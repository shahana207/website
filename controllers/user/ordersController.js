const User = require('../../models/userSchema');
const Product = require('../../models/productSchema');
const Order = require('../../models/orderSchema');
const Wallet = require('../../models/walletSchema')
const {generateCustomId}  = require("../../utils/helpers")
const mongoose = require('mongoose');

const loadOrders = async (req, res) => {
    try {
        const userId = req.session.user;
        if (!userId) {
            return res.redirect('/login');
        }
     
        const userData = await User.findById(userId);
        
        const page = parseInt(req.query.page) || 1;
        const limit = 5; 
        const skip = (page - 1) * limit;

        const totalOrders = await Order.countDocuments({ user: userId });
        const totalPages = Math.ceil(totalOrders / limit);

       
        const orders = await Order.find({ user: userId })
            .populate({
                path: 'orderedItems.product',
                select: 'productName productImage',
            })
            .sort({ createdOn: -1 })
            .skip(skip)
            .limit(limit);

       
        orders.forEach(order => {
            if (!order.createdOn) {
                order.createdOn = order._id.getTimestamp();
            }
        });

        console.log(orders)

        res.render('orders', {
            user: userData,
            orders,
            userId,
            currentPage: page,
            totalPages: totalPages
        });
    } catch (error) {
        console.error('Cannot load orders page:', error);
        res.redirect('/pageNotFound');
    }
};

const cancelOrder = async (req, res) => {
    try {
        const userId = req.session.user;
        if (!userId) {
            return res.redirect('/login');
        }

        const { orderId } = req.body;

        const order = await Order.findOne({ orderId, user: userId });
        if (!order) {
            req.flash('error', 'Order not found');
            return res.redirect('/orders');
        }

       
        if (['Delivered', 'Cancelled'].includes(order.status)) {
            req.flash('error', 'Order cannot be cancelled');
            return res.redirect('/orders');
        }

       
        if (['Wallet', 'Online'].includes(order.paymentMethod)) {
            const refundAmount = order.finalAmount; 

           
            const wallet = await Wallet.findOneAndUpdate(
                { userId },
                {
                    $setOnInsert: { userId },
                    $inc: { balance: refundAmount },
                    $push: {
                        transactions: {
                            transactionId: generateCustomId("RFD"),
                            amount: refundAmount,
                            type: "Credit",
                            status: "Completed",
                            method: "Refund",
                            description: `Refund for cancelled order #${order.orderId}`,
                            orderId: order._id,
                            date: new Date()
                        }
                    },
                    $set: { lastUpdated: new Date() }
                },
                { upsert: true, new: true }
            );

            order.refundAmount = (order.refundAmount || 0) + refundAmount;
        }

     
        order.status = 'Cancelled';
        await order.save();

       
        for (const item of order.orderedItems) {
            const product = await Product.findById(item.product);
            if (product) {
                product.quantity += item.quantity;
                await product.save();
            }
        }

        req.flash('success', `Order cancelled successfully${['Wallet', 'Online'].includes(order.paymentMethod) ? `. ₹${refundAmount} refunded to wallet.` : ''}`);
        return res.redirect('/orders');
    } catch (error) {
        console.error('Cannot cancel order:', error);
        req.flash('error', 'Failed to cancel order');
        return res.redirect('/orders');
    }
};

const viewOrderDetails = async (req, res) => {
    try {
        const userId = req.session.user;
        if (!userId) {
            return res.redirect('/login'); 
        }
        const userData = await User.findById(userId);
        const { orderId } = req.params;

        const order = await Order.findOne({ orderId, user: userId })
            .populate({
                path: 'orderedItems.product',
                select: 'productName salePrice productImage',
            });

        if (!order) {
            req.flash('error', 'Order not found');
            return res.redirect('/orders');
        }

        res.render('order-details', {
            user: userData,
            order,
            userId,
        });
    } catch (error) {
        console.error('Cannot load order details:', error);
        res.redirect('/pageNotFound');
    }
};

const cancelItem = async (req, res) => {
    try {
        const userId = req.session.user;
        if (!userId) {
            return res.status(401).json({ success: false, message: 'User not authenticated' });
        }

        const { orderId, itemId, reason } = req.body;

        const order = await Order.findOne({ orderId, user: userId });
        if (!order) {
            return res.status(404).json({ success: false, message: 'Order not found' });
        }

        if (['Delivered', 'Cancelled', 'Returned'].includes(order.status)) {
            return res.status(400).json({ success: false, message: 'Order cannot be cancelled at this stage' });
        }

        const item = order.orderedItems.find(i => i._id.toString() === itemId);
        if (!item) {
            return res.status(404).json({ success: false, message: 'Item not found in order' });
        }

       
        if (item.returnStatus !== 'Not Returned') {
            return res.status(400).json({ success: false, message: 'Item cannot beee cancelled' });
        }

       
        item.returnStatus = 'Cancelled';
        item.returnReason = reason;

        let refundAmount;
       
        if (['Wallet', 'Online'].includes(order.paymentMethod)) {
            refundAmount = item.price * item.quantity;

            
            const wallet = await Wallet.findOneAndUpdate(
                { userId },
                {
                    $setOnInsert: { userId },
                    $inc: { balance: refundAmount },
                    $push: {
                        transactions: {
                            transactionId: generateCustomId("RFD"),
                            amount: refundAmount,
                            type: "Credit",
                            status: "Completed",
                            method: "Refund",
                            description: `Refund for cancelled item in order #${order.orderId}`,
                            orderId: order._id,
                            date: new Date()
                        }
                    },
                    $set: { lastUpdated: new Date() }
                },
                { upsert: true, new: true }
            );

            
            order.refundAmount = (order.refundAmount || 0) + refundAmount;
        }

        
        const product = await Product.findById(item.product);
        if (product) {
            product.quantity += item.quantity;
            await product.save();
        }

        const allCancelled = order.orderedItems.every(i => i.returnStatus === 'Cancelled');
        if (allCancelled) {
            order.status = 'Cancelled';
        }

        await order.save();

        return res.json({
            success: true,
            message: 'Item cancelled successfully',
            refundAmount: ['Wallet', 'Online'].includes(order.paymentMethod) ? refundAmount : 0
        });
    } catch (error) {
        console.error('Error canceling item:', error);
        return res.status(500).json({ success: false, message: 'Failed to cancel item' });
    }
};

const returnItem = async (req, res) => {
    try {
        const userId = req.session.user;
        if (!userId) {
            return res.status(401).json({ success: false, message: 'User not authenticated' });
        }

        const { orderId, itemId, reason } = req.body;

        
        const order = await Order.findOne({ orderId, user: userId });

        if (!order) {
            return res.status(404).json({ success: false, message: 'Order not found' });
        }

        if (order.status !== 'Delivered') {
            return res.status(400).json({ success: false, message: 'Order must be delivered to request a return' });
        }

     
        const item = order.orderedItems.find(i => i._id.toString() === itemId);
        if (!item) {
            return res.status(404).json({ success: false, message: 'Item not found in order' });
        }

        
        if (item.returnStatus !== 'Not Returned') {
            return res.status(400).json({ success: false, message: 'Item has already been returned or a return is requested' });
        }

        
        item.returnStatus = 'Return Requested';
        item.returnReason = reason;

        
        const allReturnedOrRequested = order.orderedItems.every(i => i.returnStatus === 'Return Requested' || i.returnStatus === 'Returned');
        if (allReturnedOrRequested) {
            order.status = 'Return Request';
        }

        await order.save();

        return res.json({ success: true, message: 'Return request submitted successfully' });
    } catch (error) {
        console.error('Error returning item:', error);
        return res.status(500).json({ success: false, message: 'Failed to submit return request' });
    }
};

module.exports = {
    loadOrders,
    cancelOrder,
    viewOrderDetails,
    cancelItem,
    returnItem,
};
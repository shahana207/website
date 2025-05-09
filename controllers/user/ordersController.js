const User = require('../../models/userSchema');
const Product = require('../../models/productSchema');
const Order = require('../../models/orderSchema');
const mongoose = require('mongoose');

const loadOrders = async (req, res) => {
    try {
        const userId = req.session.user;
        if (!userId) {
            return res.redirect('/login');
        }
     
        const userData = await User.findById(userId);
        
        const page = parseInt(req.query.page) || 1;
        const limit = 5; // Orders per page
        const skip = (page - 1) * limit;

        // Count total orders for the user
        const totalOrders = await Order.countDocuments({ user: userId });
        const totalPages = Math.ceil(totalOrders / limit);

        // Fetch paginated orders
        const orders = await Order.find({ user: userId })
            .populate({
                path: 'orderedItems.product',
                select: 'productName productImage',
            })
            .sort({ createdOn: -1 })
            .skip(skip)
            .limit(limit);

        // Fallback to _id timestamp if createdOn missing
        orders.forEach(order => {
            if (!order.createdOn) {
                order.createdOn = order._id.getTimestamp();
            }
        });

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
            return res.redirect('/login'); // Redirect to login if user is not authenticated
        }

        const { orderId } = req.body;

        // Find the order
        const order = await Order.findOne({ orderId, user: userId });
        if (!order) {
            req.flash('error', 'Order not found');
            return res.redirect('/orders');
        }

        // Check if the order can be cancelled (e.g., not already delivered or cancelled)
        if (order.status === 'Delivered' || order.status === 'Cancelled') {
            req.flash('error', 'Order cannot be cancelled');
            return res.redirect('/orders');
        }

        // Update order status to cancelled
        order.status = 'Cancelled';
        await order.save();

        // Restore product quantities
        for (const item of order.orderedItems) {
            const product = await Product.findById(item.product);
            if (product) {
                product.quantity += item.quantity;
                await product.save();
            }
        }

        req.flash('success', 'Order cancelled successfully');
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
            return res.redirect('/login'); // Redirect to login if user is not authenticated
        }
        const userData = await User.findById(userId);
        const { orderId } = req.params;

        // Fetch the order with populated product details
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

        if (!mongoose.Types.ObjectId.isValid(userId)) {
            return res.status(400).json({ success: false, message: 'Invalid user ID' });
        }

        // Find the order
        const order = await Order.findOne({ orderId, user: userId });
        if (!order) {
            return res.status(404).json({ success: false, message: 'Order not found' });
        }

        // Check if the order can be cancelled
        if (order.status === 'Delivered' || order.status === 'Cancelled') {
            return res.status(400).json({ success: false, message: 'Order cannot be cancelled at this stage' });
        }

        // Find the item
        const item = order.orderedItems.find(i => i._id.toString() === itemId);
        if (!item) {
            return res.status(404).json({ success: false, message: 'Item not found in order' });
        }

        // Check if the item can be cancelled
        if (item.returnStatus !== 'Not Returned') {
            return res.status(400).json({ success: false, message: 'Item cannot be cancelled' });
        }

        // Update the item's returnStatus and reason
        item.returnStatus = 'Cancelled';
        item.cancelReason = reason;

        // Restore product quantity
        const product = await Product.findById(item.product);
        if (product) {
            product.quantity += item.quantity;
            await product.save();
        }

        // Check if all items are cancelled
        const allCancelled = order.orderedItems.every(i => i.returnStatus === 'Cancelled');
        if (allCancelled) {
            order.status = 'Cancelled';
        }

        // Adjust order totals
        const cancelledItemTotal = item.price * item.quantity;
        order.totalPrice -= cancelledItemTotal;
        order.finalAmount -= cancelledItemTotal;
        if (order.finalAmount < 0) order.finalAmount = 0;

        await order.save();

        return res.json({ success: true, message: 'Item cancelled successfully' });
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

        // Find the order
        const order = await Order.findOne({ orderId, user: userId });

        if (!order) {
            return res.status(404).json({ success: false, message: 'Order not found' });
        }

        // Check if the order is delivered
        if (order.status !== 'Delivered') {
            return res.status(400).json({ success: false, message: 'Order must be delivered to request a return' });
        }

        // Find the item in the orderedItems array
        const item = order.orderedItems.find(i => i._id.toString() === itemId);
        if (!item) {
            return res.status(404).json({ success: false, message: 'Item not found in order' });
        }

        // Check if the item can be returned
        if (item.returnStatus !== 'Not Returned') {
            return res.status(400).json({ success: false, message: 'Item has already been returned or a return is requested' });
        }

        // Update the item's returnStatus and reason
        item.returnStatus = 'Return Requested';
        item.returnReason = reason;

        // Check if all items have a return request, then update the order status
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
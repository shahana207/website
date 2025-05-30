const User = require('../../models/userSchema');
const Order = require('../../models/orderSchema');
const Address = require('../../models/addressSchema');
const Product = require('../../models/productSchema');
const Wallet = require("../../models/walletSchema");
const {generateCustomId}  = require("../../utils/helpers")

const getOrders = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 5; 
        const skip = (page - 1) * limit;

      
        const totalOrders = await Order.countDocuments();
        const totalPages = Math.ceil(totalOrders / limit);

        
        const orders = await Order.find()
            .populate('user', 'name email')
            .populate('orderedItems.product', 'productName productImage')
            .sort({ createdOn: -1 })
            .skip(skip)
            .limit(limit);

        orders.forEach(order => {
            if (!order.createdOn) {
                order.createdOn = order._id.getTimestamp();
            }
        });

        res.render('ordersadmin', { 
            orders, 
            error: null,
            currentPage: page,
            totalPages: totalPages 
        });
    } catch (error) {
        console.error('Error fetching orders:', error);
        res.render('ordersadmin', { 
            orders: [], 
            error: 'Failed to fetch orders',
            currentPage: 1,
            totalPages: 1 
        });
    }
};


const getOrderDetails = async (req, res) => {
    try {
        const order = await Order.findOne({ orderId: req.params.orderId })
            .populate('user', 'name email')
            .populate('orderedItems.product', 'productName productImage');

        if (!order) {
            return res.render('orders-details', { order: null, error: 'Order not found' });
        }

        res.render('orders-details', { order, error: null });
    } catch (error) {
        console.error('Error fetching order details:', error);
        res.render('orders-details', { order: null, error: 'Failed to fetch order details' });
    }
};


const updateOrderStatus = async (req, res) => {
    try {
        const { status } = req.body;
        const validStatuses = ['Processing', 'Shipped', 'Delivered', 'Cancelled', 'Return Request', 'Returned'];

        if (!validStatuses.includes(status)) {
            return res.status(400).json({ success: false, message: 'Invalid status' });
        }

        const restricted = ['Cancelled', 'Return Request', 'Returned'];

        if (restricted.includes(status)) {
            return res.status(400).json({ 
                success: false, 
                message: `Changing order status to "${status}" is not permitted for admin.` 
            });
        }

        const order = await Order.findOneAndUpdate(
            { orderId: req.params.orderId },
            { status },
            { new: true }
        );

        if (!order) {
            return res.status(404).json({ success: false, message: 'Order not found' });
        }

       
        if (['Cancelled', 'Returned'].includes(status)) {
            for (const item of order.orderedItems) {
                if (item.returnStatus !== 'Cancelled' && item.returnStatus !== 'Returned') {
                    const product = await Product.findById(item.product);
                    if (product) {
                        product.quantity += item.quantity;
                        await product.save();
                    }
                }
            }
        }

        res.json({ success: true, message: 'Order status updated successfully' });
    } catch (error) {
        console.error('Error updating order status:', error);
        res.status(500).json({ success: false, message: 'Failed to update order status' });
    }
};


const handleReturnRequest = async (req, res) => {
    try {
        const { orderId, itemId, action } = req.body; 

        if (!['approve', 'reject'].includes(action)) {
            return res.status(400).json({ success: false, message: 'Invalid action' });
        }

        const order = await Order.findOne({ orderId });
        if (!order) {
            return res.status(404).json({ success: false, message: 'Order not found' });
        }

        
        const item = order.orderedItems.find(i => i._id.toString() === itemId);
        if (!item) {
            return res.status(404).json({ success: false, message: 'Item not found in order' });
        }

        
        if (item.returnStatus !== 'Return Requested') {
            return res.status(400).json({ success: false, message: 'No return request found for this item' });
        }

        if (action === 'approve') {
          
            item.returnStatus = 'Returned';
            
          
            const product = await Product.findById(item.product);
            if (product) {
                product.quantity += item.quantity;
                await product.save();
            }

            
            const refundAmount = item.price * item.quantity;

             order.refundAmount += refundAmount;
             

             const wallet = await Wallet.findOneAndUpdate(
                { userId: order.user },
                {
                  $setOnInsert: {
                    userId: order.user,
                  },
                  $inc: { balance: refundAmount },
                  $push: {
                    transactions: {
                      transactionId: generateCustomId("RFD"),
                      amount: refundAmount,
                      type: "Credit",
                      status: "Completed",
                      method: "Refund",
                      description: `Refund for order #${order.orderId}`,
                      orderId: order._id,
                      date: Date.now(),
                    },
                  },
                  $set: { lastUpdated: new Date() },
                },
                { upsert: true, new: true }
              );

           
            const allReturnedOrRequested = order.orderedItems.every(i => i.returnStatus === 'Returned' || i.returnStatus === 'Cancelled');
            if (allReturnedOrRequested) {
                order.status = 'Returned';
            }
        } else {
        
            item.returnStatus = 'Not Returned';
            item.returnReason = null; 
        }

        await order.save();

        res.json({
            success: true,
            message: `Return request ${action === 'approve' ? 'approved' : 'rejected'} successfully`
        });
    } catch (error) {
        console.error('Error handling return request:', error);
        res.status(500).json({ success: false, message: 'Failed to handle return request' });
    }
};

module.exports = {
    getOrders,
    getOrderDetails,
    updateOrderStatus,
    handleReturnRequest,
};
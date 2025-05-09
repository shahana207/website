const User = require('../../models/userSchema');
const Order = require('../../models/orderSchema');
const Address = require('../../models/addressSchema');
const Product = require('../../models/productSchema');

// Get all orders with pagination
const getOrders = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 5; // Orders per page
        const skip = (page - 1) * limit;

        // Count total orders
        const totalOrders = await Order.countDocuments();
        const totalPages = Math.ceil(totalOrders / limit);

        // Fetch paginated orders
        const orders = await Order.find()
            .populate('user', 'name email')
            .populate('orderedItems.product', 'productName productImage')
            .sort({ createdOn: -1 })
            .skip(skip)
            .limit(limit);

        // Fallback to _id timestamp if createdOn is missing
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

// Get order details
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

// Update order status
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

        // Restore stock if cancelled or returned
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

// Handle return request
const handleReturnRequest = async (req, res) => {
    try {
        const { orderId, itemId, action } = req.body; // action: 'approve' or 'reject'

        if (!['approve', 'reject'].includes(action)) {
            return res.status(400).json({ success: false, message: 'Invalid action' });
        }

        const order = await Order.findOne({ orderId });
        if (!order) {
            return res.status(404).json({ success: false, message: 'Order not found' });
        }

        // Find the item
        const item = order.orderedItems.find(i => i._id.toString() === itemId);
        if (!item) {
            return res.status(404).json({ success: false, message: 'Item not found in order' });
        }

        // Check if the item has a return request
        if (item.returnStatus !== 'Return Requested') {
            return res.status(400).json({ success: false, message: 'No return request found for this item' });
        }

        if (action === 'approve') {
            // Approve return
            item.returnStatus = 'Returned';
            
            // Restore product quantity
            const product = await Product.findById(item.product);
            if (product) {
                product.quantity += item.quantity;
                await product.save();
            }

            // Adjust order totals
            const returnedItemTotal = item.price * item.quantity;
            order.totalPrice -= returnedItemTotal;
            order.finalAmount -= returnedItemTotal;
            if (order.finalAmount < 0) order.finalAmount = 0;

            // Check if all items are returned
            const allReturnedOrRequested = order.orderedItems.every(i => i.returnStatus === 'Returned' || i.returnStatus === 'Cancelled');
            if (allReturnedOrRequested) {
                order.status = 'Returned';
            }
        } else {
            // Reject return
            item.returnStatus = 'Not Returned';
            item.returnReason = null; // Clear the reason
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
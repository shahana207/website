const User = require('../../models/userSchema');
const Product = require('../../models/productSchema');
const Category = require('../../models/categorySchema');
const Cart = require('../../models/cartSchema');
const Address = require('../../models/addressSchema');
const mongoose = require('mongoose');
const Order = require("../../models/orderSchema");
const path = require('path');
const fs = require('fs');
const puppeteer = require('puppeteer');
const ejs = require('ejs');
const { generateCustomId } = require("../../utils/helpers");
const Coupon = require('../../models/couponSchema');
const Razorpay = require('razorpay');
const Wallet = require('../../models/walletSchema');
const crypto = require('crypto');

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

const loadCheckout = async (req, res) => {
    try {
        const userId = req.session.user;
        if (!userId) {
            return res.redirect('/login'); 
        }
        
        const user = await User.findById(userId).select('name firstName lastName email phone addresses profilePicture');
        let cart = await Cart.findOne({ userId }).populate('items.productId');

        
        const wallet = await Wallet.findOne({ userId });
        const walletBalance = wallet ? wallet.balance : 0;

        const addressDoc = await Address.findOne({ userId });
        const addresses = addressDoc && addressDoc.address ? addressDoc.address : [];

        if (!cart) {
            return res.redirect('/cart'); 
        }

        cart.subtotal = cart.items.reduce((sum, item) => sum + item.totalPrice, 0);
        cart.shippingCharge = cart.items.length > 0 ? 50 : 0;
        cart.total = cart.subtotal + cart.shippingCharge - (cart.discount || 0);
        await cart.save();

        res.render('checkout', {
            user,   
            cart,
            userId,
            addresses,
            walletBalance, 
            profilePicture: user.profilePicture || null,
        });
    } catch (error) {
        console.error('Cannot render the checkout page:', error);
        res.redirect('/pageNotFound');
    }
};

const saveAddress = async (req, res) => {
    try {
      
        console.log('Received saveAddress request:', {
            body: req.body,
            sessionUser: req.session.user,
        });

       
        let userId = req.session.user;
        if (!userId) {
            console.log('User not authenticated in saveAddress');
            return res.status(401).json({
                success: false,
                message: 'User not authenticated',
                redirect: '/login',
            });
        }

        
        if (typeof userId === 'object' && userId._id) {
            userId = userId._id;
            console.log('Extracted userId from object:', userId);
        }

        if (!mongoose.Types.ObjectId.isValid(userId)) {
            console.log('Invalid userId format:', userId);
            return res.status(400).json({
                success: false,
                message: 'Invalid user ID format',
            });
        }

        const address = {
            addressType: req.body.addressType,
            name: req.body.name,
            city: req.body.city,
            landMark: req.body.landMark,
            state: req.body.state,
            pincode: req.body.pincode,
            phone: req.body.phone,
            altPhone: req.body.altPhone || '',
        };
        console.log('Constructed address object:', address);

      
        const errors = validateAddress(address);
        if (errors && Object.keys(errors).length > 0) {
            console.log('Address validation failed:', errors);
            return res.status(400).json({
                success: false,
                message: 'Validation failed',
                errors,
            });
        }

        
        let addressDoc = await Address.findOne({ userId });
        console.log('Found address document:', addressDoc);

        if (!addressDoc) {
            console.log('No address document found, creating new one for userId:', userId);
            addressDoc = new Address({ userId, address: [] });
        }

        addressDoc.address.push(address);
        await addressDoc.save();
        console.log('Saved address document:', addressDoc);

        
        const newAddress = addressDoc.address[addressDoc.address.length - 1];

        return res.status(200).json({
            success: true,
            message: 'Address created successfully',
            address: {
                _id: newAddress._id || Date.now(),
                addressType: newAddress.addressType,
                name: newAddress.name,
                city: newAddress.city,
                landMark: newAddress.landMark,
                state: newAddress.state,
                pincode: newAddress.pincode,
                phone: newAddress.phone,
                altPhone: newAddress.altPhone,
            },
        });
    } catch (error) {
        console.error('Error in saveAddress:', error.message, error.stack);
        return res.status(500).json({
            success: false,
            message: `Failed to save address: ${error.message}`,
        });
    }
};


const placeOrder = async (req, res) => {
    try {
        const { paymentMethod, addressId, totalAmount } = req.body;
        const userId = req.session.user;

        if (!userId) {
            return res.status(401).json({ success: false, message: "User not authenticated", redirect: "/login" });
        }

        let cart = await Cart.findOne({ userId }).populate({
            path: "items.productId",
            select: "productName salePrice regularPrice quantity status",
        });

        if (!cart) {
            return res.status(404).json({ success: false, message: "Cart is not available" });
        }

        for (let item of cart.items) {
            const product = await Product.findById(item.productId._id);
            if (!product) {
                return res.status(400).json({ success: false, message: "Products in your cart are no longer available" });
            }
            if (product.quantity < item.quantity) {
                return res.status(400).json({
                    success: false,
                    message: `Insufficient stock for ${product.productName}. Only ${product.quantity} units available.`,
                });
            }
        }

        const addressDoc = await Address.findOne({ userId });
        const deliveryAddress = addressDoc?.address.find(address =>
            address._id.toString() === addressId.toString()
        );

        if (!deliveryAddress) {
            return res.status(404).json({ success: false, message: "Delivery address not found" });
        }

        let totalPrice = cart.subtotal;
        const orderedItems = cart.items.map(item => ({
            product: item.productId._id,
            quantity: item.quantity,
            price: item.totalPrice / item.quantity,
        }));

        if (isNaN(totalPrice) || totalPrice <= 0) {
            console.error('Invalid total price:', { totalPrice, orderedItems });
            return res.status(400).json({ success: false, message: "Invalid total price" });
        }

        const shippingFee = cart.shippingCharge || 50;
        const discount = cart.discount || 0;
        const finalAmount = totalPrice + shippingFee - discount;

        const newOrder = new Order({
            orderId: generateCustomId("ORD"),
            user: userId,
            orderedItems,
            totalPrice,
            discount,
            shippingFee,
            finalAmount,
            address: deliveryAddress,
            paymentMethod,
            invoiceDate: new Date(),
            status: 'pending',
            createdOn: new Date(),
            couponApplied: cart.couponApplied,
        });

        if (paymentMethod === 'Online') {
            const options = {
                amount: finalAmount * 100,
                currency: 'INR',
                receipt: `receipt_${newOrder._id}`,
            };
            const razorpayOrder = await razorpay.orders.create(options);

            await newOrder.save();

            return res.json({
                success: true,
                message: "Razorpay order created",
                razorpayOrder: {
                    id: razorpayOrder.id,
                    amount: razorpayOrder.amount,
                    currency: razorpayOrder.currency,
                },
                orderId: newOrder._id,
            });
        }

        if (paymentMethod === 'Wallet') {
            const wallet = await Wallet.findOne({ userId });
            if (!wallet || wallet.balance < finalAmount) {
                return res.status(400).json({ success: false, message: "Insufficient wallet balance" });
            }
            wallet.balance -= finalAmount;
            wallet.transactions.push({
                transactionId: generateCustomId("TNX"),
                amount: finalAmount,
                type: 'Debit',
                method: 'OrderPayment',
                status: 'Completed',
                orderId: newOrder._id,
                description: `Payment for order ${newOrder.orderId}`,
            });
            await wallet.save();
        }

        newOrder.status = 'processing';
        await newOrder.save();

        for (const item of cart.items) {
            const product = await Product.findById(item.productId._id);
            if (product) {
                product.quantity -= item.quantity;
                await product.save();
            }
        }

        await Cart.deleteOne({ userId });

        req.session.orderId = newOrder.orderId;

        return res.json({ success: true, message: "Order placed successfully", redirectUrl: "/order-success" });
    } catch (error) {
        console.error("Error in placeOrder:", error);
        return res.status(500).json({ success: false, message: "Failed to place order" });
    }
};
const verifyPayment = async (req, res) => {
    try {
        const { razorpay_order_id, razorpay_payment_id, razorpay_signature, orderId } = req.body;
        const userId = req.session.user;

        if (!userId) {
            return res.status(401).json({ success: false, message: "User not authenticated" });
        }

        const body = razorpay_order_id + '|' + razorpay_payment_id;
        const expectedSignature = crypto
            .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
            .update(body)
            .digest('hex');

        if (expectedSignature !== razorpay_signature) {
            const order = await Order.findByIdAndUpdate(orderId, { status: 'Payment Failed' }, { new: true })
                .populate('orderedItems.product', 'productName salePrice images')
                .populate('user', 'firstName lastName email');
            req.session.orderId = order.orderId;
            return res.json({ success: false, message: "Invalid payment signature", redirectUrl: "/payment-failure" });
        }

        const order = await Order.findById(orderId);
        if (!order) {
            return res.status(404).json({ success: false, message: "Order not found" });
        }

        order.status = 'processing';
        await order.save();

        const wallet = await Wallet.findOne({ userId });
        if (wallet) {
            wallet.transactions.push({
                transactionId: generateCustomId("TNX"),
                amount: order.finalAmount,
                type: 'Debit',
                method: 'Razorpay',
                status: 'Completed',
                orderId: order._id,
                description: `Payment for order ${order.orderId}`,
            });
            await wallet.save();
        }

        await Cart.deleteOne({ userId });

        for (const item of order.orderedItems) {
            const product = await Product.findById(item.product);
            if (product) {
                product.quantity -= item.quantity;
                await product.save();
            }
        }

        req.session.orderId = order.orderId;

        return res.json({ success: true, message: "Payment verified successfully", redirectUrl: "/order-success" });
    } catch (error) {
        console.error("Error in verifyPayment:", error);
        const order = await Order.findByIdAndUpdate(req.body.orderId, { status: 'Payment Failed' }, { new: true })
            .populate('orderedItems.product', 'productName salePrice images')
            .populate('user', 'firstName lastName email');
        req.session.orderId = order.orderId;
        return res.json({ success: false, message: "Payment verification failed", redirectUrl: "/payment-failure" });
    }
};

const orderSuccess = async (req, res) => {
    try {
        const userId = req.session.user;
        if (!userId) {
            return res.redirect('/login?error=User not authenticated');
        }

        const orderId = req.session.orderId;
        if (!orderId) {
            return res.redirect('/orders?error=No order ID found in session');
        }

        const order = await Order.findOne({ orderId, user: userId })
            .populate('orderedItems.product', 'productName salePrice images')
            .populate('user', 'firstName lastName email');

        if (!order) {
            return res.redirect('/orders?error=Order not found');
        }

        req.session.orderId;

        res.render('order-success', {
            order,
            userId,
        });
    } catch (error) {
        console.log(error);
        res.redirect('/pageNotFound?error=Failed to load order success page');
    }
};

const paymentFailure = async (req, res) => {
    try {
        const userId = req.session.user;
        if (!userId) {
            return res.redirect('/login?error=User not authenticated');
        }

        const orderId = req.session.orderId;
        if (!orderId) {
            return res.redirect('/orders?error=No order ID found in session');
        }

        const order = await Order.findOne({ orderId, user: userId })
            .populate('orderedItems.product', 'productName salePrice images')
            .populate('user', 'firstName lastName email');

        if (!order) {
            return res.redirect('/orders?error=Order not found');
        }

        // Update order status to Payment Failed
        order.status = 'Payment Failed';
        await order.save();

        // Clear orderId from session
        delete req.session.orderId;

        res.render('payment-failure', {
            order,
            userId,
        });
    } catch (error) {
        console.log(error);
        res.redirect('/pageNotFound?error=Failed to load payment failure page');
    }
};


const downloadInvoice = async (req, res) => {
    const { orderId } = req.params;
    const userId = req.session.user;

    try {
        if (!userId) {
            console.log('No user in session');
            return res.status(401).json({ message: 'User not authenticated' });
        }

        const order = await Order.findOne({ orderId })
            .populate('orderedItems.product', 'productName salePrice images')
            .populate('user', 'firstName lastName email');

        if (!order) {
            console.log(`Order not found for orderId: ${orderId}`);
            return res.status(404).json({ message: 'Order not found' });
        }

       

        const invoiceData = {
            orderId: order.orderId,
            orderDate: order.createdOn.toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
            }),
            customer: {
                name: `${order.user.firstName} ${order.user.lastName}`,
                address: {
                    addressType: order.address.addressType,
                    name: order.address.name,
                    city: order.address.city,
                    state: order.address.state,
                    pincode: order.address.pincode,
                    phone: order.address.phone,
                    altPhone: order.address.altPhone || '',
                },
                email: order.user.email,
            },
            items: order.orderedItems.map(item => ({
                name: item.product ? item.product.productName : 'Product Not Found',
                quantity: item.quantity,
                unitPrice: item.price,
                amount: item.price * item.quantity,
            })),
            subtotal: order.totalPrice,
            shipping: order.shippingCharge,
            discount: order.discount || 0,
            total: order.finalAmount,
            paymentMethod: order.paymentMethod,
        };

        const templatePath = path.join(__dirname, '../../', 'views', 'invoice.ejs');
        ejs.renderFile(templatePath, invoiceData, async (err, htmlContent) => {
            if (err) {
                console.error('Error rendering EJS:', err);
                return res.status(500).json({ message: 'Error rendering invoice template' });
            }

            const browser = await puppeteer.launch({ headless: 'new' });
            const page = await browser.newPage();
            await page.setContent(htmlContent, { waitUntil: 'domcontentloaded' });

            const pdfBuffer = await page.pdf({
                format: 'A4',
                printBackground: true,
                margin: {
                    top: '20px',
                    right: '20px',
                    bottom: '20px',
                    left: '20px',
                },
            });

            await browser.close();

            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename=Invoice-${order.orderId}.pdf`);
            res.setHeader('Content-Length', pdfBuffer.length);
            res.end(pdfBuffer);
        });
    } catch (error) {
        console.error('Error generating the PDF:', error);
        res.status(500).send('An error occurred while generating the PDF');
    }
};

const getAvailableCoupons = async (req, res) => {
    try {
        const coupons = await Coupon.find({
            status: 'Active',
            endDate: { $gte: new Date() },
        });
        console.log('Fetched coupons:', coupons);
        if (!coupons || coupons.length === 0) {
            return res.json({
                success: true,
                coupons: [],
                message: 'No active coupons available',
            });
        }
        res.json({
            success: true,
            coupons,
        });
    } catch (error) {
        console.error('Error fetching available coupons:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch coupons',
        });
    }
};

const applyCoupon = async (req, res) => {
    try {
        const { couponCode } = req.body;
        console.log('Applying coupon:', couponCode);
        console.log('Logged-in user ID:', req.session.user); 
        console.log('Request user ID:', req.user ? req.user._id.toString() : 'undefined'); 

      
        if (!req.session.user) {
            return res.status(401).json({
                success: false,
                message: 'User not authenticated',
                redirect: '/login'
            });
        }

        const userId = req.session.user;
        const coupon = await Coupon.findOne({
            couponCode,
            status: 'Active',
            endDate: { $gte: new Date() },
        });
        if (!coupon) {
            console.log('Coupon not found or invalid:', couponCode);
            return res.status(400).json({
                success: false,
                message: 'Invalid or expired coupon',
            });
        }

        const cart = await Cart.findOne({ userId: userId }).populate('items.productId');
        console.log('Cart found:', cart);
        if (!cart) {
            return res.status(404).json({
                success: false,
                message: 'Cart not found',
            });
        }

        const subtotal = cart.subtotal || 0;
        if (subtotal < coupon.minPurchase) {
            console.log('Subtotal:', subtotal, 'Min Purchase:', coupon.minPurchase);
            return res.status(400).json({
                success: false,
                message: `Minimum purchase of ₹${coupon.minPurchase} required`,
            });
        }

        cart.coupon = { code: coupon.couponCode, discount: coupon.discountValue };
        cart.discount = coupon.discountValue;
        cart.couponApplied = true;
        cart.total = subtotal + (cart.shippingCharge || 0) + (cart.tax || 0) - (cart.discount || 0);
        await cart.save();
        console.log('Cart updated with coupon:', cart);

        res.json({
            success: true,
            message: 'Coupon applied successfully',
            cart: {
                subtotal: cart.subtotal || 0,
                shippingCharge: cart.shippingCharge || 0,
                tax: cart.tax || 0,
                discount: cart.discount || 0,
                total: cart.total || 0,
                coupon: cart.coupon,
                couponApplied: cart.couponApplied
            },
        });
    } catch (error) {
        console.error('Error applying coupon:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to apply coupon',
        });
    }
};
const removeCoupon = async (req, res) => {
    try {
        const userId = req.session.user;
        console.log('Logged-in user ID for remove coupon:', userId);

        if (!userId) {
            return res.status(401).json({
                success: false,
                message: 'User not authenticated',
                redirect: '/login'
            });
        }

        const cart = await Cart.findOne({ userId: userId }).populate('items.productId');
        console.log('Cart found for coupon removal:', cart);
        if (!cart) {
            return res.status(404).json({
                success: false,
                message: 'Cart not found',
            });
        }

        cart.coupon = { code: null, discount: 0 };
        cart.discount = 0;
        cart.couponApplied = false;
        cart.total = (cart.subtotal || 0) + (cart.shippingCharge || 0) + (cart.tax || 0);
        await cart.save();
        console.log('Cart updated after coupon removal:', cart);

        res.json({
            success: true,
            message: 'Coupon removed successfully',
            cart: {
                subtotal: cart.subtotal || 0,
                shippingCharge: cart.shippingCharge || 0,
                tax: cart.tax || 0,
                discount: cart.discount || 0,
                total: cart.total || 0,
                coupon: cart.coupon,
                couponApplied: cart.couponApplied
            },
        });
    } catch (error) {
        console.error('Error removing coupon:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to remove coupon',
        });
    }
};

function validateAddress(address) {
    let errors = {};

    if (!address.addressType) errors.addressType = "Address type is required";
    if (!address.name) errors.name = "Name is required";
    if (!address.city) errors.city = "City is required";
    if (!address.landMark) errors.landMark = "Landmark is required";
    if (!address.state) errors.state = "State is required";
    if (!address.pincode) errors.pincode = "Pincode is required";
    if (!address.phone) errors.phone = "Phone number is required";

    return errors;
};
const updateOrderStatus = async (req, res) => {
    try {
        const { orderId, status } = req.body;
        const order = await Order.findByIdAndUpdate(orderId, { status }, { new: true });
        if (!order) {
            return res.status(404).json({ success: false, message: "Order not found" });
        }
        return res.json({ success: true, message: "Order status updated" });
    } catch (error) {
        console.error("Error updating order status:", error);
        return res.status(500).json({ success: false, message: "Failed to update order status" });
    }
};
const retryPayment = async (req, res) => {
    try {
        const userId = req.session.user;
        if (!userId) {
            return res.status(401).json({ success: false, message: "User not authenticated", redirect: "/login" });
        }

        const { orderId } = req.body;
        const order = await Order.findOne({ orderId, user: userId }).populate('orderedItems.product');

        if (!order) {
            return res.status(404).json({ success: false, message: "Order not found" });
        }

        if (order.status !== 'Payment Failed') {
            return res.status(400).json({ success: false, message: "Order not eligible for retry payment" });
        }

        // Restore cart for retry payment
        let cart = await Cart.findOne({ userId });
        if (!cart) {
            cart = new Cart({ userId, items: [] });
        }

        cart.items = order.orderedItems.map(item => ({
            productId: item.product._id,
            quantity: item.quantity,
            price: item.price,
            totalPrice: item.price * item.quantity,
        }));

        cart.subtotal = order.totalPrice;
        cart.shippingCharge = order.shippingCharge;
        cart.discount = order.discount || 0;
        cart.total = order.finalAmount;
        cart.couponApplied = order.couponApplied;
        if (order.couponApplied) {
            cart.coupon = { code: order.coupon?.code, discount: order.discount };
        }

        await cart.save();

        // Store orderId in session for reference
        req.session.orderId = order.orderId;

        return res.json({ success: true, redirectUrl: "/checkout" });
    } catch (error) {
        console.error("Error in retryPayment:", error);
        return res.status(500).json({ success: false, message: "Failed to retry payment" });
    }
};
const submitPayment = async (req, res) => {
    try {
        const userId = req.session.user;
        if (!userId) {
            return res.redirect('/login?error=User not authenticated');
        }

        const { razorpay_payment_id, razorpay_order_id, razorpay_signature } = req.query;

        if (!razorpay_payment_id || !razorpay_order_id || !razorpay_signature) {
            return res.redirect('/payment-failure?error=Missing payment details');
        }

        // Verify payment signature
        const body = razorpay_order_id + '|' + razorpay_payment_id;
        const expectedSignature = crypto
            .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
            .update(body)
            .digest('hex');

        if (expectedSignature !== razorpay_signature) {
            const order = await Order.findOneAndUpdate(
                { orderId: razorpay_order_id, user: userId },
                { status: 'Payment Failed' },
                { new: true }
            );
            req.session.orderId = order.orderId;
            return res.redirect('/payment-failure?error=Invalid payment signature');
        }

        const order = await Order.findOne({ orderId: razorpay_order_id, user: userId });
        if (!order) {
            return res.redirect('/orders?error=Order not found');
        }

        order.status = 'processing';
        await order.save();

        // Clear cart and update product quantities
        await Cart.deleteOne({ userId });
        for (const item of order.orderedItems) {
            const product = await Product.findById(item.product);
            if (product) {
                product.quantity -= item.quantity;
                await product.save();
            }
        }

        req.session.orderId = order.orderId;
        return res.redirect('/order-success');
    } catch (error) {
        console.error('Error in submitPayment:', error);
        return res.redirect('/payment-failure?error=Payment processing failed');
    }
};

module.exports = {
    loadCheckout,
    saveAddress,
    placeOrder,
    verifyPayment,
    orderSuccess,
    paymentFailure,
    retryPayment,
    downloadInvoice,
    getAvailableCoupons,
    applyCoupon,
    removeCoupon,
    updateOrderStatus,
    submitPayment,
};
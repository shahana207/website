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

        // Fetch the wallet balance
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
            walletBalance, // Pass wallet balance to the frontend
            profilePicture: user.profilePicture || null,
        });
    } catch (error) {
        console.error('Cannot render the checkout page:', error);
        res.redirect('/pageNotFound');
    }
};

const saveAddress = async (req, res) => {
    try {
        console.log('hidsafdsalfkdsaljf')
        console.log(req.body,'body')
        const userId = req.session.user;
        console.log(userId,'id')
        if (!userId) {
            return res.redirect('/login'); 
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

       

        let addressDoc = await Address.findOne({ userId });
        if (!addressDoc) {
            addressDoc = new Address({ userId, address: [] });
        }

        addressDoc.address.push(address);
        await addressDoc.save();
        console.log(addressDoc,'doc ')
        return res.status(200).json({success:true,message:"address Created Successfully"})
        
    } catch (error) {
        console.error('Cannot save address:', error);
        return res.redirect('/checkout?error=Failed+to+save+address');
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
            price: item.totalPrice/item.quantity,
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
            shippingCharge: shippingFee,
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
           
            const order = await Order.findByIdAndUpdate(orderId, { status: 'failed' }, { new: true })
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
       
        const order = await Order.findByIdAndUpdate(req.body.orderId, { status: 'failed' }, { new: true })
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

        req.session.orderId;

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
        const userId = req.session.user;
        if (!userId) {
            return res.status(401).json({ success: false, message: "User not authenticated" });
        }

        const cart = await Cart.findOne({ userId });
        if (!cart) {
            return res.status(404).json({ success: false, message: "Cart not found" });
        }

        const subtotal = cart.subtotal || 0;
        const currentDate = new Date();
        const coupons = await Coupon.find({
            status: 'Active',
            startDate: { $lte: currentDate },
            endDate: { $gte: currentDate },
            minPurchase: { $lte: subtotal },
        });

        return res.json({ success: true, coupons });
    } catch (error) {
        console.error('Error fetching available coupons:', error);
        return res.status(500).json({ success: false, message: "Error fetching coupons" });
    }
};

const applyCoupon = async (req, res) => {
    try {
        const { couponCode } = req.body;
        const userId = req.session.user;

        if (!userId) {
            return res.status(401).json({ success: false, message: "Please log in to apply coupon", redirect: "/login" });
        }

        const user = await User.findById(userId);
        if (!user) {
            return res.status(401).json({ success: false, message: "User not found" });
        }

        const coupon = await Coupon.findOne({ couponCode, status: "Active" });
        if (!coupon) {
            return res.status(404).json({ success: false, message: "Invalid or inactive coupon" });
        }

        if (new Date() < coupon.startDate || new Date() > coupon.endDate) {
            return res.status(400).json({ success: false, message: "Coupon is expired or not yet active" });
        }

        let cart = await Cart.findOne({ userId }).populate("items.productId");
        if (!cart || !cart.items.length) {
            return res.status(404).json({ success: false, message: "Cart is empty" });
        }

        const subtotal = cart.items.reduce((sum, item) => sum + item.totalPrice, 0);
        if (subtotal < coupon.minPurchase) {
            return res.status(400).json({ success: false, message: `Minimum purchase of ₹${coupon.minPurchase} required` });
        }

        cart.coupon = { code: coupon.couponCode, discount: coupon.discountValue };
        cart.couponApplied = true;
        cart.discount = coupon.discountValue;
        cart.subtotal = subtotal;
        cart.shippingCharge = cart.items.length > 0 ? 50 : 0;
        cart.total = cart.subtotal - cart.discount + cart.shippingCharge;
        await cart.save();

        return res.json({
            success: true,
            message: "Coupon applied successfully",
            cart
        });
    } catch (error) {
        console.error("Error in applyCoupon:", error);
        return res.status(500).json({ success: false, message: "Server error" });
    }
};

const removeCoupon = async (req, res) => {
    try {
        const userId = req.session.user;
        if (!userId) {
            return res.status(401).json({ success: false, message: "Please log in", redirect: "/login" });
        }

        let cart = await Cart.findOne({ userId }).populate("items.productId");
        if (!cart) {
            return res.status(404).json({ success: false, message: "Cart not found" });
        }

        cart.coupon = { code: null, discount: 0 };
        cart.couponApplied = false;
        cart.discount = 0;
        cart.subtotal = cart.items.reduce((sum, item) => sum + item.totalPrice, 0);
        cart.shippingCharge = cart.items.length > 0 ? 50 : 0;
        cart.total = cart.subtotal + cart.shippingCharge;
        await cart.save();

        return res.json({
            success: true,
            message: "Coupon removed successfully",
            cart
        });
    } catch (error) {
        console.error("Error in removeCoupon:", error);
        return res.status(500).json({ success: false, message: "Server error" });
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

module.exports = {
    loadCheckout,
    saveAddress,
    placeOrder,
    verifyPayment,
    orderSuccess,
    paymentFailure,
    downloadInvoice,
    getAvailableCoupons,
    applyCoupon,
    removeCoupon,
    updateOrderStatus,
};
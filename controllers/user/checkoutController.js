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

const loadCheckout = async (req, res) => {
    try {
        const userId = req.session.user;
        if (!userId) {
            return res.redirect('/login');
        }

        const user = await User.findById(userId).select('name firstName lastName email phone addresses profilePicture wallet');
        let cart = await Cart.findOne({ userId }).populate('items.productId coupon');

        const addressDoc = await Address.findOne({ userId });

        const addresses = addressDoc && addressDoc.address ? addressDoc.address : [];

        if (!cart) {
            return res.redirect('/cart');
        }

        cart.subtotal = cart.items.reduce((sum, item) => sum + item.totalPrice, 0);
        cart.shippingCharge = cart.items.length > 0 ? 50 : 0;
        cart.total = cart.subtotal - (cart.discount || 0) + cart.shippingCharge;
        await cart.save();

        res.render('checkout', {
            user,
            cart,
            userId,
            addresses,
            profilePicture: user.profilePicture || null,
            walletBalance: user.wallet || 0
        });
    } catch (error) {
        console.error('Cannot render the checkout page:', error);
        res.redirect('/pageNotFound');
    }
};

const saveAddress = async (req, res) => {
    try {
        const userId = req.session.user;
        if (!userId) {
            return res.redirect('/login');
        }

        if (!mongoose.Types.ObjectId.isValid(userId)) {
            req.flash('error', 'Invalid user ID');
            return res.redirect('/checkout');
        }

        const address = {
            addressType: req.body.addressType,
            name: req.body.name,
            addressLine: req.body.addressLine,
            landmark: req.body.landMark,
            city: req.body.city,
            state: req.body.state,
            pincode: req.body.pincode,
            phone: req.body.phone,
            altPhone: req.body.altPhone || '',
            isDefault: req.body.isDefault === 'on'
        };

        const errors = validateAddress(address);
        if (Object.keys(errors).length > 0) {
            req.flash('error', Object.values(errors)[0]);
            return res.redirect('/checkout');
        }

        let addressDoc = await Address.findOne({ userId });
        if (!addressDoc) {
            addressDoc = new Address({ userId, address: [] });
        }

        if (address.isDefault) {
            addressDoc.address.forEach(addr => (addr.isDefault = false));
        }

        if (req.body.saveAddress === 'on') {
            addressDoc.address.push(address);
            await addressDoc.save();
            req.flash('success', 'Address saved successfully');
        } else {
            req.session.selectedAddress = address;
            req.flash('success', 'Address selected for this order');
        }

        return res.redirect('/checkout');
    } catch (error) {
        console.error('Cannot save address:', error);
        req.flash('error', 'Failed to save address');
        return res.redirect('/checkout');
    }
};

const placeOrder = async (req, res) => {
    try {
        const { paymentMethod, addressId, totalAmount } = req.body;
        const userId = req.session.user;

        if (!userId) {
            return res.status(401).json({ success: false, message: "Please log in", redirect: "/login" });
        }

        let cart = await Cart.findOne({ userId }).populate({
            path: "items.productId",
            select: "productName salePrice regularPrice quantity status"
        }).populate("coupon");

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
                    message: `Insufficient stock for ${product.productName}. Only ${product.quantity} units available.`
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

        const totalPrice = cart.items.reduce((sum, item) => sum + item.totalPrice, 0);
        const shippingFee = cart.shippingCharge || 50;
        const discount = cart.discount || 0;
        const finalAmount = totalPrice - discount + shippingFee;

        if (paymentMethod === "Wallet") {
            const user = await User.findById(userId);
            if (user.wallet < finalAmount) {
                return res.status(400).json({ success: false, message: "Insufficient wallet balance" });
            }
            user.wallet -= finalAmount;
            await user.save();
        }

        const newOrder = new Order({
            orderId: generateCustomId("ORD"),
            user: userId,
            orderedItems: cart.items.map(item => ({
                product: item.productId._id,
                quantity: item.quantity,
                price: item.price
            })),
            totalPrice,
            discount,
            coupon: cart.coupon || null,
            couponApplied: !!cart.coupon,
            address: deliveryAddress,
            finalAmount,
            paymentMethod,
            invoiceDate: new Date(),
            status: paymentMethod === "COD" ? "pending" : "confirmed",
            createdOn: new Date()
        });

        await newOrder.save();

        for (const item of cart.items) {
            item.productId.quantity -= item.quantity;
            await item.productId.save();
        }

        await Cart.deleteOne({ userId });

        req.session.orderId = newOrder.orderId;

        return res.json({
            success: true,
            message: "Order placed successfully",
            redirectUrl: "/order-success"
        });
    } catch (error) {
        console.error("Error in placeOrder:", error);
        return res.status(500).json({ success: false, message: "Server error" });
    }
};

const orderSuccess = async (req, res) => {
    try {
        const userId = req.session.user;
        if (!userId) {
            return res.redirect('/login?error=User not authenticated');
        }

        if (!mongoose.Types.ObjectId.isValid(userId)) {
            return res.redirect('/pageNotFound?error=Invalid user ID');
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

        delete req.session.orderId;

        res.render('order-success', {
            order,
            userId
        });
    } catch (error) {
        console.error('Cannot load order success page:', error);
        res.redirect('/pageNotFound?error=Failed to load order success page');
    }
};

const downloadInvoice = async (req, res) => {
    const { orderId } = req.params;
    const userId = req.session.user;

    try {
        if (!userId) {
            return res.status(401).json({ message: 'User not authenticated' });
        }

        const order = await Order.findOne({ orderId })
            .populate('orderedItems.product', 'productName salePrice images')
            .populate('user', 'firstName lastName email')
            .populate('coupon');

        if (!order) {
            return res.status(404).json({ message: 'Order not found' });
        }

        if (order.user._id.toString() !== userId.toString()) {
            return res.status(403).json({ message: 'Unauthorized access to this order' });
        }

        const invoiceData = {
            orderId: order.orderId,
            orderDate: order.createdOn.toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
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
                    altPhone: order.address.altPhone || ''
                },
                email: order.user.email
            },
            items: order.orderedItems.map(item => ({
                name: item.product ? item.product.productName : 'Product Not Found',
                quantity: item.quantity,
                unitPrice: item.price,
                amount: item.price * item.quantity
            })),
            subtotal: order.totalPrice,
            shipping: order.finalAmount - order.totalPrice + (order.discount || 0),
            discount: order.discount || 0,
            total: order.finalAmount,
            paymentMethod: order.paymentMethod,
            coupon: order.coupon ? {
                code: order.coupon.couponCode,
                discount: order.discount
            } : null
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
                    left: '20px'
                }
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

module.exports = {
    loadCheckout,
    saveAddress,
    placeOrder,
    orderSuccess,
    downloadInvoice
};
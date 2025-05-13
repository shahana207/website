const Coupon = require("../../models/couponSchema");
const Cart = require("../../models/cartSchema");
const User = require("../../models/userSchema");

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

        if (user.usedCoupons.includes(coupon._id)) {
            return res.status(400).json({ success: false, message: "Coupon already used" });
        }

        let cart = await Cart.findOne({ userId }).populate("items.productId");
        if (!cart || !cart.items.length) {
            return res.status(404).json({ success: false, message: "Cart is empty" });
        }

        const subtotal = cart.items.reduce((sum, item) => sum + item.totalPrice, 0);
        if (subtotal < coupon.minPurchase) {
            return res.status(400).json({ success: false, message: `Minimum purchase of ₹${coupon.minPurchase} required` });
        }

        cart.coupon = coupon._id;
        cart.discount = coupon.discountValue;
        cart.subtotal = subtotal;
        cart.shippingCharge = cart.items.length > 0 ? 50 : 0;
        cart.total = cart.subtotal - cart.discount + cart.shippingCharge;
        await cart.save();

        user.usedCoupons.push(coupon._id);
        await user.save();

        return res.json({
            success: true,
            message: "Coupon applied successfully",
            discount: cart.discount,
            total: cart.total
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

        cart.coupon = null;
        cart.discount = 0;
        cart.subtotal = cart.items.reduce((sum, item) => sum + item.totalPrice, 0);
        cart.shippingCharge = cart.items.length > 0 ? 50 : 0;
        cart.total = cart.subtotal + cart.shippingCharge;
        await cart.save();

        return res.json({
            success: true,
            message: "Coupon removed successfully",
            discount: cart.discount,
            total: cart.total
        });
    } catch (error) {
        console.error("Error in removeCoupon:", error);
        return res.status(500).json({ success: false, message: "Server error" });
    }
};

const getAvailableCoupons = async (req, res) => {
    try {
        const userId = req.session.user;
        if (!userId) {
            return res.status(401).json({ success: false, message: "Please log in" });
        }

        const user = await User.findById(userId);
        const coupons = await Coupon.find({
            status: "Active",
            startDate: { $lte: new Date() },
            endDate: { $gte: new Date() },
            _id: { $nin: user.usedCoupons }
        });

        return res.json({ success: true, coupons });
    } catch (error) {
        console.error("Error in getAvailableCoupons:", error);
        return res.status(500).json({ success: false, message: "Server error" });
    }
};

module.exports = {
    applyCoupon,
    removeCoupon,
    getAvailableCoupons
};
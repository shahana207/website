const Coupon = require("../../models/couponSchema");

const loadCoupon = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const search = req.query.search || '';
        
        const query = search 
            ? { couponCode: { $regex: search, $options: 'i' } }
            : {};

        const totalCoupons = await Coupon.countDocuments(query);
        const coupons = await Coupon.find(query)
        .sort({startDate:-1})
            .skip((page - 1) * limit)
            .limit(limit);

        return res.render("coupon", {
            coupons,
            currentPage: page,
            totalPages: Math.ceil(totalCoupons / limit),
            search
        });
    } catch (error) {
        console.error(error);
        return res.redirect("/pageerror");
    }
};

const addCoupon = async (req, res) => {
    try {
        const { couponCode, minPurchase, discountValue, startDate, endDate, description, status } = req.body;

        const existingCoupon = await Coupon.findOne({ couponCode });
        if (existingCoupon) {
            return res.status(400).json({ success: false, message: "Coupon code already exists" });
        }

        const newCoupon = new Coupon({
            couponCode,
            minPurchase: Number(minPurchase),
            discountValue: Number(discountValue),
            startDate: new Date(startDate),
            endDate: new Date(endDate),
            description,
            status
        });

        await newCoupon.save();
        return res.json({ success: true, message: "Coupon added successfully" });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ success: false, message: "Error adding coupon" });
    }
};

const editCoupon = async (req, res) => {
    try {
        const { id } = req.params;
        const { couponCode, minPurchase, discountValue, startDate, endDate, description, status } = req.body;

        const existingCoupon = await Coupon.findOne({ couponCode, _id: { $ne: id } });
        if (existingCoupon) {
            return res.status(400).json({ success: false, message: "Coupon code already exists" });
        }

        const updatedCoupon = await Coupon.findByIdAndUpdate(
            id,
            {
                couponCode,
                minPurchase: Number(minPurchase),
                discountValue: Number(discountValue),
                startDate: new Date(startDate),
                endDate: new Date(endDate),
                description,
                status
            },
            { new: true }
        );

        if (!updatedCoupon) {
            return res.status(404).json({ success: false, message: "Coupon not found" });
        }

        return res.json({ success: true, message: "Coupon updated successfully" });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ success: false, message: "Error updating coupon" });
    }
};

const getCoupon = async (req, res) => {
    try {
        const { id } = req.params;
        const coupon = await Coupon.findById(id);
        if (!coupon) {
            return res.status(404).json({ success: false, message: "Coupon not found" });
        }
        return res.json(coupon);
    } catch (error) {
        console.error(error);
        return res.status(500).json({ success: false, message: "Error fetching coupon" });
    }
};

const deleteCoupon = async (req, res) => {
    try {
        const { id } = req.params;
        const coupon = await Coupon.findByIdAndDelete(id);
        if (!coupon) {
            return res.status(404).json({ success: false, message: "Coupon not found" });
        }
        return res.json({ success: true, message: "Coupon deleted successfully" });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ success: false, message: "Error deleting coupon" });
    }
};

module.exports = {
    loadCoupon,
    addCoupon,
    editCoupon,
    getCoupon,
    deleteCoupon
};

const Brand = require("../../models/brandSchema");
const mongoose = require("mongoose");


const getBrandpage = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 4;
        const skip = (page - 1) * limit;

        const brandData = await Brand.find({})
        
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        const totalBrands = await Brand.countDocuments();
        const totalPages = Math.ceil(totalBrands / limit);

        res.render("brands", {
            brand: brandData,
            currentPage: page,
            totalPages,
            totalBrands,
            limit
        });
    } catch (error) {
        console.error("Error in getBrandpage:", error);
        res.redirect("/admin/pageerror");
    }
};

const addBrand = async (req, res) => {
    try {
        const { name, description, isBlocked } = req.body;

        const existingBrand = await Brand.findOne({
            name: { $regex: new RegExp(`^${name}$`, 'i') }
        });

        if (existingBrand) {
            return res.status(400).json({ error: "Brand already exists" });
        }

        const newBrand = new Brand({
            name,
            description,
            isBlocked: isBlocked !== undefined ? isBlocked : false
        });
        await newBrand.save();

        return res.json({ message: "Brand added successfully" });
    } catch (error) {
        console.error("Error adding brand:", error);
        return res.status(500).json({ error: "Internal Server Error" });
    }
};

const editBrand = async (req, res) => {
    try {
        const id = req.params.id;
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, message: "Invalid brand ID" });
        }
        const brand = await Brand.findById(id);
        if (!brand) {
            return res.status(404).json({ success: false, message: "Brand not found" });
        }
        res.json({ success: true, brand });
    } catch (error) {
        console.error("Error fetching brand:", error);
        res.status(500).json({ success: false, message: "Internal Server Error" });
    }
};

const updateBrand = async (req, res) => {
    try {
        const { brandId, brandName, description, isBlocked } = req.body;
        if (!mongoose.Types.ObjectId.isValid(brandId)) {
            return res.status(400).json({ success: false, message: "Invalid brand ID" });
        }

        const existingBrand = await Brand.findOne({
            name: { $regex: new RegExp(`^${brandName}$`, 'i') },
            _id: { $ne: brandId }
        });

        if (existingBrand) {
            return res.status(400).json({ success: false, message: "Brand name already exists" });
        }

        const updatedBrand = await Brand.findByIdAndUpdate(
            brandId,
            {
                name: brandName,
                description,
                isBlocked: isBlocked === 'true'
            },
            { new: true }
        );

        if (!updatedBrand) {
            return res.status(404).json({ success: false, message: "Brand not found" });
        }

        res.json({ success: true, message: "Brand updated successfully" });
    } catch (error) {
        console.error("Error updating brand:", error);
        res.status(500).json({ success: false, message: "Internal Server Error" });
    }
};

const toggleBrandStatus = async (req, res) => {
    try {
        const id = req.params.id;
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, message: "Invalid brand ID" });
        }

        const brand = await Brand.findById(id);
        if (!brand) {
            return res.status(404).json({ success: false, message: "Brand not found" });
        }

        const newStatus = !brand.isBlocked;
        await Brand.updateOne({ _id: id }, { $set: { isBlocked: newStatus } });

        res.json({
            success: true,
            isBlocked: newStatus,
            message: `Brand ${newStatus ? 'deactivated' : 'activated'} successfully`
        });
    } catch (error) {
        console.error("Error toggling brand status:", error);
        res.status(500).json({ success: false, message: "Internal Server Error" });
    }
};

const deleteBrand = async (req, res) => {
    try {
        const id = req.params.id;
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, message: "Invalid brand ID" });
        }

        const brand = await Brand.findByIdAndDelete(id);
        if (!brand) {
            return res.status(404).json({ success: false, message: "Brand not found" });
        }

        res.json({ success: true, message: "Brand deleted successfully" });
    } catch (error) {
        console.error("Error deleting brand:", error);
        res.status(500).json({ success: false, message: "Internal Server Error" });
    }
};

module.exports = {
    getBrandpage,
    addBrand,
    editBrand,
    updateBrand,
    toggleBrandStatus,
    deleteBrand
};

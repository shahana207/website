
const Product = require('../../models/productSchema');
const Category = require('../../models/categorySchema');
const Brand = require('../../models/brandSchema');
const User = require('../../models/userSchema');
const fs = require('fs').promises;
const path = require('path');
const sharp = require('sharp');
const { serializeUser } = require('passport');
const { sanitizeFilter } = require('mongoose');

const getProductAddPage = async (req, res) => {
    try {
        const category = await Category.find({});
        const brands = await Brand.find({ isBlocked: false });
        res.render('add-product', {
            cat: category,
            brands: brands,
            error: req.query.error || null
        });
    } catch (error) {
        console.error('Error in getProductAddPage:', error);
        res.redirect('/admin/pagenotfound');
    }
};

const escapeRegex = (string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const getAllProducts = async (req, res) => {
    try {
        const search = req.query.search || '';
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = 4;
        
        const regexSearch = escapeRegex(search);
        const searchQuery = {
           
            isDeleted:false,
            $or: [
                { productName: { $regex: regexSearch, $options: 'i' } },
                { 'brand.name': { $regex: regexSearch, $options: 'i' } },
                { 'category.name': { $regex: regexSearch, $options: 'i' } },
                { color: { $regex: regexSearch, $options: 'i' } }
            ]
        };

        if (!search.trim()) {
            delete searchQuery.$or;
        }

        const productData = await Product.find(searchQuery)
            .populate('category')
            .populate('brand')
            .limit(limit)
            .skip((page - 1) * limit)
            .sort({ createdAt: -1 })
            .exec();


        const count = await Product.countDocuments(searchQuery)
        const username = req.user?.name || 'Admin';
        
        res.render('products', {
            data: productData,
            currentPage: page,
            totalPages: Math.max(1, Math.ceil(count / limit)),
            search: search,
            username
        });

    } catch (error) {
        console.error('Error fetching products:', error);
        res.redirect('/admin/pagenotfound');
    }
};

const addProducts = async (req, res) => {
    try {
        const { productName, description, category, brand, regularPrice, salePrice, quantity, color, sizeVariants } = req.body;

        // Server-side validation
        if (!productName?.trim() || !/^[a-zA-Z0-9\s,()\-.]+$/.test(productName.trim())) {
            return res.redirect('/admin/load-add-product?error=Invalid%20product%20name');
        }
        if (!description?.trim() || !/^[a-zA-Z0-9\s,()\-.]+$/.test(description.trim())) {
            return res.redirect('/admin/load-add-product?error=Invalid%20product%20description');
        }
        if (!regularPrice || parseFloat(regularPrice) <= 0) {
            return res.redirect('/admin/load-add-product?error=Regular%20price%20must%20be%20positive');
        }
        if (!salePrice || parseFloat(salePrice) <= 0) {
            return res.redirect('/admin/load-add-product?error=Sale%20price%20must%20be%20positive');
        }
        if (parseFloat(salePrice) >= parseFloat(regularPrice)) {
            return res.redirect('/admin/load-add-product?error=Sale%20price%20must%20be%20less%20than%20regular%20price');
        }
        if (!quantity || parseInt(quantity) < 0) {
            return res.redirect('/admin/load-add-product?error=Quantity%20must%20be%20non-negative');
        }

        // Process sizeVariants
        let sizeVariantsArray = [];
        if (sizeVariants && Array.isArray(sizeVariants)) {
            sizeVariantsArray = sizeVariants
                .filter(variant => variant.size?.trim() && variant.quantity >= 0)
                .map(variant => ({
                    size: variant.size.trim(),
                    quantity: parseInt(variant.quantity)
                }));
        }

        const productExists = await Product.findOne({ productName: productName.trim() });
        if (productExists) {
            return res.redirect('/admin/load-add-product?error=Product%20already%20exists');
        }

        const categoryId = await Category.findOne({ name: { $regex: new RegExp(`^${category.trim()}$`, 'i') } });
        if (!categoryId) {
            return res.redirect('/admin/load-add-product?error=Invalid%20category');
        }

        let brandId = null;
        if (brand && brand.trim()) {
            brandId = await Brand.findOne({ name: { $regex: new RegExp(`^${brand.trim()}$`, 'i') } });
            if (!brandId) {
                return res.redirect('/admin/load-add-product?error=Invalid%20brand');
            }
        }

        // Process colors
        let colors = [];
        if (color && color.trim()) {
            colors = color.split(',').map(c => c.trim()).filter(c => c);
        }

        const images = [];
        if (!req.files || req.files.length === 0) {
            return res.redirect('/admin/load-add-product?error=Please%20upload%20at%20least%20one%20image');
        }

        for (let i = 0; i < req.files.length; i++) {
            const originalImagePath = req.files[i].path;
            const filename = `${Date.now()}-${i}${path.extname(req.files[i].originalname)}`;
            const resizedImagePath = path.join(__dirname, '..', '..', 'public', 'Uploads', 'product-images', filename);

            await fs.mkdir(path.dirname(resizedImagePath), { recursive: true });
            await sharp(originalImagePath)
                .resize({ width: 440, height: 440, fit: 'cover' })
                .toFile(resizedImagePath);
            await fs.unlink(originalImagePath);
            images.push(filename);
        }

        const newProduct = new Product({
            productName: productName.trim(),
            description: description.trim(),
            category: categoryId._id,
            brand: brandId ? brandId._id : undefined,
            regularPrice: parseFloat(regularPrice),
            salePrice: parseFloat(salePrice),
            quantity: parseInt(quantity),
            color: colors,
            sizeVariants: sizeVariantsArray, // Use sizeVariants instead of sizes
            productImage: images,
            status: 'Available'
        });

        await newProduct.save();
        res.redirect('/admin/products?success=Product%20added%20successfully');
    } catch (error) {
        console.error('Error in addProducts:', error);
        let errorMessage = 'Failed%20to%20add%20product';
        if (error.code === 11000) {
            errorMessage = 'Product%20with%20this%20name%20already%20exists';
        } else if (error.name === 'ValidationError') {
            errorMessage = encodeURIComponent(Object.values(error.errors)[0].message);
        } else {
            errorMessage = encodeURIComponent(error.message || 'Server%20error');
        }
        res.redirect(`/admin/load-add-product?error=${errorMessage}`);
    }
};
const blockProduct = async (req, res) => {
    try {
        let id = req.query.id;
        await Product.updateOne({ _id: id }, { $set: { isBlocked: true } });
        res.json({ success: true, message: "Product blocked successfully" });
    } catch (error) {
        console.error("Error blocking product:", error);
        res.status(500).json({ success: false, message: "Failed to block product" });
    }
};

const unblockProduct = async (req, res) => {
    try {
        let id = req.query.id;
        await Product.updateOne({ _id: id }, { $set: { isBlocked: false } });
        res.json({ success: true, message: "Product unblocked successfully" });
    } catch (error) {
        console.error("Error unblocking product:", error);
        res.status(500).json({ success: false, message: "Failed to unblock product" });
    }
};

const getEditProduct = async (req, res) => {
    try {
        const id = req.query.id;

        const product = await Product.findOne({ _id: id })
            .populate('category')
            .populate('brand');

        const categories = await Category.find({ isListed: true });
        const brands = await Brand.find({ isBlocked: false });

        res.render('edit-product', {
            product,
            categories,
            brands,
            error: req.query.error || null
        });
    } catch (error) {
        console.error(error);
        res.redirect('/admin/pagenotfound');
    }
};

const editProduct = async (req, res) => {
    try {
        const id = req.params.id;
        const {
            productName,
            brand,
            description,
            category,
            quantity,
            regularPrice,
            salePrice,
            offerPrice,
            hasOffer,
            color,
            sizeVariants,
            existingImages = [],
            removedImages = []
        } = req.body;

        const product = await Product.findById(id);
        if (!product) {
            return res.status(404).json({ success: false, message: "Product not found" });
        }

        const existingProduct = await Product.findOne({ productName, _id: { $ne: id } });
        if (existingProduct) {
            return res.status(400).json({ success: false, message: "Product with this name already exists" });
        }

        const categoryDoc = await Category.findById(category);
        if (!categoryDoc) {
            return res.status(400).json({ success: false, message: "Invalid category" });
        }

        let brandId = null;
        if (brand && brand.trim()) {
            brandId = await Brand.findOne({ name: { $regex: new RegExp(`^${brand.trim()}$`, 'i') } });
            if (!brandId) {
                return res.status(400).json({ success: false, message: "Invalid brand" });
            }
        }

        // Process colors
        let colors = [];
        if (color && color.trim()) {
            colors = color.split(',').map(c => c.trim()).filter(c => c);
        }

        // Process sizeVariants
        let sizeVariantsArray = [];
        if (sizeVariants && Array.isArray(sizeVariants)) {
            sizeVariantsArray = sizeVariants
                .filter(variant => variant.size?.trim() && variant.quantity >= 0)
                .map(variant => ({
                    size: variant.size.trim(),
                    quantity: parseInt(variant.quantity)
                }));
        }

        let productImages = [...existingImages];

        for (const image of removedImages) {
            const imagePath = path.join(__dirname, '..', '..', 'public', 'Uploads', 'product-images', image);
            try {
                await fs.unlink(imagePath);
            } catch (err) {
                console.warn(`Could not delete image ${image}:`, err);
            }
            productImages = productImages.filter(img => img !== image);
        }

        if (req.files && req.files.length > 0) {
            const newImages = req.files;
            if (productImages.length + newImages.length > 4) {
                return res.status(400).json({ success: false, message: "Maximum 4 images allowed" });
            }

            const images = [];
            for (let i = 0; i < newImages.length; i++) {
                const originalImagePath = newImages[i].path;
                const filename = `${Date.now()}-${i}${path.extname(newImages[i].originalname)}`;
                const resizedImagePath = path.join(__dirname, '..', '..', 'public', 'Uploads', 'product-images', filename);

                await fs.mkdir(path.dirname(resizedImagePath), { recursive: true });
                await sharp(originalImagePath)
                    .resize({ width: 440, height: 440, fit: 'cover' })
                    .toFile(resizedImagePath);
                await fs.unlink(originalImagePath);

                images.push(filename);
            }
            productImages = [...productImages, ...images];
        }

        if (productImages.length === 0) {
            return res.status(400).json({ success: false, message: "At least one image is required" });
        }

        const salePriceNum = parseFloat(salePrice);
        const regularPriceNum = parseFloat(regularPrice);
        const offerPriceNum = offerPrice ? parseFloat(offerPrice) : 0;
        const quantityNum = parseInt(quantity);

        if (isNaN(salePriceNum) || salePriceNum < 0) {
            return res.status(400).json({ success: false, message: "Invalid sale price" });
        }
        if (offerPrice && (isNaN(offerPriceNum) || offerPriceNum < 0)) {
            return res.status(400).json({ success: false, message: "Invalid offer price" });
        }
        if (isNaN(quantityNum) || quantityNum < 0) {
            return res.status(400).json({ success: false, message: "Invalid quantity" });
        }

        const updateFields = {
            productName,
            brand: brandId ? brandId._id : undefined,
            description,
            category: categoryDoc._id,
            quantity: quantityNum,
            regularPrice: regularPriceNum,
            salePrice: salePriceNum,
            offerPrice: offerPriceNum,
            hasOffer: hasOffer === 'on',
            color: colors,
            sizeVariants: sizeVariantsArray, // Use sizeVariants instead of sizes
            productImage: productImages
        };

        const updatedProduct = await Product.findByIdAndUpdate(
            id,
            { $set: updateFields },
            { new: true }
        );

        res.json({
            success: true,
            message: "Product updated successfully",
            productImage: updatedProduct.productImage
        });
    } catch (error) {
        console.error('Error in editProduct:', error);
        res.status(500).json({ success: false, message: error.message || "Failed to update product" });
    }
};
const deleteProduct = async (req, res) => {
    try {
        const id = req.params.id;

        if (!id) {
            console.log("Product ID not found");
            return res.status(400).json({ status: false, message: "Product ID is required" });
        }

        console.log("Received ID:", id);

        const product = await Product.findByIdAndUpdate(
            id,
            { $set: { isDeleted: true } },
            { new: true }
        );

        if (!product) {
            return res.status(404).json({ status: false, message: "Product not found" });
        }

        console.log("Product soft-deleted:", product._id);
        res.status(200).json({ status: true, message: "Successfully deleted" });
    } catch (error) {
        console.error("Error while deleting product:", error);
        res.status(500).json({ status: false, message: "Error while deleting the product" });
    }
};

async function migrateSizes() {
    try {
        await mongoose.connect('mongodb://localhost:27017/your_database_name', {
            useNewUrlParser: true,
            useUnifiedTopology: true
        });

        const products = await Product.find({ sizes: { $exists: true } });

        for (const product of products) {
            if (product.sizes && product.sizes.length > 0) {
                const sizeVariants = product.sizes.map(size => ({
                    size: size,
                    quantity: product.quantity // Use the product's total quantity or adjust as needed
                }));
                await Product.updateOne(
                    { _id: product._id },
                    {
                        $set: { sizeVariants: sizeVariants },
                        $unset: { sizes: 1 }
                    }
                );
                console.log(`Migrated product ${product.productName}`);
            }
        }

        console.log('Migration completed');
        mongoose.connection.close();
    } catch (error) {
        console.error('Migration error:', error);
        mongoose.connection.close();
    }
}



module.exports = {
    getAllProducts,
    getProductAddPage,
    addProducts,
    blockProduct,
    unblockProduct,
    getEditProduct,
    editProduct,
    deleteProduct,
    migrateSizes,
};

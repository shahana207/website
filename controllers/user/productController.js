const Product=require("../../models/productSchema");
const Category=require("../../models/categorySchema");
const User= require("../../models/userSchema");




const productDetails = async (req, res) => {
    try {
        const userId = req.session.user;
        let userData;
        if (userId) {
            userData = await User.findById(userId._id);
        }

        const productId = req.query.id;
        const product = await Product.findById(productId)
            .populate('category')
            .populate('brand');
        
        if (!product) {
            return res.status(404).send("Product not found");
        }

        console.log('Product sizes:', product.sizes); // Debug log

        const findCategory = product.category;
        const categoryOffer = findCategory?.categoryOffer || 0;
        const productOffer = product.productOffer || 0;
        const totalOffer = categoryOffer + productOffer;

        const relatedProducts = await Product.find({
            category: product.category._id,
            _id: { $ne: productId }
        })
        .limit(4)
        .select('productName productImage salePrice _id')
        .lean();

        res.render("productdetails", {
            user: userData,
            product,
            relatedProducts,
            totalOffer
        });
    } catch (error) {
        console.log('Error in productDetails:', error);
        res.status(500).send("Server error");
    }
};

module.exports ={
    productDetails,
}


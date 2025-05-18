const Product=require("../../models/productSchema");
const Category=require("../../models/categorySchema");
const User= require("../../models/userSchema");
const Offer = require("../../models/offerSchema");


const calculateBestOffer = async (product) => {
    try {
        let bestOffer = 0;
        let offerType = '';
        let offerName = '';

      
        if (product.productOffer > 0) {
            bestOffer = product.productOffer;
            offerType = 'product';
            offerName = 'Product Offer';
        }

        if (product.category && product.category.categoryOffer > 0) {
            if (product.category.categoryOffer > bestOffer) {
                bestOffer = product.category.categoryOffer;
                offerType = 'category';
                offerName = 'Category Offer';
            }
        }

       
        if (product.brand) {
            const brandOffer = await Offer.findOne({
                offerType: 'Brands',
                applicableTo: product.brand._id,
                isListed: true,
                isDeleted: false,
                validFrom: { $lte: new Date() },
                validUpto: { $gte: new Date() }
            });

            if (brandOffer && brandOffer.discountAmount > bestOffer) {
                bestOffer = brandOffer.discountAmount;
                offerType = 'brand';
                offerName = brandOffer.offerName;
            }
        }

        const discountedPrice = product.salePrice - (product.salePrice * bestOffer / 100);

        return {
            bestOffer,
            offerType,
            offerName,
            discountedPrice
        };
    } catch (error) {
        console.error('Error calculating best offer:', error);
        return {
            bestOffer: 0,
            offerType: '',
            offerName: '',
            discountedPrice: product.regularPrice
        };
    }
};

const productDetails = async (req, res) => {
    try {
        const userId = req.session.user;

        let userData;
        if(userId){
            userData = await User.findById(userId._id);
        }

        const productId = req.query.id;
        const product = await Product.findById(productId)
            .populate('category')
            .populate('brand')
        
        if (!product) {
            return res.status(404).send("Product not found");
        }

        const offerDetails = await calculateBestOffer(product);
        
        const relatedProducts = await Product.find({
            category: product.category._id,
            _id: { $ne: productId } 
        })
        .populate('category')
        .populate('brand')
        .limit(4)
        .lean();

        
        const relatedProductsWithOffers = await Promise.all(relatedProducts.map(async (relatedProduct) => {
            const offerDetails = await calculateBestOffer(relatedProduct);
            return {
                ...relatedProduct,
                offerDetails
            };
        }));

        res.render("productdetails", { 
            user: userData,
            product, 
            relatedProducts: relatedProductsWithOffers,
            offerDetails
        });

    } catch (error) {
        console.log('error from productDetails', error);
        res.status(500).send("Server error");
    }
};

module.exports = {
    productDetails,
}


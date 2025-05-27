const User = require("../../models/userSchema");
const Product = require("../../models/productSchema");
const Wishlist = require("../../models/wishlistSchema");
const Offer = require('../../models/offerSchema');

const loadWishlist = async (req, res) => {
    try {
        const userId = req.session.user;
        if (!userId) {
            return res.redirect("/login");
        }

        const user = await User.findById(userId);
        if (!user) {
            return res.redirect("/login");
        }

        const wishlist = await Wishlist.findOne({ userId }).populate("products.productId");

const updatedWishlist = [];

for (let item of wishlist.products) {
    const itemObj = item.toObject(); 
    const bestOffer = await getBestOffer(itemObj.productId);

    if (bestOffer) {
        const discountAmount = (itemObj.productId.salePrice * bestOffer.discountAmount) / 100;
        itemObj.offerPrice = itemObj.productId.salePrice - discountAmount;
    } else {
        itemObj.salePrice = itemObj.productId.salePrice;
    }

    updatedWishlist.push(itemObj);
}

        res.render('wishlist', {
            user: user,
            wishlist:updatedWishlist
        });
    } catch (error) {
        console.log("Error in loadWishlist:", error);
        res.redirect("/pageNotFound");
    }
};

const addToWishlist = async (req, res) => {
    try {
        if (!req.session.user) {
            console.log('No user logged in, redirecting to login');
            return res.status(401).json({ success: false, redirect: '/login', message: 'Please sign in to manage your wishlist.' });
        }

        const userId = req.session.user;
        const { id, size, color } = req.body;
        console.log('addToWishlist request:', { userId, productId: id, size, color });

        if (!id) {
            return res.status(400).json({ success: false, message: 'Product ID is required' });
        }

        let wishlist = await Wishlist.findOne({ userId });

        if (!wishlist) {
            wishlist = new Wishlist({ userId, products: [] });
        }

        const productIndex = wishlist.products.findIndex(item =>
            item.productId.toString() === id &&
            item.size === (size || '') &&
            item.color === (color || '')
        );

        let action = '';
        if (productIndex !== -1) {
            wishlist.products.splice(productIndex, 1);
            action = 'removed';
            await wishlist.save();
            console.log('Product removed from wishlist:', id);
            return res.json({ success: true, message: 'Product removed from wishlist', action });
        } else {
            const product = await Product.findById(id);
            if (!product) {
                console.log('Product not found:', id);
                return res.status(404).json({ success: false, message: 'Product not found' });
            }

            wishlist.products.push({ productId: id, size: size || '', color: color || '' });
            action = 'added';
            await wishlist.save();
            console.log('Product added to wishlist:', id);
            return res.json({ success: true, message: 'Product added to wishlist', action });
        }
    } catch (error) {
        console.error('Error in addToWishlist:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

const getWishlist = async (req, res) => {
    try {
        const userId = req.session.user;

        if (!userId) {
            return res.status(401).json({ success: false, message: 'Please log in' });
        }

        const wishlist = await Wishlist.findOne({ userId }).populate('products.productId');
        if (!wishlist) {
            return res.status(200).json({ success: true, wishlist: [] });
        }

        const wishlistProductIds = wishlist.products
            .filter(item => item.productId)
            .map(item => item.productId._id.toString());
        console.log('getWishlist response:', wishlistProductIds);

        return res.status(200).json({ success: true, wishlist: wishlistProductIds });
    } catch (error) {
        console.error('Error in getWishlist:', error);
        return res.status(500).json({ success: false, message: 'Server error' });
    }
};

const removeFromWishlist = async (req, res) => {
    try {
        console.log(req.body)
        const { productId } = req.body;
        const userId = req.session.user;

        if (!userId) {
            return res.status(401).json({ success: false, message: "Please log in", redirect: "/login" });
        }

        const wishlist = await Wishlist.findOne({ userId });
        if (!wishlist) {
            return res.status(404).json({ success: false, message: "Wishlist not found" });
        }

        const productIndex = wishlist.products.findIndex(item => item.productId.toString() === productId);
        if (productIndex === -1) {
            return res.status(404).json({ success: false, message: "Product not in wishlist" });
        }

        wishlist.products.splice(productIndex, 1);
        await wishlist.save();

        return res.status(200).json({ success: true, message: "Product removed from wishlist" });
    } catch (error) {
        console.error("Error in removeFromWishlist:", error);
        return res.status(500).json({ success: false, message: "Server error" });
    }
};

const addToCart = async (req, res) => {
    try {
        const { id: productId, qty, size, color } = req.body;
        const userId = req.session.user;

        
        if (!userId) {
            return res.status(401).json({
                success: false,
                message: "Please log in to add to cart",
                redirect: "/login"
            });
        }

        const user = await User.findById(userId);
        if (!user) {
            return res.status(401).json({
                success: false,
                message: "User not found",
                redirect: "/login"
            });
        }

        const product = await Product.findById(productId);
        if (!product) {
            return res.status(404).json({
                success: false,
                message: "Product not found"
            });
        }

       
        const variant = product.sizeVariants?.find(v => v.size === size) || { quantity: product.quantity };
        if (variant.quantity < qty) {
            return res.status(400).json({
                success: false,
                message: "Product out of stock"
            });
        }

        let cart = await Cart.findOne({ userId });
        if (!cart) {
            cart = new Cart({ userId, products: [] });
        }

        const existingItem = cart.products.find(item => 
            item.productId.toString() === productId &&
            (!size || item.size === size) &&
            (!color || item.color === color)
        );

        if (existingItem) {
            existingItem.quantity += qty;
        } else {
            cart.products.push({
                productId,
                quantity: qty,
                size,
                color
            });
        }

        await cart.save();

        let wishlist = await Wishlist.findOne({ userId });
        if (wishlist) {
            wishlist.products = wishlist.products.filter(item => 
                item.productId.toString() !== productId || 
                item.size !== size || 
                item.color !== color
            );
            await wishlist.save();
        }

        return res.status(200).json({
            success: true,
            message: "Product added to cart and removed from wishlist"
        });
    } catch (error) {
        console.error("Error in addToCart:", error);
        return res.status(500).json({
            success: false,
            message: "Server error"
        });
    }
};

const getBestOffer = async (product) => {
    try {
        const currentDate = new Date();
      
        const productOffers = await Offer.find({
            isListed: true,
            isDeleted: false,
            validFrom: { $lte: currentDate },
            validUpto: { $gte: currentDate },
            offerType: 'Products',
            applicableTo: product._id
        });

       
        const brandOffers = await Offer.find({
            isListed: true,
            isDeleted: false,
            validFrom: { $lte: currentDate },
            validUpto: { $gte: currentDate },
            offerType: 'Brands',
            applicableTo: product.brand
        });

        const categoryOffers = await Offer.find({
            isListed: true,
            isDeleted: false,
            validFrom: { $lte: currentDate },
            validUpto: { $gte: currentDate },
            offerType: 'Category',
            applicableTo: product.category
        });

        const allOffers = [...productOffers, ...brandOffers, ...categoryOffers];

        if (allOffers.length === 0) {
            return null;
        }

        const bestOffer = allOffers.reduce((best, current) => {
            const currentDiscount = (product.salePrice * current.discountAmount) / 100;
            const bestDiscount = best ? (product.salePrice * best.discountAmount) / 100 : 0;
            return currentDiscount > bestDiscount ? current : best;
        }, null);

        return bestOffer;
    } catch (error) {
        console.error('Error finding best offer:', error);
        return null;
    }
};

module.exports = {
    loadWishlist,
    addToWishlist,
    getWishlist,
    removeFromWishlist,
    addToCart
};
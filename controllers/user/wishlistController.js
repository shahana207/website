const User = require("../../models/userSchema");
const Product = require("../../models/productSchema");
const Wishlist = require("../../models/wishlistSchema");

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
const product= await Product.find({})
      
        const wishlist=await Wishlist .findOne({userId}).populate("products.productId")

       
        res.render('wishlist', {
            user: user,
            wishlist
        });
    } catch (error) {
        console.log("Error in loadWishlist:", error);
        res.redirect("/pageNotFound");
    }
};

const addToWishlist = async (req, res) => {
    try {
        if (!req.session.user) {
            return res.status(401).json({ success: false, redirect: '/login', message: 'Please sign in to add to wishlist.' });
        }

        const userId = req.session.user._id;
        const { id, size, color } = req.body;

        let wishlist = await Wishlist.findOne({ userId });

        if (!wishlist) {
            wishlist = new Wishlist({ userId, products: [] });
        }

        const exists = wishlist.products.some(item => 
            item.productId.toString() === id && item.size === size && item.color === color
        );

        if (exists) {
            return res.status(400).json({ success: false, message: 'Product already in wishlist' });
        }

        wishlist.products.push({ productId: id, size, color });
        await wishlist.save();

        res.json({ success: true, message: 'Product added to wishlist' });
    } catch (error) {
        console.error('Error adding to wishlist:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

const addToCart = async (req, res) => {
    try {
        const { id: productId, qty, size, color } = req.body;
        const userId = req.session.user;

        // Validate user
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

        // Validate product
        const product = await Product.findById(productId);
        if (!product) {
            return res.status(404).json({
                success: false,
                message: "Product not found"
            });
        }

        // Check stock
        if (product.quantity < qty) {
            return res.status(400).json({
                success: false,
                message: "Product out of stock"
            });
        }

        // Find or create cart
        let cart = await Cart.findOne({ userId });
        if (!cart) {
            cart = new Cart({ userId, products: [] });
        }

        // Update cart
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

        // Remove from wishlist
        let wishlist = await Wishlist.findOne({ userId });
        if (wishlist && wishlist.products.some(item => item.productId.toString() === productId)) {
            wishlist.products = wishlist.products.filter(item => item.productId.toString() !== productId);
            await wishlist.save();
            console.log(`Removed product ${productId} from wishlist for user ${userId}`);
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

const getWishlist = async (req, res) => {
    try {
        const userId = req.session.user;
        if (!userId) {
            return res.status(401).json({ status: false, message: "Please log in" });
        }

        const user = await User.findById(userId);
        if (!user) {
            return res.status(401).json({ status: false, message: "User not found" });
        }

        if (!user.wishlist) {
            user.wishlist = [];
            await user.save();
        }

        return res.status(200).json({ success: true, wishlist: user.wishlist });
    } catch (error) {
        console.error("Error in getWishlist:", error);
        return res.status(500).json({ success: false, message: "Server error" });
    }
};

const removeFromWishlist = async (req, res) => {
    try {
        const { productId } = req.body;
        const userId = req.session.user;

        if (!userId) {
            return res.status(401).json({ success: false, message: "Please log in", redirect: "/login" });
        }

        const user = await User.findById(userId);
        if (!user) {
            return res.status(401).json({ success: false, message: "User not found", redirect: "/login" });
        }

        let wishlist = await Wishlist.findOne({ userId });
        if (!wishlist) {
            return res.status(404).json({ success: false, message: "Wishlist not found" });
        }

       
        const productExists = wishlist.products.some(item => item.productId.toString() === productId);
        if (!productExists) {
            return res.status(404).json({ success: false, message: "Product not in wishlist" });
        }

        wishlist.products = wishlist.products.filter(item => item.productId.toString() !== productId);

        await wishlist.save();

        return res.status(200).json({ success: true, message: "Product removed from wishlist" });
    } catch (error) {
        console.error("Error in removeFromWishlist:", error);
        return res.status(500).json({ success: false, message: "Server error" });
    }
};

module.exports = {
    loadWishlist,
    addToWishlist,
    getWishlist,
    removeFromWishlist
};
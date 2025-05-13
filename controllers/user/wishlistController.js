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
        // Initialize wishlist if undefined 
        const wishlist=await Wishlist .findOne({userId}).populate("products.productId")

        // const products = await Product.find({ _id: { $in: user.wishlist } }).populate('category');

        res.render('wishlist', {
            user: user,
            wishlist
        });
    } catch (error) {
        console.log("Error in loadWishlist:", error);
        res.redirect("/pageNotFound");
    }
};

const addToWishList = async (req, res) => {
    try {
        const productId = req.body.id;
        const userId = req.session.user;
        console.log(req.body)

        if (!userId) {
            return res.status(401).json({ status: false, message: "Please log in to add to wishlist", redirect: "/login" });
        }

        const user = await User.findById(userId);
        if (!user) {
            return res.status(401).json({ status: false, message: "User not found", redirect: "/login" });
        }

        let  wishlist= await Wishlist .findOne({userId})
        // Initialize wishlist if undefined
        if (!wishlist) {
            wishlist =new Wishlist ({
                userId,
                products:[]
            })
        }

        const product =await Product.findById(productId)
        if(!product){
            return res.json({
                success:false,
                message:'product is not found'
            })
        }
        
        const existingItem=wishlist.products.find((item)=>{
            return item.productId._id.toString()==productId.toString()
        })

        if(!existingItem){
            wishlist.products.push({
                productId
            })
        }
        

        
        await wishlist.save();
        return res.status(200).json({ status: true, message: "Product added to wishlist" });
    } catch (error) {
        console.error("Error in addToWishList:", error);
        return res.status(500).json({ status: false, message: "Server error" });
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

// New endpoint for removing from wishlist (used by wishlist.ejs)
const removeFromWishlist = async (req, res) => {
    try {
        const { productId } = req.body;
        const userId = req.session.user;

        // Check if user is logged in
        if (!userId) {
            return res.status(401).json({ success: false, message: "Please log in", redirect: "/login" });
        }

        // Verify user exists
        const user = await User.findById(userId);
        if (!user) {
            return res.status(401).json({ success: false, message: "User not found", redirect: "/login" });
        }

        // Find the user's wishlist
        let wishlist = await Wishlist.findOne({ userId });
        if (!wishlist) {
            return res.status(404).json({ success: false, message: "Wishlist not found" });
        }

        // Check if product exists in wishlist
        const productExists = wishlist.products.some(item => item.productId.toString() === productId);
        if (!productExists) {
            return res.status(404).json({ success: false, message: "Product not in wishlist" });
        }

        // Remove the product from the wishlist
        wishlist.products = wishlist.products.filter(item => item.productId.toString() !== productId);

        // Save the updated wishlist
        await wishlist.save();

        return res.status(200).json({ success: true, message: "Product removed from wishlist" });
    } catch (error) {
        console.error("Error in removeFromWishlist:", error);
        return res.status(500).json({ success: false, message: "Server error" });
    }
};

module.exports = {
    loadWishlist,
    addToWishList,
    getWishlist,
    removeFromWishlist
};
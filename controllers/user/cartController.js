const User =require('../../models/userSchema');
const Product =require('../../models/productSchema');
const Category =require('../../models/categorySchema');
const Cart =require('../../models/cartSchema');
const mongoose = require('mongoose');

const loadCartPage = async (req, res) => {
    try {
        const userId = req.session.user?._id;
        if (!userId) return res.redirect('/login');

        let cart = await Cart.findOne({ user: userId }).populate('items.product');

        if (!cart) {
            cart = new Cart({ user: userId, items: [] });
            await cart.save();
        }

        const totals = calculateCartTotals(cart);
        Object.assign(cart, totals);
        await cart.save();

        const user = await User.findById(userId);
        res.render('user/cart', { cart, user });
    } catch (error) {
        console.error('Error loading cart page:', error);
        res.status(500).render('user/error', { message: 'Failed to load cart.', user: req.session.user });
    }
};

module.exports ={
    loadCartPage,
}
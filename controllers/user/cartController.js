const User = require('../../models/userSchema');
const Product = require('../../models/productSchema');
const Category = require('../../models/categorySchema');
const Cart = require('../../models/cartSchema');
const mongoose = require('mongoose');

const loadCart = async (req, res) => {
    try {
      console.log('ready');
      const userId = req.session.user;
      if (!userId) {
        return res.redirect('/login'); 
      }
      
      const userData = await User.findById(userId);
      let cart = await Cart.findOne({ userId }).populate('items.productId'); 
  
      if (cart) {
        cart.items = cart.items.filter(item => item.productId); 
        cart.shippingCharge = 50;
        cart.subtotal = cart.items.reduce((sum, item) => sum + item.totalPrice, 0); 
        cart.total = cart.subtotal + cart.shippingCharge;
        await cart.save();
      }
  
      console.log(cart, 'cart data');
  
      res.render('cart', {
        user:userData,     
           cart,
        userId,
        profilePicture: userData.profilePicture || null,
      });
    } catch (error) {
      console.error('Cannot render the cart page:', error);
      res.redirect('/pageNotFound');
    }
  };


const addToCart = async (req, res) => {
  try {
    const { id, qty } = req.body;
    const quantity = parseInt(qty);
    const userId = req.session.user;
   

    if (!userId) {
      return res.status(401).json({ success: false, message: 'User not authenticated' ,redirect:"/login"});
    }

    if (isNaN(quantity) || quantity <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid quantity' });
    }

    const product = await Product.findById(id);
    if (!product || typeof product.salePrice !== 'number') {
      return res.status(404).json({ success: false, message: 'Product not found or price missing' });
    }

    let cart = await Cart.findOne({ userId });
    if (!cart) {
      cart = new Cart({ userId, items: [], subtotal: 0 });
    }

    const existingItem = cart.items.find(item => item.productId.toString() === id);
    if (existingItem) {
      existingItem.quantity += quantity;
      existingItem.totalPrice = existingItem.quantity * product.salePrice;
    } else {
      cart.items.push({
        productId: product._id,
        quantity,
        price: product.salePrice,
        totalPrice: quantity * product.salePrice,
      });
    }

    cart.subtotal = cart.items.reduce((sum, item) => sum + item.totalPrice, 0);
    await cart.save();

    return res.status(200).json({ success: true, message: 'Product added to cart' });
  } catch (error) {
    console.error('Error while adding to cart:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};


const updateCart = async (req, res) => {
    try {
      const userId = req.session.user;
      const { updates} = req.body; 
      console.log('Updates received:', updates);
  
      const cart = await Cart.findOne({ userId }).populate('items.productId'); 
      console.log(cart,'dfhgvjhdfvb');
      
  
      if (!cart) {
        return res.json({ success: false, message: 'Cart not found' });
      }
      
      const errors = [];
      
      
      updates.forEach(update => {
        const item = cart.items.find(i => i.productId._id.toString() === update.productId);
        if (item) {
          if (item.productId.quantity < update.quantity) {
            errors.push({
              productId: update.productId,
              message: `Only ${item.productId.quantity} items available in stock for ${item.productId.productName}`

            });
          } else {
            item.quantity = update.quantity;
        }
      }
      console.log(item,'hgdsvdhd');
      
    });

    cart.subtotal = cart.items.reduce((sum, item) => {
      return sum + item.quantity * item.productId.salePrice;
    }, 0);
    cart.shippingCharge = 50; 
    cart.total = cart.subtotal + cart.shippingCharge; 

    await cart.save();
    
    

    res.json({ success: true, cart });

  } catch (error) {
    console.error(error);
    res.json({ success: false, message: 'Error updating cart' });
  }
};

const removeFromCart = async (req, res) => {
    console.log('Entering removeFromCart');
    const userId = req.session.user;
    const { productId } = req.params;
  
    console.log('User ID:', userId);
    console.log('Product ID:', productId);
  
   
    if (!userId) {
      console.log('No user session found');
      return res.status(401).json({ success: false, message: 'User not authenticated' });
    }
  
   
    if (!mongoose.Types.ObjectId.isValid(productId)) {
      console.log('Invalid productId');
      return res.status(400).json({ success: false, message: 'Invalid product ID' });
    }
  
    try {
     
      const cart = await Cart.findOne({ userId }).populate('items.productId');
      console.log('Cart found:', cart);
  
      if (!cart) {
        console.log('Cart not found for user');
        return res.status(404).json({ success: false, message: 'Cart not found' });
      }
  
     
      const initialItemCount = cart.items.length;
      cart.items = cart.items.filter(item => item.productId._id.toString() !== productId);
      console.log('Items after filter:', cart.items);
  
      
      if (cart.items.length === initialItemCount) {
        console.log('Item not found in cart');
        return res.status(404).json({ success: false, message: 'Item not found in cart' });
      }
  
     
      cart.subtotal = cart.items.reduce((sum, item) => sum + item.totalPrice, 0);
      cart.shippingCharge = cart.items.length > 0 ? 50 : 0; 
      cart.total = cart.subtotal + cart.shippingCharge;
      console.log('New subtotal:', cart.subtotal);
  
     
      await cart.save();
      console.log('Cart saved:', cart);
  
      return res.status(200).json({ success: true, message: 'Item removed successfully', cart });
    } catch (error) {
      console.error('Error removing item from cart:', error);
      return res.status(500).json({ success: false, message: 'Internal server error' });
    }
  };
  
  
  

  module.exports ={
    loadCart,
    addToCart,
    updateCart,
    removeFromCart,

  }
  
  
const User = require('../../models/userSchema');
const Product = require('../../models/productSchema');
const Category = require('../../models/categorySchema');
const Cart = require('../../models/cartSchema');
const Offer = require('../../models/offerSchema');
const mongoose = require('mongoose');


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

const loadCart = async (req, res) => {
    try {
        const userId = req.session.user;
        if (!userId) {
            return res.redirect('/login'); 
        }
        
        const userData = await User.findById(userId);
        let cart = await Cart.findOne({ userId }).populate('items.productId'); 
    
        if (cart) {
            cart.items = cart.items.filter(item => item.productId);
            
            for (let item of cart.items) {
                const bestOffer = await getBestOffer(item.productId);
                if (bestOffer) {
                    const discountAmount = (item.productId.salePrice * bestOffer.discountAmount) / 100;
                    item.bestOffer = {
                        name: bestOffer.offerName,
                        discountAmount: discountAmount,
                        originalPrice: item.productId.salePrice
                    };
                    item.totalPrice = (item.productId.salePrice - discountAmount) * item.quantity;
                } else {
                    item.totalPrice = item.productId.salePrice * item.quantity;
                }
            }
            console.log(cart,'cart,idsaf da')
         
            cart.shippingCharge = 50;
            cart.subtotal = cart.items.reduce((sum, item) => sum + item.totalPrice, 0);
            cart.total = cart.subtotal + cart.shippingCharge;
            await cart.save();
        }
    
        res.render('cart', {
            user: userData,     
            cart,
            userId,
            profilePicture: userData.profilePicture || null,
        });
        console.log(cart)
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
      return res.status(401).json({ success: false, message: 'User not authenticated', redirect: "/login" });
    }

    if (isNaN(quantity) || quantity <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid quantity' });
    }

    const product = await Product.findById(id);
    if (!product || typeof product.salePrice !== 'number') {
      return res.status(404).json({ success: false, message: 'Product not found or price missing' });
    }

    if (quantity > product.quantity) {
      return res.status(400).json({
        success: false,
        message: `Only ${product.quantity} items available in stock for ${product.productName}`,
      });
    }

    let cart = await Cart.findOne({ userId });
    if (!cart) {
      cart = new Cart({ userId, items: [], subtotal: 0 });
    }

    const existingItem = cart.items.find(item => item.productId.toString() === id);
    if (existingItem) {
      const newQuantity = existingItem.quantity + quantity;
      if (newQuantity > product.quantity) {
        return res.status(400).json({
          success: false,
          message: `Cannot add more. Only ${product.quantity} items available in stock for ${product.productName}`,
        });
      }
      existingItem.quantity = newQuantity;
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
    const { updates } = req.body;
    console.log('Updates received:', updates);

    const cart = await Cart.findOne({ userId }).populate('items.productId');

    if (!cart) {
      return res.status(404).json({ success: false, message: 'Cart not found' });
    }

    const errors = [];

    for (const update of updates) {
      const item = cart.items.find(i => i.productId._id.toString() === update.productId);
      if (item) {
        if (update.quantity <= 0) {
          errors.push({
            productId: update.productId,
            message: `Quantity must be at least 1 for ${item.productId.productName}`,
          });
        } else if (update.quantity > item.productId.quantity) {
          errors.push({
            productId: update.productId,
            message: `Only ${item.productId.quantity} items available in stock for ${item.productId.productName}`,
          });
        } else {
          item.quantity = update.quantity;
          item.totalPrice = item.quantity * item.productId.salePrice;
        }
      } else {
        errors.push({
          productId: update.productId,
          message: 'Item not found in cart',
        });
      }
    }

    if (errors.length > 0) {
      return res.status(400).json({ success: false, errors });
    }

    cart.subtotal = cart.items.reduce((sum, item) => sum + item.totalPrice, 0);
    cart.shippingCharge = cart.items.length > 0 ? 50 : 0;
    cart.total = cart.subtotal + cart.shippingCharge;

    await cart.save();

    return res.status(200).json({ success: true, cart });
  } catch (error) {
    console.error('Error updating cart:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
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
  
  const updateCartsWithSize = async () => {
    const carts = await Cart.find();
    for (let cart of carts) {
        for (let item of cart.items) {
            if (!item.size) {
                item.size = null; 
            }
        }
        await cart.save();
    }
};
  

  module.exports ={
    loadCart,
    addToCart,
    updateCart,
    removeFromCart,
    updateCartsWithSize

  }
  
  
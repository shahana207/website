const User = require('../../models/userSchema');
const Product = require('../../models/productSchema');
const Category = require('../../models/categorySchema');
const Cart = require('../../models/cartSchema');
const Address= require('../../models/addressSchema');
const mongoose = require('mongoose');
const Order = require("../../models/orderSchema")
const {generateCustomId} = require("../../utils/helpers");

const loadCheckout = async (req, res) => {
    try {
        const userId = req.session.user;
        if (!userId) {
            return res.redirect('/login'); // Redirect to login if user is not authenticated
        }


        
        const user = await User.findById(userId).select('firstName lastName email phone addresses');
        let cart = await Cart.findOne({ userId }).populate('items.productId');

        const addressDoc = await Address.findOne({ userId: userId });

        const addresses = addressDoc && addressDoc.address ? addressDoc.address : [];


        if (!cart) {
            return res.redirect('/cart'); // Redirect to cart if no cart exists
        }


        console.log("userId in bakcend ",userId._id)

        // Recalculate cart totals
        cart.subtotal = cart.items.reduce((sum, item) => sum + item.totalPrice, 0);
        cart.shippingCharge = cart.items.length > 0 ? 50 : 0;
        cart.total = cart.subtotal + cart.shippingCharge;
        await cart.save();

        res.render('checkout', {
            user,   
            cart,
            userId,
            addresses,
            profilePicture: user.profilePicture || null,
        });
    } catch (error) {
        console.error('Cannot render the checkout page:', error);
        res.redirect('/pageNotFound');
    }
};


const saveAddress = async (req, res) => {
    try {
        const userId = req.session.user;
        if (!userId) {
            return res.redirect('/login'); // Redirect to login if user is not authenticated
        }

        if (!mongoose.Types.ObjectId.isValid(userId)) {
            req.flash('error', 'Invalid user ID');
            return res.redirect('/checkout');
        }

        const address = {
            addressType: req.body.addressType,
            name: req.body.name,
            addressLine: req.body.addressLine,
            landmark: req.body.landMark,
            city: req.body.city,
            state: req.body.state,
            pincode: req.body.pincode,
            phone: req.body.phone,
            altPhone: req.body.altPhone || '',
            isDefault: req.body.isDefault === 'on'
        };

        // Validate address
        const errors = validateAddress(address);
        if (Object.keys(errors).length > 0) {
            req.flash('error', Object.values(errors)[0]);
            return res.redirect('/checkout');
        }

        // Find or create the Address document for the user
        let addressDoc = await Address.findOne({ userId });
        if (!addressDoc) {
            addressDoc = new Address({ userId, address: [] });
        }

        // If this address is set as default, unset other default addresses
        if (address.isDefault) {
            addressDoc.address.forEach(addr => (addr.isDefault = false));
        }

        // If user wants to save the address for future use
        if (req.body.saveAddress === 'on') {
            addressDoc.address.push(address);
            await addressDoc.save();
            req.flash('success', 'Address saved successfully');
        } else {
            // If not saving permanently, store in session
            req.session.selectedAddress = address;
            req.flash('success', 'Address selected for this order');
        }

        return res.redirect('/checkout');
    } catch (error) {
        console.error('Cannot save address:', error);
        req.flash('error', 'Failed to save address');
        return res.redirect('/checkout');
    }
};


const placeOrder = async (req, res) => {

    try {
    
      console.log("req.body",req.body)

      const  { paymentMethod,  addressId, totalAmount } = req.body;
 
      const userId = req.session.user._id;
  
    //   const cart = await Cart.findOne({ userId }).populate('items.productId');

    let cart = await Cart.findOne({ userId }).populate({
        path: "items.productId",
        select: "productName salePrice regularPrice quantity status",
    })

    console.log("cart:",cart)

    if(!cart) {
        return res.status(404).json({success:false,message:"cart is not available.."})
    }

    for(let item  of cart.items){
        const product = await Product.findById(item.productId._id);
        if(!product){
            return res.status(400).json({success:false,message:"products in your cart are no longer available"})
        }
        if (product.quantity < item.quantity) {
            return res.status(400).json({
                success: false,
                message:` Insufficient stock for ${product.productName}. Only ${product.quantity} units available.`,
            });
        }

        // const status = await determineStatus(product._id);
        // product.status = status;
        // await product.save();

        // if(status === "Discontinued" ){
        //     return res.status(400).json({success:false,message:`${product.productName} is discontinued and cannot be ordered}`)  
        // }
    }



      const addressDoc = await Address.findOne({ userId });
  
      const deliveryAddress = addressDoc?.address.find(address => 
        address._id.toString() === addressId.toString()
      );

      console.log("deliveryAddress",deliveryAddress)

      if(!deliveryAddress){
        return status(404).json({success:true , messsage:"delivery address is not found..."})
      }
      
  
    //   if (!cart || !cart.items.length || !deliveryAddress) {
    //     console.warn('Invalid order data:', {
    //       hasCart: !!cart,
    //       hasItems: cart?.items.length,
    //       hasAddress: !!deliveryAddress
    //     });
    //     return res.redirect('/pageNotFound');
    //   }
  
    //   const cartItems = cart.items;
    //   const validItems = [];
  
     
    //   for (const item of cartItems) {
    //     if (
    //       !item.productId ||
    //       typeof item.productId.quantity !== 'number' ||
    //       item.productId.quantity < item.quantity ||
    //       typeof item.price !== 'number' ||
    //       isNaN(item.price)
    //     ) {
    //       console.warn('Skipping invalid item in placeOrder:', {
    //         productId: item.productId?._id,
    //         productQuantity: item.productId?.quantity,
    //         itemPrice: item.price,
    //         itemQuantity: item.quantity
    //       });
    //       continue;
    //     }
    //     validItems.push(item);
    //   }
  
    //   if (!validItems.length) {
    //     console.error('No valid items to process order:', { cartItems });
    //     return res.redirect('/pageNotFound');
    //   }
  
      let totalPrice = 0 ;
      const orderedItems = cart.items.map(item => {
        const itemTotal = item.price * item.quantity;
        totalPrice += itemTotal;
        return {
          product: item.productId._id,
          quantity: item.quantity,
          price: item.price
        };
      });
  
      if (isNaN(totalPrice) || totalPrice <= 0) {
        console.error('Invalid total price:', { totalPrice, orderedItems });
        return res.redirect('/pageNotFound');
      }
  
      const shippingFee = 50;
      const finalAmount = totalPrice + shippingFee;
  
      
      const newOrder = new Order({
        orderId:generateCustomId("ORD"),
        userId,
        orderedItems,
        totalPrice,
        discount: 0,
        address:deliveryAddress,
        finalAmount,
        paymentMethod,
        invoiceDate: new Date(),
        status: 'pending',
        createdOn: new Date(),
        couponApplied: false,
        user: req.session.user._id,
      });

    await newOrder.save();
    console.log('orderId:',newOrder.orderId);
     

      for (const item of cart.items) {
         item.productId.quantity -= item.quantity;
         await item.productId.save();
      }
  
      await Cart.deleteOne({ userId });
      
      req.session.orderId = newOrder.orderId;
      return res.json({success:true , message:"order placed succussfully..",redirectUrl: "order-success"})

    } catch (error) {
      console.error("Error in placeOrder:", error);
      res.redirect('/pageNotFound');
    }
  };
  

module.exports = {
    loadCheckout,
    saveAddress,
    placeOrder,
};    
const User = require('../../models/userSchema');
const Product = require('../../models/productSchema');
const Category = require('../../models/categorySchema');
const Cart = require('../../models/cartSchema');
const Address= require('../../models/addressSchema');
const mongoose = require('mongoose');
const Order = require("../../models/orderSchema")
const path = require('path')
const fs = require('fs')
const puppeteer = require('puppeteer');
const ejs = require('ejs');
const {generateCustomId} = require("../../utils/helpers");

const loadCheckout = async (req, res) => {
    try {
        const userId = req.session.user;
        if (!userId) {
            return res.redirect('/login'); 
        }


        
        const user = await User.findById(userId).select('firstName lastName email phone addresses');
        let cart = await Cart.findOne({ userId }).populate('items.productId');

        const addressDoc = await Address.findOne({ userId: userId });

        const addresses = addressDoc && addressDoc.address ? addressDoc.address : [];


        if (!cart) {
            return res.redirect('/cart'); 
        }


        console.log("userId in bakcend ",userId._id)

      
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
            return res.redirect('/login'); 
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

      
        const errors = validateAddress(address);
        if (Object.keys(errors).length > 0) {
            req.flash('error', Object.values(errors)[0]);
            return res.redirect('/checkout');
        }

       
        let addressDoc = await Address.findOne({ userId });
        if (!addressDoc) {
            addressDoc = new Address({ userId, address: [] });
        }

        if (address.isDefault) {
            addressDoc.address.forEach(addr => (addr.isDefault = false));
        }

       
        if (req.body.saveAddress === 'on') {
            addressDoc.address.push(address);
            await addressDoc.save();
            req.flash('success', 'Address saved successfully');
        } else {
           
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
        console.log("req.body", req.body);
        console.log("Session data in placeOrder:", req.session);

        const { paymentMethod, addressId, totalAmount } = req.body;
        const userId = req.session.user._id;

        let cart = await Cart.findOne({ userId }).populate({
            path: "items.productId",
            select: "productName salePrice regularPrice quantity status",
        });

        console.log("cart:", cart);

        if (!cart) {
            return res.status(404).json({ success: false, message: "cart is not available.." });
        }

        for (let item of cart.items) {
            const product = await Product.findById(item.productId._id);
            if (!product) {
                return res.status(400).json({ success: false, message: "products in your cart are no longer available" });
            }
            if (product.quantity < item.quantity) {
                return res.status(400).json({
                    success: false,
                    message: `Insufficient stock for ${product.productName}. Only ${product.quantity} units available.`,
                });
            }
        }

        const addressDoc = await Address.findOne({ userId });
        const deliveryAddress = addressDoc?.address.find(address =>
            address._id.toString() === addressId.toString()
        );

        console.log("deliveryAddress", deliveryAddress);

        if (!deliveryAddress) {
            return res.status(404).json({ success: true, message: "delivery address is not found..." });
        }

        let totalPrice = 0;
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
            orderId: generateCustomId("ORD"),
            user: userId, 
            orderedItems,
            totalPrice,
            discount: 0,
            address: deliveryAddress,
            finalAmount,
            paymentMethod,
            invoiceDate: new Date(),
            status: 'pending', 
            createdOn: new Date(),
            couponApplied: false,
        });

        await newOrder.save();
        console.log('orderId:', newOrder.orderId);
        console.log('Saved order:', await Order.findOne({ orderId: newOrder.orderId }));

        for (const item of cart.items) {
            item.productId.quantity -= item.quantity;
            await item.productId.save();
        }

        await Cart.deleteOne({ userId });

        req.session.orderId = newOrder.orderId;
        console.log('Session after setting orderId:', req.session);

        return res.json({ success: true, message: "order placed successfully..", redirectUrl: "order-success" });
    } catch (error) {
        console.error("Error in placeOrder:", error);
        res.redirect('/pageNotFound');
    }
};
  
const orderSuccess = async (req, res) => {
    try {
       
        const userId = req.session.user?._id;
        console.log('Session user:', req.session.user); 
        console.log('Extracted userId:', userId);

    
        if (!userId) {
            console.log('No userId in session, redirecting to login');
            return res.redirect('/login?error=User not authenticated');
        }

        if (!mongoose.Types.ObjectId.isValid(userId)) {
            console.log('Invalid userId:', userId);
            return res.redirect('/pageNotFound?error=Invalid user ID');
        }

     
        const orderId = req.session.orderId;
        console.log('Session orderId:', orderId);
        if (!orderId) {
            console.log('No orderId in session, redirecting to orders');
            return res.redirect('/orders?error=No order ID found in session');
        }

        
        const order = await Order.findOne({ orderId, user: userId })
            .populate('orderedItems.product', 'productName salePrice images')
            .populate('user', 'firstName lastName email');
        console.log('Fetched order:', order);

        if (!order) {
            console.log('Order not found for orderId:', orderId, 'and userId:', userId);
            return res.redirect('/orders?error=Order not found');
        }

        
        delete req.session.orderId;
        console.log('Cleared session orderId');

       
        res.render('order-success', {
            order,
            userId,
        });
    } catch (error) {
        console.error('Cannot load order success page:', error);
        res.redirect('/pageNotFound?error=Failed to load order success page');
    }
};


const downloadInvoice = async (req, res) => {
    console.log('Generating PDF...');
    const { orderId } = req.params; 
    const userId = req.session.user?._id;
  
    try {
   
      if (!userId) {
        return res.status(401).json({ message: 'User not authenticated' });
      }
  
      
      const order = await Order.findOne({ orderId })
                  .populate('orderedItems.product', 'productName salePrice images')
                  .populate('user', 'firstName lastName email');
      
      if (!order) {
        console.log('Order not found for orderId:', orderId);
        return res.status(404).json({ message: 'Order not found' });
      }
  
      
      if (order.user._id.toString() !== userId.toString()) {
        console.log('Unauthorized access to order:', orderId, 'by user:', userId);
        return res.status(403).json({ message: 'Unauthorized access to this order' });
      }
  
      
      const invoiceData = {
        orderId: order.orderId,
        orderDate: order.createdOn.toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        }),
        customer: {
          name: `${order.user.firstName} ${order.user.lastName}`,
          address: {
            addressType: order.address.addressType,
            name: order.address.name,
            city: order.address.city,
            state: order.address.state,
            pincode: order.address.pincode,
            phone: order.address.phone,
            altPhone: order.address.altPhone || '',
          },
          email: order.user.email,
        },
        items: order.orderedItems.map(item => ({
          name: item.product ? item.product.productName : 'Product Not Found',
          quantity: item.quantity,
          unitPrice: item.price,
          amount: item.price * item.quantity,
        })),
        subtotal: order.totalPrice,
        shipping: 50.00, 
        discount: order.discount || 0,
        total: order.finalAmount,
        paymentMethod: order.paymentMethod,
      };
  
      console.log('Invoice data:', invoiceData);
  
  
      const templatePath = path.join(__dirname, '../../', 'views', 'invoice.ejs');
      console.log(`Rendering template from: ${templatePath}`);
  
      ejs.renderFile(templatePath, invoiceData, async (err, htmlContent) => {
        if (err) {
          console.error('Error rendering EJS:', err);
          return res.status(500).json({ message: 'Error rendering invoice template' });
        }
  
        console.log('EJS rendering successful, launching Puppeteer...');
  
       
        const browser = await puppeteer.launch({ headless: 'new' });
        const page = await browser.newPage();
        await page.setContent(htmlContent, { waitUntil: 'domcontentloaded' });
  
       
        const pdfBuffer = await page.pdf({
          format: 'A4',
          printBackground: true,
          margin: {
            top: '20px',
            right: '20px',
            bottom: '20px',
            left: '20px',
          },
        });
  
        await browser.close();
        console.log('PDF generated successfully!');
  
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=Invoice-${order.orderId}.pdf`);
        res.setHeader('Content-Length', pdfBuffer.length);
  
        
        res.end(pdfBuffer);
      });
    } catch (error) {
      console.error('Error generating the PDF:', error);
      res.status(500).send('An error occurred while generating the PDF');
    }
  };
  


module.exports = {
    loadCheckout,
    saveAddress,
    placeOrder,
    orderSuccess,
    downloadInvoice,
};    
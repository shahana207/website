const express=require("express");
const router=express.Router();
const userController=require("../controllers/user/userController");
const passport = require("passport");

const {uploadProfilePicture}=require("../helpers/multer");

// const { route } = require("../app");
const { userAuth } = require("../middlewares/auth");
const productController = require('../controllers/user/productController');
const profileController = require("../controllers/user/profileController");
const cartController = require("../controllers/user/cartController");
const checkoutController = require('../controllers/user/checkoutController');
const ordersController = require('../controllers/user/ordersController');
const { route } = require("./adminRouter");


//Error management
router.get("/pageNotFound",userController.pageNotFound);

//sign up management
router.get("/signup",userController.loadSignup);

router.post("/signup",userController.signup);

router.get("/pageNotFound",userController.pageNotFound);

router.post("/verify-otp",userController.verifyOtp);

router.post("/resend-otp",userController.resendOtp);

router.get('/auth/google',passport.authenticate('google',{scope:['profile','email']}));

router.get("/auth/google/callback", (req, res, next) => {
    passport.authenticate("google", (err, user, info) => {
        if (err) return next(err);

        if (!user) {
            const message = info?.message || 'Google login failed';
            return res.redirect(`/login?error=${encodeURIComponent(message)}`);
        }

        req.logIn(user, (err) => {
            if (err) return next(err);
            req.session.user = { _id: user._id };
            return res.redirect("/");
        });
    })(req, res, next);
});



//Login management
router.get("/login",userController.loadLogin);

router.post('/login', userController.loginUser); 

router.get("/logout",userController.logout);


//home page & shopping page
router.get('/',userAuth,userController.loadHomepage);

router.get("/shop",userAuth,userController.loadShoppingPage);


//product management
router.get("/productDetails",userAuth,productController.productDetails);


//password management
router.get("/forgot-password",profileController.getforgotPasspage);

router.post("/forgot-email-valid",profileController.forgotEmailValid);

router.post("/verify-passForgot-otp",profileController.verifyForgotPassOtp);

router.get("/reset-password",profileController.getResetPassPage);

router.post("/resend-forgot-otp",profileController.resendOtp);

router.post("/reset-password",profileController.postNewPassword);

//profile management
router.get("/userProfile",userAuth,profileController.userProfile);

router.get("/getEditProfile",userAuth,profileController.getEditProfile);

router.post('/updateProfile', uploadProfilePicture.single('profilePicture'), profileController.updateProfile);

router.get("/change-email",userAuth,profileController.changeEmail);

router.post("/change-email", userAuth, profileController.changeEmailValid);

router.post("/verify-email-otp",userAuth,profileController.verifyEmailOtp);

router.post("/update-email",userAuth,profileController.updateEmail);

router.get("/change-password",userAuth,profileController.changePassword);

router.post("/change-password",userAuth,profileController.changePasswordValid);

router.post("/verify-changepassword-otp",userAuth,profileController.verifyChangePassOtp);

// Address Management
router.get("/address",userAuth,profileController.userAddress);

router.get("/add-address",userAuth,profileController.addAddress);

router.post("/add-address", userAuth, profileController.postAddAddress);
router.post("/addAdrress", userAuth, profileController.checkoutAddAddress);


router.get('/edit-address', userAuth, profileController.editAddress);

router.post('/update-address/:id', userAuth, profileController.postEditAddress);


// router.post('/edit-address-checkout/:id', userAuth, profileController.editAddressCheckout);


router.get("/delete-address",userAuth,profileController.deleteAddress);


// Cart Management
router.get('/cart',userAuth,cartController.loadCart);

router.post('/addToCart',userAuth,cartController.addToCart);

router.put('/update-cart',userAuth,cartController.updateCart);

router.patch('/removeFromCart/:productId', userAuth,cartController.removeFromCart);


//checkout management

router.get('/checkout', userAuth, checkoutController.loadCheckout);

router.post('/save-address', checkoutController.saveAddress);

router.post("/place-order",userAuth,checkoutController.placeOrder);

router.get("/order-success", userAuth, checkoutController.orderSuccess); 

router.get("/download-invoice/:orderId", userAuth, checkoutController.downloadInvoice);


// //order management

router.get("/order",ordersController.loadOrders);

router.post('/cancel-order', userAuth, ordersController.cancelOrder);

router.get('/order-details/:orderId', userAuth, ordersController.viewOrderDetails);

router.post('/cancel-item', userAuth, ordersController.cancelItem);

router.post('/return-item', userAuth, ordersController.returnItem);







module.exports=router;
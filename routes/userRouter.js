const express=require("express");
const router=express.Router();
const userController=require("../controllers/user/userController");
const passport = require("passport");
// const { route } = require("../app");
const { userAuth } = require("../middlewares/auth");
const productController = require('../controllers/user/productController');
const profileController = require("../controllers/user/profileController");


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


//password
router.get("/forgot-password",profileController.getforgotPasspage);

router.post("/forgot-email-valid",profileController.forgotEmailValid);

router.post("/verify-passForgot-otp",profileController.verifyForgotPassOtp);

router.get("/reset-password",profileController.getResetPassPage);

router.post("/resend-forgot-otp",profileController.resendOtp);

router.post("/reset-password",profileController.postNewPassword);


module.exports=router;
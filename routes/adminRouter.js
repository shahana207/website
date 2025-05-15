const express = require("express");
const router = express.Router();

const adminController = require("../controllers/admin/adminController");
const userController = require("../controllers/admin/userController");
const categoryController = require("../controllers/admin/categoryControllers");
const brandController = require("../controllers/admin/brandControllers");
const productController = require("../controllers/admin/productController");
const orderController=require("../controllers/admin/orderController");
const couponController=require("../controllers/admin/couponController");
const offerController = require("../controllers/admin/offerController");

const { userAuth, adminAuth } = require("../middlewares/auth");
const { upload } = require("../helpers/multer");  




//error management
router.get("/pageerror",adminController.pageerror);



//log in management
router.get("/login",adminController.loadLogin);

router.post("/login",adminController.login);

router.get("/dashboard",adminAuth,adminController.loadDashboard);

router.get("/logout",adminController.logout);

//user management
router.get("/users",adminAuth,userController.userInfo);

router.patch("/blockUser/:id",adminAuth,userController.userBlocked);

router.patch("/unblockUser/:id",adminAuth,userController.userunBlocked);


//category management
router.get("/category",adminAuth,categoryController.categoryInfo);

router.post("/addCategory",adminAuth,categoryController.addCategory);

router.post("/categories/toggle-status/:id",adminAuth,categoryController.getActiveCategory);

router.get("/categories/:id",adminAuth,categoryController.editCategory);

router.post('/categories/update',categoryController.posteditcategory);

router.delete("/categories/:id", adminAuth, categoryController.deleteCategory);

router.get('/search-category',categoryController.searchCategory);


// Brand Management Routes
router.get('/brands', brandController.getBrandpage);

router.post('/addBrand', brandController.addBrand)
; 
router.get('/brand/:id', brandController.editBrand); 

router.post('/brand/update', brandController.updateBrand); 

router.post('/brand/toggle-status/:id', brandController.toggleBrandStatus); 

router.delete('/brand/:id', brandController.deleteBrand); 



//product management
router.get('/products',adminAuth,productController.getAllProducts);

router.get('/load-add-product',adminAuth,productController.getProductAddPage);

router.post('/addProducts', adminAuth, upload.array('productImages', 4), productController.addProducts);




router.post('/block-product',adminAuth,productController.blockProduct)

router.post('/unblock-product',adminAuth,productController.unblockProduct)

router.get('/editProduct',adminAuth,productController.getEditProduct);

router.post('/editProduct/:id', adminAuth, upload.array('newImages', 4), productController.editProduct);

router.patch('/deleteProduct/:id', adminAuth, productController.deleteProduct);



//order management
router.get('/ordersadmin', adminAuth,orderController. getOrders);

router.get('/order-details/:orderId', adminAuth,orderController.getOrderDetails);

router.post('/update-order-status/:orderId', adminAuth,orderController.updateOrderStatus);

router.post('/handle-return-request',adminAuth,orderController. handleReturnRequest);


//coupon management
router.get("/coupon",adminAuth,couponController.loadCoupon);

router.post("/coupon/add", adminAuth, couponController.addCoupon);

router.post("/coupon/edit/:id", adminAuth, couponController.editCoupon);

router.get("/coupon/:id", adminAuth, couponController.getCoupon);

router.post("/coupon/delete/:id", adminAuth, couponController.deleteCoupon);


// Offer management
router.get('/offers', adminAuth, offerController.getAllOffers);

// router.get('/offers/add', adminAuth, offerController.getAddOfferPage);
 
router.get('/addOffer', adminAuth, offerController.getAddOfferPage);
router.get('/editOffer/:id', adminAuth, offerController.getEditOfferPage);
router.get('/applicable-items', adminAuth, offerController.getApplicableItems);
router.post('/addOffer', adminAuth, offerController.addOffer);
router.post('/offers/:id/edit', adminAuth, offerController.editOffer);
router.post('/toggleOffer', adminAuth, offerController.toggleOffer);


module.exports=router;
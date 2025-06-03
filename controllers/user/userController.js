const User = require("../../models/userSchema");
const Category = require("../../models/categorySchema");
const Product = require("../../models/productSchema");
const Brand = require("../../models/brandSchema");
const Wallet=require("../../models/walletSchema");
const dotenv = require("dotenv").config(); 
const nodemailer = require("nodemailer");
const Offer = require("../../models/offerSchema");
const { generateCustomId } = require("../../utils/helpers");
const bcrypt = require("bcrypt");

const generateReferralCode = () => {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 8; i++) {
        code += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return code;
};


const pageNotFound = async (req, res) => {
    try {
        res.render("page-404");
    } catch (error) {
        res.redirect("/pageNotFound");
    }
};

const loadHomepage = async (req, res) => {
    try {
        const user = req.session.user;
        const categories = await Category.find({ isListed: true });
        
        let ProductData = await Product.find({
            isBlocked: false,
            category: { $in: categories.map((category) => category._id) },
            quantity: { $gt: 0 }
        });

        ProductData.sort((a, b) => new Date(b.createdOn) - new Date(a.createdOn));
        ProductData = ProductData.slice(0, 4);

        if (user) {
            const userData = await User.findOne({ _id: user._id });
            return res.render("home", { user: userData, products: ProductData });
        } else {
            return res.render("home", { user: null, products: ProductData }); 
        }
    } catch (error) {
        console.log("Home page not loading:", error);
        res.status(500).send("Server Error");
    }
};

const loadSignup = async (req, res) => {
    try {
        const referralCode = req.query.referralCode || ''; 
        return res.render("signup", { referralCode });
    } catch (error) {
        console.log("Signup page not loading:", error);
        res.status(500).send("Server Error");
    }
};

function generateOtp() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

async function sendVerificationEmail(email, otp) {
    try {
        const transporter = nodemailer.createTransport({
            service: "gmail",
            port: 587, 
            secure: false,
            requireTLS: true,
            auth: {
                user: process.env.NODEMAILER_EMAIL,
                pass: process.env.NODEMAILER_PASSWORD,
            },
        });

        const info = await transporter.sendMail({
            from: process.env.NODEMAILER_EMAIL, 
            to: email,
            subject: "Verify your account",
            text: `Your OTP is ${otp}`,
            html: `<b>Your OTP: ${otp}</b>`,
        });

        return info.accepted.length > 0;
    } catch (error) {
        console.log("Error sending email", error);
        return false;
    }
}

const signup = async (req, res) => {
  try {
    const { name, phone, email, password, confirmPassword, referralCode } = req.body;

   
    if (password !== confirmPassword) {
      return res.render("signup", { message: "Passwords do not match", referralCode });
    }

    
    const phonePattern = /^[6-9]\d{9}$/;
    const sequentialNumbers = /^(?:1234567890|0123456789|9876543210|0987654321)$/;
    const repetitiveNumbers = /^(\d)\1{9}$/;

    if (!phonePattern.test(phone)) {
      return res.render("signup", {
        message: "Enter a valid 10-digit Indian phone number starting with 6, 7, 8, or 9",
        referralCode,
      });
    }

    if (sequentialNumbers.test(phone)) {
      return res.render("signup", {
        message: "Sequential numbers like 1234567890 are not allowed",
        referralCode,
      });
    }

    if (repetitiveNumbers.test(phone)) {
      return res.render("signup", {
        message: "Repetitive numbers like 1111111111 are not allowed",
        referralCode,
      });
    }

   
    const findPhone = await User.findOne({ phone });
    if (findPhone) {
      return res.render("signup", {
        message: "Phone number already exists",
        referralCode,
      });
    }

    
    const findUser = await User.findOne({ email });
    if (findUser) {
      return res.render("signup", {
        message: "User with this email already exists",
        referralCode,
      });
    }

    if (referralCode) {
      const validReferral = await User.findOne({ referralCode });
      if (!validReferral) {
        return res.render("signup", {
          message: "Invalid referral code",
          referralCode,
        });
      }
    }

   
    const otp = generateOtp();
    const emailSent = await sendVerificationEmail(email, otp);
    if (!emailSent) {
      return res.json("email-error");
    }

    req.session.userOtp = otp;
    req.session.otpExpires = Date.now() + 30 * 1000;
    req.session.userData = { name, phone, email, password, referralCode };

    res.render("verify-otp");
    console.log("OTP Sent:", otp);
  } catch (error) {
    console.error("Signup error:", error);
    res.redirect("/pageNotFound");
  }
};

const verifyOtp = async (req, res) => {
    try {
        const { otp } = req.body;

        if (req.session.otpExpires && Date.now() > req.session.otpExpires) {
            req.session.userOtp = null;
            return res.status(400).json({ success: false, message: "OTP expired. Please request a new one." });
        }

        if (req.session.userOtp && otp === req.session.userOtp) {
            const userData = req.session.userData;

            if (!userData) {
                return res.status(400).json({ success: false, message: "User data missing in session" });
            }

            const hashedPass = await bcrypt.hash(userData.password, 10);
            const referralCode = generateReferralCode();

            const newUser = new User({
                name: userData.name,
                email: userData.email,
                phone: userData.phone,
                password: hashedPass,
                referralCode
            });

            await newUser.save();

            let newUserWallet = await Wallet.findOne({ userId: newUser._id });
            if (!newUserWallet) {
                newUserWallet = new Wallet({
                    userId: newUser._id,
                    balance: 0,
                    transactions: []
                });
            }

            if (userData.referralCode) {
                const referrer = await User.findOne({ referralCode: userData.referralCode });
                if (referrer) {
                  
                    referrer.referralHistory.push({
                        referredUser: newUser._id,
                        name: newUser.name,
                        status: "Completed",
                        reward: 1000
                    });

                   
                    let referrerWallet = await Wallet.findOne({ userId: referrer._id });
                    if (!referrerWallet) {
                        referrerWallet = new Wallet({
                            userId: referrer._id,
                            balance: 0,
                            transactions: []
                        });
                    }

                    referrerWallet.balance += 1000;
                    referrerWallet.transactions.push({
                        transactionId: generateCustomId("TNX"),
                        amount: 1000,
                        type: "Credit",
                        method: "Referral",
                        status: "Completed",
                        description: `Referral reward for referring ${newUser.name}`,
                        date: new Date()
                    });

                  
                    newUserWallet.balance += 500;
                    newUserWallet.transactions.push({
                        transactionId: generateCustomId("TNX"),
                        amount: 500,
                        type: "Credit",
                        method: "Signup",
                        status: "Completed",
                        description: "Signup bonus via referral",
                        date: new Date()
                    });

                    
                    newUser.redeemed = true;

                    await referrerWallet.save();
                    await newUserWallet.save();
                    await referrer.save();
                    await newUser.save();
                }
            } else {
                
                await newUserWallet.save();
            }

            req.session.userOtp = null;
            req.session.userData = null;
            req.session.otpExpires = null;

            return res.json({ success: true, redirectUrl: "/login" });
        }

        return res.status(400).json({ success: false, message: "Invalid OTP" });
    } catch (error) {
        console.error("Error while verifying OTP:", error);
        return res.status(500).json({ success: false, message: "Error while verifying OTP" });
    }
};

const resendOtp = async (req, res) => {
    try {
        const { email } = req.session.userData;
        if (!email) {
            return res.status(400).json({ success: false, message: "Email not found in session" });
        }

        const otp = generateOtp();
        req.session.userOtp = otp;
        req.session.otpExpires = Date.now() + 30 * 1000;

        const emailSent = await sendVerificationEmail(email, otp);
        if (emailSent) {
            console.log("Resend OTP:", otp);
            res.status(200).json({ success: true, message: "OTP Resend Successfully" });
        } else {
            res.status(500).json({ success: false, message: "Failed to resend OTP. Please try again" });
        }
    } catch (error) {
        console.error("Error resending OTP", error);
        res.status(500).json({ success: false, message: "Internal Server Error. Please try again" });
    }
};

const loadLogin = async (req, res) => {
    try {
        let error = req.query.error ? req.query.error : '';
        if (!req.session.user) {
            return res.render("login", { errorMessage: error });
        } else {
            res.redirect('/');
        }
    } catch (error) {
        res.redirect("/pageNotFound");
    }
};

const loginUser = async (req, res) => {
    try {
        const { username, password } = req.body;

        const user = await User.findOne({ email: username });

        if (!user) {
            return res.render("login", { errorMessage: "Invalid credentials" });
        }

        if (user.isBlocked) {
            return res.render("login", { errorMessage: "Account is Blocked" });
        }

        const passwordMatch = await bcrypt.compare(password, user.password);
        if (!passwordMatch) {
            return res.render("login", { errorMessage: "Invalid credentials" });
        }

        req.session.user = {
            _id: user._id,
            name: user.name,
            email: user.email,
            isAdmin: user.isAdmin,
        };

        res.redirect("/");
    } catch (error) {
        console.error("Login error:", error);
        res.status(500).render("login", { errorMessage: "Something went wrong" });
    }
};

const logout = async (req, res) => {
    try {
        req.session.destroy((error) => {
            if (error) {
                console.log("Session destruction error", error.message);
                return res.redirect("/pageNotFound");
            }
            return res.redirect("/login");
        });
    } catch (error) {
        console.log("Logout error", error);
        res.redirect("/pageNotFound");
    }
};

const getBestOffer = async (product) => {
    try {
        if (!product || product.isBlocked || product.isDeleted) {
            return null;
        }

        let productOffer = null;
        const productOfferData = await Offer.findOne({
            offerType: 'Products',
            applicableTo: product._id,
            isListed: true,
            isDeleted: false,
            validFrom: { $lte: new Date() },
            validUpto: { $gte: new Date() },
        });

        if (productOfferData) {
            productOffer = {
                name: productOfferData.offerName,
                discount: productOfferData.discountAmount,
                originalPrice: product.salePrice,
                offerPrice: product.salePrice * (1 - productOfferData.discountAmount / 100),
            };
        }

        let categoryOffer = null;
        if (product.category) {
            const categoryOfferData = await Offer.findOne({
                offerType: 'Category',
                applicableTo: product.category._id,
                isListed: true,
                isDeleted: false,
                validFrom: { $lte: new Date() },
                validUpto: { $gte: new Date() },
            });

            if (categoryOfferData) {
                categoryOffer = {
                    name: categoryOfferData.offerName,
                    discount: categoryOfferData.discountAmount,
                    originalPrice: product.salePrice,
                    offerPrice: product.salePrice * (1 - categoryOfferData.discountAmount / 100),
                };
            }
        }

        if (productOffer && categoryOffer) {
            return productOffer.discount >= categoryOffer.discount ? productOffer : categoryOffer;
        } else if (productOffer) {
            return productOffer;
        } else if (categoryOffer) {
            return categoryOffer;
        } else {
            return null;
        }
    } catch (error) {
        console.error('Error in getBestOffer:', error);
        return null;
    }
};

const loadShoppingPage = async (req, res) => {
    try {
        const {
            search,
            sort,
            cat,
            brand,
            minPrice,
            maxPrice,
            page = 1,
        } = req.query;

        const user = req.session.user;

        let userData = null;
        if (user) {
            userData = await User.findOne({ _id: user._id });
        }

        const categoryId = cat;
        const brandId = brand;

        let query = {
            isBlocked: false,
            isDeleted: false,
        };

        if (search) {
            query.productName = { $regex: search, $options: 'i' };
        }

        if (categoryId) {
            query.category = categoryId;
        }

        if (brandId) {
            query.brand = brandId;
        }

        if (minPrice || maxPrice) {
            query.salePrice = {};
            if (minPrice) query.salePrice.$gte = Number(minPrice);
            if (maxPrice) query.salePrice.$lte = Number(maxPrice);
        }

        let sortOption = {};
        switch (sort) {
            case 'newest':
                sortOption.createdAt = -1;
                break;
            case 'price-low':
                sortOption.salePrice = 1;
                break;
            case 'price-high':
                sortOption.salePrice = -1;
                break;
            case 'a-z':
                sortOption.productName = 1;
                break;
            case 'z-a':
                sortOption.productName = -1;
                break;
            default:
                sortOption.createdAt = -1;
        }

        const limit = 9;
        const skip = (Number(page) - 1) * limit;

        const products = await Product.find(query)
            .populate('category')
            .populate('brand')
            .sort(sortOption)
            .skip(skip)
            .limit(limit);

        const productsWithOffers = await Promise.all(
            products.map(async (product) => {
                const bestOffer = await getBestOffer(product);
                return {
                    ...product.toObject(),
                    bestOffer
                };
            })
        );

        const totalProducts = await Product.countDocuments(query);
        const totalPages = Math.ceil(totalProducts / limit);

        const categories = await Category.find();
        const brands = await Brand.find();

        res.render('shop', {
            user: userData,
            products: productsWithOffers,
            category: categories,
            brand: brands,
            currentPage: Number(page),
            totalPages,
            search,
            sort,
            selectedCategory: categoryId,
            selectedBrand: brandId,
            minPrice,
            maxPrice,
        });
    } catch (error) {
        console.error(error);
        res.status(500).send('Server Error');
    }
};


const referralPage = async (req, res) => {
    try {
        const userId = req.session.user;
        if (!userId) {
            return res.redirect("/login");
        }

        const user = await User.findById(userId._id);
        if (!user) {
            return res.status(404).send("User not found");
        }

        const wallet = await Wallet.findOne({ userId: user._id }) || { balance: 0, transactions: [] };

        res.render("referral", {
            user,
            wallet, 
            active: 'referral'
        });
    } catch (error) {
        console.log("Error from referralPage:", error);
        res.status(500).send("Server error");
    }
};

const getAboutUs = async (req, res) => {
    try {
        res.render('aboutUs');
    } catch (error) {
        console.error("Error loading About Us page:", error);
        res.redirect("/pageerror");
    }
};


const getContactUs = async (req, res) => {
  try {
    res.render('contactUs');
  } catch (error) {
    console.error("Error loading Contact Us page:", error);
    res.redirect("/pageerror");
  }
};

module.exports = {
    loadHomepage,
    pageNotFound,
    loadSignup,
    signup,
    verifyOtp,
    resendOtp,
    loginUser, 
    loadLogin,
    logout,
    loadShoppingPage,
    referralPage,
    getAboutUs,
    getContactUs,
};
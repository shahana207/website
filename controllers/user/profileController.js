const User = require("../../models/userSchema");
const Address=require("../../models/addressSchema");
const nodemailer = require("nodemailer");
const bcrypt = require("bcrypt");
const dotenv = require("dotenv").config();
const session = require("express-session");
const fs = require('fs').promises;
const mongoose=require('mongoose');
const path = require('path');




// Generate 6-digit OTP
function generateOtp() {
    const digits = '1234567890';
    let otp = "";
    for (let i = 0; i < 6; i++) {
        otp += digits[Math.floor(Math.random() * 10)];
    }
    return otp;
}

// Send OTP to email
const sendVerificationEmail = async (email, otp) => {
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

        const mailOptions = {
            from: process.env.NODEMAILER_EMAIL,
            to: email,
            subject: "Your OTP for password reset",
            text: `Your OTP is ${otp}`,
            html: `<b><h4>Your OTP: ${otp}</h4></b>`
        };

        const info = await transporter.sendMail(mailOptions);
        console.log("Email sent:", info.messageId);
        return true;

    } catch (error) {
        console.error("Error sending email", error);
        return false;
    }
};


const securePassword=async(password)=>{
    try {
        const passwordHash=await bcrypt.hash(password,10);
        return passwordHash;
    } catch (error) {
        
    }
}




const getforgotPasspage = async (req, res) => {
    try {
        res.render("forgot-password");
    } catch (error) {
        res.redirect("/pageNotFound");
    }
};


const forgotEmailValid = async (req, res) => {
    try {
        const { email } = req.body;
        const findUser = await User.findOne({ email: email });

        if (findUser) {
            const otp = generateOtp();
            const emailSent = await sendVerificationEmail(email, otp);

            if (emailSent) {
                req.session.userOtp = otp;
                req.session.email = email;
                console.log("OTP:", otp);
                res.render("forgotPass-otp"); 
            } else {
                res.json({ success: false, message: "Failed to send OTP. Please try again" });
            }

        } else {
            res.render("forgot-password", {
                message: "User with this email does not exist"
            });
        }
    } catch (error) {
        console.error(error);
        res.redirect("/pageNotFound");
    }
};


const verifyForgotPassOtp = async (req, res) => {
    try {
        const enteredOtp = req.body.otp;

        if (enteredOtp === req.session.userOtp) {
            res.json({ success: true, redirectUrl: "/reset-password" });
        } else {
            res.json({ success: false, message: "OTP not matching" });
        }
    } catch (error) {
        res.status(500).json({ success: false, message: "An error occurred. Please try again." });
    }
};


const getResetPassPage=async(req,res)=>{
    try {
        res.render("reset-password");

    } catch (error) {
        res.redirect("/pageNotFound");

    }
}


const resendOtp = async (req, res) => {
    try {
        const otp = generateOtp();
        req.session.userOtp = otp;
        const email = req.session.email;

        console.log("Resending OTP:", email);

        const emailSent = await sendVerificationEmail(email, otp);

        if (emailSent) {
            console.log("Resend OTP:", otp);
            res.status(200).json({ success: true, message: "Resend OTP Successful" });
        } else {
            res.status(500).json({ success: false, message: "Failed to resend OTP" });
        }
    } catch (error) {
        console.error("Resend OTP error:", error);
        res.status(500).json({ success: false, message: "An error occurred while resending OTP" });
    }
};



const postNewPassword = async (req, res) => {
    try {
        const { newPass1, newPass2 } = req.body;
        const email = req.session.email;

        if (!email) {
            return res.render("reset-password", { message: "Session expired. Please try again." });
        }

        if (newPass1 === newPass2) {
            const passwordHash = await securePassword(newPass1);
            await User.updateOne(
                { email: email },
                { $set: { password: passwordHash } }
            );
            res.redirect("/login");
        } else {
            res.render("reset-password", { message: 'Passwords do not match' });
        }
    } catch (error) {
        res.redirect("/pageNotFound");
       
    }
};

const userProfile = async(req, res) => {
    try {
        const userId = req.session.user;
        console.log(userId);
        
        const userData = await User.findById(userId).select('name gender email phone profilePicture');
        const addressData = await Address.findOne({userId : userId})
        console.log('User Data:', userData);

        if (!userData) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        res.render('profile', {
            user:userData,
            userAddress:addressData,
            name: userData.name,
             email: userData.email,
            phone: userData.phone,
            profilePicture: userData.profilePicture || null
        });
    } catch (error) {
        console.error('Error while retrieving user profile data:', error);
        res.status(500).json({ message: 'Server error' });
    }
};


const getEditProfile = async(req,res)=>{
    try {
        const userId = req.session.user;
        const userData = await User.findById(userId).select('name gender email phone');
        
        if (!userData) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        res.render('edit-profile', {
            name: userData.name,
            gender: userData.gender,
            email: userData.email,
            phone: userData.phone,
            profilePicture: userData.profilePicture || null
        });
    } catch (error) {
        console.error('Error while retrieving user data for edit:', error);
        res.status(500).json({ message: 'Server error' });
    }
};




const updateProfile = async (req, res) => {
    try {
        const userId = req.session.user;
        const { name, phone } = req.body;
        const updateData = { name, phone };

        let oldProfilePicture = null;

        if (req.file) {
            // Get the current user's profile picture to delete later
            const user = await User.findById(userId).select('profilePicture');
            oldProfilePicture = user.profilePicture;

            const tempPath = req.file.path;
            const fileName = `${Date.now()}-${req.file.originalname.replace(/\s+/g, '_')}`;
            console.log(__dirname,'dirname')
            const permanentPath = path.join(__dirname, '..', '..', 'public', 'Uploads', 'profile-pictures', fileName);
            
            await fs.mkdir(path.dirname(permanentPath), { recursive: true });
            await fs.rename(tempPath, permanentPath);

            updateData.profilePicture = `/Uploads/profile-pictures/${fileName}`;
        }

        const user = await User.findByIdAndUpdate(userId, updateData, { new: true });

        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        // Delete old profile picture if it exists
        if (oldProfilePicture && req.file) {
            const oldPicturePath = path.join(__dirname, '..', '..', 'public', oldProfilePicture);
            try {
                await fs.unlink(oldPicturePath);
            } catch (err) {
                console.warn(`Failed to delete old profile picture: ${oldPicturePath}`, err);
            }
        }

        res.redirect('userProfile');
    } catch (error) {
        console.error('Error while updating user profile:', error);
        res.status(500).json({ message: 'Server error' });
    }
};



const changeEmail = async(req,res)=>{
    try {
        res.render('change-email');
    } catch (error) {
        res.redirect('/pageNotFound');
        
    }
}

const changeEmailValid = async (req, res) => {
    try {
      const { email } = req.body;
      const userExists = await User.findOne({ email });
      if (userExists) {
        const otp = generateOtp();
        const emailSent = await sendVerificationEmail(email, otp);
        if (emailSent) {
          req.session.userotp = otp;
          req.session.userData = req.body;
          req.session.email = email;
          res.render('verify-email-otp'); 
          console.log('OTP:', otp);
        } else {
          res.json('email-error');
        }
      } else {
        res.render('change-email', {
          message: 'User with this email not exists',
        });
      }
    } catch (error) {
      res.redirect('pageNotFound');
    }
  };

  const verifyEmailOtp = async(req,res)=>{
    try {
        const enteredOtp= req.body.otp;
        if(enteredOtp===req.session.userotp){
            req.session.userData=req.body.userData;
            res.render('new-email',{
                userData:req.session.userData,

            })
        }else{
            res.render('/verify-email-otp',{
                message:"OTP is not matching"
            })
        }
    } catch (error) {
        res.redirect('/pageNotFound');
        
    }
}

const updateEmail = async(req,res)=>{
    try {
        const newEmail = req.body.newEmail;
        const userId = req.session.user;
        await User.findByIdAndUpdate(userId,{email:newEmail})
        res.redirect('/profile')
    } catch (error) {
        res.redirect('/pageNotFound');
        
    }
}

const changePassword = async(req,res)=>{
    try {
        res.render('change-password')
    } catch (error) {
        res.redirect('/pageNotFound');
    }
}

const changePasswordValid = async (req, res) => {
    try {
        const { email } = req.body;
        const userExists = await User.findOne({ email });
        if (userExists) {
            const otp = generateOtp();
            req.session.userotp = otp;
            console.log('Generated OTP:', otp);

            const emailSent = await sendVerificationEmail(email, otp);
            if (emailSent) {
                req.session.userData = req.body;
                req.session.email = email;
                res.render('change-pass-otp');
                console.log('OTP sent to email:', otp);
            } else {
                res.json({
                    success: false,
                    message: 'Failed to send OTP, please try again.'
                });
            }
        } else {
            res.render('change-password', {
                message: 'User with this email does not exist.'
            });
        }
    } catch (error) {
        console.error('Error in password change validation:', error);
        res.redirect('/pageNotFound');
    }
};

const verifyChangePassOtp = async (req, res) => {
    try {
        const { otp } = req.body;
        console.log('Entered OTP:', otp);
        console.log('Session OTP:', req.session.userotp);

        if (otp === req.session.userotp) {
            res.json({ success: true, redirectUrl: '/reset-password' });
        } else {
            res.json({ success: false, message: 'OTP not matching.' });
        }
    } catch (error) {
        console.error('Error verifying OTP:', error);
        res.status(500).json({ success: false, message: 'An error occurred, please try again later.' });
    }
};


const userAddress = async (req, res) => {
    try {
        const userId = req.session.user;

        if(!userId){
            return res.redirect('/')
        }

        const userData = await User.findById(userId);
        const addressDocs = await Address.find({ userId });

        // Flatten the nested address arrays
        const address = addressDocs.flatMap(doc => doc.address);

        res.render('address', {
            user: userData,
            active: 'address',
            profilePicture: userData.profilePicture,
            address // now this is a flat array of individual address objects
        });
    } catch (error) {
        console.error(error);
        res.redirect('/pageNotFound');
    }
};



const addAddress = async (req, res) => {
    try {
        const userId = req.session.user;
        console.log('addAddress - User ID from session:', userId);
        if (!userId) {
            throw new Error('User ID not found in session');
        }

        const userData = await User.findById(userId);
        console.log('addAddress - User Data:', userData);
        console.log('Views directory:', res.app.get('views'));

        res.render('add-new-address', {
            user: userId,
            active: 'address',
            profilePicture: userData.profilePicture,
            successMessage: req.session.successMessage,
            errorMessage: req.session.errorMessage
        });

        // Clear session messages after rendering
        req.session.successMessage = null;
        req.session.errorMessage = null;
    } catch (error) {
        console.log('addAddress - Error:', error);
        res.redirect('/pageNotFound');
    }
};

const postAddAddress = async (req, res) => {
    try {
        const userId = req.session.user;

        if (!userId) {
            return res.status(401).json({ success: false, message: 'User not authenticated' });
        }

        const userData = await User.findById(userId);
        if (!userData) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        const {
            addressType, name, city, landMark, state,
            pincode, phone, altPhone 
        } = req.body;

        if (!addressType || !name || !city || !landMark || !state || !pincode || !phone || !altPhone) {
            return res.status(400).json({ success: false, message: 'Missing required address fields' });
        }

        const userAddress = await Address.findOne({ userId });

        const newAddress = {
            addressType,
            name,
            city,
            landMark,
            state,
            pincode,
            phone,
            altPhone,
            // isDefault: isDefault === 'true'
        };

        if (!userAddress) {
            const addressDoc = new Address({
                userId,
                address: [newAddress]
            });
            await addressDoc.save();
        }
         else {

            userAddress.address.push(newAddress);
            await userAddress.save();
          
        }

        return res.status(200).json({ success: true, message: 'Address saved successfully' });
       

    } catch (error) {
        console.error('Error in postAddAddress:', error);
        return res.status(500).json({ success: false, message: 'An error occurred while saving the address' });
    }
};



// const checkoutAddAddress = async (req , res ) => {
//     try {

//         console.log("req.body:",req.body);


//         const userId = req.session.user;

//         if (!userId) {
//             return res.status(401).json({ success: false, message: 'User not authenticated' });
//         }

//         const userData = await User.findById(userId);
//         if (!userData) {
//             return res.status(404).json({ success: false, message: 'User not found' });
//         }

//         const {
//             addressType, name, city, landMark, state,
//             pincode, phone, altPhone 
//         } = req.body;

//         // if (!addressType || !name || !city || !landMark || !state || !pincode || !phone || !altPhone) {
//         //     return res.status(400).json({ success: false, message: 'Missing required address fields' });
//         // }


//         if (!addressType || !name || !city || !landMark || !state || !pincode || !phone) {
//             return res.status(400).json({ success: false, message: 'Missing required address fields' });
//         }
        

//         console.log({
//             addressType, name, city, landMark, state,
//             pincode, phone, altPhone 
//         })

//         const userAddress = await Address.findOne({ userId });


//         console.log("new adderss:",userAddress)

//         const newAddress = {
//             addressType:addressType,
//             name,
//             city,
//             landMark,
//             state,
//             pincode,
//             phone,
//             altPhone
//         };


//         console.log("newAddress funtioin:",newAddress)

//         if (!userAddress) {
//             const addressDoc = new Address({
//                 userId,
//                 address: [newAddress]
//             });
//             await addressDoc.save();
//         } else {
//             userAddress.address.push(newAddress);
//             await userAddress.save();
          
//         }

//         console.log("added to theaddress::")


//         return res.status(200).json({ success: true, message: 'Address saved successfully' });
    

//     } catch (error) {
//         console.log(error)
//     }
// }



const checkoutAddAddress = async (req, res) => {
    try {
      const userId = req.session.user;
  
      if (!userId) {
        return res.status(401).json({ success: false, message: "User not authenticated" });
      }
  
      const userData = await User.findById(userId);
      if (!userData) {
        return res.status(404).json({ success: false, message: "User not found" });
      }
  
      const { addressType, name, city, landMark, state, pincode, phone, altPhone } = req.body;
  
      // Validate required fields
      if (!addressType || !name || !city || !landMark || !state || !pincode || !phone) {
        return res.status(400).json({ success: false, message: "Missing required address fields" });
      };
  
      const newAddress = {
        addressType,
        name,
        city,
        landMark,
        state,
        pincode,
        phone,
        altPhone: altPhone || "",
      };
  
      const userAddress = await Address.findOne({ userId });
  
      if (!userAddress) {
        const addressDoc = new Address({
          userId,
          address: [newAddress],
        });
        await addressDoc.save();
      } else {
        await Address.updateOne(
          { userId },
          { $push: { address: newAddress } }
        );
      }
  
      return res.status(200).json({ success: true, message: "Address saved successfully" });
    } catch (error) {
      console.error("Error in checkoutAddAddress:", error);
      return res.status(500).json({ success: false, message: "Internal server error" });
    }
  };


// Controller for rendering the edit address page
const editAddress = async (req, res) => {
    try {
        const addressId = req.query.id; 
        const user = req.session.user;
        const userData = await User.findById(user);

        const currentAddress = await Address.findOne({ address: { $elemMatch: { _id: addressId } } });

        if (!currentAddress) {
            return res.redirect('/pageNotFound');
        }

        const addressData = currentAddress.address.find((item) => item._id.toString() === addressId);

        if (!addressData) {
            console.log('Address not found for ID:', addressId);
            return res.redirect('/pageNotFound');
        }

        res.render('edit-address', {
            address: addressData,
            user,
            profilePicture: userData.profilePicture || null,
        });
    } catch (error) {
        console.error('Error in edit address:', error);
        res.redirect('/pageNotFound');
    }
};



// const editAddressCheckout = async (req, res) => {
//     try {
//         // const data = req.body;
//         const addressId = req.params.id; 



//         console.log("in backend req.body :",req.body);
        
//         console.log('Received addressId:', addressId);
//         // console.log('Form data:', data);

//         // const user = req.session.user;

      
//         // if (!user || !user._id) {
//         //     return res.json({success:false, message:'User session invalid!'}); 
//         // }

        
//         // const findAddress = await Address.findOne({
//         //     userId: user._id,
//         //     'address._id': addressId,
//         // });

//         // if (!findAddress) {
//         //     return res.json({success:false, message:'Address not found for ID!'}); 
//         // }

//         // if (data.isDefault === 'on') {
//         //     await Address.updateMany(
//         //         { userId: user._id, 'address._id': { $ne: addressId } },
//         //         { $set: { 'address.$[].isDefault': false } }
//         //     );
//         // }

       
//         // await Address.updateOne(
//         //     { userId: user._id, 'address._id': addressId },
//         //     {
//         //         $set: {
//         //             'address.$.addressType': data.addressType,
//         //             'address.$.name': data.name,
//         //             'address.$.city': data.city,
//         //             'address.$.landMark': data.landMark,
//         //             'address.$.state': data.state,
//         //             'address.$.pincode': data.pincode,
//         //             'address.$.phone': data.phone,
//         //             'address.$.altPhone': data.altPhone,
//         //             'address.$.isDefault': data.isDefault === 'on', // Handle isDefault checkbox
//         //         },
//         //     }
//         // );

//         return res.json({success:true, message:'Address changed succusfully '}); 

//     } catch (error) {
//         console.error('Error in edit address:', error);
//         return res.redirect('/pageNotFound');
//     }
// };




const postEditAddress = async (req, res) => {
    try {
        const data = req.body;
        const addressId = req.params.id; 

        console.log("in backend req.body :",req.body);
        
        console.log('Received addressId:', addressId);
        console.log('Form data:', data);

        const user = req.session.user;

      
        if (!user || !user._id) {
            return res.json({success:false, message:'User session invalid!'}); 
        }

        
        const findAddress = await Address.findOne({
            userId: user._id,
            'address._id': addressId,
        });

        if (!findAddress) {
            return res.json({success:false, message:'Address not found for ID!'}); 
        }

        // if (data.isDefault === 'on') {
        //     await Address.updateMany(
        //         { userId: user._id, 'address._id': { $ne: addressId } },
        //         // { $set: { 'address.$[].isDefault': false } }
        //     );
        // }

       
        await Address.updateOne(
            { userId: user._id, 'address._id': addressId },
            {
                $set: {
                    'address.$.addressType': data.addressType,
                    'address.$.name': data.name,
                    'address.$.city': data.city,
                    'address.$.landMark': data.landMark,
                    'address.$.state': data.state,
                    'address.$.pincode': data.pincode,
                    'address.$.phone': data.phone,
                    'address.$.altPhone': data.altPhone,
                    // 'address.$.isDefault': data.isDefault === 'on', // Handle isDefault checkbox
                },
            }
        );

        return res.json({success:true, message:'Address updated successfully'}); 

    } catch (error) {
        console.error('Error in edit address:', error);
        return res.redirect('/pageNotFound');
    }
};


const deleteAddress = async (req, res) => {
    try {
        const addressId = req.query.id;
        console.log(addressId,"address");
        
        const findAddress=await Address.findOne({'address._id':addressId});
        if(!findAddress){
            return res.status(400).send('Address not found');
        }
        await Address.updateOne({
            'address._id':addressId
        },
        {
          $pull :{
            address :{
                _id:addressId,

            }
          }  
        }
    )
    res.redirect('/address')
    } catch (error) {
        console.error("Error in deleting the address",error);
        res.redirect('/pageNotFound');
        
    }
  };

const loadCartPage = async (req,res)=>{
    try {
        
    } catch (error) {
        
    }
}



module.exports = {
    getforgotPasspage,
    forgotEmailValid,
    verifyForgotPassOtp,
    getResetPassPage,
    resendOtp,
    postNewPassword,
    userProfile,
    getEditProfile,
    updateProfile,
    changeEmail,
    changeEmailValid,
    verifyEmailOtp,
    updateEmail,
    changePassword,
    changePasswordValid,
    verifyChangePassOtp,
    addAddress,
    userAddress,
    postAddAddress,
    editAddress,
    postEditAddress,
    deleteAddress,

    checkoutAddAddress
};

const passport = require('passport');
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const User = require('../models/userSchema');
const env=require("dotenv").config();


passport.use(new GoogleStrategy({
    clientID:process.env.GOOGLE_CLIENT_ID,
    clientSecret:process.env.GOOGLE_CLIENT_SECRET,
    callbackURL:'/auth/google/callback'
},
 
async (accessToken,refreshToken,profile,done)=>{
    try {
         let user =await User.findOne({googleId:profile.id});
         if (user){

            if(user.isBlocked){
                return done(null, false, { message: 'Account is blocked' });
            }

            return done(null,user);
         }else{
            const referralCode = generateReferralCode()
            user = new User({
                name: profile.displayName,
                email:profile.emails[0].value,
                googleId:profile.id,
                referralCode
            });
            await user.save();
            return done(null,user);
         }
    } catch (error) {
        return done(error,null)
    }
}

));



passport.serializeUser((user, done) => {
    done(null, user.id);
});


passport.deserializeUser(async(id,done)=>{
    try {
     const user = await User.findById(id);
     done (null,user)
    } catch (error) {
     done(err,null)
 }
 })

 const generateReferralCode = () => {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 8; i++) {
        code += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return code;
};


module.exports = passport;
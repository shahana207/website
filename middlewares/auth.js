const User = require("../models/userSchema");

const userAuth = async (req, res, next) => {
    try {
        if (!req.session.user) {
            next()
            return 
        }

        const user = await User.findById(req.session.user._id);

        if (!user || user.isBlocked) {
            req.session.user = null; 
            next()
            return; 
        }

        
        next(); 
        
    } catch (error) {
        console.error("Error in user authentication middleware:", error);
        res.redirect('/pagenotfound')
    }
};

const adminAuth = (req, res, next) => {
    if (req.session.admin) {
        User.findById(req.session.admin)
            .then(user => {
                if (user && user.isAdmin) {
                    req.user = user; 
                    next();
                } else {
                    res.redirect('/admin/login');
                }
            })
            .catch(error => {
                console.log("Error in admin auth middleware", error);
                res.status(500).send('Internal Server Error');
            });
    } else {
        res.redirect('/admin/login');
    }
};

module.exports = {
    userAuth,
    adminAuth
};

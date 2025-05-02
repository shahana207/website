const User = require("../../models/userSchema");
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");


const pageerror =async (req,res)=>{
    res.render("admin-error")
}



const loadLogin = (req, res) => {
  console.log('loadLogin');
  
  if (req.session.admin) {
    return res.redirect("/admin/dashboard");
  }
  res.render("admin-login", { message: null }); 
};

const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const admin = await User.findOne({ email, isAdmin: true });

    if (admin) {
      const passwordMatch = await bcrypt.compare(password, admin.password);
      if (passwordMatch) {
        req.session.admin = admin._id.toString(); 
        return res.redirect("/admin/dashboard");
      }
    }


    return res.redirect("/admin/login");

  } catch (error) {
    console.log("Login error:", error);
    return res.redirect("/pageerror");
  }
};


const loadDashboard = async (req, res) => {
  if (req.session.admin) {
    try {
      res.render("dashboard"); 
    } catch (error) {
      res.redirect("/pageerror");
    }
  } else {
    res.redirect("/admin/login");
  }
}


const logout = async(req,res)=>{
  try {
    req.session.destroy(err=>{
      if(err){
        console.log("Error destroyig seession",err);
        return res.redirect("/pageerror")
      }
      res.redirect("/admin/login")
    })
  } catch (error) {
    console.log("unexpected error during logout",error);
res.redirect("/pageerror")
  }
};




module.exports = {
  loadLogin,
  login,
  loadDashboard,
  pageerror,
  logout,
};

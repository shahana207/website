const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const userSchema = new Schema({
  name: {
    type: String,
    required: true
  },
  email: {
    type: String,
    required: true,
    unique: true
  },
  phone: {
    type: String,
    required: false,
    unique: true,
    sparse: true,
    default: null
  },
  profilePicture: {
    type: String,
    required: false,
    default: null 
  },
  googleId: {
    type: String,
    unique: false,
    sparse: true
  },
  password: {
    type: String,
    required: false
  },
  isBlocked: {
    type: Boolean,
    default: false
  },
  isAdmin: {
    type: Boolean,
    default: false
  },
  cart: [{
    type: Schema.Types.ObjectId,
    ref: "Cart"
  }],
  wallet: {
    type: Number,
    default: 0
  },
  whishlist: [{
    type: Schema.Types.ObjectId,
    ref: "Whishlist"
  }],
  orderHistory: [{
    type: Schema.Types.ObjectId,
    ref: "Order"
  }],
  createdOn: {
    type: Date,
    default: Date.now
  },
  referralCode: {
    type: String,
    unique: true,
        sparse: true 
  },
  referralLink: {
        type: String,
        unique: true,
        sparse: true
    },
  redeemed: {
    type: Boolean,
    default:false
  },
  redeemedUsers: [{
    type: Schema.Types.ObjectId,
    ref: "User"
  }],
   referralHistory: [{  
        referredUser: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: true
        },
        name: { 
            type: String,
            required: true
        },
        date: {
            type: Date,
            default: Date.now
        },
        status: { 
            type: String,
            enum: ["Pending", "Completed", "Failed"],
            default: "Pending"
        },
        reward: { 
            type: Number,
            default: 0
        }
    }],
  searchHistory: [{
    category: {
      type: Schema.Types.ObjectId,
      ref: "Category"
    },
    brand: {
      type: String
    },
    searchOn: {
      type: Date,
      default: Date.now
    }
  }]
});

const User = mongoose.model("User", userSchema);
module.exports = User;

const mongoose = require('mongoose');
const { Schema } = mongoose;
const { generateCustomId } = require("../utils/helpers");

const orderSchema = new Schema({
  orderId: {
    type: String,  
    default: generateCustomId("ORD"),
    unique: true
  },
  user: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  orderedItems: [{
    product: {
      type: Schema.Types.ObjectId,
      ref: "Product",
      required: true
    },
    quantity: {
      type: Number,
      required: true
    },
    price: {
      type: Number,
      default: 0
    },
    returnStatus: { 
        type: String,
        enum: ["Not Returned", "Return Requested", "Returned", "Cancelled"],
        default: "Not Returned",
    },
    returnReason: { type: String, trim: true },
  }],
  totalPrice: {
    type: Number,
    required: true
  },
  discount: {
    type: Number,
    default: 0
  },
  shippingCharge: {
    type: Number,
    default: 0
  },
  finalAmount: {
    type: Number,
    required: true
  },
  address: {
    addressType: { type: String, required: true },
    name: { type: String, required: true },
    city: { type: String, required: true },
    landMark: { type: String },
    state: { type: String, required: true },
    pincode: { type: String, required: true },
    phone: { type: String, required: true },
    altPhone: { type: String },
  },
  invoiceDate: {
    type: Date
  },
  status: {
    type: String,
    required: true,
    enum: ["pending", "processing", "Shipped", "Delivered", "Cancelled", "Return Request", "Returned","Payment Cancelled","Payment Failed"]
  },
  paymentMethod: {  
      type: String,
      enum: ["COD", "Online", "Wallet"], 
      required: true,
      default: "COD"
  },
  createdOn: {
    type: Date,
    default: Date.now,
  },
  couponApplied: {
    type: Boolean,
    default: false 
  },
  refundAmount: {
    type: Number,
    default: 0
  },
});

const Order = mongoose.model("Order", orderSchema);
module.exports = Order;
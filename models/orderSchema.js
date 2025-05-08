const mongoose = require('mongoose');
const { Schema } = mongoose;
const {generateCustomId} = require("../utils/helpers")


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
        enum: ["Not Returned", "Return Requested", "Returned","Cancelled"],
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
    enum: ["pending", "processing", "Shipped", "Delivered", "Cancelled", "Return Request", "Returned"]
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
    required: true
  },
  couponApplied: {
    type: Boolean,
    default: false 
  }
});

const Order = mongoose.model("Order", orderSchema);
module.exports = Order;





// userId :{
//   type:Schema.Types.ObjectId,
//   ref:"User",
//   required:true
// },
// orderedItems:[{
//   product:{
//       type:Schema.Types.ObjectId,
//       ref:"Product",
//       required:true
//   },
//   quantity:{
//       type:Number,
//       required:true
//   },
//   price:{
//       type:Number,    
//       required: true 
//   },
//   returnStatus: { 
//       type: String,
//       enum: ["Not Returned", "Return Requested", "Returned","Cancelled"],
//       default: "Not Returned",
//   },
//   totalAmount:{             
//       type:Number,
//       required:true
//   },
//   returnReason: { type: String, trim: true },
//   returnNote: { type: String, trim: true }
// }],
// totalPrice:{
//   type:Number,
//   required:true
// },
// discount:{
//   type:Number,
//   default:0
// },
// tax: {  
//   type: Number,
//   default: 0
// },
// shipping: {  
//   type: Number,
//   default: 0
// },
// appliedCoupon: { 
//   type: mongoose.Schema.Types.ObjectId,
//   ref: 'Coupon',
//   default: null
// },
// couponDiscount: { 
//   type: Number, 
//   default: 0
// },
// finalAmount:{                       
//   type:Number,
//   required:true
// },
// address: { 
//   type: {
//       addressType: { type: String, required: true },
//       name: { type: String, required: true },
//       addressLine: { type: String, required: true },
//       city: { type: String, required: true },
//       landmark: { type: String },
//       state: { type: String, required: true },
//       pincode: { type: String, required: true },
//       phone: { type: String, required: true },
//       altPhone: { type: String },
//   },
//   required: true,
// },
// paymentMethod: {  
//   type: String,
//   enum: ["COD", "Online", "Wallet"], 
//   required: true,
//   default: "COD"
// },
// invoiceDate:{
//   type:Date,
//   default: Date.now
// },
// status:{  
//   type:String,
//   required:true,
//   enum:["Pending","Processing","Shipped", "Out for Delivery","Delivered","Cancelled","Return Request","Returned","Partially Returned"],
//   default:"Pending"   
// },
// paymentStatus:{
//   type:String, 
//   required:true,
//   enum:["Pending","Paid","Failed", "Refunded"],
//   default:"Pending"  
// },
// couponApplied:{
//   type:Boolean,
//   default:false
// },
// razorpay_payment_id: {
//   type: String,
//   required: false 
// },
// razorpay_order_id: {
//   type: String,
//   required: false 
// },
// cancellation: {
//   reason: String,
//   comments: String,
//   canceledBy: { type: Schema.Types.ObjectId, ref: 'User' },
//   canceledAt: Date
// },
// isCanceled: { type: Boolean, default: false },
// revokedCoupon:{
//   type: Number,
//   default: 0
// },
// refundAmount:{
//   type: Number,
//   default: 0
// },
// returnTax:{
//   type: Number,
//   default: 0
// }  
// },
// {timestamps:true});    

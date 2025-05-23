const mongoose=require("mongoose")
const{Schema}=mongoose
const couponSchema=new Schema({
    couponCode:{
        type:String,
        required:true,
        unique:true
    },
    startDate:{
        type:Date,
        default:Date.now,
        required:true
    },
    endDate:{
        type:Date,
        required:true,
    },
    discountValue:{
        type:Number,
        required:true
    },
    minPurchase:{
        type:Number,
        required:true
    },
    status:{
        type:String,
        enum:["Active","Disabled"]
    },
    description:{
        type:String,
        required:false,
        default:""
    }
})

const Coupon=mongoose.model("Coupon",couponSchema)
module.exports=Coupon

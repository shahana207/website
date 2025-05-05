const mongoose=require('mongoose');
const {Schema}=mongoose;

const cartSchema=new Schema({
    userId:{
        type:Schema.Types.ObjectId,
        ref:"User",
        required:true
    },
    items:[{
        productId:{
            type:Schema.Types.ObjectId,
            ref:"Product",
            required:true
        },
        quantity:{
            type:Number,
            default:""
        },
        price:{
            type:Number,
            required:true
        },
        totalPrice:{
            type:Number,
            required:true
        },
        status:{
            type:String,
            default:"placed"
        },
        cancellationReason:{
            type:String,
            default:"none"
        },
    }],
    subtotal:{
        type:Number,
        default:0

    }
})
const Cart=mongoose.model('cart',cartSchema);
module.exports=Cart;

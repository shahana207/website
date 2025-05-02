const mongoose =require("mongoose");
const{schema}=mongoose;

const CategorySchema = new mongoose.Schema({
    name:{
        type:String,
        required:true,
        unique:true,
        trim:true
    },
    description:{
        type:String,
        required:true,
    },
    isListed:{
        type:Boolean,
        default:true
    },
    categoryOffer:{
        type:Number,
        default:0,
    },
    createdAt:{
        type:Date,
        default:Date.now
    },
    isActive:{
        type:Boolean,
        default:true,
    }
})

const Category= mongoose.model("Category",CategorySchema);
module.exports=Category;
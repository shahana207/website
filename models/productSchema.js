
const mongoose = require("mongoose");
const { Schema } = mongoose;

const productSchema = new mongoose.Schema({
    productName: {
        type: String,
        required: true,
        trim: true
    },
    description: {
        type: String,
        required: true,
        trim: true
    },
    brand: {
        type: Schema.Types.ObjectId,
        ref: "Brand",
        required: true
    },
    category: {
        type: Schema.Types.ObjectId,
        ref: "Category",
        required: true
    },
    regularPrice: {
        type: Number,
        required: true,
        min: 0
    },
    salePrice: {
        type: Number,
        required: true,
        min: 0
    },
    productOffer: {
        type: Number,
        default: 0
    },
    quantity: {
        type: Number,
        default: 1,
        min: 0
    },
    color: {
        type: [String],
        required: false,
        default: []
    },
    productImage: {
        type: [String],
        required: true,
        validate: [arr => arr.length > 0, 'At least one image is required']
    },
  sizeVariants: [{
        size: {
            type: String,
            required: true,
            trim: true
        },
        quantity: {
            type: Number,
            required: true,
            min: 0
        }
    }],
    isBlocked: {
        type: Boolean,
        default: false
    },
    isDeleted:{
type:Boolean,
default:false
    },
    status: {
        type: String,
        enum: ["Available", "Out of Stock", "Discontinued"],
        required: true,
        default: "Available"
    }
}, { timestamps: true });

const Product = mongoose.model("Product", productSchema);
module.exports = Product;

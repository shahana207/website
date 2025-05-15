const mongoose = require('mongoose');
    const {Schema} = mongoose


const offerSchema = new mongoose.Schema({
    offerName: {
        type: String,
        required: true,
        trim: true
    },
    description: {
        type: String,
        required: true,
        trim: true
    },
    discountType: {
        type: String,
        enum: ['percentage'],
        required: true
    },
    discountAmount: {
        type: Number,
        required: true
    },
    validFrom: {
        type: Date,
        required: true
    },
    validUpto: {
        type: Date,
        required: true
    },
    offerType: {
        type: String,
        enum: ['Products', 'Brands', 'Category'],
        required: true
    },
    applicableTo: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        refPath: 'offerTypeRef'
    },
    offerTypeRef: {
        type: String,
        enum: ['Category', 'Brand', 'Product'], // Adjusted for dynamic ref
        required: true
    },
    isListed: {
        type: Boolean,
        default: true
    },
    isDeleted: {
        type: Boolean,
        default: false
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('Offer', offerSchema);
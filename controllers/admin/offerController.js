const Offer = require('../../models/offerSchema');
const Product = require('../../models/productSchema');
const Category = require('../../models/categorySchema');
const Brand = require('../../models/brandSchema');

const escapeRegex = (string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const getAllOffers = async (req, res) => {
  try {
    const searchQuery = req.query.search || '';
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = 10;

    const regexSearch = escapeRegex(searchQuery);
    const searchCriteria = {
      isDeleted: false,
      $or: [
        { offerName: { $regex: regexSearch, $options: 'i' } },
        { description: { $regex: regexSearch, $options: 'i' } },
      ],
    };

    if (!searchQuery.trim()) {
      delete searchCriteria.$or;
    }

    const offers = await Offer.find(searchCriteria)
      .populate('applicableTo')
      .limit(limit)
      .skip((page - 1) * limit)
      .sort({ createdAt: -1 })
      .lean(); 

    const count = await Offer.countDocuments(searchCriteria);
    const categories = await Category.find({ isListed: true, isDeleted: false }).select('name _id').lean();
    const username = req.user?.name || 'Admin';

    res.render('offers', {
      offers: offers || [],
      currentPage: page,
      totalPages: Math.max(1, Math.ceil(count / limit)),
      searchQuery: searchQuery || '',
      username,
      limit,
      categories: categories || [],
    });
  } catch (error) {
    console.error('Error fetching offers:', error);
    res.redirect('/admin/pageerror');
  }
};

const getAddOfferPage = async (req, res) => {
  try {
    res.render('addOffer', {
      errors: [],
      formData: {},
    });
  } catch (error) {
    console.error('Error fetching offer page data:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while loading offer page',
    });
  }
};

const getEditOfferPage = async (req, res) => {
  try {
    const offerId = req.params.id;
    const offer = await Offer.findById(offerId).populate('applicableTo').lean();
    if (!offer) {
      return res.redirect('/admin/pageerror');
    }
    res.render('editOffer', { offer });
  } catch (error) {
    console.error('Error fetching edit offer page:', error);
    res.redirect('/admin/pageerror');
  }
};

const getApplicableItems = async (req, res) => {
  try {
    const { offerType } = req.query;

    let items = [];
    switch (offerType) {
      case 'Products':
        items = await Product.find({ isDeleted: false, isBlocked: false })
          .select('productName _id')
          .lean();
        break;
      case 'Category':
        items = await Category.find({ isActive: true, isListed: true })
          .select('name _id')
          .lean();
        break;
      case 'Brands':
        items = await Brand.find({ isBlocked: false })
          .select('name _id')
          .lean();
        break;
      default:
        return res.status(400).json({
          success: false,
          message: 'Invalid offer type',
        });
    }

    res.json({
      success: true,
      items: items.map((item) => ({
        id: item._id,
        name: item.productName || item.name,
      })),
    });
  } catch (error) {
    console.error('Error fetching applicable items:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching items',
    });
  }
};

const addOffer = async (req, res) => {
  try {
    const {
      offerName,
      description,
      discountType,
      discountAmount,
      validFrom,
      validUpto,
      offerType,
      applicableTo,
    } = req.body;

  
    const errors = {};
    if (!offerName?.trim()) errors.offerName = 'Offer name is required';
    if (!description?.trim()) errors.description = 'Description is required';
    if (discountType !== 'percentage') errors.discountType = 'Discount type must be percentage';
    if (!discountAmount || isNaN(discountAmount) || discountAmount <= 0 || discountAmount > 100) {
      errors.discountAmount = 'Discount amount must be between 1 and 100';
    }
    if (!validFrom || isNaN(new Date(validFrom))) errors.validFrom = 'Valid from date is required';
    if (!validUpto || isNaN(new Date(validUpto))) errors.validUpto = 'Valid until date is required';
    if (validFrom && validUpto && new Date(validFrom) >= new Date(validUpto)) {
      errors.validUpto = 'Valid until must be after valid from';
    }
    if (!['Products', 'Category', 'Brands'].includes(offerType)) errors.offerType = 'Invalid offer type';
    if (!applicableTo) errors.applicableTo = 'Applicable to is required';

    let offerTypeRef;
    switch (offerType) {
      case 'Products':
        offerTypeRef = 'Product';
        const product = await Product.findById(applicableTo);
        if (!product || product.isDeleted || product.isBlocked) {
          errors.applicableTo = 'Invalid or unavailable product';
        }
        break;
      case 'Category':
        offerTypeRef = 'Category';
        const category = await Category.findById(applicableTo);
        if (!category || !category.isActive || !category.isListed) {
          errors.applicableTo = 'Invalid or unavailable category';
        }
        break;
      case 'Brands':
        offerTypeRef = 'Brand';
        const brand = await Brand.findById(applicableTo);
        if (!brand || brand.isBlocked) {
          errors.applicableTo = 'Invalid or unavailable brand';
        }
        break;
    }

    const existingOffer = await Offer.findOne({
      offerName: { $regex: `^${escapeRegex(offerName?.trim())}$`, $options: 'i' },
      isDeleted: false,
    });
    if (existingOffer) errors.offerName = 'Offer with this name already exists';

    if (Object.keys(errors).length > 0) {
      return res.status(400).json({ success: false, errors });
    }

   
    const offer = new Offer({
      offerName: offerName.trim(),
      description: description.trim(),
      discountType,
      discountAmount: parseFloat(discountAmount),
      validFrom: new Date(validFrom),
      validUpto: new Date(validUpto),
      offerType,
      applicableTo,
      offerTypeRef,
      isListed: true,
      isDeleted: false,
    });

    await offer.save();

 
    if (offerType === 'Products') {
      await Product.findByIdAndUpdate(applicableTo, {
        productOffer: discountAmount,
      });
    } else if (offerType === 'Category') {
      await Category.findByIdAndUpdate(applicableTo, {
        categoryOffer: discountAmount,
      });
    }

    res.json({
      success: true,
      message: 'Offer created successfully',
    });
  } catch (error) {
    console.error('Error creating offer:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while creating offer',
    });
  }
};

const editOffer = async (req, res) => {
  try {
    const offerId = req.params.id;
    const {
      offerName,
      description,
      discountType,
      discountAmount,
      validFrom,
      validUpto,
      offerType,
      applicableTo,
      isListed,
    } = req.body;

    const errors = {};
    if (!offerName?.trim()) errors.offerName = 'Offer name is required';
    if (!description?.trim()) errors.description = 'Description is required';
    if (discountType !== 'percentage') errors.discountType = 'Discount type must be percentage';
    if (!discountAmount || isNaN(discountAmount) || discountAmount <= 0 || discountAmount > 100) {
      errors.discountAmount = 'Discount amount must be between 1 and 100';
    }
    if (!validFrom || isNaN(new Date(validFrom))) errors.validFrom = 'Valid from date is required';
    if (!validUpto || isNaN(new Date(validUpto))) errors.validUpto = 'Valid until date is required';
    if (validFrom && validUpto && new Date(validFrom) >= new Date(validUpto)) {
      errors.validUpto = 'Valid until must be after valid from';
    }
    if (!['Products', 'Category', 'Brands'].includes(offerType)) errors.offerType = 'Invalid offer type';
    if (!applicableTo) errors.applicableTo = 'Applicable to is required';
    if (isListed !== 'true' && isListed !== 'false') errors.isListed = 'Status must be true or false';

    let offerTypeRef;
    switch (offerType) {
      case 'Products':
        offerTypeRef = 'Product';
        const product = await Product.findById(applicableTo);
        if (!product || product.isDeleted || product.isBlocked) {
          errors.applicableTo = 'Invalid or unavailable product';
        }
        break;
      case 'Category':
        offerTypeRef = 'Category';
        const category = await Category.findById(applicableTo);
        if (!category || !category.isActive || !category.isListed) {
          errors.applicableTo = 'Invalid or unavailable category';
        }
        break;
      case 'Brands':
        offerTypeRef = 'Brand';
        const brand = await Brand.findById(applicableTo);
        if (!brand || brand.isBlocked) {
          errors.applicableTo = 'Invalid or unavailable brand';
        }
        break;
    }

    const existingOffer = await Offer.findOne({
      offerName: { $regex: `^${escapeRegex(offerName?.trim())}$`, $options: 'i' },
      _id: { $ne: offerId },
      isDeleted: false,
    });
    if (existingOffer) errors.offerName = 'Offer with this name already exists';

    if (Object.keys(errors).length > 0) {
      return res.status(400).json({ success: false, errors });
    }

    const updatedOffer = await Offer.findByIdAndUpdate(
      offerId,
      {
        $set: {
          offerName: offerName.trim(),
          description: description.trim(),
          discountType,
          discountAmount: parseFloat(discountAmount),
          validFrom: new Date(validFrom), 
          validUpto: new Date(validUpto),
          offerType,
          applicableTo,
          offerTypeRef,
          isListed: isListed === 'true',
        },
      },
      { new: true }
    );

    if (!updatedOffer) {
      return res.status(404).json({ success: false, message: 'Offer not found' });
    }

    
    if (offerType === 'Products') {
      await Product.findByIdAndUpdate(applicableTo, {
        productOffer: discountAmount,
      });
    } else if (offerType === 'Category') {
      await Category.findByIdAndUpdate(applicableTo, {
        categoryOffer: discountAmount,
      });
    }

    res.json({ success: true, message: 'Offer updated successfully' });
  } catch (error) {
    console.error('Error updating offer:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while updating offer',
    });
  }
};

const toggleOffer = async (req, res) => {
  try {
    const { id, action } = req.body;
    console.log('Toggling offer:', { id, action }); 

    if (!id || !['list', 'unlist'].includes(action)) {
      return res.status(400).json({ success: false, message: 'Invalid request' });
    }

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid offer ID' });
    }

    const isListed = action === 'list';
    const offer = await Offer.findByIdAndUpdate(
      id,
      { $set: { isListed } },
      { new: true }
    );

    if (!offer) {
      return res.status(404).json({ success: false, message: 'Offer not found' });
    }

    console.log('Offer updated:', offer); 
    res.json({ success: true, message: `Offer ${action}ed successfully` });
  } catch (error) {
    console.error('Error toggling offer:', error);
    res.status(500).json({ success: false, message: 'Failed to toggle offer' });
  }
};

module.exports = {
  getAllOffers,
  getAddOfferPage,
  getEditOfferPage,
  getApplicableItems,
  addOffer,
  editOffer,
  toggleOffer,
};
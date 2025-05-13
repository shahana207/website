// const Category = require("../../models/categorySchema");
// const mongoose = require('mongoose')


const Category = require("../../models/categorySchema");
const mongoose = require('mongoose');


const categoryInfo = async (req,res)=>{
    try {
        const page = parseInt(req.query.page) || 1;
        const limit =4;
        const skip=(page-1)*limit;

        const categoryData = await Category.find({})
        .sort({createdAt:-1})
        .skip(skip)
        .limit(limit);

        console.log(categoryData)

        const totalCategories =await Category.countDocuments();
        const totalPages = Math.ceil(totalCategories/limit);
        
        res.render("category",{
            categories:categoryData,
            currentPage:page,
            totalPages : totalPages,
            totalCategories : totalCategories
        });

    } catch (error) {
        
console.error(error);
res.redirect("/pageerror")

    }
}


const addCategory = async (req, res) => {
    const { name, description } = req.body;
    
     
    try {
        const existingCategory = await Category.findOne({
            name: { $regex: new RegExp(`^${name}$`, 'i') }
        });

        if (existingCategory) {
            return res.status(400).json({success:false, message: "Category already exists" });
        }

        const newCategory = new Category({ name, description });
        await newCategory.save();

        return res.json({success:true , message: "Category added successfully" });

    } catch (error) {
        console.error(error);
        return res.status(500).json({success:false, message: "Internal Server Error" });
    }
};


const getActiveCategory = async (req, res) => {
    try {
      const id = req.params.id;
      const objectId = new mongoose.Types.ObjectId(id);
      const find = await Category.findOne({ _id: objectId });
  
      if (!find) {
        return res.json({ success: false, message: "Category not found" });
      }
  
      if (!find.isListed) {
        await Category.updateOne({ _id: objectId }, { $set: { isListed: true } });
        return res.json({
          success: true,
          isListed: true,
          message: `Category activated successfully`
        });
      } else {
        await Category.updateOne({ _id: objectId }, { $set: { isListed: false } });
        return res.json({
          success: true,
          isListed: false,
          message: `Category deactivated successfully`
        });
      }
    } catch (error) {
      console.error("Error toggling category:", error);
      return res.json({ success: false, message: "Server error" });
    }
  };
  


 const getEditCategory = async (req, res) => {
    try {
        const id = req.query.id;
        const category = await category.findOne({ _id: id });
        res.render("edit-category", { category: category });
    } catch (error) {
        res.redirect("/pageerror");
    }
};



const editCategory = async (req, res) => {
    try {
        const id = req.params.id;
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, message: "Invalid category ID" });
        }
        const category = await Category.findById(id);
        if (!category) {
            return res.status(404).json({ success: false, message: "Category not found" });
        }
        res.json({ success: true, category });
    } catch (error) {
        console.error("Error fetching category:", error);
        res.status(500).json({ success: false, message: "Internal Server Error" });
    }
};

const posteditcategory = async (req, res) => {
    try {
        const { categoryId, categoryName, description, isActive } = req.body;
        if (!mongoose.Types.ObjectId.isValid(categoryId)) {
            return res.status(400).json({ success: false, message: "Invalid category ID" });
        }

       
        const existingCategory = await Category.findOne({
            name: { $regex: new RegExp(`^${categoryName}$`, 'i') },
            _id: { $ne: categoryId }
        });

        if (existingCategory) {
            return res.status(400).json({ success: false, message: "Category name already exists" });
        }

        const updatedCategory = await Category.findByIdAndUpdate(
            categoryId,
            {
                name: categoryName,
                description,
                isListed: isActive === 'true' 
            },
            { new: true }
        );

        if (!updatedCategory) {
            return res.status(404).json({ success: false, message: "Category not found" });
        }

        res.json({ success: true, message: "Category updated successfully" });
    } catch (error) {
        console.error("Error updating category:", error);
        res.status(500).json({ success: false, message: "Internal Server Error" });
    }
};

const deleteCategory = async (req, res) => {
  try {
      const id = req.params.id;
      if (!mongoose.Types.ObjectId.isValid(id)) {
          return res.status(400).json({ success: false, message: "Invalid category ID" });
      }

      const category = await Category.findByIdAndDelete(id);
      if (!category) {
          return res.status(404).json({ success: false, message: "Category not found" });
      }

      res.json({ success: true, message: "Category deleted successfully" });
  } catch (error) {
      console.error("Error deleting category:", error);
      res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

const searchCategory = async(req,res)=>{
    try {
        console.log('hidosafdsafdafodjsafk')
        const term = req.query.term || '';
        const categories = await Category.find({
          name: { $regex: term, $options: 'i' },
        });
        console.log(categories,'hidsaf')
        res.json({ success: true, categories });
      } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Server error' });
      }
}


module.exports = {
  categoryInfo,
  addCategory,
  getActiveCategory,
  editCategory,
  posteditcategory,
  deleteCategory,
  searchCategory,
};

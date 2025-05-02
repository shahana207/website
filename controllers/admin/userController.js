const User = require ("../../models/userSchema");



const userInfo= async(req,res)=>{
    try {
        let search="";
        if(req.query.search){
            search=req.query.search;
        }
        let page=1;
        if(req.query.page){
            page=req.query.page
        }
        const limit=3
        const userData = await User.find({
            isAdmin:false,
            $or:[
                {name:{$regex:".*"+search+".*"}},
                {email:{$regex:".*"+search+".*"}},
            ],
        })
        .limit(limit*1)
        .skip((page-1)*limit)
        .exec();

        const count = await User.find({
            isAdmin:false,
            $or:[
                {name:{$regex:".*"+search+".*"}},
                {email:{$regex:".*"+search+".*"}},
            ],
        }).countDocuments();

        console.log('asd',userData)

        res.render("users", {
      users: userData,
      currentPage: page,
      totalPages: Math.ceil(count / limit),
      search,
    });


    } catch (error) { 
        console.error("Error loading user info:", error);
        res.redirect("/admin/pageerror");
    }
};


const userBlocked=async(req,res)=>{
    try{
        let id=req.params.id;
        
        const user = await User.updateOne({_id:id},{$set:{isBlocked:true}});

        if(!user){
            return res.json({success:false, message: 'User doesn/t found'})
        }

        return res.json({success:true, message: 'User blocked successfully'})
    }catch (error){
        res.redirect("/pageerror");
    }
};

const userunBlocked=async(req,res)=>{
    try {
        let id= req.params.id;
        const user= await User.updateOne({_id:id},{$set:{isBlocked:false}});

        if (!user){
            return res.json({success:false, message: 'User doesn/t found'})
        }
        return res.json({success:true, message: 'User unblocked successfully'})
    } catch (error) {
       res.redirect("/pageerror") ;
    }
};



module.exports ={
    userInfo,
    userBlocked,
    userunBlocked,
};

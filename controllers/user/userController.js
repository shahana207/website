



const pageNotFound = async (req, res) => {
    try {
      res.render("user/page-404");
    } catch (error) {
     
      res.redirect("/pageNotFound"); // fallback to home or a generic error page
    }
  };
  

const loadHomepage = async(req,res)=>{
    try{
         res.render("user/home");
    }catch(error){
        console.log("home page not found");
        res.status(500).send("server error");

    }
}
module.exports=
{
    loadHomepage,
   pageNotFound,
};
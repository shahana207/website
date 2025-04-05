const express =require("express");
const app =express();
const env=require("dotenv").config();
const db =require("./config/db");
db();





const PORT=3000 || process.env.PORT;
app.listen(PORT,()=>{
    console.log("server running");
})



module.exports=app;
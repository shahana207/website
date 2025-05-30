const express =require("express");
const app =express();
const path = require("path");
const env=require("dotenv").config();
const session = require("express-session");
const passport= require("./config/passport");
const db =require("./config/db");
const userRouter = require("./routes/userRouter");
const adminRouter = require('./routes/adminRouter');
db();



app.use(express.json());
app.use(express.urlencoded({extended:true}));
app.use (session({
    secret:process.env.SESSION_SECRET,
    resave:false,
    saveUninitialized:true,
    cookie:{
secure:false,
httpOnly:true,
maxAge:24 * 60 * 60 * 1000
    }

}))


app.use (passport.initialize());
app.use(passport.session());




app.use((req,res,next)=>{
    res.set('cache-control','no-store')
    next();
});

app.set("view engine", "ejs");
app.set('views',[path.join(__dirname,'views/user'),path.join(__dirname,'views/admin')]);
app.use(express.static(path.join(__dirname, "public")));


//routes
app.use("/", userRouter);
app.use('/admin',adminRouter);


// Global error handler
app.use((err, req, res, next) => {
    console.error('Global error handler triggered:', {
        stack: err.stack,
        url: req.url,
        method: req.method,
        body: req.body
    });

    // If the request is expecting JSON (like an API/AJAX call)
    if (req.xhr || req.headers.accept?.includes('application/json')) {
        return res.status(500).json({ error: 'Something went wrong!' });
    }

    // Otherwise, redirect to a custom error page
    res.redirect('/pageNotFound');
});




const PORT = process.env.PORT || 4000;
app.listen(PORT,()=>{
    console.log("server running");
})



module.exports=app;
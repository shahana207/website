const User = require("../../models/userSchema");
const Order=require("../../models/orderSchema");
const Product =require("../../models/productSchema");
const Brand = require("../../models/brandSchema");
const Category =require("../../models/brandSchema");
const path = require('path');
const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");


const pageerror =async (req,res)=>{
    res.render("admin-error")
}



const loadLogin = (req, res) => {
  console.log('loadLogin');
  
  if (req.session.admin) {
    return res.redirect("/admin/dashboard");
  }
  res.render("admin-login", { message: null }); 
};

const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const admin = await User.findOne({ email, isAdmin: true });

    if (admin) {
      const passwordMatch = await bcrypt.compare(password, admin.password);
      if (passwordMatch) {
        req.session.admin = admin._id.toString(); 
        return res.redirect("/admin/dashboard");
      }
    }


    return res.redirect("/admin/login");

  } catch (error) {
    console.log("Login error:", error);
    return res.redirect("/pageerror");
  }
};


const loadDashboard = async (req, res) => {
  if (req.session.admin) {
    try {
    
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(today.getDate() - 1);
      const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
      const yearStart = new Date(today.getFullYear(), 0, 1);

      
      const orders = await Order.find()
        .populate("orderedItems.product")
        .populate("user");

      if (!orders) orders = [];

      
      const todaySales = orders
        .filter((order) => order.createdOn.toDateString() === today.toDateString())
        .reduce((sum, order) => sum + (order.finalAmount || 0), 0);

      const yesterdaySales = orders
        .filter((order) => order.createdOn.toDateString() === yesterday.toDateString())
        .reduce((sum, order) => sum + (order.finalAmount || 0), 0);

      const monthlySales = orders
        .filter((order) => order.createdOn >= monthStart)
        .reduce((sum, order) => sum + (order.finalAmount || 0), 0);

      const yearlySales = orders
        .filter((order) => order.createdOn >= yearStart)
        .reduce((sum, order) => sum + (order.finalAmount || 0), 0);

     
      const weeklyStart = new Date(today);
      weeklyStart.setDate(today.getDate() - 29);
      const weeklyOrders = orders.filter((order) => order.createdOn >= weeklyStart);
      const weeklyLabels = [];
      const weeklyData = [];
      for (let i = 0; i < 30; i++) {
        const date = new Date(weeklyStart);
        date.setDate(weeklyStart.getDate() + i);
        weeklyLabels.push(
          date.toLocaleDateString("en-GB", { day: "2-digit", month: "short" })
        );
        const dailySales = weeklyOrders
          .filter((order) => order.createdOn.toDateString() === date.toDateString())
          .reduce((sum, order) => sum + (order.finalAmount || 0), 0);
        weeklyData.push(dailySales);
      }

      const monthlyStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const monthlyOrders = orders.filter((order) => order.createdOn >= monthlyStart);
      const monthlyLabels = ["Apr", "May"];
      const monthlyData = monthlyLabels.map((month, index) => {
        const monthStart = new Date(today.getFullYear(), 3 + index, 1);
        const monthEnd = new Date(today.getFullYear(), 3 + index + 1, 0);
        return monthlyOrders
          .filter((order) => order.createdOn >= monthStart && order.createdOn <= monthEnd)
          .reduce((sum, order) => sum + (order.finalAmount || 0), 0);
      });

      const yearlyLabels = ["2025"];
      const yearlyData = [yearlySales];

      const salesData = {
        weekly: { labels: weeklyLabels, data: weeklyData },
        monthly: { labels: monthlyLabels, data: monthlyData },
        yearly: { labels: yearlyLabels, data: yearlyData },
      };

     
      const topProducts = await Order.aggregate([
        { $unwind: "$orderedItems" },
        {
          $group: {
            _id: "$orderedItems.product",
            quantity: { $sum: "$orderedItems.quantity" },
          },
        },
        {
          $lookup: {
            from: "products",
            localField: "_id",
            foreignField: "_id",
            as: "product",
          },
        },
        { $unwind: "$product" },
        { $sort: { quantity: -1 } },
        { $limit: 10 },
        {
          $project: {
            productName: "$product.productName",
            quantity: 1,
          },
        },
      ]);

      const topCategories = await Order.aggregate([
        { $unwind: "$orderedItems" },
        {
          $lookup: {
            from: "products",
            localField: "orderedItems.product",
            foreignField: "_id",
            as: "product",
          },
        },
        { $unwind: "$product" },
        {
          $lookup: {
            from: "categories",
            localField: "product.category",
            foreignField: "_id",
            as: "category",
          },
        },
        { $unwind: "$category" },
        {
          $group: {
            _id: "$category._id",
            name: { $first: "$category.name" },
            revenue: { $sum: { $multiply: ["$orderedItems.quantity", "$orderedItems.price"] } },
          },
        },
        { $sort: { revenue: -1 } },
        { $limit: 10 },
        {
          $project: {
            name: 1,
            revenue: 1,
          },
        },
      ]);

    
      const topBrands = await Order.aggregate([
        { $unwind: "$orderedItems" },
        {
          $lookup: {
            from: "products",
            localField: "orderedItems.product",
            foreignField: "_id",
            as: "product",
          },
        },
        { $unwind: "$product" },
        {
          $lookup: {
            from: "brands",
            localField: "product.brand",
            foreignField: "_id",
            as: "brand",
          },
        },
        { $unwind: "$brand" },
        {
          $group: {
            _id: "$brand._id",
            name: { $first: "$brand.name" },
            revenue: { $sum: { $multiply: ["$orderedItems.quantity", "$orderedItems.price"] } },
          },
        },
        { $sort: { revenue: -1 } },
        { $limit: 10 },
        {
          $project: {
            name: 1,
            revenue: 1,
          },
        },
      ]);

    
      const page = parseInt(req.query.page) || 1;
      const limit = 10; 
      const skip = (page - 1) * limit;

      const totalOrders = await Order.countDocuments();
      const totalPages = Math.ceil(totalOrders / limit);

      const recentOrders = await Order.find()
        .populate("user")
        .sort({ createdOn: -1 })
        .skip(skip)
        .limit(limit);

      
      res.render("dashboard", {
        todaySales,
        yesterdaySales,
        monthlySales,
        yearlySales,
        salesData,
        topProducts,
        topCategories,
        topBrands,
        recentOrders,
        currentPage: page,
        totalPages,
        totalOrders,
      });
    } catch (error) {
      console.error(error);
      res.redirect("/pageerror");
    }
  } else {
    res.redirect("/admin/login");
  }
};

const logout = async(req,res)=>{
  try {
    req.session.destroy(err=>{
      if(err){
        console.log("Error destroyig seession",err);
        return res.redirect("/pageerror")
      }
      res.redirect("/admin/login")
    })
  } catch (error) {
    console.log("unexpected error during logout",error);
res.redirect("/pageerror")
  }
};

const getSalesReport = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 10;
        const skip = (page - 1) * limit;

        const { startDate, endDate, status } = req.query;

       
        let query = {};
        if (startDate && endDate) {
            const start = new Date(startDate);
            const end = new Date(endDate);
         
            if (isNaN(start) || isNaN(end)) {
                throw new Error('Invalid date format');
            }
            if (start > end) {
                throw new Error('Start date cannot be later than end date');
            }
            end.setHours(23, 59, 59, 999);
            query.createdOn = {
                $gte: start,
                $lte: end
            };
        }
        if (status) {
            query.status = status;
        }

        const orders = await Order.find(query)
            .skip(skip)
            .limit(limit)
            .sort({ createdOn: -1 });

        const allOrders = await Order.find(query);
        const summary = {
            grossSales: allOrders.reduce((sum, order) => sum + order.totalPrice, 0),
            couponsRedeemed: allOrders.reduce((sum, order) => sum + (order.couponApplied ? order.discount : 0), 0),
            discounts: allOrders.reduce((sum, order) => sum + order.discount, 0),
            netSales: allOrders.reduce((sum, order) => sum + order.finalAmount, 0),
            totalOrders: allOrders.length
        };

        const totalOrdersCount = await Order.countDocuments(query);
        const totalPages = Math.ceil(totalOrdersCount / limit);

        res.render('salesReport', {
            orders,
            summary,
            currentPage: page,
            totalPages,
            startDate: startDate || '',
            endDate: endDate || '',
            status: status || ''
        });
    } catch (error) {
        console.error("Error loading sales report:", error);
        res.redirect("/admin/pageerror");
    }
};

const exportSalesReport = async (req, res) => {
    try {
        const { format } = req.params;
        const { startDate, endDate, status } = req.query;

        let query = {};
        if (startDate && endDate) {
            const start = new Date(startDate);
            const end = new Date(endDate);
            if (isNaN(start) || isNaN(end)) {
                throw new Error('Invalid date format');
            }
            if (start > end) {
                throw new Error('Start date cannot be later than end date');
            }
            end.setHours(23, 59, 59, 999);
            query.createdOn = {
                $gte: start,
                $lte: end
            };
        }
        if (status) {
            query.status = status;
        }

        const orders = await Order.find(query).sort({ createdOn: -1 });

      
        const summary = {
            grossSales: orders.reduce((sum, order) => sum + order.totalPrice, 0),
            couponsRedeemed: orders.reduce((sum, order) => sum + (order.couponApplied ? order.discount : 0), 0),
            discounts: orders.reduce((sum, order) => sum + order.discount, 0),
            netSales: orders.reduce((sum, order) => sum + order.finalAmount, 0),
            totalOrders: orders.length
        };

        if (format === 'pdf') {
            const PDFDocument = require('pdfkit');
            const doc = new PDFDocument({ margin: 50 });
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', 'attachment; filename=sales-report.pdf');
            doc.pipe(res);

          
            doc.fontSize(20).font('Helvetica-Bold').text('Sales Report', { align: 'center' });
            doc.moveDown();

          
            doc.fontSize(12).font('Helvetica');
            doc.text(`Date Range: ${startDate || 'N/A'} to ${endDate || 'N/A'}`);
            doc.text(`Status: ${status || 'All'}`);
            doc.moveDown();

          
            doc.fontSize(14).font('Helvetica-Bold').text('Summary', { align: 'left' });
            doc.moveDown(0.5);
            doc.fontSize(12).font('Helvetica');
            doc.text(`Gross Sales: ₹${summary.grossSales.toLocaleString('en-IN')}`);
            doc.text(`Coupons Redeemed: ₹${summary.couponsRedeemed.toLocaleString('en-IN')}`);
            doc.text(`Discounts: ₹${summary.discounts.toLocaleString('en-IN')}`);
            doc.text(`Net Sales: ₹${summary.netSales.toLocaleString('en-IN')}`);
            doc.text(`Total Orders: ${summary.totalOrders}`);
            doc.moveDown(1.5);

           
            const tableTop = doc.y + 10;
            const rowHeight = 20;
            const pageHeight = doc.page.height - doc.page.margins.bottom;
            let y = tableTop;

           
            const colPositions = {
                orderId: 50,
                amount: 150,
                coupon: 250,
                finalAmount: 350,
                payment: 450,
                date: 510,
                status: 570
            };
            const colWidths = {
                orderId: 100,
                amount: 100,
                coupon: 100,
                finalAmount: 100,
                payment: 60,
                date: 60,
                status: 60
            };

            
            doc.font('Helvetica-Bold');
            doc.text('Order ID', colPositions.orderId, y, { width: colWidths.orderId });
            doc.text('Amount', colPositions.amount, y, { width: colWidths.amount });
            doc.text('Coupon', colPositions.coupon, y, { width: colWidths.coupon });
            doc.text('Final Amount', colPositions.finalAmount, y, { width: colWidths.finalAmount });
            doc.text('Payment', colPositions.payment, y, { width: colWidths.payment });
            doc.text('Date', colPositions.date, y, { width: colWidths.date });
            doc.text('Status', colPositions.status, y, { width: colWidths.status });
            y += rowHeight;
            doc.moveTo(colPositions.orderId, y).lineTo(colPositions.status + colWidths.status, y).stroke();
            y += 5;

          
            doc.font('Helvetica');
            orders.forEach((order, index) => {
               
                if (y + rowHeight > pageHeight) {
                    doc.addPage();
                    y = doc.page.margins.top;

                   
                    doc.font('Helvetica-Bold');
                    doc.text('Order ID', colPositions.orderId, y, { width: colWidths.orderId });
                    doc.text('Amount', colPositions.amount, y, { width: colWidths.amount });
                    doc.text('Coupon', colPositions.coupon, y, { width: colWidths.coupon });
                    doc.text('Final Amount', colPositions.finalAmount, y, { width: colWidths.finalAmount });
                    doc.text('Payment', colPositions.payment, y, { width: colWidths.payment });
                    doc.text('Date', colPositions.date, y, { width: colWidths.date });
                    doc.text('Status', colPositions.status, y, { width: colWidths.status });
                    y += rowHeight;
                    doc.moveTo(colPositions.orderId, y).lineTo(colPositions.status + colWidths.status, y).stroke();
                    y += 5;
                }

                doc.text(order.orderId, colPositions.orderId, y, { width: colWidths.orderId });
                doc.text(`₹${order.totalPrice.toLocaleString('en-IN')}`, colPositions.amount, y, { width: colWidths.amount });
                doc.text(`₹${order.discount.toLocaleString('en-IN')}`, colPositions.coupon, y, { width: colWidths.coupon });
                doc.text(`₹${order.finalAmount.toLocaleString('en-IN')}`, colPositions.finalAmount, y, { width: colWidths.finalAmount });
                doc.text(order.paymentMethod === 'COD' ? 'cod' : 'razorpay', colPositions.payment, y, { width: colWidths.payment });
                doc.text(order.createdOn.toLocaleDateString('en-IN'), colPositions.date, y, { width: colWidths.date });
                doc.text(order.status, colPositions.status, y, { width: colWidths.status });
                y += rowHeight;
            });

            doc.end();
        } else if (format === 'excel') {
            const ExcelJS = require('exceljs');
            const workbook = new ExcelJS.Workbook();
            const worksheet = workbook.addWorksheet('Sales Report');

          
            worksheet.addRow(['Sales Report']);
            worksheet.addRow(['Date Range', `${startDate || 'N/A'} to ${endDate || 'N/A'}`]);
            worksheet.addRow(['Status', status || 'All']);
            worksheet.addRow([]);
            worksheet.addRow(['Summary']);
            worksheet.addRow(['Gross Sales', `₹${summary.grossSales.toLocaleString('en-IN')}`]);
            worksheet.addRow(['Coupons Redeemed', `₹${summary.couponsRedeemed.toLocaleString('en-IN')}`]);
            worksheet.addRow(['Discounts', `₹${summary.discounts.toLocaleString('en-IN')}`]);
            worksheet.addRow(['Net Sales', `₹${summary.netSales.toLocaleString('en-IN')}`]);
            worksheet.addRow(['Total Orders', summary.totalOrders]);
            worksheet.addRow([]);

            worksheet.columns = [
                { header: 'Order ID', key: 'orderId', width: 20 },
                { header: 'Amount', key: 'totalPrice', width: 15 },
                { header: 'Coupon', key: 'discount', width: 15 },
                { header: 'Final Amount', key: 'finalAmount', width: 15 },
                { header: 'Payment', key: 'paymentMethod', width: 15 },
                { header: 'Date', key: 'createdOn', width: 15 },
                { header: 'Status', key: 'status', width: 15 }
            ];

            orders.forEach(order => {
                worksheet.addRow({
                    orderId: order.orderId,
                    totalPrice: `₹${order.totalPrice.toLocaleString('en-IN')}`,
                    discount: `₹${order.discount.toLocaleString('en-IN')}`,
                    finalAmount: `₹${order.finalAmount.toLocaleString('en-IN')}`,
                    paymentMethod: order.paymentMethod === 'COD' ? 'cod' : 'razorpay',
                    createdOn: order.createdOn.toLocaleDateString('en-IN'),
                    status: order.status
                });
            });

            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', 'attachment; filename=sales-report.xlsx');
            await workbook.xlsx.write(res);
            res.end();
        } else {
            res.status(400).send('Invalid format');
        }
    } catch (error) {
        console.error("Error exporting sales report:", error);
        res.redirect("/admin/pageerror");
    }
};


const mockOrders = [
    { customer: 'kadheeja', date: new Date('2025-05-21'), amount: 5744, status: 'Delivered' },
    { customer: 'Unknown', date: new Date('2025-05-20'), amount: 0, status: 'Processing' },
    { customer: 'Unknown', date: new Date('2025-05-20'), amount: 17400, status: 'Processing' },
    { customer: 'Unknown', date: new Date('2025-05-20'), amount: 16040, status: 'Processing' },
    { customer: 'Unknown', date: new Date('2025-05-19'), amount: 41450, status: 'Processing' }
];

const getDashboard = async (req, res) => {
  if (req.session.admin) {
    try {
     
      const today = new Date(); 
      const yesterday = new Date(today);
      yesterday.setDate(today.getDate() - 1);
      const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
      const yearStart = new Date(today.getFullYear(), 0, 1);

    
      const orders = await Order.find()
        .populate("orderedItems.product")
        .populate("user");

      if (!orders) orders = [];

     
      const todaySales = orders
        .filter((order) => order.createdOn.toDateString() === today.toDateString())
        .reduce((sum, order) => sum + (order.finalAmount || 0), 0);

      const yesterdaySales = orders
        .filter((order) => order.createdOn.toDateString() === yesterday.toDateString())
        .reduce((sum, order) => sum + (order.finalAmount || 0), 0);

      const monthlySales = orders
        .filter((order) => order.createdOn >= monthStart)
        .reduce((sum, order) => sum + (order.finalAmount || 0), 0);

      const yearlySales = orders
        .filter((order) => order.createdOn >= yearStart)
        .reduce((sum, order) => sum + (order.finalAmount || 0), 0);

      
      const salesData = {
        weekly: { labels: [], data: [] },
        monthly: { labels: [], data: [] },
        yearly: { labels: [], data: [] },
      };

     
      const weeklyStart = new Date(today);
      weeklyStart.setDate(today.getDate() - 29); 
      const weeklyOrders = orders.filter((order) => order.createdOn >= weeklyStart);
      for (let i = 0; i < 30; i++) {
        const date = new Date(weeklyStart);
        date.setDate(weeklyStart.getDate() + i);
        salesData.weekly.labels.push(
          date.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit" })
        ); 
        const dailySales = weeklyOrders
          .filter((order) => order.createdOn.toDateString() === date.toDateString())
          .reduce((sum, order) => sum + (order.finalAmount || 0), 0);
        salesData.weekly.data.push(dailySales);
      }

   
      for (let i = 11; i >= 0; i--) {
        const monthStart = new Date(today.getFullYear(), today.getMonth() - i, 1);
        const monthEnd = new Date(today.getFullYear(), today.getMonth() - i + 1, 0);
        monthEnd.setHours(23, 59, 59, 999);
        const monthSales = orders
          .filter((order) => order.createdOn >= monthStart && order.createdOn <= monthEnd)
          .reduce((sum, order) => sum + (order.finalAmount || 0), 0);
        salesData.monthly.labels.push(
          monthStart.toLocaleDateString("en-GB", { month: "short", year: "2-digit" })
        ); 
        salesData.monthly.data.push(monthSales);
      }

      for (let i = 4; i >= 0; i--) {
        const year = today.getFullYear() - i;
        const yearStart = new Date(year, 0, 1);
        const yearEnd = new Date(year, 11, 31, 23, 59, 59, 999);
        const yearSales = orders
          .filter((order) => order.createdOn >= yearStart && order.createdOn <= yearEnd)
          .reduce((sum, order) => sum + (order.finalAmount || 0), 0);
        salesData.yearly.labels.push(year.toString()); 
        salesData.yearly.data.push(yearSales);
      }

      
      const topProducts = await Order.aggregate([
        { $unwind: "$orderedItems" },
        {
          $group: {
            _id: "$orderedItems.product",
            quantity: { $sum: "$orderedItems.quantity" },
          },
        },
        {
          $lookup: {
            from: "products",
            localField: "_id",
            foreignField: "_id",
            as: "product",
          },
        },
        { $unwind: "$product" },
        { $sort: { quantity: -1 } },
        { $limit: 10 },
        {
          $project: {
            productName: "$product.productName",
            quantity: 1,
          },
        },
      ]);

      
      const topCategories = await Order.aggregate([
        { $unwind: "$orderedItems" },
        {
          $lookup: {
            from: "products",
            localField: "orderedItems.product",
            foreignField: "_id",
            as: "product",
          },
        },
        { $unwind: "$product" },
        {
          $lookup: {
            from: "categories",
            localField: "product.category",
            foreignField: "_id",
            as: "category",
          },
        },
        { $unwind: "$category" },
        {
          $group: {
            _id: "$category._id",
            name: { $first: "$category.name" },
            revenue: { $sum: { $multiply: ["$orderedItems.quantity", "$orderedItems.price"] } },
          },
        },
        { $sort: { revenue: -1 } },
        { $limit: 10 },
        {
          $project: {
            name: 1,
            revenue: 1,
          },
        },
      ]);

      
      const topBrands = await Order.aggregate([
        { $unwind: "$orderedItems" },
        {
          $lookup: {
            from: "products",
            localField: "orderedItems.product",
            foreignField: "_id",
            as: "product",
          },
        },
        { $unwind: "$product" },
        {
          $lookup: {
            from: "brands",
            localField: "product.brand",
            foreignField: "_id",
            as: "brand",
          },
        },
        { $unwind: "$brand" },
        {
          $group: {
            _id: "$brand._id",
            name: { $first: "$brand.name" },
            revenue: { $sum: { $multiply: ["$orderedItems.quantity", "$orderedItems.price"] } },
          },
        },
        { $sort: { revenue: -1 } },
        { $limit: 10 },
        {
          $project: {
            name: 1,
            revenue: 1,
          },
        },
      ]);

      const orderStatusDistribution = await Order.aggregate([
        {
          $group: {
            _id: "$status",
            count: { $sum: 1 },
          },
        },
        {
          $project: {
            status: "$_id",
            count: 1,
            _id: 0,
          },
        },
      ]);

      const paymentMethodDistribution = await Order.aggregate([
        {
          $group: {
            _id: "$paymentMethod",
            count: { $sum: 1 },
          },
        },
        {
          $project: {
            method: "$_id",
            count: 1,
            _id: 0,
          },
        },
      ]);

      
      const page = parseInt(req.query.page) || 1;
      const limit = 10; 
      const skip = (page - 1) * limit;

      const totalOrders = await Order.countDocuments();
      const totalPages = Math.ceil(totalOrders / limit);

      const recentOrders = await Order.find()
        .populate("user")
        .sort({ createdOn: -1 })
        .skip(skip)
        .limit(limit);

    
      res.render("dashboard", {
        todaySales,
        yesterdaySales,
        monthlySales,
        yearlySales,
        salesData,
        topProducts,
        topCategories,
        topBrands,
        orderStatusDistribution,
        paymentMethodDistribution,
        recentOrders,
        currentPage: page,
        totalPages,
        totalOrders,
      });
    } catch (error) {
      console.error(error);
      res.redirect("/pageerror");
    }
  } else {
    res.redirect("/admin/login");
  }
};

const generateLedger = async (req, res) => {
  try {
    const orders = await Order.find().populate("user");
    const ledgerContent = orders.map(order => 
      `${order.createdOn.toISOString().split('T')[0]} | ${order.user ? order.user.name : 'Unknown'} | ₹${order.finalAmount} | ${order.status}`
    ).join('\n');

    const filePath = path.join(__dirname, '../public/ledger.txt');
    fs.writeFileSync(filePath, ledgerContent);

    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.json({ success: false });
  }
};

const downloadLedger = (req, res) => {
  const filePath = path.join(__dirname, '../public/ledger.txt');
  res.download(filePath, 'ledger.txt', (err) => {
    if (err) {
      console.error(err);
      res.status(500).send('Error downloading ledger');
    }
  });
};
module.exports = {
  loadLogin,
  login,
  loadDashboard,
  pageerror,
  logout,
  getSalesReport,
  exportSalesReport,
  getDashboard,
  generateLedger,
  downloadLedger,
};

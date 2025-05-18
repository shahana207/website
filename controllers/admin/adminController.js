const User = require("../../models/userSchema");
const Order=require("../../models/orderSchema")
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
      res.render("dashboard"); 
    } catch (error) {
      res.redirect("/pageerror");
    }
  } else {
    res.redirect("/admin/login");
  }
}


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

        // Build query for filtering orders
        let query = {};
        if (startDate && endDate) {
            query.createdOn = {
                $gte: new Date(startDate),
                $lte: new Date(endDate)
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
            query.createdOn = {
                $gte: new Date(startDate),
                $lte: new Date(endDate)
            };
        }
        if (status) {
            query.status = status;
        }

        const orders = await Order.find(query).sort({ createdOn: -1 });

        if (format === 'pdf') {
            const doc = new PDFDocument();
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', 'attachment; filename=sales-report.pdf');
            doc.pipe(res);

            doc.fontSize(20).text('Sales Report', { align: 'center' });
            doc.moveDown();
            doc.fontSize(12).text(`Date Range: ${startDate || 'N/A'} to ${endDate || 'N/A'}`);
            doc.text(`Status: ${status || 'All'}`);
            doc.moveDown();

            const tableTop = 150;
            const rowHeight = 20;
            let y = tableTop;

            doc.font('Helvetica-Bold');
            doc.text('Order ID', 50, y);
            doc.text('Amount', 150, y);
            doc.text('Coupon', 250, y);
            doc.text('Final Amount', 350, y);
            doc.text('Payment', 450, y);
            doc.text('Date', 550, y);
            doc.text('Status', 650, y);
            y += rowHeight;
            doc.moveTo(50, y).lineTo(750, y).stroke();
            y += 5;

          
            doc.font('Helvetica');
            orders.forEach(order => {
                doc.text(order.orderId, 50, y);
                doc.text(`₹${order.totalPrice.toLocaleString('en-IN')}`, 150, y);
                doc.text(`₹${order.discount.toLocaleString('en-IN')}`, 250, y);
                doc.text(`₹${order.finalAmount.toLocaleString('en-IN')}`, 350, y);
                doc.text(order.paymentMethod === 'COD' ? 'cod' : 'razorpay', 450, y);
                doc.text(order.createdOn.toLocaleDateString('en-IN'), 550, y);
                doc.text(order.status, 650, y);
                y += rowHeight;
            });

            doc.end();
        } else if (format === 'excel') {
            const workbook = new ExcelJS.Workbook();
            const worksheet = workbook.addWorksheet('Sales Report');

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


module.exports = {
  loadLogin,
  login,
  loadDashboard,
  pageerror,
  logout,
  getSalesReport,
  exportSalesReport,
};

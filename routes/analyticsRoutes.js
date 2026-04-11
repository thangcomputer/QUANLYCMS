/**
 * analyticsRoutes.js — Báo cáo Doanh thu & Thống kê đa chi nhánh
 * Routes: GET /api/analytics/revenue, /analytics/enrollment, /analytics/branches
 */
const express  = require('express');
const router   = express.Router();
const Student  = require('../models/Student');
const Invoice  = require('../models/Invoice');
const Schedule = require('../models/Schedule');
const Branch   = require('../models/Branch');
const { authMiddleware, branchFilter } = require('../middleware/auth');

const guard = [authMiddleware, branchFilter];

// ── Helper: tính khoảng thời gian từ period string ────────────────────────────
function getPeriodRange(period) {
  const now  = new Date();
  const start = new Date(now);
  switch (period) {
    case '1d':   start.setDate(now.getDate() - 1);        break;
    case '7d':   start.setDate(now.getDate() - 7);        break;
    case '1m':   start.setMonth(now.getMonth() - 1);      break;
    case '2m':   start.setMonth(now.getMonth() - 2);      break;
    case '10m':  start.setMonth(now.getMonth() - 10);     break;
    case '1y':   start.setFullYear(now.getFullYear() - 1); break;
    case '2y':   start.setFullYear(now.getFullYear() - 2); break;
    default:     start.setMonth(now.getMonth() - 1);      break; // default 1 tháng
  }
  return { start, end: now };
}

// ── Tạo time-series data (daily buckets) ───────────────────────────────────────
function generateTimeSeries(docs, startDate, endDate, field = 'createdAt', valueField = 'price') {
  const days = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24));
  const bucketSize = days > 60 ? 'month' : days > 14 ? 'week' : 'day';

  const buckets = {};
  const cur = new Date(startDate);
  while (cur <= endDate) {
    const key = bucketSize === 'month'
      ? `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}`
      : bucketSize === 'week'
        ? `W${Math.ceil(cur.getDate() / 7)}-${cur.getMonth() + 1}/${cur.getFullYear()}`
        : cur.toISOString().slice(0, 10);
    buckets[key] = 0;
    if (bucketSize === 'day')   cur.setDate(cur.getDate() + 1);
    else if (bucketSize === 'week')  cur.setDate(cur.getDate() + 7);
    else cur.setMonth(cur.getMonth() + 1);
  }

  docs.forEach(doc => {
    const d = new Date(doc[field] || doc.createdAt || doc.paidAt);
    const key = bucketSize === 'month'
      ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      : bucketSize === 'week'
        ? `W${Math.ceil(d.getDate() / 7)}-${d.getMonth() + 1}/${d.getFullYear()}`
        : d.toISOString().slice(0, 10);
    if (buckets[key] !== undefined) buckets[key] += (doc[valueField] || 0);
  });

  return Object.entries(buckets).map(([label, value]) => ({ label, value }));
}

// ──────────────────────────────────────────────────────────────────────────────
// GET /api/analytics/revenue?period=1m&branchId=all
// Báo cáo doanh thu theo khoảng thời gian + breakdown theo chi nhánh
// ──────────────────────────────────────────────────────────────────────────────
router.get('/revenue', guard, async (req, res) => {
  try {
    const { period = '1m', branchId: queryBranch } = req.query;
    const { start, end } = getPeriodRange(period);

    // Base filter (branch isolation for staff)
    const baseFilter = { ...req.branchFilter };
    if (queryBranch && queryBranch !== 'all' && !baseFilter.branchId) {
      baseFilter.branchId = queryBranch;
    }

    // ── Tổng doanh thu trong khoảng ───────────────────────────────
    const paidStudents = await Student.find({
      ...baseFilter,
      paid: true,
      paidAt: { $gte: start, $lte: end },
    }).select('name price course branchId branchCode paidAt').lean();

    const totalRevenue = paidStudents.reduce((s, st) => s + (st.price || 0), 0);

    // ── So sánh kỳ trước (previous period) ─────────────────────────
    const periodMs   = end - start;
    const prevStart  = new Date(start.getTime() - periodMs);
    const prevEnd    = new Date(start);
    const prevStudents = await Student.find({
      ...baseFilter,
      paid: true,
      paidAt: { $gte: prevStart, $lte: prevEnd },
    }).select('price').lean();
    const prevRevenue = prevStudents.reduce((s, st) => s + (st.price || 0), 0);
    const growthPct   = prevRevenue > 0 ? Math.round(((totalRevenue - prevRevenue) / prevRevenue) * 100) : null;

    // ── Breakdown theo chi nhánh ────────────────────────────────────
    const branchMap = {};
    paidStudents.forEach(st => {
      const key   = st.branchId ? st.branchId.toString() : 'unknown';
      const label = st.branchCode || 'Không xác định';
      if (!branchMap[key]) branchMap[key] = { branchId: key, branchCode: label, total: 0, count: 0 };
      branchMap[key].total += (st.price || 0);
      branchMap[key].count += 1;
    });
    const byBranch = Object.values(branchMap).sort((a, b) => b.total - a.total);

    // Tính % đóng góp
    byBranch.forEach(b => {
      b.pct = totalRevenue > 0 ? Math.round((b.total / totalRevenue) * 100) : 0;
    });

    // ── Time-series (line/bar chart data) ──────────────────────────
    const timeSeries = generateTimeSeries(paidStudents, start, end, 'paidAt', 'price');

    // ── Thống kê học viên mới ───────────────────────────────────────
    const newStudents = await Student.countDocuments({
      ...baseFilter,
      createdAt: { $gte: start, $lte: end },
    });

    // ── Tổng toàn thời gian (all-time, theo branchFilter) ──────────
    const mongoose = require('mongoose');
    const aggFilter = { ...baseFilter, paid: true };
    if (aggFilter.branchId && typeof aggFilter.branchId === 'string' && mongoose.Types.ObjectId.isValid(aggFilter.branchId)) {
      aggFilter.branchId = new mongoose.Types.ObjectId(aggFilter.branchId);
    }

    const allTimeResult = await Student.aggregate([
      { $match: aggFilter },
      { $group: { _id: null, total: { $sum: '$price' } } },
    ]);
    const allTimeRevenue = allTimeResult[0]?.total || 0;

    return res.json({
      success: true,
      data: {
        period,
        dateRange: { from: start, to: end },
        totalRevenue,
        prevRevenue,
        growthPct,            // % tăng so với kỳ trước (null nếu không có dữ liệu kỳ trước)
        allTimeRevenue,
        newStudentsCount: newStudents,
        paidStudentsCount: paidStudents.length,
        byBranch,             // breakdown per branch
        timeSeries,           // [{label, value}] for chart
      },
    });
  } catch (err) {
    console.error('[ANALYTICS] revenue error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// GET /api/analytics/enrollment?period=1m&branchId=all
// Thống kê học viên đăng ký mới theo khoảng thời gian
// ──────────────────────────────────────────────────────────────────────────────
router.get('/enrollment', guard, async (req, res) => {
  try {
    const { period = '1m', branchId: queryBranch } = req.query;
    const { start, end } = getPeriodRange(period);

    const baseFilter = { ...req.branchFilter };
    if (queryBranch && queryBranch !== 'all' && !baseFilter.branchId) {
      baseFilter.branchId = queryBranch;
    }

    const students = await Student.find({
      ...baseFilter,
      createdAt: { $gte: start, $lte: end },
    }).select('name course branchId branchCode paid price createdAt paidAt').lean();

    const total      = students.length;
    const paid       = students.filter(s => s.paid).length;
    const totalFee   = students.filter(s => s.paid).reduce((s, st) => s + (st.price || 0), 0);

    // Breakdown by branch
    const branchMap = {};
    students.forEach(st => {
      const key = st.branchId ? st.branchId.toString() : 'unknown';
      if (!branchMap[key]) branchMap[key] = {
        branchId: key, branchCode: st.branchCode || 'Không xác định',
        count: 0, paid: 0, revenue: 0,
      };
      branchMap[key].count += 1;
      if (st.paid) { branchMap[key].paid += 1; branchMap[key].revenue += (st.price || 0); }
    });

    // Breakdown by course
    const courseMap = {};
    students.forEach(st => {
      const key = st.course || 'Chưa xếp khóa';
      if (!courseMap[key]) courseMap[key] = { course: key, count: 0, revenue: 0 };
      courseMap[key].count += 1;
      if (st.paid) courseMap[key].revenue += (st.price || 0);
    });

    const timeSeries = generateTimeSeries(students, start, end, 'createdAt', 'price');

    return res.json({
      success: true,
      data: {
        period,
        dateRange: { from: start, to: end },
        total, paid, totalFee,
        byBranch: Object.values(branchMap).sort((a, b) => b.count - a.count),
        byCourse:  Object.values(courseMap).sort((a, b) => b.count - a.count),
        timeSeries,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// GET /api/analytics/branches — Tổng quan từng chi nhánh (all-time)
// ──────────────────────────────────────────────────────────────────────────────
router.get('/branches', guard, async (req, res) => {
  try {
    const branches = await Branch.find({ isActive: { $ne: false } }).lean();

    const result = await Promise.all(branches.map(async (br) => {
      const [studentCount, paidCount, revenueRes, scheduleCount] = await Promise.all([
        Student.countDocuments({ branchId: br._id }),
        Student.countDocuments({ branchId: br._id, paid: true }),
        Student.aggregate([
          { $match: { branchId: br._id, paid: true } },
          { $group: { _id: null, total: { $sum: '$price' } } },
        ]),
        Schedule.countDocuments({ branchId: br._id }),
      ]);
      return {
        _id:          br._id,
        name:         br.name,
        code:         br.code,
        address:      br.address,
        studentCount,
        paidCount,
        revenue:      revenueRes[0]?.total || 0,
        scheduleCount,
      };
    }));

    const grandTotal = result.reduce((s, b) => s + b.revenue, 0);
    result.forEach(b => { b.pct = grandTotal > 0 ? Math.round((b.revenue / grandTotal) * 100) : 0; });

    return res.json({ success: true, data: result.sort((a, b) => b.revenue - a.revenue) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;

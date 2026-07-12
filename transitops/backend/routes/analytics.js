/* ============================================================
   TransitOps – Analytics Routes
   GET /api/analytics/summary      Full KPI summary
   GET /api/analytics/revenue      Monthly revenue data
   GET /api/analytics/costs        Per-vehicle cost breakdown
   ============================================================ */
'use strict';

const express = require('express');
const { getDb } = require('../database/db');
const auth = require('../middleware/auth');
const rbac = require('../middleware/rbac');

const router = express.Router();

/* ─── GET /summary ─── */
router.get('/summary', auth, rbac('analytics'), (req, res) => {
  const db = getDb();

  const vehicles    = db.prepare('SELECT * FROM vehicles').all();
  const trips       = db.prepare('SELECT * FROM trips').all();
  const fuelLogs    = db.prepare('SELECT * FROM fuel_logs').all();
  const maint       = db.prepare('SELECT * FROM maintenance_logs').all();

  const completed   = trips.filter(t => t.status === 'Completed');
  const dispatched  = trips.filter(t => t.status === 'Dispatched');

  /* Fleet utilization */
  const onTrip      = vehicles.filter(v => v.status === 'On Trip').length;
  const utilization = vehicles.length ? Math.round((onTrip / vehicles.length) * 100) : 0;

  /* Fuel efficiency */
  const totalDist   = completed.reduce((s, t) => s + (t.actual_dist || t.planned_dist || 0), 0);
  const totalFuel   = fuelLogs.reduce((s, f) => s + (f.liters || 0), 0);
  const fuelEff     = totalFuel > 0 ? (totalDist / totalFuel).toFixed(2) : '0.00';

  /* Operational cost */
  const fuelCost    = fuelLogs.reduce((s, f) => s + (f.cost || 0), 0);
  const maintCost   = maint.reduce((s, m) => s + (m.cost || 0), 0);
  const opCost      = fuelCost + maintCost;

  /* Revenue & ROI */
  const revenue     = completed.reduce((s, t) => s + (t.revenue || 0), 0);
  const acqCost     = vehicles.reduce((s, v) => s + (v.acquisition_cost || 0), 0) || 1;
  const roi         = ((revenue - opCost) / acqCost * 100).toFixed(2);

  /* Status breakdown */
  const statusBreakdown = ['Available','On Trip','In Shop','Retired'].map(s => ({
    status: s,
    count:  vehicles.filter(v => v.status === s).length
  }));

  res.json({
    ok: true,
    data: {
      fleet_total:       vehicles.length,
      utilization_pct:   utilization,
      fuel_efficiency:   parseFloat(fuelEff),
      operational_cost:  opCost,
      fuel_cost:         fuelCost,
      maint_cost:        maintCost,
      total_revenue:     revenue,
      roi_pct:           parseFloat(roi),
      acquisition_cost:  acqCost,
      trips_completed:   completed.length,
      trips_dispatched:  dispatched.length,
      trips_total:       trips.length,
      status_breakdown:  statusBreakdown,
    }
  });
});

/* ─── GET /revenue ─── */
router.get('/revenue', auth, rbac('analytics'), (req, res) => {
  const db = getDb();
  /* Group completed trip revenue by month */
  const rows = db.prepare(`
    SELECT SUBSTR(created_at, 1, 7) AS month,
           SUM(revenue) AS total
    FROM trips
    WHERE status='Completed'
    GROUP BY month
    ORDER BY month ASC
    LIMIT 12
  `).all();
  res.json({ ok: true, data: rows });
});

/* ─── GET /costs ─── */
router.get('/costs', auth, rbac('analytics'), (req, res) => {
  const db = getDb();
  const vehicles = db.prepare('SELECT id, name FROM vehicles').all();

  const result = vehicles.map(v => {
    const fc = db.prepare('SELECT COALESCE(SUM(cost),0) AS t FROM fuel_logs WHERE vehicle_id=?').get(v.id).t;
    const mc = db.prepare('SELECT COALESCE(SUM(cost),0) AS t FROM maintenance_logs WHERE vehicle_id=?').get(v.id).t;
    return { vehicle_id: v.id, vehicle_name: v.name, fuel_cost: fc, maint_cost: mc, total: fc + mc };
  }).sort((a, b) => b.total - a.total);

  res.json({ ok: true, data: result });
});

module.exports = router;

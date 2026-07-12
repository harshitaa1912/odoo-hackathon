/* ============================================================
   TransitOps – Fuel & Expense Routes

   Fuel logs:
     GET  /api/fuel/logs          List fuel logs
     POST /api/fuel/logs          Add fuel log
     DELETE /api/fuel/logs/:id    Delete

   Expenses:
     GET  /api/fuel/expenses          List expenses
     POST /api/fuel/expenses          Add expense
     DELETE /api/fuel/expenses/:id    Delete

   Summary:
     GET  /api/fuel/total             Total operational cost
   ============================================================ */
'use strict';

const express = require('express');
const { getDb, genId } = require('../database/db');
const auth = require('../middleware/auth');
const rbac = require('../middleware/rbac');

const router = express.Router();
const today  = () => new Date().toISOString().split('T')[0];

/* ══════════ FUEL LOGS ══════════ */

router.get('/logs', auth, rbac('fuel'), (req, res) => {
  const rows = getDb().prepare(`
    SELECT f.*, v.name AS vehicle_name
    FROM fuel_logs f
    LEFT JOIN vehicles v ON f.vehicle_id = v.id
    ORDER BY f.date DESC, f.created_at DESC
  `).all();
  res.json({ ok: true, data: rows });
});

router.post('/logs', auth, rbac('fuel', 'edit'), (req, res) => {
  const { vehicle_id, date = today(), liters, cost = 0 } = req.body;
  if (!vehicle_id || !liters || liters <= 0) {
    return res.status(400).json({ ok: false, message: 'vehicle_id and liters (>0) are required.' });
  }
  const db = getDb();
  if (!db.prepare('SELECT id FROM vehicles WHERE id=?').get(vehicle_id)) {
    return res.status(404).json({ ok: false, message: 'Vehicle not found.' });
  }
  const id = genId();
  db.prepare('INSERT INTO fuel_logs (id,vehicle_id,date,liters,cost) VALUES (?,?,?,?,?)')
    .run(id, vehicle_id, date, liters, cost);
  res.status(201).json({ ok: true, data: db.prepare('SELECT * FROM fuel_logs WHERE id=?').get(id) });
});

router.delete('/logs/:id', auth, rbac('fuel', 'edit'), (req, res) => {
  const db = getDb();
  if (!db.prepare('SELECT id FROM fuel_logs WHERE id=?').get(req.params.id)) {
    return res.status(404).json({ ok: false, message: 'Fuel log not found.' });
  }
  db.prepare('DELETE FROM fuel_logs WHERE id=?').run(req.params.id);
  res.json({ ok: true, message: 'Fuel log deleted.' });
});

/* ══════════ EXPENSES ══════════ */

router.get('/expenses', auth, rbac('fuel'), (req, res) => {
  const rows = getDb().prepare(`
    SELECT e.*,
      t.trip_no, t.status AS trip_status,
      v.name AS vehicle_name
    FROM expenses e
    LEFT JOIN trips    t ON e.trip_id    = t.id
    LEFT JOIN vehicles v ON e.vehicle_id = v.id
    ORDER BY e.created_at DESC
  `).all();
  res.json({ ok: true, data: rows });
});

router.post('/expenses', auth, rbac('fuel', 'edit'), (req, res) => {
  const { trip_id = null, vehicle_id, toll = 0, other = 0, maint_linked = 0 } = req.body;
  if (!vehicle_id) return res.status(400).json({ ok: false, message: 'vehicle_id is required.' });
  const db = getDb();
  if (!db.prepare('SELECT id FROM vehicles WHERE id=?').get(vehicle_id)) {
    return res.status(404).json({ ok: false, message: 'Vehicle not found.' });
  }
  const id = genId();
  db.prepare('INSERT INTO expenses (id,trip_id,vehicle_id,toll,other,maint_linked) VALUES (?,?,?,?,?,?)')
    .run(id, trip_id, vehicle_id, toll, other, maint_linked);
  res.status(201).json({ ok: true, data: db.prepare('SELECT * FROM expenses WHERE id=?').get(id) });
});

router.delete('/expenses/:id', auth, rbac('fuel', 'edit'), (req, res) => {
  const db = getDb();
  if (!db.prepare('SELECT id FROM expenses WHERE id=?').get(req.params.id)) {
    return res.status(404).json({ ok: false, message: 'Expense not found.' });
  }
  db.prepare('DELETE FROM expenses WHERE id=?').run(req.params.id);
  res.json({ ok: true, message: 'Expense deleted.' });
});

/* ══════════ TOTAL OPERATIONAL COST ══════════ */

router.get('/total', auth, rbac('fuel'), (req, res) => {
  const db = getDb();
  const fuelTotal  = db.prepare('SELECT COALESCE(SUM(cost),0) AS t FROM fuel_logs').get().t;
  const maintTotal = db.prepare('SELECT COALESCE(SUM(cost),0) AS t FROM maintenance_logs').get().t;
  res.json({ ok: true, data: { fuel_cost: fuelTotal, maint_cost: maintTotal, total: fuelTotal + maintTotal } });
});

module.exports = router;

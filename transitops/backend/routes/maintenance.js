/* ============================================================
   TransitOps – Maintenance Routes
   GET    /api/maintenance          List logs
   POST   /api/maintenance          Create log
   POST   /api/maintenance/:id/close  Close record → vehicle Available
   DELETE /api/maintenance/:id      Delete
   ============================================================ */
'use strict';

const express = require('express');
const { getDb, genId } = require('../database/db');
const auth = require('../middleware/auth');
const rbac = require('../middleware/rbac');

const router = express.Router();
const today = () => new Date().toISOString().split('T')[0];

/* ─── GET / ─── */
router.get('/', auth, rbac('maintenance'), (req, res) => {
  const rows = getDb().prepare(`
    SELECT m.*, v.name AS vehicle_name
    FROM maintenance_logs m
    LEFT JOIN vehicles v ON m.vehicle_id = v.id
    ORDER BY m.created_at DESC
  `).all();
  res.json({ ok: true, data: rows });
});

/* ─── POST / ─── */
router.post('/', auth, rbac('maintenance', 'edit'), (req, res) => {
  const { vehicle_id, service_type, cost = 0, date, status = 'Active' } = req.body;
  if (!vehicle_id || !service_type || !date) {
    return res.status(400).json({ ok: false, message: 'vehicle_id, service_type and date are required.' });
  }

  const db = getDb();
  const vehicle = db.prepare('SELECT * FROM vehicles WHERE id=?').get(vehicle_id);
  if (!vehicle) return res.status(404).json({ ok: false, message: 'Vehicle not found.' });
  if (vehicle.status === 'Retired') return res.status(400).json({ ok: false, message: 'Cannot add maintenance for a Retired vehicle.' });

  const id = genId();
  db.prepare(
    'INSERT INTO maintenance_logs (id,vehicle_id,service_type,cost,date,status) VALUES (?,?,?,?,?,?)'
  ).run(id, vehicle_id, service_type, cost, date, status);

  /* Business rule: Active maintenance → vehicle In Shop */
  if (status === 'Active') {
    db.prepare("UPDATE vehicles SET status='In Shop' WHERE id=?").run(vehicle_id);
  }

  const record = db.prepare('SELECT * FROM maintenance_logs WHERE id=?').get(id);
  res.status(201).json({
    ok: true,
    data: record,
    message: status === 'Active' ? 'Record saved. Vehicle → In Shop.' : 'Maintenance record saved.'
  });
});

/* ─── POST /:id/close ─── */
router.post('/:id/close', auth, rbac('maintenance', 'edit'), (req, res) => {
  const db     = getDb();
  const record = db.prepare('SELECT * FROM maintenance_logs WHERE id=?').get(req.params.id);
  if (!record) return res.status(404).json({ ok: false, message: 'Maintenance record not found.' });
  if (record.status !== 'Active') {
    return res.status(400).json({ ok: false, message: 'Record is already Completed.' });
  }

  db.prepare("UPDATE maintenance_logs SET status='Completed' WHERE id=?").run(req.params.id);

  /* Business rule: closing → vehicle Available (unless Retired) */
  const vehicle = db.prepare('SELECT status FROM vehicles WHERE id=?').get(record.vehicle_id);
  let vmsg = '';
  if (vehicle && vehicle.status !== 'Retired') {
    db.prepare("UPDATE vehicles SET status='Available' WHERE id=?").run(record.vehicle_id);
    vmsg = ' Vehicle → Available.';
  }

  res.json({ ok: true, message: 'Maintenance closed.' + vmsg });
});

/* ─── DELETE /:id ─── */
router.delete('/:id', auth, rbac('maintenance', 'edit'), (req, res) => {
  const db     = getDb();
  const record = db.prepare('SELECT * FROM maintenance_logs WHERE id=?').get(req.params.id);
  if (!record) return res.status(404).json({ ok: false, message: 'Record not found.' });
  db.prepare('DELETE FROM maintenance_logs WHERE id=?').run(req.params.id);
  res.json({ ok: true, message: 'Record deleted.' });
});

module.exports = router;

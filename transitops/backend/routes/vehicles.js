/* ============================================================
   TransitOps – Vehicle Routes
   GET    /api/vehicles          List (with filter: type, status, region, q)
   POST   /api/vehicles          Create
   GET    /api/vehicles/:id      Get by ID
   PUT    /api/vehicles/:id      Update
   DELETE /api/vehicles/:id      Delete
   ============================================================ */
'use strict';

const express = require('express');
const { getDb, genId } = require('../database/db');
const auth = require('../middleware/auth');
const rbac = require('../middleware/rbac');

const router = express.Router();

/* ─── GET / ─── */
router.get('/', auth, rbac('fleet'), (req, res) => {
  const db = getDb();
  let sql = 'SELECT * FROM vehicles WHERE 1=1';
  const params = [];

  if (req.query.type)   { sql += ' AND type=?';   params.push(req.query.type); }
  if (req.query.status) { sql += ' AND status=?';  params.push(req.query.status); }
  if (req.query.region) { sql += ' AND region=?';  params.push(req.query.region); }
  if (req.query.q) {
    sql += ' AND (LOWER(reg_no) LIKE ? OR LOWER(name) LIKE ?)';
    const like = `%${req.query.q.toLowerCase()}%`;
    params.push(like, like);
  }

  sql += ' ORDER BY created_at DESC';
  const rows = db.prepare(sql).all(...params);
  res.json({ ok: true, data: rows });
});

/* ─── POST / ─── */
router.post('/', auth, rbac('fleet', 'edit'), (req, res) => {
  const { reg_no, name, type, capacity, odometer = 0, acquisition_cost = 0, status = 'Available', region = '' } = req.body;

  if (!reg_no || !name || !type || !capacity) {
    return res.status(400).json({ ok: false, message: 'reg_no, name, type and capacity are required.' });
  }
  if (capacity <= 0) {
    return res.status(400).json({ ok: false, message: 'Capacity must be greater than 0.' });
  }

  const db = getDb();

  /* Business rule: unique reg_no */
  const exists = db.prepare('SELECT id FROM vehicles WHERE reg_no=?').get(reg_no);
  if (exists) {
    return res.status(409).json({ ok: false, message: `Registration number "${reg_no}" already exists.` });
  }

  const id = genId();
  db.prepare(
    'INSERT INTO vehicles (id,reg_no,name,type,capacity,odometer,acquisition_cost,status,region) VALUES (?,?,?,?,?,?,?,?,?)'
  ).run(id, reg_no, name, type, capacity, odometer, acquisition_cost, status, region);

  const vehicle = db.prepare('SELECT * FROM vehicles WHERE id=?').get(id);
  res.status(201).json({ ok: true, data: vehicle });
});

/* ─── GET /:id ─── */
router.get('/:id', auth, rbac('fleet'), (req, res) => {
  const vehicle = getDb().prepare('SELECT * FROM vehicles WHERE id=?').get(req.params.id);
  if (!vehicle) return res.status(404).json({ ok: false, message: 'Vehicle not found.' });
  res.json({ ok: true, data: vehicle });
});

/* ─── PUT /:id ─── */
router.put('/:id', auth, rbac('fleet', 'edit'), (req, res) => {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM vehicles WHERE id=?').get(req.params.id);
  if (!existing) return res.status(404).json({ ok: false, message: 'Vehicle not found.' });

  const { reg_no, name, type, capacity, odometer, acquisition_cost, status, region } = req.body;

  /* Business rule: unique reg_no (excluding self) */
  if (reg_no && reg_no !== existing.reg_no) {
    const dup = db.prepare('SELECT id FROM vehicles WHERE reg_no=? AND id!=?').get(reg_no, req.params.id);
    if (dup) return res.status(409).json({ ok: false, message: `Registration number "${reg_no}" already in use.` });
  }

  db.prepare(`
    UPDATE vehicles SET
      reg_no=COALESCE(?,reg_no), name=COALESCE(?,name), type=COALESCE(?,type),
      capacity=COALESCE(?,capacity), odometer=COALESCE(?,odometer),
      acquisition_cost=COALESCE(?,acquisition_cost), status=COALESCE(?,status),
      region=COALESCE(?,region)
    WHERE id=?
  `).run(reg_no, name, type, capacity, odometer, acquisition_cost, status, region, req.params.id);

  res.json({ ok: true, data: db.prepare('SELECT * FROM vehicles WHERE id=?').get(req.params.id) });
});

/* ─── DELETE /:id ─── */
router.delete('/:id', auth, rbac('fleet', 'edit'), (req, res) => {
  const db = getDb();
  const vehicle = db.prepare('SELECT * FROM vehicles WHERE id=?').get(req.params.id);
  if (!vehicle) return res.status(404).json({ ok: false, message: 'Vehicle not found.' });

  /* Business rule: cannot delete a vehicle On Trip */
  const activeTrip = db.prepare(
    "SELECT id FROM trips WHERE vehicle_id=? AND status IN ('Dispatched','On Trip')"
  ).get(req.params.id);
  if (activeTrip) {
    return res.status(400).json({ ok: false, message: 'Cannot delete a vehicle currently On Trip.' });
  }

  db.prepare('DELETE FROM vehicles WHERE id=?').run(req.params.id);
  res.json({ ok: true, message: 'Vehicle deleted.' });
});

module.exports = router;

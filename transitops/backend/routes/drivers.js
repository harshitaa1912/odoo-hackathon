/* ============================================================
   TransitOps – Driver Routes
   GET    /api/drivers          List
   POST   /api/drivers          Create
   GET    /api/drivers/:id      Get by ID
   PUT    /api/drivers/:id      Update
   PATCH  /api/drivers/:id/status  Change status
   DELETE /api/drivers/:id      Delete
   ============================================================ */
'use strict';

const express = require('express');
const { getDb, genId } = require('../database/db');
const auth = require('../middleware/auth');
const rbac = require('../middleware/rbac');

const router = express.Router();

/* ─── GET / ─── */
router.get('/', auth, rbac('drivers'), (req, res) => {
  const drivers = getDb().prepare('SELECT * FROM drivers ORDER BY created_at DESC').all();
  res.json({ ok: true, data: drivers });
});

/* ─── POST / ─── */
router.post('/', auth, rbac('drivers', 'edit'), (req, res) => {
  const { name, license_no, category, expiry, contact, safety_score = 100, status = 'Available' } = req.body;

  if (!name || !license_no || !category || !expiry || !contact) {
    return res.status(400).json({ ok: false, message: 'name, license_no, category, expiry and contact are required.' });
  }
  if (safety_score < 0 || safety_score > 100) {
    return res.status(400).json({ ok: false, message: 'safety_score must be 0–100.' });
  }

  const id = genId();
  const db = getDb();
  db.prepare(
    'INSERT INTO drivers (id,name,license_no,category,expiry,contact,safety_score,status,trips_completed) VALUES (?,?,?,?,?,?,?,?,0)'
  ).run(id, name, license_no, category, expiry, contact, safety_score, status);

  res.status(201).json({ ok: true, data: db.prepare('SELECT * FROM drivers WHERE id=?').get(id) });
});

/* ─── GET /:id ─── */
router.get('/:id', auth, rbac('drivers'), (req, res) => {
  const driver = getDb().prepare('SELECT * FROM drivers WHERE id=?').get(req.params.id);
  if (!driver) return res.status(404).json({ ok: false, message: 'Driver not found.' });
  res.json({ ok: true, data: driver });
});

/* ─── PUT /:id ─── */
router.put('/:id', auth, rbac('drivers', 'edit'), (req, res) => {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM drivers WHERE id=?').get(req.params.id);
  if (!existing) return res.status(404).json({ ok: false, message: 'Driver not found.' });

  const { name, license_no, category, expiry, contact, safety_score, status } = req.body;
  if (safety_score !== undefined && (safety_score < 0 || safety_score > 100)) {
    return res.status(400).json({ ok: false, message: 'safety_score must be 0–100.' });
  }

  db.prepare(`
    UPDATE drivers SET
      name=COALESCE(?,name), license_no=COALESCE(?,license_no),
      category=COALESCE(?,category), expiry=COALESCE(?,expiry),
      contact=COALESCE(?,contact), safety_score=COALESCE(?,safety_score),
      status=COALESCE(?,status)
    WHERE id=?
  `).run(name, license_no, category, expiry, contact, safety_score, status, req.params.id);

  res.json({ ok: true, data: db.prepare('SELECT * FROM drivers WHERE id=?').get(req.params.id) });
});

/* ─── PATCH /:id/status ─── */
router.patch('/:id/status', auth, rbac('drivers', 'edit'), (req, res) => {
  const { status } = req.body;
  const VALID = ['Available', 'On Trip', 'Off Duty', 'Suspended'];
  if (!VALID.includes(status)) {
    return res.status(400).json({ ok: false, message: `Invalid status. Must be: ${VALID.join(', ')}` });
  }

  const db = getDb();
  const driver = db.prepare('SELECT * FROM drivers WHERE id=?').get(req.params.id);
  if (!driver) return res.status(404).json({ ok: false, message: 'Driver not found.' });

  /* Business rule: cannot manually set On Trip */
  if (status === 'On Trip') {
    return res.status(400).json({ ok: false, message: 'On Trip status is set automatically via trip dispatch.' });
  }
  /* Business rule: if driver is On Trip, check for active trip before changing */
  if (driver.status === 'On Trip') {
    const activeTrip = db.prepare(
      "SELECT id FROM trips WHERE driver_id=? AND status='Dispatched'"
    ).get(req.params.id);
    if (activeTrip) {
      return res.status(400).json({ ok: false, message: 'Driver is currently On Trip. Complete or cancel the trip first.' });
    }
  }

  db.prepare('UPDATE drivers SET status=? WHERE id=?').run(status, req.params.id);
  res.json({ ok: true, data: db.prepare('SELECT * FROM drivers WHERE id=?').get(req.params.id) });
});

/* ─── DELETE /:id ─── */
router.delete('/:id', auth, rbac('drivers', 'edit'), (req, res) => {
  const db = getDb();
  const driver = db.prepare('SELECT * FROM drivers WHERE id=?').get(req.params.id);
  if (!driver) return res.status(404).json({ ok: false, message: 'Driver not found.' });

  const activeTrip = db.prepare(
    "SELECT id FROM trips WHERE driver_id=? AND status IN ('Dispatched','On Trip')"
  ).get(req.params.id);
  if (activeTrip) {
    return res.status(400).json({ ok: false, message: 'Cannot delete a driver currently On Trip.' });
  }

  db.prepare('DELETE FROM drivers WHERE id=?').run(req.params.id);
  res.json({ ok: true, message: 'Driver deleted.' });
});

module.exports = router;

/* ============================================================
   TransitOps – Trip Routes
   GET    /api/trips               List
   POST   /api/trips/dispatch      Dispatch a new trip
   GET    /api/trips/:id           Get by ID
   POST   /api/trips/:id/complete  Complete a trip
   POST   /api/trips/:id/cancel    Cancel a trip
   DELETE /api/trips/:id           Remove a Draft trip
   ============================================================ */
'use strict';

const express = require('express');
const { getDb, genId } = require('../database/db');
const auth = require('../middleware/auth');
const rbac = require('../middleware/rbac');

const router = express.Router();

const today = () => new Date().toISOString().split('T')[0];
const isExpired = d => d && new Date(d) < new Date();

function nextTripNo(db) {
  const rows = db.prepare("SELECT trip_no FROM trips").all();
  const nums = rows.map(r => parseInt(r.trip_no.replace('TR', '')) || 0);
  return 'TR' + String(Math.max(0, ...nums) + 1).padStart(3, '0');
}

/* ─── GET / ─── */
router.get('/', auth, rbac('trips'), (req, res) => {
  const db = getDb();
  let sql = `
    SELECT t.*,
      v.name AS vehicle_name, v.reg_no AS vehicle_reg_no, v.capacity AS vehicle_capacity,
      d.name AS driver_name, d.license_no AS driver_license, d.expiry AS driver_expiry
    FROM trips t
    LEFT JOIN vehicles v ON t.vehicle_id = v.id
    LEFT JOIN drivers  d ON t.driver_id  = d.id
    WHERE 1=1
  `;
  const params = [];

  if (req.query.status) { sql += ' AND t.status=?'; params.push(req.query.status); }
  sql += ' ORDER BY t.created_at DESC';

  const rows = db.prepare(sql).all(...params);
  res.json({ ok: true, data: rows });
});

/* ─── POST /dispatch ─── */
router.post('/dispatch', auth, rbac('trips', 'edit'), (req, res) => {
  const { source, destination, vehicle_id, driver_id, cargo_weight, planned_dist = 0 } = req.body;

  if (!source || !destination)  return res.status(400).json({ ok: false, message: 'Source and destination are required.' });
  if (!vehicle_id)              return res.status(400).json({ ok: false, message: 'Select an available vehicle.' });
  if (!driver_id)               return res.status(400).json({ ok: false, message: 'Select an available driver.' });
  if (!cargo_weight || cargo_weight <= 0) return res.status(400).json({ ok: false, message: 'Enter a valid cargo weight.' });

  const db = getDb();

  /* Vehicle checks */
  const vehicle = db.prepare('SELECT * FROM vehicles WHERE id=?').get(vehicle_id);
  if (!vehicle)                              return res.status(404).json({ ok: false, message: 'Vehicle not found.' });
  if (vehicle.status !== 'Available')        return res.status(400).json({ ok: false, message: `Vehicle is "${vehicle.status}" – only Available vehicles can be dispatched.` });
  if (['In Shop','Retired'].includes(vehicle.status)) return res.status(400).json({ ok: false, message: 'In Shop / Retired vehicles cannot be dispatched.' });

  /* Business rule: cargo <= capacity */
  if (cargo_weight > vehicle.capacity) {
    return res.status(400).json({
      ok: false,
      message: `Cargo (${cargo_weight} kg) exceeds vehicle capacity (${vehicle.capacity} kg). Dispatch blocked.`
    });
  }

  /* Driver checks */
  const driver = db.prepare('SELECT * FROM drivers WHERE id=?').get(driver_id);
  if (!driver)                          return res.status(404).json({ ok: false, message: 'Driver not found.' });
  if (driver.status !== 'Available')    return res.status(400).json({ ok: false, message: `Driver is "${driver.status}" – only Available drivers can be assigned.` });
  if (driver.status === 'Suspended')    return res.status(400).json({ ok: false, message: 'Suspended driver cannot be assigned.' });
  if (isExpired(driver.expiry))         return res.status(400).json({ ok: false, message: 'Driver license is expired – dispatch blocked.' });

  const id     = genId();
  const tripNo = nextTripNo(db);

  /* Insert trip */
  db.prepare(
    'INSERT INTO trips (id,trip_no,source,destination,vehicle_id,driver_id,cargo_weight,planned_dist,status,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)'
  ).run(id, tripNo, source, destination, vehicle_id, driver_id, cargo_weight, planned_dist, 'Dispatched', today());

  /* Auto status transitions */
  db.prepare("UPDATE vehicles SET status='On Trip' WHERE id=?").run(vehicle_id);
  db.prepare("UPDATE drivers  SET status='On Trip' WHERE id=?").run(driver_id);

  const trip = db.prepare('SELECT * FROM trips WHERE id=?').get(id);
  res.status(201).json({ ok: true, data: trip, message: `${tripNo} dispatched! Vehicle & driver → On Trip.` });
});

/* ─── GET /:id ─── */
router.get('/:id', auth, rbac('trips'), (req, res) => {
  const trip = getDb().prepare('SELECT * FROM trips WHERE id=?').get(req.params.id);
  if (!trip) return res.status(404).json({ ok: false, message: 'Trip not found.' });
  res.json({ ok: true, data: trip });
});

/* ─── POST /:id/complete ─── */
router.post('/:id/complete', auth, rbac('trips', 'edit'), (req, res) => {
  const db   = getDb();
  const trip = db.prepare('SELECT * FROM trips WHERE id=?').get(req.params.id);
  if (!trip) return res.status(404).json({ ok: false, message: 'Trip not found.' });
  if (trip.status !== 'Dispatched') {
    return res.status(400).json({ ok: false, message: `Only Dispatched trips can be completed. Current status: ${trip.status}` });
  }

  const { actual_dist = 0, fuel_consumed = 0, revenue = 0 } = req.body;

  /* Update trip */
  db.prepare(
    "UPDATE trips SET status='Completed', actual_dist=?, fuel_consumed=?, revenue=? WHERE id=?"
  ).run(actual_dist, fuel_consumed, revenue, req.params.id);

  /* Business rule: vehicle → Available */
  if (trip.vehicle_id) {
    const v = db.prepare('SELECT status FROM vehicles WHERE id=?').get(trip.vehicle_id);
    if (v && v.status !== 'Retired') {
      db.prepare("UPDATE vehicles SET status='Available', odometer=odometer+? WHERE id=?")
        .run(actual_dist, trip.vehicle_id);
    }
  }

  /* Business rule: driver → Available, increment trips_completed */
  if (trip.driver_id) {
    db.prepare("UPDATE drivers SET status='Available', trips_completed=trips_completed+1 WHERE id=?")
      .run(trip.driver_id);
  }

  /* Auto log fuel */
  if (fuel_consumed > 0 && trip.vehicle_id) {
    db.prepare('INSERT INTO fuel_logs (id,vehicle_id,date,liters,cost) VALUES (?,?,?,?,?)')
      .run(genId(), trip.vehicle_id, today(), fuel_consumed, Math.round(fuel_consumed * 75));
  }

  res.json({ ok: true, data: db.prepare('SELECT * FROM trips WHERE id=?').get(req.params.id), message: 'Trip completed. Vehicle & driver → Available.' });
});

/* ─── POST /:id/cancel ─── */
router.post('/:id/cancel', auth, rbac('trips', 'edit'), (req, res) => {
  const db   = getDb();
  const trip = db.prepare('SELECT * FROM trips WHERE id=?').get(req.params.id);
  if (!trip) return res.status(404).json({ ok: false, message: 'Trip not found.' });
  if (!['Dispatched','Draft'].includes(trip.status)) {
    return res.status(400).json({ ok: false, message: `Cannot cancel a ${trip.status} trip.` });
  }

  db.prepare("UPDATE trips SET status='Cancelled' WHERE id=?").run(req.params.id);

  /* Restore vehicle and driver */
  if (trip.vehicle_id) {
    const v = db.prepare('SELECT status FROM vehicles WHERE id=?').get(trip.vehicle_id);
    if (v && !['Retired','In Shop'].includes(v.status)) {
      db.prepare("UPDATE vehicles SET status='Available' WHERE id=?").run(trip.vehicle_id);
    }
  }
  if (trip.driver_id) {
    const d = db.prepare('SELECT status FROM drivers WHERE id=?').get(trip.driver_id);
    if (d) db.prepare("UPDATE drivers SET status='Available' WHERE id=?").run(trip.driver_id);
  }

  res.json({ ok: true, message: 'Trip cancelled. Vehicle & driver → Available.' });
});

/* ─── DELETE /:id (Draft only) ─── */
router.delete('/:id', auth, rbac('trips', 'edit'), (req, res) => {
  const db   = getDb();
  const trip = db.prepare('SELECT * FROM trips WHERE id=?').get(req.params.id);
  if (!trip) return res.status(404).json({ ok: false, message: 'Trip not found.' });
  if (trip.status !== 'Draft') {
    return res.status(400).json({ ok: false, message: 'Only Draft trips can be removed.' });
  }
  db.prepare('DELETE FROM trips WHERE id=?').run(req.params.id);
  res.json({ ok: true, message: 'Draft trip removed.' });
});

module.exports = router;

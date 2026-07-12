/* ============================================================
   TransitOps – Settings Routes
   GET /api/settings   Get all settings
   PUT /api/settings   Update settings
   ============================================================ */
'use strict';

const express = require('express');
const { getDb } = require('../database/db');
const auth = require('../middleware/auth');
const rbac = require('../middleware/rbac');

const router = express.Router();

/* ─── GET / ─── */
router.get('/', auth, rbac('dashboard'), (req, res) => {
  const rows = getDb().prepare('SELECT * FROM settings').all();
  const settings = Object.fromEntries(rows.map(r => [r.key, r.value]));
  res.json({ ok: true, data: settings });
});

/* ─── PUT / ─── */
router.put('/', auth, rbac('settings', 'edit'), (req, res) => {
  const db = getDb();
  const allowed = ['depot_name', 'currency', 'distance_unit'];
  const upsert  = db.prepare('INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value');

  const updated = {};
  for (const key of allowed) {
    if (req.body[key] !== undefined) {
      upsert.run(key, String(req.body[key]));
      updated[key] = req.body[key];
    }
  }

  res.json({ ok: true, data: updated, message: 'Settings saved.' });
});

module.exports = router;

/* ============================================================
   TransitOps – Express Server Entry Point
   ============================================================ */
'use strict';

require('dotenv').config();

const express = require('express');
const cors    = require('cors');
const path    = require('path');

const app  = express();
const PORT = process.env.PORT || 3000;

/* ─── Global Middleware ─── */
app.use(cors({ origin: '*' }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/* ─── Serve Frontend Static Files ─── */
// Serve the transitops frontend (HTML/CSS/JS) from the Desktop location
const FRONTEND = process.env.FRONTEND_PATH ||
  path.join(__dirname, '..') ||                    // fallback: sibling folder
  'C:\\Users\\Himani Nandwani\\OneDrive\\Desktop\\odoo\\transitops';
app.use(express.static(FRONTEND));

/* ─── API Routes ─── */
app.use('/api/auth',        require('./routes/auth'));
app.use('/api/vehicles',    require('./routes/vehicles'));
app.use('/api/drivers',     require('./routes/drivers'));
app.use('/api/trips',       require('./routes/trips'));
app.use('/api/maintenance', require('./routes/maintenance'));
app.use('/api/fuel',        require('./routes/fuel'));
app.use('/api/analytics',   require('./routes/analytics'));
app.use('/api/settings',    require('./routes/settings'));

/* ─── Health Check ─── */
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'TransitOps API', timestamp: new Date().toISOString() });
});

/* ─── 404 for unknown API routes ─── */
app.use('/api/*', (_req, res) => {
  res.status(404).json({ ok: false, message: 'API endpoint not found.' });
});

/* ─── SPA fallback – serve index.html for all other routes ─── */
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'index.html'));
});

/* ─── Global Error Handler ─── */
app.use((err, _req, res, _next) => {
  console.error('[ERROR]', err.message);
  res.status(err.status || 500).json({ ok: false, message: err.message || 'Internal server error.' });
});

/* ─── Start ─── */
app.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════╗
║   🚛  TransitOps API Server              ║
║   http://localhost:${PORT}                  ║
║                                          ║
║   Endpoints:                             ║
║   POST /api/auth/login                   ║
║   GET  /api/vehicles                     ║
║   GET  /api/drivers                      ║
║   GET  /api/trips                        ║
║   GET  /api/maintenance                  ║
║   GET  /api/fuel/logs                    ║
║   GET  /api/analytics/summary            ║
║   GET  /api/settings                     ║
╚══════════════════════════════════════════╝
  `);
});

module.exports = app;

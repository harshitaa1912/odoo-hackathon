/* ============================================================
   TransitOps – Auth Routes
   POST /api/auth/login
   POST /api/auth/logout
   GET  /api/auth/me
   ============================================================ */
'use strict';

const express = require('express');
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const { getDb } = require('../database/db');
const authMw  = require('../middleware/auth');

const router = express.Router();
const JWT_SECRET  = process.env.JWT_SECRET  || 'transitops_secret';
const JWT_EXPIRES = process.env.JWT_EXPIRES_IN || '8h';

/* Brute-force guard (in-memory, resets on restart) */
const failMap = {};
const MAX_FAILS = 5;
const LOCK_MS   = 15 * 60 * 1000; // 15 min

/* ─── POST /api/auth/login ─── */
router.post('/login', (req, res) => {
  const { email, password, role } = req.body;

  if (!email || !password || !role) {
    return res.status(400).json({ ok: false, message: 'Email, password and role are required.' });
  }

  /* Brute-force check */
  const key  = email.toLowerCase();
  const info = failMap[key] || { count: 0, lockedAt: null };

  if (info.lockedAt && Date.now() - info.lockedAt < LOCK_MS) {
    const remaining = Math.ceil((LOCK_MS - (Date.now() - info.lockedAt)) / 60000);
    return res.status(429).json({
      ok: false,
      message: `Account locked. Try again in ${remaining} minute(s).`
    });
  }

  const db   = getDb();
  const user = db.prepare('SELECT * FROM users WHERE LOWER(email)=? AND role=?')
                  .get(key, role);

  const passwordOk = user ? bcrypt.compareSync(password, user.password) : false;

  if (!user || !passwordOk) {
    info.count++;
    if (info.count >= MAX_FAILS) info.lockedAt = Date.now();
    failMap[key] = info;
    const left = MAX_FAILS - info.count;
    return res.status(401).json({
      ok: false,
      message: left > 0
        ? `Invalid credentials. ${left} attempt(s) left.`
        : 'Account locked after 5 failed attempts.'
    });
  }

  /* Success – reset fail counter */
  delete failMap[key];

  const payload = { id: user.id, name: user.name, email: user.email, role: user.role, initials: user.initials };
  const token   = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES });

  return res.json({
    ok: true,
    token,
    user: payload
  });
});

/* ─── POST /api/auth/logout ─── */
router.post('/logout', authMw, (_req, res) => {
  /* JWT is stateless; client should discard the token */
  res.json({ ok: true, message: 'Signed out.' });
});

/* ─── GET /api/auth/me ─── */
router.get('/me', authMw, (req, res) => {
  res.json({ ok: true, user: req.user });
});

module.exports = router;

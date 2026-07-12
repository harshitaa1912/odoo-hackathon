/* ============================================================
   TransitOps – JWT Auth Middleware
   ============================================================ */
'use strict';

const jwt = require('jsonwebtoken');
const { JWT_SECRET } = process.env;

module.exports = function authMiddleware(req, res, next) {
  const header = req.headers['authorization'] || '';
  const token  = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ ok: false, message: 'No token – please sign in.' });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET || 'transitops_secret');
    req.user = payload;   // { id, name, email, role, initials }
    next();
  } catch (err) {
    return res.status(401).json({ ok: false, message: 'Token expired or invalid – please sign in again.' });
  }
};

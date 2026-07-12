/* ============================================================
   TransitOps – RBAC Middleware
   Checks if the logged-in user's role has access to a module.

   Usage:  router.get('/', auth, rbac('fleet'), handler)
   ============================================================ */
'use strict';

const PERMS = {
  'Fleet Manager':    { dashboard:true, fleet:true,   drivers:true,   trips:true,   maintenance:true,  fuel:true,  analytics:true,  settings:true  },
  'Dispatcher':       { dashboard:true, fleet:'view', drivers:false,  trips:true,   maintenance:false, fuel:false, analytics:false, settings:false },
  'Safety Officer':   { dashboard:true, fleet:false,  drivers:true,   trips:'view', maintenance:false, fuel:false, analytics:false, settings:false },
  'Financial Analyst':{ dashboard:true, fleet:'view', drivers:false,  trips:false,  maintenance:false, fuel:true,  analytics:true,  settings:false },
};

/**
 * @param {string} module  - module name
 * @param {'view'|'edit'}  level - required access level (default 'view')
 */
module.exports = function rbac(module, level = 'view') {
  return (req, res, next) => {
    const role = req.user?.role;
    const perm = PERMS[role]?.[module];

    const hasAccess =
      level === 'view' ? (perm === true || perm === 'view') : perm === true;

    if (!hasAccess) {
      return res.status(403).json({
        ok: false,
        message: `Your role (${role}) does not have ${level} access to [${module}].`
      });
    }
    next();
  };
};

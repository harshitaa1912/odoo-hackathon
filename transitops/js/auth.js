/* ============================================
   TransitOps – Authentication & RBAC
   ============================================ */

const Auth = {
  _failCount: 0,
  MAX_FAIL: 5,

  /* RBAC matrix
     true  = full access
     'view'= read-only
     false = no access                            */
  PERMS: {
    'Fleet Manager':    { dashboard: true, fleet: true,   drivers: true,   trips: true,   maintenance: true,  fuel: true,  analytics: true,  settings: true  },
    'Dispatcher':       { dashboard: true, fleet: 'view', drivers: false,  trips: true,   maintenance: false, fuel: false, analytics: false, settings: false },
    'Safety Officer':   { dashboard: true, fleet: false,  drivers: true,   trips: 'view', maintenance: false, fuel: false, analytics: false, settings: false },
    'Financial Analyst':{ dashboard: true, fleet: 'view', drivers: false,  trips: false,  maintenance: false, fuel: true,  analytics: true,  settings: false },
  },

  login(email, password, role) {
    if (this._failCount >= this.MAX_FAIL) {
      return { ok: false, msg: 'Account locked after 5 failed attempts. Contact admin.' };
    }

    const user = DB.users.find(u =>
      u.email.toLowerCase() === email.toLowerCase() &&
      u.password === password &&
      u.role === role
    );

    if (user) {
      this._failCount = 0;
      localStorage.setItem(KEYS.CURR_USER, JSON.stringify(user));
      return { ok: true, user };
    }

    this._failCount++;
    const left = this.MAX_FAIL - this._failCount;
    return {
      ok: false,
      msg: `Invalid credentials.${left > 0 ? ` ${left} attempt(s) left.` : ' Account locked after 5 failed attempts.'}`
    };
  },

  logout() {
    localStorage.removeItem(KEYS.CURR_USER);
    window.location.href = 'index.html';
  },

  me() {
    try { return JSON.parse(localStorage.getItem(KEYS.CURR_USER) || 'null'); }
    catch { return null; }
  },

  isLoggedIn() { return !!this.me(); },

  /* Returns true / 'view' / false */
  perm(module) {
    const user = this.me();
    if (!user) return false;
    return this.PERMS[user.role]?.[module] ?? false;
  },

  canView(module) { const p = this.perm(module); return p === true || p === 'view'; },
  canEdit(module) { return this.perm(module) === true; },
};

/* ============================================================
   TransitOps – Frontend API Client
   Bridges the frontend modules to the backend REST API.
   Falls back to localStorage cache if backend is offline.
   ============================================================ */
'use strict';

const API_BASE = 'http://localhost:3000/api';

/* ─── Low-level HTTP helper ─── */
const Http = {
  _token() { return localStorage.getItem('to_token') || ''; },

  async _request(method, path, body) {
    const opts = {
      method,
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${this._token()}`
      }
    };
    if (body) opts.body = JSON.stringify(body);
    try {
      const res  = await fetch(API_BASE + path, opts);
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'API error');
      return data;
    } catch (err) {
      console.error('[API]', method, path, err.message);
      throw err;
    }
  },

  get(path)         { return this._request('GET',    path); },
  post(path, body)  { return this._request('POST',   path, body); },
  put(path, body)   { return this._request('PUT',    path, body); },
  patch(path, body) { return this._request('PATCH',  path, body); },
  del(path)         { return this._request('DELETE', path); },
};

/* ─── Public API client ─── */
window.API = {

  /* ── Auth ── */
  async login(email, password, role) {
    const data = await Http.post('/auth/login', { email, password, role });
    if (data.token) localStorage.setItem('to_token', data.token);
    return data;
  },
  logout() {
    Http.post('/auth/logout').catch(() => {});
    localStorage.removeItem('to_token');
  },

  /* ── Vehicles ── */
  vehicles: {
    list(params = {}) {
      const q = new URLSearchParams(params).toString();
      return Http.get('/vehicles' + (q ? '?' + q : ''));
    },
    create(body)     { return Http.post('/vehicles', body); },
    update(id, body) { return Http.put(`/vehicles/${id}`, body); },
    remove(id)       { return Http.del(`/vehicles/${id}`); },
  },

  /* ── Drivers ── */
  drivers: {
    list()            { return Http.get('/drivers'); },
    create(body)      { return Http.post('/drivers', body); },
    update(id, body)  { return Http.put(`/drivers/${id}`, body); },
    setStatus(id, s)  { return Http.patch(`/drivers/${id}/status`, { status: s }); },
    remove(id)        { return Http.del(`/drivers/${id}`); },
  },

  /* ── Trips ── */
  trips: {
    list(params = {}) {
      const q = new URLSearchParams(params).toString();
      return Http.get('/trips' + (q ? '?' + q : ''));
    },
    dispatch(body)    { return Http.post('/trips/dispatch', body); },
    complete(id, body){ return Http.post(`/trips/${id}/complete`, body); },
    cancel(id)        { return Http.post(`/trips/${id}/cancel`); },
    remove(id)        { return Http.del(`/trips/${id}`); },
  },

  /* ── Maintenance ── */
  maintenance: {
    list()       { return Http.get('/maintenance'); },
    create(body) { return Http.post('/maintenance', body); },
    close(id)    { return Http.post(`/maintenance/${id}/close`); },
    remove(id)   { return Http.del(`/maintenance/${id}`); },
  },

  /* ── Fuel & Expenses ── */
  fuel: {
    listLogs()        { return Http.get('/fuel/logs'); },
    addLog(body)      { return Http.post('/fuel/logs', body); },
    deleteLog(id)     { return Http.del(`/fuel/logs/${id}`); },
    listExpenses()    { return Http.get('/fuel/expenses'); },
    addExpense(body)  { return Http.post('/fuel/expenses', body); },
    deleteExpense(id) { return Http.del(`/fuel/expenses/${id}`); },
    total()           { return Http.get('/fuel/total'); },
  },

  /* ── Analytics ── */
  analytics: {
    summary() { return Http.get('/analytics/summary'); },
    revenue() { return Http.get('/analytics/revenue'); },
    costs()   { return Http.get('/analytics/costs'); },
  },

  /* ── Settings ── */
  settings: {
    get()      { return Http.get('/settings'); },
    save(body) { return Http.put('/settings', body); },
  },

  /* ── Sync: pull ALL data from backend into localStorage ── */
  async syncAll() {
    try {
      const [v, d, t, m, f, e, s] = await Promise.all([
        this.vehicles.list(),
        this.drivers.list(),
        this.trips.list(),
        this.maintenance.list(),
        this.fuel.listLogs(),
        this.fuel.listExpenses(),
        this.settings.get(),
      ]);

      /* Map snake_case API fields → camelCase localStorage format */
      const mv = r => ({ id: r.id, regNo: r.reg_no, name: r.name, type: r.type, capacity: r.capacity, odometer: r.odometer, acquisitionCost: r.acquisition_cost, status: r.status, region: r.region });
      const md = r => ({ id: r.id, name: r.name, licenseNo: r.license_no, category: r.category, expiry: r.expiry, contact: r.contact, safetyScore: r.safety_score, status: r.status, tripsCompleted: r.trips_completed });
      const mt = r => ({ id: r.id, tripNo: r.trip_no, source: r.source, destination: r.destination, vehicleId: r.vehicle_id, driverId: r.driver_id, cargoWeight: r.cargo_weight, plannedDist: r.planned_dist, actualDist: r.actual_dist, fuelConsumed: r.fuel_consumed, status: r.status, revenue: r.revenue, createdAt: r.created_at });
      const mm = r => ({ id: r.id, vehicleId: r.vehicle_id, serviceType: r.service_type, cost: r.cost, date: r.date, status: r.status });
      const mf = r => ({ id: r.id, vehicleId: r.vehicle_id, date: r.date, liters: r.liters, cost: r.cost });
      const me = r => ({ id: r.id, tripId: r.trip_id, vehicleId: r.vehicle_id, toll: r.toll, other: r.other, maintLinked: r.maint_linked });

      localStorage.setItem(KEYS.VEHICLES,    JSON.stringify(v.data.map(mv)));
      localStorage.setItem(KEYS.DRIVERS,     JSON.stringify(d.data.map(md)));
      localStorage.setItem(KEYS.TRIPS,       JSON.stringify(t.data.map(mt)));
      localStorage.setItem(KEYS.MAINTENANCE, JSON.stringify(m.data.map(mm)));
      localStorage.setItem(KEYS.FUEL_LOGS,   JSON.stringify(f.data.map(mf)));
      localStorage.setItem(KEYS.EXPENSES,    JSON.stringify(e.data.map(me)));
      localStorage.setItem(KEYS.SETTINGS,    JSON.stringify({ depotName: s.data.depot_name, currency: s.data.currency, distanceUnit: s.data.distance_unit }));

      console.log('[API] ✓ Sync complete — data refreshed from backend.');
      return true;
    } catch (err) {
      console.warn('[API] Backend offline — using localStorage cache.', err.message);
      return false;
    }
  }
};

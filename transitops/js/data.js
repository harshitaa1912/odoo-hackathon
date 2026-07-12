/* ============================================
   TransitOps – Data Layer (localStorage)
   ============================================ */

const KEYS = {
  USERS:       'to_users',
  VEHICLES:    'to_vehicles',
  DRIVERS:     'to_drivers',
  TRIPS:       'to_trips',
  MAINTENANCE: 'to_maintenance',
  FUEL_LOGS:   'to_fuel_logs',
  EXPENSES:    'to_expenses',
  SETTINGS:    'to_settings',
  CURR_USER:   'to_current_user',
  INITIALIZED: 'to_initialized',
};

const DB = {
  /* ---- Generic CRUD ---- */
  getAll(key) {
    try { return JSON.parse(localStorage.getItem(key) || '[]'); }
    catch { return []; }
  },
  save(key, data) { localStorage.setItem(key, JSON.stringify(data)); },

  getById(key, id) {
    return this.getAll(key).find(item => item.id === id) || null;
  },

  add(key, item) {
    const arr = this.getAll(key);
    arr.push(item);
    this.save(key, arr);
    return item;
  },

  update(key, id, patch) {
    const arr = this.getAll(key);
    const i = arr.findIndex(x => x.id === id);
    if (i !== -1) {
      arr[i] = { ...arr[i], ...patch };
      this.save(key, arr);
      return arr[i];
    }
    return null;
  },

  remove(key, id) {
    this.save(key, this.getAll(key).filter(x => x.id !== id));
  },

  genId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  },

  /* ---- Convenience getters ---- */
  get vehicles()    { return this.getAll(KEYS.VEHICLES); },
  get drivers()     { return this.getAll(KEYS.DRIVERS); },
  get trips()       { return this.getAll(KEYS.TRIPS); },
  get maintenance() { return this.getAll(KEYS.MAINTENANCE); },
  get fuelLogs()    { return this.getAll(KEYS.FUEL_LOGS); },
  get expenses()    { return this.getAll(KEYS.EXPENSES); },
  get users()       { return this.getAll(KEYS.USERS); },
  get settings() {
    try { return JSON.parse(localStorage.getItem(KEYS.SETTINGS) || '{}'); }
    catch { return {}; }
  },
  get currentUser() {
    try { return JSON.parse(localStorage.getItem(KEYS.CURR_USER) || 'null'); }
    catch { return null; }
  },

  /* ---- Seed initial data ---- */
  init() {
    if (localStorage.getItem(KEYS.INITIALIZED)) return;

    // Users
    this.save(KEYS.USERS, [
      { id: 'u1', email: 'fleet@transitops.in',   password: 'fleet123',   name: 'Fleet Manager',   role: 'Fleet Manager',    initials: 'FM' },
      { id: 'u2', email: 'raven@transitops.in',   password: 'raven123',   name: 'Raven K.',        role: 'Dispatcher',       initials: 'RK' },
      { id: 'u3', email: 'safety@transitops.in',  password: 'safety123',  name: 'Safety Officer',  role: 'Safety Officer',   initials: 'SO' },
      { id: 'u4', email: 'finance@transitops.in', password: 'finance123', name: 'Finance Analyst', role: 'Financial Analyst', initials: 'FA' },
    ]);

    // Vehicles
    this.save(KEYS.VEHICLES, [
      { id: 'v1', regNo: 'GJ01AB4521', name: 'VAN-05',   type: 'Van',   capacity: 500,  odometer: 74000,  acquisitionCost: 620000,  status: 'Available', region: 'Ahmedabad' },
      { id: 'v2', regNo: 'GJ01AB9981', name: 'TRUCK-11', type: 'Truck', capacity: 5000, odometer: 182000, acquisitionCost: 2450000, status: 'On Trip',   region: 'Surat' },
      { id: 'v3', regNo: 'GJ01AB1120', name: 'MINI-03',  type: 'Mini',  capacity: 1000, odometer: 66000,  acquisitionCost: 410000,  status: 'In Shop',   region: 'Vadodara' },
      { id: 'v4', regNo: 'GJ01AB0081', name: 'VAN-09',   type: 'Van',   capacity: 750,  odometer: 241900, acquisitionCost: 590000,  status: 'Retired',   region: 'Gandhinagar' },
    ]);

    // Drivers
    this.save(KEYS.DRIVERS, [
      { id: 'd1', name: 'Alex',   licenseNo: 'DL-88213', category: 'LMV', expiry: '2028-12-31', contact: '98765XXXXX', safetyScore: 96, status: 'Available',  tripsCompleted: 47 },
      { id: 'd2', name: 'John',   licenseNo: 'DL-44120', category: 'HMV', expiry: '2025-03-31', contact: '98220XXXXX', safetyScore: 81, status: 'Suspended',  tripsCompleted: 32 },
      { id: 'd3', name: 'Priya',  licenseNo: 'DL-77031', category: 'LMV', expiry: '2027-08-31', contact: '99110XXXXX', safetyScore: 99, status: 'On Trip',    tripsCompleted: 58 },
      { id: 'd4', name: 'Suresh', licenseNo: 'DL-90045', category: 'HMV', expiry: '2027-01-31', contact: '97440XXXXX', safetyScore: 88, status: 'Off Duty',   tripsCompleted: 23 },
    ]);

    // Trips
    this.save(KEYS.TRIPS, [
      { id: 't1', tripNo: 'TR001', source: 'Gandhinagar Depot',    destination: 'Ahmedabad Hub',    vehicleId: 'v1', driverId: 'd1', cargoWeight: 450,  plannedDist: 35,  status: 'Dispatched', revenue: 8500,  fuelConsumed: 0,   actualDist: 0,   createdAt: '2026-07-05' },
      { id: 't2', tripNo: 'TR002', source: 'Ahmedabad Hub',        destination: 'Surat Depot',      vehicleId: 'v2', driverId: 'd2', cargoWeight: 3000, plannedDist: 265, status: 'Completed',  revenue: 35000, fuelConsumed: 110, actualDist: 270, createdAt: '2026-07-06' },
      { id: 't3', tripNo: 'TR003', source: 'Vadodara',             destination: 'Anand',            vehicleId: 'v3', driverId: 'd3', cargoWeight: 800,  plannedDist: 45,  status: 'Dispatched', revenue: 5000,  fuelConsumed: 0,   actualDist: 0,   createdAt: '2026-07-06' },
      { id: 't4', tripNo: 'TR004', source: 'Vatva Industrial Area', destination: 'Sanand Warehouse', vehicleId: null, driverId: null, cargoWeight: 0,    plannedDist: 0,   status: 'Draft',      revenue: 0,     fuelConsumed: 0,   actualDist: 0,   createdAt: '2026-07-07' },
      { id: 't6', tripNo: 'TR006', source: 'Mansa',               destination: 'Kalol Depot',      vehicleId: null, driverId: null, cargoWeight: 0,    plannedDist: 0,   status: 'Cancelled',  revenue: 0,     fuelConsumed: 0,   actualDist: 0,   createdAt: '2026-07-07' },
    ]);

    // Maintenance logs
    this.save(KEYS.MAINTENANCE, [
      { id: 'm1', vehicleId: 'v1', serviceType: 'Oil Change',    cost: 2500,  date: '2026-07-07', status: 'Active' },
      { id: 'm2', vehicleId: 'v2', serviceType: 'Engine Repair', cost: 18000, date: '2026-07-01', status: 'Completed' },
      { id: 'm3', vehicleId: 'v3', serviceType: 'Tyre Replace',  cost: 6200,  date: '2026-07-05', status: 'Active' },
    ]);

    // Fuel logs
    this.save(KEYS.FUEL_LOGS, [
      { id: 'f1', vehicleId: 'v1', date: '2026-07-05', liters: 42,  cost: 3150 },
      { id: 'f2', vehicleId: 'v2', date: '2026-07-06', liters: 110, cost: 8400 },
      { id: 'f3', vehicleId: 'v3', date: '2026-07-06', liters: 28,  cost: 2050 },
    ]);

    // Expenses
    this.save(KEYS.EXPENSES, [
      { id: 'e1', tripId: 't1', vehicleId: 'v1', toll: 120, other: 0,   maintLinked: 0 },
      { id: 'e2', tripId: 't2', vehicleId: 'v2', toll: 340, other: 150, maintLinked: 18000 },
    ]);

    // Settings
    localStorage.setItem(KEYS.SETTINGS, JSON.stringify({
      depotName:    'Gandhinagar Depot, GJ4',
      currency:     'INR (Rs)',
      distanceUnit: 'Kilometers',
    }));

    localStorage.setItem(KEYS.INITIALIZED, 'true');
    console.log('[TransitOps] Database initialized with seed data.');
  },

  /* ---- Reset (dev helper) ---- */
  reset() {
    Object.values(KEYS).forEach(k => localStorage.removeItem(k));
    this.init();
    location.reload();
  }
};

// Run on every page load
DB.init();

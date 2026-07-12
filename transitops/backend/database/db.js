/* ============================================================
   TransitOps – SQLite Database Layer
   Uses better-sqlite3 (synchronous, zero-config)
   ============================================================ */
'use strict';

const Database = require('better-sqlite3');
const bcrypt   = require('bcryptjs');
const path     = require('path');

const DB_PATH = path.join(__dirname, 'transitops.db');
let db = null;

/* ─── Connection ─── */
function getDb() {
  if (db) return db;
  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  createSchema();
  seedData();
  return db;
}

/* ─── Schema ─── */
function createSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      email       TEXT UNIQUE NOT NULL,
      password    TEXT NOT NULL,
      role        TEXT NOT NULL CHECK(role IN ('Fleet Manager','Dispatcher','Safety Officer','Financial Analyst')),
      initials    TEXT,
      created_at  TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS vehicles (
      id                TEXT PRIMARY KEY,
      reg_no            TEXT UNIQUE NOT NULL,
      name              TEXT NOT NULL,
      type              TEXT NOT NULL CHECK(type IN ('Van','Truck','Mini')),
      capacity          REAL NOT NULL CHECK(capacity > 0),
      odometer          REAL NOT NULL DEFAULT 0,
      acquisition_cost  REAL NOT NULL DEFAULT 0,
      status            TEXT NOT NULL DEFAULT 'Available'
                          CHECK(status IN ('Available','On Trip','In Shop','Retired')),
      region            TEXT,
      created_at        TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS drivers (
      id               TEXT PRIMARY KEY,
      name             TEXT NOT NULL,
      license_no       TEXT NOT NULL,
      category         TEXT NOT NULL,
      expiry           TEXT NOT NULL,
      contact          TEXT NOT NULL,
      safety_score     REAL NOT NULL DEFAULT 100 CHECK(safety_score BETWEEN 0 AND 100),
      status           TEXT NOT NULL DEFAULT 'Available'
                         CHECK(status IN ('Available','On Trip','Off Duty','Suspended')),
      trips_completed  INTEGER NOT NULL DEFAULT 0,
      created_at       TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS trips (
      id            TEXT PRIMARY KEY,
      trip_no       TEXT UNIQUE NOT NULL,
      source        TEXT NOT NULL,
      destination   TEXT NOT NULL,
      vehicle_id    TEXT REFERENCES vehicles(id),
      driver_id     TEXT REFERENCES drivers(id),
      cargo_weight  REAL DEFAULT 0,
      planned_dist  REAL DEFAULT 0,
      actual_dist   REAL DEFAULT 0,
      fuel_consumed REAL DEFAULT 0,
      status        TEXT NOT NULL DEFAULT 'Draft'
                      CHECK(status IN ('Draft','Dispatched','Completed','Cancelled')),
      revenue       REAL DEFAULT 0,
      created_at    TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS maintenance_logs (
      id           TEXT PRIMARY KEY,
      vehicle_id   TEXT NOT NULL REFERENCES vehicles(id),
      service_type TEXT NOT NULL,
      cost         REAL DEFAULT 0,
      date         TEXT NOT NULL,
      status       TEXT NOT NULL DEFAULT 'Active'
                     CHECK(status IN ('Active','Completed')),
      created_at   TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS fuel_logs (
      id          TEXT PRIMARY KEY,
      vehicle_id  TEXT NOT NULL REFERENCES vehicles(id),
      date        TEXT NOT NULL,
      liters      REAL NOT NULL CHECK(liters > 0),
      cost        REAL DEFAULT 0,
      created_at  TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS expenses (
      id           TEXT PRIMARY KEY,
      trip_id      TEXT REFERENCES trips(id),
      vehicle_id   TEXT NOT NULL REFERENCES vehicles(id),
      toll         REAL DEFAULT 0,
      other        REAL DEFAULT 0,
      maint_linked REAL DEFAULT 0,
      created_at   TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT
    );
  `);
  console.log('[DB] Schema ready.');
}

/* ─── Seed ─── */
function seedData() {
  const count = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
  if (count > 0) { console.log('[DB] Already seeded – skipping.'); return; }

  const hash = p => bcrypt.hashSync(p, 10);

  // Users
  const addUser = db.prepare(
    'INSERT INTO users (id,name,email,password,role,initials) VALUES (?,?,?,?,?,?)'
  );
  addUser.run('u1','Fleet Manager','fleet@transitops.in',  hash('fleet123'),  'Fleet Manager',    'FM');
  addUser.run('u2','Raven K.',     'raven@transitops.in',  hash('raven123'),  'Dispatcher',       'RK');
  addUser.run('u3','Safety Officer','safety@transitops.in',hash('safety123'), 'Safety Officer',   'SO');
  addUser.run('u4','Finance Analyst','finance@transitops.in',hash('finance123'),'Financial Analyst','FA');

  // Vehicles
  const addVehicle = db.prepare(
    'INSERT INTO vehicles (id,reg_no,name,type,capacity,odometer,acquisition_cost,status,region) VALUES (?,?,?,?,?,?,?,?,?)'
  );
  addVehicle.run('v1','GJ01AB4521','VAN-05',  'Van',  500, 74000, 620000,  'Available','Ahmedabad');
  addVehicle.run('v2','GJ01AB9981','TRUCK-11','Truck',5000,182000,2450000,'On Trip',  'Surat');
  addVehicle.run('v3','GJ01AB1120','MINI-03', 'Mini', 1000,66000, 410000,  'In Shop',  'Vadodara');
  addVehicle.run('v4','GJ01AB0081','VAN-09',  'Van',  750, 241900,590000,  'Retired',  'Gandhinagar');

  // Drivers
  const addDriver = db.prepare(
    'INSERT INTO drivers (id,name,license_no,category,expiry,contact,safety_score,status,trips_completed) VALUES (?,?,?,?,?,?,?,?,?)'
  );
  addDriver.run('d1','Alex',  'DL-88213','LMV','2028-12-31','98765XXXXX',96,'Available',47);
  addDriver.run('d2','John',  'DL-44120','HMV','2025-03-31','98220XXXXX',81,'Suspended',32);
  addDriver.run('d3','Priya', 'DL-77031','LMV','2027-08-31','99110XXXXX',99,'On Trip',  58);
  addDriver.run('d4','Suresh','DL-90045','HMV','2027-01-31','97440XXXXX',88,'Off Duty', 23);

  // Trips
  const addTrip = db.prepare(
    'INSERT INTO trips (id,trip_no,source,destination,vehicle_id,driver_id,cargo_weight,planned_dist,actual_dist,fuel_consumed,status,revenue) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)'
  );
  addTrip.run('t1','TR001','Gandhinagar Depot','Ahmedabad Hub','v1','d1',450,35,0,0,'Dispatched',8500);
  addTrip.run('t2','TR002','Ahmedabad Hub','Surat Depot','v2','d2',3000,265,270,110,'Completed',35000);
  addTrip.run('t3','TR003','Vadodara','Anand','v3','d3',800,45,0,0,'Dispatched',5000);
  addTrip.run('t4','TR004','Vatva Industrial Area','Sanand Warehouse',null,null,0,0,0,0,'Draft',0);
  addTrip.run('t6','TR006','Mansa','Kalol Depot',null,null,0,0,0,0,'Cancelled',0);

  // Maintenance
  const addMaint = db.prepare(
    'INSERT INTO maintenance_logs (id,vehicle_id,service_type,cost,date,status) VALUES (?,?,?,?,?,?)'
  );
  addMaint.run('m1','v1','Oil Change',   2500,'2026-07-07','Active');
  addMaint.run('m2','v2','Engine Repair',18000,'2026-07-01','Completed');
  addMaint.run('m3','v3','Tyre Replace', 6200,'2026-07-05','Active');

  // Fuel
  const addFuel = db.prepare(
    'INSERT INTO fuel_logs (id,vehicle_id,date,liters,cost) VALUES (?,?,?,?,?)'
  );
  addFuel.run('f1','v1','2026-07-05',42,3150);
  addFuel.run('f2','v2','2026-07-06',110,8400);
  addFuel.run('f3','v3','2026-07-06',28,2050);

  // Expenses
  const addExp = db.prepare(
    'INSERT INTO expenses (id,trip_id,vehicle_id,toll,other,maint_linked) VALUES (?,?,?,?,?,?)'
  );
  addExp.run('e1','t1','v1',120,0,0);
  addExp.run('e2','t2','v2',340,150,18000);

  // Settings
  const addSet = db.prepare('INSERT OR IGNORE INTO settings (key,value) VALUES (?,?)');
  addSet.run('depot_name',    'Gandhinagar Depot, GJ4');
  addSet.run('currency',      'INR (Rs)');
  addSet.run('distance_unit', 'Kilometers');

  console.log('[DB] Seed data inserted.');
}

/* ─── Helper ─── */
function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

module.exports = { getDb, genId };

# TransitOps – Backend API

Node.js + Express + SQLite REST API for the TransitOps hackathon platform.

---

## 🚀 Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Start the server
npm start          # production
npm run dev        # development (auto-restart with nodemon)
```

Server starts at **http://localhost:3000**

---

## 📁 Project Structure

```
backend/
├── server.js              ← Express entry point
├── package.json
├── .env                   ← Port, JWT secret, frontend path
├── database/
│   ├── db.js              ← SQLite schema + seed data
│   └── transitops.db      ← Auto-created on first run
├── middleware/
│   ├── auth.js            ← JWT verification
│   └── rbac.js            ← Role-based access control
└── routes/
    ├── auth.js            ← Login / logout / me
    ├── vehicles.js        ← CRUD + business rules
    ├── drivers.js         ← CRUD + status toggle
    ├── trips.js           ← Dispatch / complete / cancel
    ├── maintenance.js     ← Service log + In Shop transitions
    ├── fuel.js            ← Fuel logs + expenses + total cost
    ├── analytics.js       ← KPIs, ROI, charts data
    └── settings.js        ← Platform settings
```

---

## 🔐 Auth

All API routes require a **JWT Bearer token** (except `/api/auth/login`).

```
POST /api/auth/login
Body: { "email": "fleet@transitops.in", "password": "fleet123", "role": "Fleet Manager" }
Response: { "ok": true, "token": "eyJ...", "user": { ... } }
```

Use the token in all subsequent requests:
```
Authorization: Bearer <token>
```

### Demo Credentials

| Role | Email | Password |
|------|-------|----------|
| Fleet Manager | fleet@transitops.in | fleet123 |
| Dispatcher | raven@transitops.in | raven123 |
| Safety Officer | safety@transitops.in | safety123 |
| Financial Analyst | finance@transitops.in | finance123 |

---

## 📡 API Reference

### Vehicles
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/vehicles` | List (filter: `type`, `status`, `region`, `q`) |
| POST | `/api/vehicles` | Create (enforces unique `reg_no`) |
| GET | `/api/vehicles/:id` | Get by ID |
| PUT | `/api/vehicles/:id` | Update |
| DELETE | `/api/vehicles/:id` | Delete (blocked if On Trip) |

### Drivers
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/drivers` | List all |
| POST | `/api/drivers` | Create |
| PUT | `/api/drivers/:id` | Update |
| PATCH | `/api/drivers/:id/status` | Change status |
| DELETE | `/api/drivers/:id` | Delete (blocked if On Trip) |

### Trips
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/trips` | List (filter: `status`) |
| POST | `/api/trips/dispatch` | Dispatch (cargo/capacity/license checks) |
| GET | `/api/trips/:id` | Get by ID |
| POST | `/api/trips/:id/complete` | Complete → vehicle & driver Available |
| POST | `/api/trips/:id/cancel` | Cancel → restore vehicle & driver |
| DELETE | `/api/trips/:id` | Remove Draft trip |

### Maintenance
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/maintenance` | List all |
| POST | `/api/maintenance` | Create (Active → vehicle In Shop) |
| POST | `/api/maintenance/:id/close` | Close → vehicle Available |
| DELETE | `/api/maintenance/:id` | Delete |

### Fuel & Expenses
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/fuel/logs` | List fuel logs |
| POST | `/api/fuel/logs` | Add log |
| DELETE | `/api/fuel/logs/:id` | Delete |
| GET | `/api/fuel/expenses` | List expenses |
| POST | `/api/fuel/expenses` | Add expense |
| DELETE | `/api/fuel/expenses/:id` | Delete |
| GET | `/api/fuel/total` | Total operational cost |

### Analytics
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/analytics/summary` | KPIs: utilization, ROI, fuel efficiency |
| GET | `/api/analytics/revenue` | Monthly revenue grouping |
| GET | `/api/analytics/costs` | Per-vehicle cost breakdown |

### Settings
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/settings` | Get all settings |
| PUT | `/api/settings` | Update settings |

---

## ✅ Business Rules Enforced (Backend)

1. **Unique registration numbers** – 409 Conflict if duplicate
2. **In Shop / Retired vehicles** – cannot be dispatched
3. **Cargo > capacity** – dispatch blocked with error
4. **Expired/Suspended driver** – dispatch blocked
5. **Auto status transitions** – Dispatch → vehicle/driver "On Trip"; Complete → "Available"
6. **Auto fuel log** – created on trip completion
7. **Maintenance Active** → vehicle "In Shop"; Close → vehicle "Available"
8. **RBAC** – each route checks role permissions via middleware
9. **Brute-force protection** – account locked after 5 failed logins (15 min)

---

## 🗄️ Database

- **Engine**: SQLite via `better-sqlite3`
- **File**: `database/transitops.db` (auto-created on first run)
- **Seeded with**: 4 users, 4 vehicles, 4 drivers, 5 trips, 3 maintenance, 3 fuel logs, 2 expenses

To **reset** the database: delete `database/transitops.db` and restart the server.

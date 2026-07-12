/* ============================================
   TransitOps – Main Application Logic
   All modules: Dashboard, Fleet, Drivers,
   Trips, Maintenance, Fuel, Analytics, Settings
   ============================================ */
'use strict';

/* ====================================================
   UTILS
   ==================================================== */
const U = {
  fmt(n)   { return new Intl.NumberFormat('en-IN').format(n ?? 0); },
  fmtDate(d) {
    if (!d) return '--';
    const dt = new Date(d + 'T00:00:00');
    return dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  },
  today()  { return new Date().toISOString().split('T')[0]; },
  isExpired(expiryStr) {
    if (!expiryStr) return true;
    return new Date(expiryStr) < new Date();
  },
  badge(status) {
    const cls = status.toLowerCase().replace(/\s+/g, '-');
    return `<span class="badge badge-${cls}">${status}</span>`;
  },
  toast(msg, type = 'success') {
    document.querySelectorAll('.toast').forEach(t => t.remove());
    const div = document.createElement('div');
    div.className = `toast toast-${type}`;
    div.textContent = msg;
    document.body.appendChild(div);
    setTimeout(() => div.remove(), 3500);
  },
  nextTripNo() {
    const nums = DB.trips.map(t => parseInt(t.tripNo.replace('TR','')) || 0);
    return 'TR' + String(Math.max(0, ...nums) + 1).padStart(3, '0');
  },
  cap(v) { return v >= 1000 ? (v / 1000) + ' Ton' : v + ' kg'; },
};

/* ====================================================
   ROUTER
   ==================================================== */
const Router = {
  curr: 'dashboard',

  go(page) {
    if (!Auth.canView(page)) {
      U.toast('Access denied for your role.', 'error'); return;
    }

    // Hide all
    document.querySelectorAll('.page-section').forEach(s => s.classList.remove('active'));
    // Show target
    const el = document.getElementById('pg-' + page);
    if (el) el.classList.add('active');

    // Update nav
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    const nav = document.querySelector(`.nav-item[data-page="${page}"]`);
    if (nav) nav.classList.add('active');

    this.curr = page;

    // Render module
    const mod = { dashboard: Dashboard, fleet: Fleet, drivers: Drivers,
                  trips: Trips, maintenance: Maint, fuel: Fuel,
                  analytics: Analytics, settings: Settings }[page];
    if (mod) mod.render();
  }
};

/* ====================================================
   DASHBOARD MODULE
   ==================================================== */
const Dashboard = {
  render() {
    this.renderKPIs();
    this.renderRecentTrips();
    this.renderStatusBars();
  },

  filtered() {
    let v = DB.vehicles;
    const t = document.getElementById('df-type')?.value;
    const s = document.getElementById('df-status')?.value;
    const r = document.getElementById('df-region')?.value;
    if (t) v = v.filter(x => x.type === t);
    if (s) v = v.filter(x => x.status === s);
    if (r) v = v.filter(x => x.region === r);
    return v;
  },

  renderKPIs() {
    const fv    = this.filtered();
    const trips = DB.trips;
    const drvrs = DB.drivers;

    const active   = fv.filter(v => v.status === 'On Trip').length;
    const avail    = fv.filter(v => v.status === 'Available').length;
    const inShop   = fv.filter(v => v.status === 'In Shop').length;
    const aTrips   = trips.filter(t => t.status === 'Dispatched' || t.status === 'On Trip').length;
    const pTrips   = trips.filter(t => t.status === 'Draft').length;
    const onDuty   = drvrs.filter(d => d.status === 'On Trip').length;
    const util     = DB.vehicles.length ? Math.round((active / DB.vehicles.length) * 100) : 0;

    const cards = [
      { label: 'Active Vehicles',        val: active,                         warn: false },
      { label: 'Available Vehicles',      val: avail,                          warn: false },
      { label: 'Vehicles in Maintenance', val: String(inShop).padStart(2,'0'), warn: true  },
      { label: 'Active Trips',            val: aTrips,                         warn: false },
      { label: 'Pending Trips',           val: String(pTrips).padStart(2,'0'), warn: false },
      { label: 'Drivers on Duty',         val: onDuty,                         warn: false },
      { label: 'Fleet Utilization',       val: util + '%',                     warn: false },
    ];

    document.getElementById('kpiGrid').innerHTML = cards.map(c => `
      <div class="kpi-card${c.warn ? ' warn' : ''}">
        <div class="kpi-label">${c.label}</div>
        <div class="kpi-value">${c.val}</div>
      </div>`).join('');
  },

  renderRecentTrips() {
    const trips   = [...DB.trips].reverse().slice(0, 6);
    const vMap    = Object.fromEntries(DB.vehicles.map(v => [v.id, v]));
    const dMap    = Object.fromEntries(DB.drivers.map(d => [d.id, d]));

    const eta = t => {
      if (t.status === 'Dispatched') return '45 min';
      if (t.status === 'Draft')      return 'Awaiting vehicle';
      return '--';
    };

    document.getElementById('dashTripsTbody').innerHTML = trips.length
      ? trips.map(t => `<tr>
          <td class="fw-600">${t.tripNo}</td>
          <td>${vMap[t.vehicleId]?.name ?? '--'}</td>
          <td>${dMap[t.driverId]?.name ?? '--'}</td>
          <td>${U.badge(t.status)}</td>
          <td class="text-muted">${eta(t)}</td>
        </tr>`).join('')
      : `<tr class="empty-row"><td colspan="5">No trips yet</td></tr>`;
  },

  renderStatusBars() {
    const v = DB.vehicles, tot = v.length || 1;
    const groups = [
      { label: 'Available', color: '#22c55e', count: v.filter(x => x.status === 'Available').length },
      { label: 'On Trip',   color: '#3b82f6', count: v.filter(x => x.status === 'On Trip').length   },
      { label: 'In Shop',   color: '#f97316', count: v.filter(x => x.status === 'In Shop').length   },
      { label: 'Retired',   color: '#f43f5e', count: v.filter(x => x.status === 'Retired').length   },
    ];
    document.getElementById('vStatusBars').innerHTML = groups.map(g => `
      <div class="vbar">
        <span class="vbar-label">${g.label}</span>
        <div class="vbar-track">
          <div class="vbar-fill" style="width:${(g.count/tot)*100}%; background:${g.color};"></div>
        </div>
        <span class="vbar-count">${g.count}</span>
      </div>`).join('');
  },

  applyFilters() { this.render(); }
};

/* ====================================================
   FLEET MODULE
   ==================================================== */
const Fleet = {
  _editId: null,

  render() { this.applyFilters(); },

  applyFilters() {
    const t = document.getElementById('ff-type')?.value || '';
    const s = document.getElementById('ff-status')?.value || '';
    const q = (document.getElementById('ff-search')?.value || '').toLowerCase();
    let v = DB.vehicles;
    if (t) v = v.filter(x => x.type === t);
    if (s) v = v.filter(x => x.status === s);
    if (q) v = v.filter(x => x.regNo.toLowerCase().includes(q) || x.name.toLowerCase().includes(q));
    this.renderTable(v);
  },

  renderTable(vehicles) {
    const canEdit = Auth.canEdit('fleet');
    document.getElementById('fleetTbody').innerHTML = vehicles.length
      ? vehicles.map(v => `
        <tr>
          <td class="mono">${v.regNo}</td>
          <td class="fw-600">${v.name}</td>
          <td>${v.type}</td>
          <td>${U.cap(v.capacity)}</td>
          <td>${U.fmt(v.odometer)}</td>
          <td>₹${U.fmt(v.acquisitionCost)}</td>
          <td>${U.badge(v.status)}</td>
          <td>
            <div class="row-actions">
              ${canEdit
                ? `<button class="act-btn" onclick="Fleet.openEdit('${v.id}')">Edit</button>
                   <button class="act-btn del" onclick="Fleet.del('${v.id}')">Delete</button>`
                : `<span class="text-muted" style="font-size:11px;">View only</span>`}
            </div>
          </td>
        </tr>`).join('')
      : `<tr class="empty-row"><td colspan="8">No vehicles found</td></tr>`;
  },

  openAdd() {
    if (!Auth.canEdit('fleet')) { U.toast('Access denied.', 'error'); return; }
    this._editId = null;
    document.getElementById('vm-title').textContent = 'Add Vehicle';
    document.getElementById('vehicleForm').reset();
    document.getElementById('v-status').value = 'Available';
    document.getElementById('vehicleModal').classList.add('show');
  },

  openEdit(id) {
    const v = DB.getById(KEYS.VEHICLES, id);
    if (!v) return;
    this._editId = id;
    document.getElementById('vm-title').textContent = 'Edit Vehicle';
    document.getElementById('v-regNo').value     = v.regNo;
    document.getElementById('v-name').value      = v.name;
    document.getElementById('v-type').value      = v.type;
    document.getElementById('v-capacity').value  = v.capacity;
    document.getElementById('v-odometer').value  = v.odometer;
    document.getElementById('v-cost').value      = v.acquisitionCost;
    document.getElementById('v-status').value    = v.status;
    document.getElementById('v-region').value    = v.region || '';
    document.getElementById('vehicleModal').classList.add('show');
  },

  closeModal() { document.getElementById('vehicleModal').classList.remove('show'); },

  save() {
    const regNo = document.getElementById('v-regNo').value.trim();
    const name  = document.getElementById('v-name').value.trim();
    const type  = document.getElementById('v-type').value;
    const cap   = parseFloat(document.getElementById('v-capacity').value);
    const odo   = parseFloat(document.getElementById('v-odometer').value) || 0;
    const cost  = parseFloat(document.getElementById('v-cost').value) || 0;
    const stat  = document.getElementById('v-status').value;
    const reg   = document.getElementById('v-region').value.trim();

    if (!regNo || !name || !cap) { U.toast('Reg. No., Name and Capacity are required.', 'error'); return; }
    if (DB.vehicles.find(v => v.regNo === regNo && v.id !== this._editId)) {
      U.toast('Registration number must be unique!', 'error'); return;
    }
    if (cap <= 0) { U.toast('Capacity must be greater than 0.', 'error'); return; }

    if (this._editId) {
      DB.update(KEYS.VEHICLES, this._editId, { regNo, name, type, capacity: cap, odometer: odo, acquisitionCost: cost, status: stat, region: reg });
      U.toast('Vehicle updated!');
    } else {
      DB.add(KEYS.VEHICLES, { id: DB.genId(), regNo, name, type, capacity: cap, odometer: odo, acquisitionCost: cost, status: stat, region: reg });
      U.toast('Vehicle added!');
    }
    this.closeModal();
    this.render();
  },

  del(id) {
    if (!confirm('Delete this vehicle? This cannot be undone.')) return;
    // Check if on trip
    const active = DB.trips.find(t => t.vehicleId === id && (t.status === 'Dispatched' || t.status === 'On Trip'));
    if (active) { U.toast('Cannot delete a vehicle currently On Trip.', 'error'); return; }
    DB.remove(KEYS.VEHICLES, id);
    U.toast('Vehicle deleted.');
    this.render();
  }
};

/* ====================================================
   DRIVERS MODULE
   ==================================================== */
const Drivers = {
  _editId: null,
  _selId: null,

  render() {
    this.renderTable();
    this.renderToggle();
  },

  renderTable() {
    const drivers  = DB.drivers;
    const canEdit  = Auth.canEdit('drivers');

    document.getElementById('driversTbody').innerHTML = drivers.length
      ? drivers.map(d => {
          const expired = U.isExpired(d.expiry);
          const expDisp = d.expiry
            ? (expired
              ? `<span class="text-red">${d.expiry.slice(0,7).replace('-','/')} EXPIRED</span>`
              : d.expiry.slice(0,7).replace('-','/'))
            : '--';
          const rowBg = this._selId === d.id ? 'style="background:rgba(255,255,255,0.03);"' : '';
          return `<tr ${rowBg} onclick="Drivers.select('${d.id}')" style="cursor:pointer;">
            <td class="fw-600">${d.name}</td>
            <td class="mono">${d.licenseNo}</td>
            <td>${d.category}</td>
            <td>${expDisp}</td>
            <td>${d.contact}</td>
            <td>${d.tripsCompleted ?? 0}</td>
            <td>${d.safetyScore}</td>
            <td>${U.badge(d.status)}</td>
            <td onclick="event.stopPropagation()">
              <div class="row-actions">
                ${canEdit
                  ? `<button class="act-btn" onclick="Drivers.openEdit('${d.id}')">Edit</button>
                     <button class="act-btn del" onclick="Drivers.del('${d.id}')">Delete</button>`
                  : `<span class="text-muted" style="font-size:11px;">View only</span>`}
              </div>
            </td>
          </tr>`;
        }).join('')
      : `<tr class="empty-row"><td colspan="9">No drivers found</td></tr>`;
  },

  renderToggle() {
    const grp = document.getElementById('toggleGroup');
    if (!this._selId) {
      grp.innerHTML = '<span class="text-muted" style="font-size:12px;">Click a driver row to change their status</span>';
      return;
    }
    const statuses = [
      { label: 'Available', cls: 'tog-available' },
      { label: 'On Trip',   cls: 'tog-on-trip'   },
      { label: 'Off Duty',  cls: 'tog-off-duty'  },
      { label: 'Suspended', cls: 'tog-suspended'  },
    ];
    grp.innerHTML = statuses.map(s =>
      `<button class="tog-btn ${s.cls}" onclick="Drivers.setStatus('${this._selId}','${s.label}')">${s.label}</button>`
    ).join('');
  },

  select(id) {
    this._selId = this._selId === id ? null : id;
    this.render();
  },

  setStatus(id, status) {
    if (!Auth.canEdit('drivers')) { U.toast('Access denied.', 'error'); return; }
    if (status === 'On Trip') {
      U.toast('On Trip status is assigned automatically when a trip is dispatched.', 'error'); return;
    }
    const driver = DB.getById(KEYS.DRIVERS, id);
    if (driver?.status === 'On Trip' && status !== 'On Trip') {
      // Check if there's an active trip
      const activeTrip = DB.trips.find(t => t.driverId === id && t.status === 'Dispatched');
      if (activeTrip) { U.toast('Driver is currently On Trip. Complete or cancel the trip first.', 'error'); return; }
    }
    DB.update(KEYS.DRIVERS, id, { status });
    U.toast(`Driver status → ${status}`);
    this.render();
  },

  openAdd() {
    if (!Auth.canEdit('drivers')) { U.toast('Access denied.', 'error'); return; }
    this._editId = null;
    document.getElementById('dm-title').textContent = 'Add Driver';
    document.getElementById('driverForm').reset();
    document.getElementById('driverModal').classList.add('show');
  },

  openEdit(id) {
    const d = DB.getById(KEYS.DRIVERS, id);
    if (!d) return;
    this._editId = id;
    document.getElementById('dm-title').textContent = 'Edit Driver';
    document.getElementById('d-name').value     = d.name;
    document.getElementById('d-license').value  = d.licenseNo;
    document.getElementById('d-cat').value      = d.category;
    document.getElementById('d-expiry').value   = d.expiry;
    document.getElementById('d-contact').value  = d.contact;
    document.getElementById('d-safety').value   = d.safetyScore;
    document.getElementById('d-dstatus').value  = d.status;
    document.getElementById('driverModal').classList.add('show');
  },

  closeModal() { document.getElementById('driverModal').classList.remove('show'); },

  save() {
    const name    = document.getElementById('d-name').value.trim();
    const lic     = document.getElementById('d-license').value.trim();
    const cat     = document.getElementById('d-cat').value;
    const expiry  = document.getElementById('d-expiry').value;
    const contact = document.getElementById('d-contact').value.trim();
    const safety  = parseFloat(document.getElementById('d-safety').value);
    const status  = document.getElementById('d-dstatus').value;

    if (!name || !lic || !expiry || !contact) {
      U.toast('Please fill all required fields.', 'error'); return;
    }
    if (isNaN(safety) || safety < 0 || safety > 100) {
      U.toast('Safety score must be 0–100.', 'error'); return;
    }

    if (this._editId) {
      const ex = DB.getById(KEYS.DRIVERS, this._editId);
      DB.update(KEYS.DRIVERS, this._editId, { name, licenseNo: lic, category: cat, expiry, contact, safetyScore: safety, status, tripsCompleted: ex?.tripsCompleted || 0 });
      U.toast('Driver updated!');
    } else {
      DB.add(KEYS.DRIVERS, { id: DB.genId(), name, licenseNo: lic, category: cat, expiry, contact, safetyScore: safety, status, tripsCompleted: 0 });
      U.toast('Driver added!');
    }
    this.closeModal();
    this.render();
  },

  del(id) {
    if (!confirm('Delete this driver?')) return;
    const active = DB.trips.find(t => t.driverId === id && (t.status === 'Dispatched' || t.status === 'On Trip'));
    if (active) { U.toast('Cannot delete a driver currently On Trip.', 'error'); return; }
    DB.remove(KEYS.DRIVERS, id);
    if (this._selId === id) this._selId = null;
    U.toast('Driver deleted.');
    this.render();
  }
};

/* ====================================================
   TRIPS MODULE
   ==================================================== */
const Trips = {
  _selCapacity: 0,
  _actionId: null,

  render() {
    this.renderLifecycle('Draft');
    this.fillVehicles();
    this.fillDrivers();
    this.renderLiveBoard();
  },

  renderLifecycle(status) {
    const steps = ['Draft','Dispatched','Completed','Cancelled'];
    const ci    = steps.indexOf(status);
    const el    = document.getElementById('tripLifecycle');
    if (!el) return;
    el.innerHTML = `
      <span class="lc-label-head">Trip Lifecycle</span>
      ${steps.map((s, i) => {
        let cls = '';
        if (i < ci) cls = 'done';
        else if (i === ci) cls = status === 'Cancelled' ? 'cancelled-step' : 'curr';
        return `
          <div class="lc-step ${cls}">
            <div class="lc-dot"></div>
            <span class="lc-name">${s}</span>
          </div>
          ${i < steps.length - 1 ? '<div style="flex:1;height:2px;background:'+ (i < ci ? 'var(--green)' : 'var(--border)') +';margin-bottom:14px;"></div>' : ''}
        `;
      }).join('')}`;
  },

  fillVehicles() {
    const avail = DB.vehicles.filter(v => v.status === 'Available');
    const sel = document.getElementById('t-vehicle');
    if (!sel) return;
    sel.innerHTML = '<option value="">Select vehicle…</option>' +
      avail.map(v => `<option value="${v.id}" data-cap="${v.capacity}">${v.name} – ${U.cap(v.capacity)} capacity</option>`).join('');
    this._selCapacity = 0;
  },

  fillDrivers() {
    const avail = DB.drivers.filter(d =>
      d.status === 'Available' &&
      !U.isExpired(d.expiry)
    );
    const sel = document.getElementById('t-driver');
    if (!sel) return;
    sel.innerHTML = '<option value="">Select driver…</option>' +
      avail.map(d => `<option value="${d.id}">${d.name} (${d.category})</option>`).join('');
  },

  onVehicleChange() {
    const sel = document.getElementById('t-vehicle');
    const opt = sel?.options[sel.selectedIndex];
    this._selCapacity = parseFloat(opt?.dataset?.cap) || 0;
    this.validateCargo();
  },

  validateCargo() {
    const cargo = parseFloat(document.getElementById('t-cargo')?.value) || 0;
    const cap   = this._selCapacity;
    const box   = document.getElementById('valBox');
    const btn   = document.getElementById('dispatchBtn');
    if (!box || !btn) return;

    if (cap > 0 && cargo > cap) {
      const over = cargo - cap;
      box.style.display = 'block';
      box.innerHTML = `
        <div class="val-row">Vehicle Capacity: ${cap} kg</div>
        <div class="val-row">Cargo Weight: ${cargo} kg</div>
        <div class="val-row err">✗ Capacity exceeded by ${over} kg — dispatch blocked</div>`;
      btn.disabled = true;
      btn.textContent = 'Dispatch (disabled)';
    } else {
      box.style.display = 'none';
      btn.disabled = false;
      btn.textContent = 'Dispatch';
    }
  },

  dispatch() {
    const source  = document.getElementById('t-source')?.value.trim();
    const dest    = document.getElementById('t-dest')?.value.trim();
    const vId     = document.getElementById('t-vehicle')?.value;
    const dId     = document.getElementById('t-driver')?.value;
    const cargo   = parseFloat(document.getElementById('t-cargo')?.value) || 0;
    const dist    = parseFloat(document.getElementById('t-dist')?.value) || 0;

    // Validations
    if (!source || !dest)  { U.toast('Source and destination required.', 'error'); return; }
    if (!vId)              { U.toast('Select an available vehicle.', 'error'); return; }
    if (!dId)              { U.toast('Select an available driver.', 'error'); return; }
    if (cargo <= 0)        { U.toast('Enter a valid cargo weight.', 'error'); return; }
    if (cargo > this._selCapacity && this._selCapacity > 0) {
      U.toast('Cargo exceeds vehicle capacity!', 'error'); return;
    }

    const vehicle = DB.getById(KEYS.VEHICLES, vId);
    const driver  = DB.getById(KEYS.DRIVERS, dId);

    if (!vehicle || vehicle.status !== 'Available')    { U.toast('Vehicle is not available.', 'error'); return; }
    if (!driver  || driver.status  !== 'Available')    { U.toast('Driver is not available.', 'error'); return; }
    if (U.isExpired(driver.expiry))                    { U.toast('Driver license is expired!', 'error'); return; }
    if (driver.status === 'Suspended')                 { U.toast('Suspended driver cannot be assigned.', 'error'); return; }

    const tripNo = U.nextTripNo();

    DB.add(KEYS.TRIPS, {
      id: DB.genId(), tripNo,
      source, destination: dest,
      vehicleId: vId, driverId: dId,
      cargoWeight: cargo, plannedDist: dist,
      status: 'Dispatched',
      revenue: 0, fuelConsumed: 0, actualDist: 0,
      createdAt: U.today()
    });

    // Business rules: status transitions
    DB.update(KEYS.VEHICLES, vId, { status: 'On Trip' });
    DB.update(KEYS.DRIVERS,  dId, { status: 'On Trip' });

    U.toast(`${tripNo} dispatched! Vehicle & driver → On Trip.`);
    this.resetForm();
    this.render();
  },

  resetForm() {
    ['t-source','t-dest','t-cargo','t-dist'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    const vSel = document.getElementById('t-vehicle');
    const dSel = document.getElementById('t-driver');
    if (vSel) vSel.value = '';
    if (dSel) dSel.value = '';
    this._selCapacity = 0;
    const box = document.getElementById('valBox');
    if (box) box.style.display = 'none';
    const btn = document.getElementById('dispatchBtn');
    if (btn) { btn.disabled = false; btn.textContent = 'Dispatch'; }
  },

  renderLiveBoard() {
    const trips = [...DB.trips].sort((a, b) => {
      const ord = { Dispatched: 0, Draft: 1, Completed: 2, Cancelled: 3 };
      return (ord[a.status] ?? 5) - (ord[b.status] ?? 5);
    });
    const vMap = Object.fromEntries(DB.vehicles.map(v => [v.id, v]));
    const dMap = Object.fromEntries(DB.drivers.map(d => [d.id, d]));

    const eta = t => {
      if (t.status === 'Dispatched') return '45 min';
      if (t.status === 'Draft')      return 'Awaiting driver';
      if (t.status === 'Cancelled')  return 'Vehicle went to shop';
      return '--';
    };

    const actions = t => {
      if (t.status === 'Dispatched') return `
        <button class="btn btn-success btn-sm" onclick="Trips.openComplete('${t.id}')">Complete</button>
        <button class="btn btn-danger btn-sm" onclick="Trips.cancelTrip('${t.id}')">Cancel</button>`;
      if (t.status === 'Draft') return `
        <button class="btn btn-secondary btn-sm" onclick="Trips.removeDraft('${t.id}')">Remove</button>`;
      return '';
    };

    const lbl = t => {
      const v = vMap[t.vehicleId], d = dMap[t.driverId];
      if (v && d) return `${v.name} / ${d.name.toUpperCase()}`;
      return 'Unassigned';
    };

    document.getElementById('liveBoard').innerHTML = trips.length
      ? trips.map(t => `
        <div class="lb-card">
          <div class="lb-header">
            <span class="lb-trip-no">${t.tripNo}</span>
            <span class="lb-vehicle-label">${lbl(t)}</span>
          </div>
          <div class="lb-route">${t.source} → ${t.destination}</div>
          <div class="lb-footer">
            <div class="lb-footer-left">
              ${U.badge(t.status)}
              ${actions(t)}
            </div>
            <span class="lb-eta">${eta(t)}</span>
          </div>
        </div>`).join('')
      : '<p class="text-muted" style="padding:28px 0;text-align:center;">No trips yet</p>';
  },

  openComplete(id) {
    this._actionId = id;
    const trip = DB.getById(KEYS.TRIPS, id);
    const vehicle = DB.getById(KEYS.VEHICLES, trip?.vehicleId);
    document.getElementById('am-title').textContent = `Complete Trip ${trip?.tripNo}`;
    document.getElementById('am-body').innerHTML = `
      <div class="form-group">
        <label class="form-label">Final Odometer (KM)</label>
        <input type="number" class="form-input" id="am-odo" placeholder="e.g. ${(vehicle?.odometer || 0) + 35}" min="0">
      </div>
      <div class="form-group">
        <label class="form-label">Fuel Consumed (Liters)</label>
        <input type="number" class="form-input" id="am-fuel" placeholder="e.g. 5" min="0">
      </div>
      <div class="form-group">
        <label class="form-label">Revenue Earned (₹)</label>
        <input type="number" class="form-input" id="am-rev" placeholder="e.g. 8500" min="0">
      </div>`;
    document.getElementById('am-confirm').textContent = 'Complete Trip';
    document.getElementById('am-confirm').onclick = () => this.completeTrip();
    document.getElementById('actionModal').classList.add('show');
  },

  completeTrip() {
    const trip = DB.getById(KEYS.TRIPS, this._actionId);
    if (!trip) return;

    const odo  = parseFloat(document.getElementById('am-odo')?.value)  || 0;
    const fuel = parseFloat(document.getElementById('am-fuel')?.value) || 0;
    const rev  = parseFloat(document.getElementById('am-rev')?.value)  || 0;

    DB.update(KEYS.TRIPS, this._actionId, { status: 'Completed', actualDist: odo, fuelConsumed: fuel, revenue: rev });

    // Business rules
    if (trip.vehicleId) {
      const v = DB.getById(KEYS.VEHICLES, trip.vehicleId);
      if (v && v.status !== 'Retired') {
        DB.update(KEYS.VEHICLES, trip.vehicleId, { status: 'Available', odometer: odo || v.odometer });
      }
    }
    if (trip.driverId) {
      const d = DB.getById(KEYS.DRIVERS, trip.driverId);
      DB.update(KEYS.DRIVERS, trip.driverId, { status: 'Available', tripsCompleted: (d?.tripsCompleted || 0) + 1 });
    }

    // Auto log fuel
    if (fuel > 0 && trip.vehicleId) {
      DB.add(KEYS.FUEL_LOGS, { id: DB.genId(), vehicleId: trip.vehicleId, date: U.today(), liters: fuel, cost: Math.round(fuel * 75) });
    }

    this.closeAction();
    U.toast('Trip completed! Vehicle & driver → Available.');
    this.render();
  },

  cancelTrip(id) {
    if (!confirm('Cancel this trip? Vehicle and driver will be restored to Available.')) return;
    const trip = DB.getById(KEYS.TRIPS, id);
    if (!trip) return;
    DB.update(KEYS.TRIPS, id, { status: 'Cancelled' });

    if (trip.vehicleId) {
      const v = DB.getById(KEYS.VEHICLES, trip.vehicleId);
      if (v && v.status !== 'Retired' && v.status !== 'In Shop') {
        DB.update(KEYS.VEHICLES, trip.vehicleId, { status: 'Available' });
      }
    }
    if (trip.driverId) {
      const d = DB.getById(KEYS.DRIVERS, trip.driverId);
      if (d) DB.update(KEYS.DRIVERS, trip.driverId, { status: 'Available' });
    }
    U.toast('Trip cancelled. Vehicle & driver → Available.');
    this.render();
  },

  removeDraft(id) {
    if (!confirm('Remove this draft trip?')) return;
    DB.remove(KEYS.TRIPS, id);
    U.toast('Draft removed.');
    this.render();
  },

  closeAction() { document.getElementById('actionModal').classList.remove('show'); }
};

/* ====================================================
   MAINTENANCE MODULE
   ==================================================== */
const Maint = {
  render() {
    this.fillVehicles();
    this.renderLog();
    const dateEl = document.getElementById('m-date');
    if (dateEl && !dateEl.value) dateEl.value = U.today();
  },

  fillVehicles() {
    const sel = document.getElementById('m-vehicle');
    if (!sel) return;
    sel.innerHTML = '<option value="">Select vehicle…</option>' +
      DB.vehicles.filter(v => v.status !== 'Retired').map(v =>
        `<option value="${v.id}">${v.name} (${v.status})</option>`).join('');
  },

  renderLog() {
    const vMap = Object.fromEntries(DB.vehicles.map(v => [v.id, v]));
    document.getElementById('maintTbody').innerHTML = DB.maintenance.length
      ? DB.maintenance.map(m => `
        <tr>
          <td class="fw-600">${vMap[m.vehicleId]?.name ?? 'Unknown'}</td>
          <td>${m.serviceType}</td>
          <td>₹${U.fmt(m.cost)}</td>
          <td>${U.badge(m.status)}</td>
          <td>
            <div class="row-actions">
              ${m.status === 'Active'
                ? `<button class="act-btn close-btn" onclick="Maint.closeRecord('${m.id}')">Close</button>`
                : ''}
              <button class="act-btn del" onclick="Maint.del('${m.id}')">Delete</button>
            </div>
          </td>
        </tr>`).join('')
      : `<tr class="empty-row"><td colspan="5">No maintenance records</td></tr>`;
  },

  save() {
    const vId     = document.getElementById('m-vehicle').value;
    const sType   = document.getElementById('m-service').value.trim();
    const cost    = parseFloat(document.getElementById('m-cost').value) || 0;
    const date    = document.getElementById('m-date').value;
    const status  = document.getElementById('m-status').value;

    if (!vId || !sType || !date) {
      U.toast('Please fill all required fields.', 'error'); return;
    }

    DB.add(KEYS.MAINTENANCE, { id: DB.genId(), vehicleId: vId, serviceType: sType, cost, date, status });

    // Business rule: Active maintenance → In Shop
    if (status === 'Active') {
      DB.update(KEYS.VEHICLES, vId, { status: 'In Shop' });
      U.toast('Record saved. Vehicle → In Shop (removed from dispatch pool).');
    } else {
      U.toast('Maintenance record saved.');
    }

    // Reset form
    document.getElementById('maintForm').reset();
    document.getElementById('m-date').value = U.today();
    document.getElementById('m-status').value = 'Active';
    this.render();
  },

  closeRecord(id) {
    const rec = DB.getById(KEYS.MAINTENANCE, id);
    if (!rec) return;
    DB.update(KEYS.MAINTENANCE, id, { status: 'Completed' });
    // Business rule: Closing → Available (unless Retired)
    const v = DB.getById(KEYS.VEHICLES, rec.vehicleId);
    if (v && v.status !== 'Retired') {
      DB.update(KEYS.VEHICLES, rec.vehicleId, { status: 'Available' });
      U.toast('Maintenance closed. Vehicle → Available.');
    } else {
      U.toast('Maintenance record closed.');
    }
    this.render();
  },

  del(id) {
    if (!confirm('Delete this record?')) return;
    DB.remove(KEYS.MAINTENANCE, id);
    U.toast('Record deleted.');
    this.render();
  }
};

/* ====================================================
   FUEL & EXPENSES MODULE
   ==================================================== */
const Fuel = {
  render() {
    this.renderFuel();
    this.renderExpenses();
    this.renderTotal();
  },

  renderFuel() {
    const vMap = Object.fromEntries(DB.vehicles.map(v => [v.id, v]));
    document.getElementById('fuelTbody').innerHTML = DB.fuelLogs.length
      ? DB.fuelLogs.map(f => `
        <tr>
          <td class="fw-600">${vMap[f.vehicleId]?.name ?? 'Unknown'}</td>
          <td>${U.fmtDate(f.date)}</td>
          <td>${f.liters} L</td>
          <td>₹${U.fmt(f.cost)}</td>
          <td>
            <button class="act-btn del" onclick="Fuel.delFuel('${f.id}')">Delete</button>
          </td>
        </tr>`).join('')
      : `<tr class="empty-row"><td colspan="5">No fuel logs yet</td></tr>`;
  },

  renderExpenses() {
    const tMap = Object.fromEntries(DB.trips.map(t => [t.id, t]));
    const vMap = Object.fromEntries(DB.vehicles.map(v => [v.id, v]));
    document.getElementById('expTbody').innerHTML = DB.expenses.length
      ? DB.expenses.map(e => {
          const trip = tMap[e.tripId];
          return `<tr>
            <td class="fw-600">${trip?.tripNo ?? '--'}</td>
            <td>${vMap[e.vehicleId]?.name ?? '--'}</td>
            <td>${U.fmt(e.toll || 0)}</td>
            <td>${U.fmt(e.other || 0)}</td>
            <td>${U.fmt(e.maintLinked || 0)}</td>
            <td>${trip ? U.badge(trip.status) : '--'}</td>
            <td>
              <button class="act-btn del" onclick="Fuel.delExp('${e.id}')">Delete</button>
            </td>
          </tr>`;
        }).join('')
      : `<tr class="empty-row"><td colspan="7">No expenses yet</td></tr>`;
  },

  renderTotal() {
    const fuelTotal = DB.fuelLogs.reduce((s, f) => s + (f.cost || 0), 0);
    const maintTotal = DB.maintenance.reduce((s, m) => s + (m.cost || 0), 0);
    document.getElementById('totalOpCost').textContent = '₹' + U.fmt(fuelTotal + maintTotal);
  },

  openFuelModal() {
    const sel = document.getElementById('fl-vehicle');
    sel.innerHTML = '<option value="">Select vehicle…</option>' +
      DB.vehicles.map(v => `<option value="${v.id}">${v.name}</option>`).join('');
    document.getElementById('fl-date').value = U.today();
    document.getElementById('fl-liters').value = '';
    document.getElementById('fl-cost').value = '';
    document.getElementById('fuelModal').classList.add('show');
  },
  closeFuelModal() { document.getElementById('fuelModal').classList.remove('show'); },

  saveFuel() {
    const vId    = document.getElementById('fl-vehicle').value;
    const date   = document.getElementById('fl-date').value;
    const liters = parseFloat(document.getElementById('fl-liters').value);
    const cost   = parseFloat(document.getElementById('fl-cost').value) || 0;
    if (!vId || !date || isNaN(liters) || liters <= 0) {
      U.toast('Fill all fields with valid values.', 'error'); return;
    }
    DB.add(KEYS.FUEL_LOGS, { id: DB.genId(), vehicleId: vId, date, liters, cost });
    U.toast('Fuel log saved!');
    this.closeFuelModal();
    this.render();
  },

  delFuel(id) {
    if (!confirm('Delete this fuel log?')) return;
    DB.remove(KEYS.FUEL_LOGS, id);
    U.toast('Fuel log deleted.');
    this.render();
  },

  openExpModal() {
    document.getElementById('ex-trip').innerHTML = '<option value="">Select trip…</option>' +
      DB.trips.map(t => `<option value="${t.id}">${t.tripNo} – ${t.source} → ${t.destination}</option>`).join('');
    document.getElementById('ex-vehicle').innerHTML = '<option value="">Select vehicle…</option>' +
      DB.vehicles.map(v => `<option value="${v.id}">${v.name}</option>`).join('');
    ['ex-toll','ex-other','ex-maint'].forEach(id => { document.getElementById(id).value = ''; });
    document.getElementById('expModal').classList.add('show');
  },
  closeExpModal() { document.getElementById('expModal').classList.remove('show'); },

  saveExp() {
    const tripId = document.getElementById('ex-trip').value;
    const vId    = document.getElementById('ex-vehicle').value;
    const toll   = parseFloat(document.getElementById('ex-toll').value) || 0;
    const other  = parseFloat(document.getElementById('ex-other').value) || 0;
    const maint  = parseFloat(document.getElementById('ex-maint').value) || 0;
    if (!vId) { U.toast('Please select a vehicle.', 'error'); return; }
    DB.add(KEYS.EXPENSES, { id: DB.genId(), tripId: tripId || null, vehicleId: vId, toll, other, maintLinked: maint });
    U.toast('Expense saved!');
    this.closeExpModal();
    this.render();
  },

  delExp(id) {
    if (!confirm('Delete this expense?')) return;
    DB.remove(KEYS.EXPENSES, id);
    U.toast('Expense deleted.');
    this.render();
  }
};

/* ====================================================
   ANALYTICS MODULE
   ==================================================== */
const Analytics = {
  _rc: null, _cc: null,

  render() {
    this.renderKPIs();
    setTimeout(() => { this.renderCharts(); }, 0);
  },

  stats() {
    const vehicles = DB.vehicles;
    const trips    = DB.trips;
    const fuel     = DB.fuelLogs;
    const maint    = DB.maintenance;

    const completed = trips.filter(t => t.status === 'Completed');
    const totalDist = completed.reduce((s, t) => s + (t.actualDist || t.plannedDist || 0), 0);
    const totalFuel = fuel.reduce((s, f) => s + (f.liters || 0), 0);
    const fuelEff   = totalFuel > 0 ? (totalDist / totalFuel).toFixed(1) : '0.0';

    const total = vehicles.length || 1;
    const onTrip = vehicles.filter(v => v.status === 'On Trip').length;
    const util   = Math.round((onTrip / total) * 100);

    const fuelCost  = fuel.reduce((s, f) => s + (f.cost || 0), 0);
    const maintCost = maint.reduce((s, m) => s + (m.cost || 0), 0);
    const opCost    = fuelCost + maintCost;

    const revenue  = completed.reduce((s, t) => s + (t.revenue || 0), 0);
    const acqCost  = vehicles.reduce((s, v) => s + (v.acquisitionCost || 0), 0) || 1;
    const roi      = ((revenue - opCost) / acqCost * 100).toFixed(1);

    return { fuelEff, util, opCost, roi, vehicles, fuelCost, maintCost };
  },

  renderKPIs() {
    const s = this.stats();
    document.getElementById('anKpiGrid').innerHTML = `
      <div class="an-kpi"><div class="an-kpi-label">Fuel Efficiency</div><div class="an-kpi-value">${s.fuelEff} km/l</div></div>
      <div class="an-kpi"><div class="an-kpi-label">Fleet Utilization</div><div class="an-kpi-value">${s.util}%</div></div>
      <div class="an-kpi"><div class="an-kpi-label">Operational Cost</div><div class="an-kpi-value">₹${U.fmt(s.opCost)}</div></div>
      <div class="an-kpi"><div class="an-kpi-label">Vehicle ROI</div><div class="an-kpi-value">${s.roi}%</div></div>`;
  },

  renderCharts() {
    this.renderRevChart();
    this.renderCostChart();
  },

  renderRevChart() {
    const ctx = document.getElementById('revChart');
    if (!ctx) return;
    if (this._rc) { this._rc.destroy(); }
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug'];
    const data   = [15000,22000,18000,28000,25000,32000,38000,30000];
    const rev    = DB.trips.filter(t => t.status === 'Completed').reduce((s, t) => s + (t.revenue || 0), 0);
    if (rev) data[6] = rev;
    this._rc = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: months,
        datasets: [{ label: 'Revenue (₹)', data, backgroundColor: '#3b82f6', borderRadius: 4 }]
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#6b7280', font: { size: 11 } } },
          y: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#6b7280', font: { size: 11 }, callback: v => '₹' + (v/1000) + 'k' } }
        }
      }
    });
  },

  renderCostChart() {
    const ctx = document.getElementById('costChart');
    if (!ctx) return;
    if (this._cc) { this._cc.destroy(); }
    const vMap = DB.vehicles.map(v => {
      const fc = DB.fuelLogs.filter(f => f.vehicleId === v.id).reduce((s, f) => s + f.cost, 0);
      const mc = DB.maintenance.filter(m => m.vehicleId === v.id).reduce((s, m) => s + m.cost, 0);
      return { name: v.name, total: fc + mc };
    }).sort((a, b) => b.total - a.total).slice(0, 5);
    this._cc = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: vMap.map(v => v.name),
        datasets: [{ label: 'Cost (₹)', data: vMap.map(v => v.total), backgroundColor: ['#f43f5e','#f97316','#3b82f6','#22c55e','#a855f7'], borderRadius: 4 }]
      },
      options: {
        indexAxis: 'y', responsive: true,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#6b7280', font: { size: 11 }, callback: v => '₹' + (v/1000) + 'k' } },
          y: { grid: { display: false }, ticks: { color: '#9a9a9a', font: { size: 12 } } }
        }
      }
    });
  }
};

/* ====================================================
   SETTINGS MODULE
   ==================================================== */
const Settings = {
  render() {
    const s = DB.settings;
    document.getElementById('s-depot').value    = s.depotName    || '';
    document.getElementById('s-currency').value = s.currency     || '';
    document.getElementById('s-dist').value     = s.distanceUnit || '';
  },

  save() {
    localStorage.setItem(KEYS.SETTINGS, JSON.stringify({
      depotName:    document.getElementById('s-depot').value.trim(),
      currency:     document.getElementById('s-currency').value.trim(),
      distanceUnit: document.getElementById('s-dist').value.trim(),
    }));
    U.toast('Settings saved!');
  }
};

/* ====================================================
   GLOBAL SEARCH
   ==================================================== */
document.getElementById('gSearch')?.addEventListener('input', e => {
  const q = e.target.value.toLowerCase().trim();
  if (!q) return;
  // Search vehicles
  const vHit = DB.vehicles.find(v => v.name.toLowerCase().includes(q) || v.regNo.toLowerCase().includes(q));
  if (vHit && Auth.canView('fleet')) {
    Router.go('fleet');
    const si = document.getElementById('ff-search');
    if (si) { si.value = q; Fleet.applyFilters(); }
    return;
  }
  // Search drivers
  const dHit = DB.drivers.find(d => d.name.toLowerCase().includes(q) || d.licenseNo.toLowerCase().includes(q));
  if (dHit && Auth.canView('drivers')) {
    Router.go('drivers');
    return;
  }
  // Search trips
  const tHit = DB.trips.find(t => t.tripNo.toLowerCase().includes(q) || t.source.toLowerCase().includes(q));
  if (tHit && Auth.canView('trips')) {
    Router.go('trips');
    return;
  }
});

/* ====================================================
   BOOTSTRAP
   ==================================================== */
(function init() {
  if (!Auth.isLoggedIn()) { window.location.href = 'index.html'; return; }

  const user = Auth.me();

  // Update topbar
  document.getElementById('topbarUser').textContent     = user.name;
  document.getElementById('roleBadgeText').textContent  = user.role;
  document.getElementById('roleInitials').textContent   = user.initials;

  // Wire nav
  document.querySelectorAll('.nav-item').forEach(item => {
    const page = item.dataset.page;
    if (!Auth.canView(page)) {
      item.classList.add('nav-locked');
    } else {
      item.addEventListener('click', () => Router.go(page));
    }
  });

  // Logout
  document.getElementById('roleBadge')?.addEventListener('click', () => {
    if (confirm('Sign out of TransitOps?')) Auth.logout();
  });

  // Dashboard filters
  ['df-type','df-status','df-region'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', () => Dashboard.applyFilters());
  });

  // Fleet filters
  ['ff-type','ff-status'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', () => Fleet.applyFilters());
  });
  document.getElementById('ff-search')?.addEventListener('input', () => Fleet.applyFilters());

  // Trip vehicle change
  document.getElementById('t-vehicle')?.addEventListener('change', () => Trips.onVehicleChange());
  document.getElementById('t-cargo')?.addEventListener('input', () => Trips.validateCargo());

  // Start on dashboard
  Router.go('dashboard');
})();

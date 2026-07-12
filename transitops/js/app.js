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
  _cuChart: null,

  render() {
    this.renderKPIs();
    this.renderRecentTrips();
    this.renderStatusBars();
    this.renderExpiringLicenses();
    this.renderMaintDue();
    setTimeout(() => this.renderCostUtil(), 0);
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

  applyFilters() { this.render(); },

  /* ══ NEW: Cost vs Utilization 7-day chart ══ */
  renderCostUtil() {
    const ctx = document.getElementById('costUtilChart');
    if (!ctx) return;
    if (this._cuChart) { this._cuChart.destroy(); }

    // Build last 7 days
    const days = [], labels = [];
    const now = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      days.push(d.toISOString().slice(0, 10));       // 'YYYY-MM-DD'
      labels.push(d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric' })); // 'Mon 7'
    }

    // Operational cost per day (fuel + maintenance recorded on that day)
    const costByDay = days.map(day => {
      const f = DB.fuelLogs.filter(l => l.date === day).reduce((s, l) => s + (l.cost || 0), 0);
      const m = DB.maintenance.filter(r => r.date === day).reduce((s, r) => s + (r.cost || 0), 0);
      return f + m;
    });

    // Utilization % = on-trip vehicles / total that day (approximated from dispatched trips)
    const total = DB.vehicles.length || 1;
    const utilByDay = days.map(day => {
      const onTrip = DB.trips.filter(t =>
        t.date === day && (t.status === 'Dispatched' || t.status === 'Completed')
      ).length;
      // Fall back to current utilization if no trip data for that day
      const active = DB.vehicles.filter(v => v.status === 'On Trip').length;
      return onTrip > 0 ? Math.min(100, Math.round((onTrip / total) * 100))
                        : Math.round((active / total) * 100);
    });

    this._cuChart = new Chart(ctx, {
      data: {
        labels,
        datasets: [
          {
            type: 'bar',
            label: 'Op. Cost (₹)',
            data: costByDay,
            backgroundColor: 'rgba(212,147,10,0.25)',
            borderColor: '#d4930a',
            borderWidth: 1.5,
            borderRadius: 4,
            yAxisID: 'yCost',
          },
          {
            type: 'line',
            label: 'Utilization %',
            data: utilByDay,
            borderColor: '#3b82f6',
            backgroundColor: 'rgba(59,130,246,0.08)',
            borderWidth: 2,
            pointRadius: 4,
            pointBackgroundColor: '#3b82f6',
            fill: true,
            tension: 0.4,
            yAxisID: 'yUtil',
          }
        ]
      },
      options: {
        responsive: true,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: ctx => ctx.dataset.label === 'Utilization %'
                ? ` Utilization: ${ctx.parsed.y}%`
                : ` Cost: ₹${U.fmt(ctx.parsed.y)}`
            }
          }
        },
        scales: {
          x: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#6b7280', font: { size: 11 } } },
          yCost: {
            type: 'linear', position: 'left',
            grid: { color: 'rgba(255,255,255,0.04)' },
            ticks: { color: '#d4930a', font: { size: 10 }, callback: v => '₹' + (v >= 1000 ? (v/1000).toFixed(0)+'k' : v) }
          },
          yUtil: {
            type: 'linear', position: 'right',
            min: 0, max: 100,
            grid: { display: false },
            ticks: { color: '#3b82f6', font: { size: 10 }, callback: v => v + '%' }
          }
        }
      }
    });
  },

  /* ══ NEW: Expiring Licenses widget ══ */
  renderExpiringLicenses() {
    const tbody  = document.getElementById('expLicTbody');
    const badge  = document.getElementById('expLicBadge');
    if (!tbody) return;

    const today = new Date();
    const WARN_DAYS = 60;  // flag licenses expiring within 60 days

    const rows = DB.drivers
      .filter(d => d.licenseExpiry)
      .map(d => {
        const exp  = new Date(d.licenseExpiry);
        const diff = Math.ceil((exp - today) / 86400000);
        return { d, exp, diff };
      })
      .filter(r => r.diff <= WARN_DAYS)
      .sort((a, b) => a.diff - b.diff);

    // Show urgent badge if any expiring within 14 days
    const urgent = rows.some(r => r.diff <= 14);
    if (badge) badge.style.display = urgent ? 'inline-block' : 'none';

    tbody.innerHTML = rows.length
      ? rows.map(r => {
          const isExpired = r.diff < 0;
          const isUrgent  = r.diff >= 0 && r.diff <= 14;
          const color     = isExpired ? '#f43f5e' : isUrgent ? '#f97316' : '#fbbf24';
          const label     = isExpired ? `Expired ${Math.abs(r.diff)}d ago`
                          : isUrgent  ? `${r.diff} days`
                          :             `${r.diff} days`;
          return `<tr>
            <td class="fw-600">${r.d.name}</td>
            <td class="mono" style="font-size:11px;">${r.d.licenseNo}</td>
            <td>${U.fmtDate(r.d.licenseExpiry)}</td>
            <td>
              <span style="background:${color}18;color:${color};border:1px solid ${color}33;
                border-radius:20px;padding:2px 10px;font-size:10px;font-weight:700;white-space:nowrap;">
                ${label}
              </span>
            </td>
          </tr>`;
        }).join('')
      : `<tr class="empty-row"><td colspan="4" style="color:var(--green);font-size:12px;">All licenses valid — no expiries within 60 days</td></tr>`;
  },

  /* ══ NEW: Maintenance Due Soon widget ══ */
  renderMaintDue() {
    const tbody = document.getElementById('maintDueTbody');
    const badge = document.getElementById('maintDueBadge');
    if (!tbody) return;

    const today = new Date();
    const WARN_DAYS = 30;

    // Build list from maintenance records that have nextServiceDue
    const seen = new Set();
    const rows = DB.maintenance
      .filter(m => m.nextServiceDue)
      .filter(m => {
        if (seen.has(m.vehicleId)) return false; // one per vehicle
        seen.add(m.vehicleId);
        return true;
      })
      .map(m => {
        const v    = DB.vehicles.find(v => v.id === m.vehicleId);
        const due  = new Date(m.nextServiceDue);
        const diff = Math.ceil((due - today) / 86400000);
        return { m, v, due, diff };
      })
      .filter(r => r.diff <= WARN_DAYS)
      .sort((a, b) => a.diff - b.diff);

    const urgent = rows.some(r => r.diff <= 7);
    if (badge) badge.style.display = urgent ? 'inline-block' : 'none';

    tbody.innerHTML = rows.length
      ? rows.map(r => {
          const isOverdue = r.diff < 0;
          const isUrgent  = r.diff >= 0 && r.diff <= 7;
          const color     = isOverdue ? '#f43f5e' : isUrgent ? '#f97316' : '#fbbf24';
          const label     = isOverdue ? `Overdue ${Math.abs(r.diff)}d`
                          : isUrgent  ? `Due in ${r.diff}d`
                          :             `Due in ${r.diff}d`;
          return `<tr>
            <td class="fw-600">${r.v?.name ?? 'Unknown'}</td>
            <td style="font-size:11px;color:var(--text-2);">${U.fmtDate(r.m.date)}</td>
            <td style="font-size:11px;">${U.fmtDate(r.m.nextServiceDue)}</td>
            <td>
              <span style="background:${color}18;color:${color};border:1px solid ${color}33;
                border-radius:20px;padding:2px 10px;font-size:10px;font-weight:700;white-space:nowrap;">
                ${label}
              </span>
            </td>
          </tr>`;
        }).join('')
      : `<tr class="empty-row"><td colspan="4" style="color:var(--green);font-size:12px;">No upcoming maintenance due within 30 days</td></tr>`;
  },
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
          <td class="fw-600" style="cursor:pointer;color:var(--accent);" onclick="VehicleProfile.open('${v.id}')" title="View vehicle profile">${v.name} <span style="font-size:10px;opacity:0.6;">↗</span></td>
          <td>${v.type}</td>
          <td>${U.cap(v.capacity)}</td>
          <td>${U.fmt(v.odometer)}</td>
          <td>₹${U.fmt(v.acquisitionCost)}</td>
          <td>${U.badge(v.status)}</td>
          <td>
            <div class="row-actions">
              <button class="act-btn" onclick="VehicleProfile.open('${v.id}')" style="color:var(--accent);">View</button>
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
   VEHICLE PROFILE POPUP MODULE
   ==================================================== */
const VehicleProfile = {

  open(vehicleId) {
    const v = DB.getById(KEYS.VEHICLES, vehicleId);
    if (!v) return;

    /* ── Derived stats from live data ── */
    const completedTrips = DB.trips.filter(t => t.vehicleId === v.id && t.status === 'Completed');
    const allTrips       = DB.trips.filter(t => t.vehicleId === v.id);
    const dispatchedTrip = allTrips.find(t => t.status === 'Dispatched');

    const totalDist  = completedTrips.reduce((s, t) => s + (t.actualDist || t.plannedDist || 0), 0);
    const totalFuel  = DB.fuelLogs.filter(f => f.vehicleId === v.id).reduce((s, f) => s + (f.liters || 0), 0);
    const totalFuelCost = DB.fuelLogs.filter(f => f.vehicleId === v.id).reduce((s, f) => s + (f.cost || 0), 0);
    const maintCost  = DB.maintenance.filter(m => m.vehicleId === v.id).reduce((s, m) => s + (m.cost || 0), 0);
    const fuelEff    = (totalFuel > 0 && totalDist > 0) ? (totalDist / totalFuel).toFixed(1) : null;

    /* ── Status color ── */
    const sc = this._statusColor(v.status);

    /* ── Active trip info ── */
    const activeTripBadge = dispatchedTrip
      ? `<div class="vp-live-trip">
           <span class="vp-live-dot"></span>
           Live: ${dispatchedTrip.tripNo} · ${dispatchedTrip.source} → ${dispatchedTrip.destination}
         </div>`
      : '';

    /* ── Build modal content ── */
    document.getElementById('vehicleProfileBody').innerHTML = `
      <!-- HEADER -->
      <div class="vp-header">
        <div class="vp-icon-wrap" style="background:${sc}18;border-color:${sc}33;">
          <span class="vp-icon">${this._typeIcon(v.type)}</span>
        </div>
        <div class="vp-header-info">
          <div class="vp-name">${v.name}</div>
          <div class="vp-reg">${v.regNo}</div>
          <div class="vp-badges">
            <span class="vp-type-badge">${v.type}</span>
            <span class="vp-status-badge" style="background:${sc}18;color:${sc};border-color:${sc}33;">● ${v.status}</span>
          </div>
        </div>
        <button class="vp-close" onclick="VehicleProfile.close()">✕</button>
      </div>

      ${activeTripBadge}

      <!-- CORE SPECS -->
      <div class="vp-section-title">Core Specifications</div>
      <div class="vp-specs-grid">
        <div class="vp-spec">
          <div class="vp-spec-icon">📦</div>
          <div class="vp-spec-val">${U.cap(v.capacity)}</div>
          <div class="vp-spec-label">Max Load</div>
        </div>
        <div class="vp-spec">
          <div class="vp-spec-icon">🛣️</div>
          <div class="vp-spec-val">${U.fmt(v.odometer)} km</div>
          <div class="vp-spec-label">Odometer</div>
        </div>
        <div class="vp-spec">
          <div class="vp-spec-icon">💰</div>
          <div class="vp-spec-val">₹${U.fmt(v.acquisitionCost)}</div>
          <div class="vp-spec-label">Acq. Cost</div>
        </div>
        <div class="vp-spec">
          <div class="vp-spec-icon">📍</div>
          <div class="vp-spec-val">${v.region || '—'}</div>
          <div class="vp-spec-label">Region</div>
        </div>
      </div>

      <!-- LIVE / DERIVED STATS -->
      <div class="vp-section-title">Live Performance Stats</div>
      <div class="vp-stats-grid">
        <div class="vp-stat ${fuelEff ? '' : 'vp-stat-muted'}">
          <div class="vp-stat-label">⛽ Fuel Efficiency</div>
          <div class="vp-stat-value">${fuelEff ? fuelEff + ' km/L' : '—'}</div>
          <div class="vp-stat-sub">${totalFuel > 0 ? U.fmt(totalFuel) + ' L consumed' : 'No fuel logs yet'}</div>
        </div>
        <div class="vp-stat">
          <div class="vp-stat-label">✅ Trips Completed</div>
          <div class="vp-stat-value">${completedTrips.length}</div>
          <div class="vp-stat-sub">${allTrips.length} total assigned</div>
        </div>
        <div class="vp-stat">
          <div class="vp-stat-label">📏 Total Distance</div>
          <div class="vp-stat-value">${U.fmt(totalDist)} km</div>
          <div class="vp-stat-sub">Across completed trips</div>
        </div>
        <div class="vp-stat">
          <div class="vp-stat-label">🔧 Maintenance Cost</div>
          <div class="vp-stat-value">₹${U.fmt(maintCost)}</div>
          <div class="vp-stat-sub">₹${U.fmt(totalFuelCost)} fuel cost</div>
        </div>
      </div>

      <!-- COST BREAKDOWN BAR -->
      ${(totalFuelCost + maintCost) > 0 ? (() => {
        const total = totalFuelCost + maintCost;
        const fp = Math.round((totalFuelCost / total) * 100);
        const mp = 100 - fp;
        return `
        <div class="vp-section-title">Cost Split</div>
        <div class="vp-cost-bar-wrap" title="Fuel: ₹${U.fmt(totalFuelCost)} · Maint: ₹${U.fmt(maintCost)}">
          <div class="vp-cost-seg" style="width:${fp}%;background:var(--blue);" title="Fuel ${fp}%"></div>
          <div class="vp-cost-seg" style="width:${mp}%;background:var(--red);"  title="Maint ${mp}%"></div>
        </div>
        <div class="vp-cost-legend">
          <span><span class="vp-dot" style="background:var(--blue);"></span>Fuel ${fp}% · ₹${U.fmt(totalFuelCost)}</span>
          <span><span class="vp-dot" style="background:var(--red);"></span>Maint ${mp}% · ₹${U.fmt(maintCost)}</span>
          <span style="margin-left:auto;color:var(--text-2);">Total ₹${U.fmt(total)}</span>
        </div>`;
      })() : ''}

      <!-- FOOTER ACTIONS -->
      <div class="vp-footer">
        ${Auth.canEdit('fleet')
          ? `<button class="btn btn-secondary btn-sm" onclick="VehicleProfile.close(); Fleet.openEdit('${v.id}');">✏ Edit Vehicle</button>`
          : ''}
        ${dispatchedTrip
          ? `<button class="btn btn-sm" style="background:rgba(59,130,246,0.12);color:var(--blue);border:1px solid rgba(59,130,246,0.25);"
                onclick="VehicleProfile.close(); Router.go('trips'); setTimeout(() => TripMap.showRoute('${dispatchedTrip.id}'), 200);">
               🗺 Track Live Trip
             </button>`
          : ''}
        <button class="btn btn-sm" style="background:transparent;color:var(--text-3);border:1px solid var(--border);"
                onclick="VehicleProfile.close()">Close</button>
      </div>`;

    document.getElementById('vehicleProfileModal').classList.add('show');
  },

  close() { document.getElementById('vehicleProfileModal').classList.remove('show'); },

  _typeIcon(type) {
    return type === 'Truck' ? '🚛' : type === 'Van' ? '🚐' : type === 'Mini' ? '🚌' : '🚚';
  },

  _statusColor(status) {
    return status === 'Available' ? '#22c55e'
         : status === 'On Trip'   ? '#3b82f6'
         : status === 'In Shop'   ? '#f97316'
         : '#6b7280';
  },
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
          return `<tr ${rowBg} onclick="DriverProfile.open('${d.id}')" style="cursor:pointer;" title="Click to view driver profile">
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
    TripMap.render();
  },

  openForm() {
    if (!Auth.canEdit('trips')) { U.toast('Access denied.', 'error'); return; }
    this.fillVehicles();
    this.fillDrivers();
    this.resetForm();
    document.getElementById('addTripModal').classList.add('show');
  },

  closeForm() {
    document.getElementById('addTripModal').classList.remove('show');
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
        const connector = i < steps.length - 1
          ? `<div class="lc-connector ${i < ci ? 'done' : ''}"></div>`
          : '';
        return `<div class="lc-step ${cls}"><div class="lc-dot"></div><span class="lc-name">${s}</span></div>${connector}`;
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
    this.closeForm();
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
      if (t.status === 'Dispatched') return '~45 min ETA';
      if (t.status === 'Draft')      return 'Awaiting dispatch';
      if (t.status === 'Cancelled')  return 'Cancelled';
      return 'Delivered';
    };

    const actions = t => {
      const parts = [];
      if (t.status === 'Dispatched') {
        parts.push(`<button class="btn btn-success btn-sm" onclick="Trips.openComplete('${t.id}')">✓ Complete</button>`);
        parts.push(`<button class="btn btn-danger btn-sm" onclick="Trips.cancelTrip('${t.id}')">✕ Cancel</button>`);
      }
      if (t.status === 'Draft') {
        parts.push(`<button class="btn btn-secondary btn-sm" onclick="Trips.removeDraft('${t.id}')">Remove</button>`);
      }
      // Route button for dispatched/completed trips
      if (t.status === 'Dispatched' || t.status === 'Completed') {
        parts.push(`<button class="btn btn-sm" style="background:rgba(212,147,10,0.15);color:var(--accent);border:1px solid rgba(212,147,10,0.3);" onclick="TripMap.showRoute('${t.id}');event.stopPropagation();">🗺 Route</button>`);
      }
      return parts.join('');
    };

    const lbl = t => {
      const v = vMap[t.vehicleId], d = dMap[t.driverId];
      if (v && d) return `${v.name} · ${d.name}`;
      return 'Unassigned';
    };

    document.getElementById('liveBoard').innerHTML = trips.length
      ? trips.map(t => {
          const canRoute = t.status === 'Dispatched' || t.status === 'Completed';
          return `
        <div class="lb-card${canRoute ? ' lb-routable' : ''}" data-trip-id="${t.id}"
             onclick="TripMap.showRoute('${t.id}')"
             style="cursor:${canRoute ? 'pointer' : 'default'};"
             title="${canRoute ? 'Click to view route on map' : t.status}">
          <div class="lb-header">
            <div>
              <span class="lb-trip-no">${t.tripNo}</span>
              <span class="lb-vehicle-label" style="margin-left:8px;">${lbl(t)}</span>
            </div>
            ${U.badge(t.status)}
          </div>
          <div class="lb-route">📍 ${t.source} → ${t.destination}</div>
          <div class="lb-footer">
            <div class="lb-footer-left" onclick="event.stopPropagation()">
              ${actions(t)}
            </div>
            <span class="lb-eta">${eta(t)}</span>
          </div>
          <div class="lb-map-tag" id="lb-tag-${t.id}"></div>
        </div>`;
        }).join('')
      : '<p class="text-muted" style="padding:28px 0;text-align:center;">No trips yet. Click <strong>+ Add Trip</strong> to get started.</p>';
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
   TRIP MAP MODULE
   ==================================================== */
const TripMap = {
  _activeTrip: null,
  _animFrame: null,

  /* City name → map coordinates (matches SVG viewBox 900×480) */
  _coords: {
    'Ahmedabad':        { x: 310, y: 200 },
    'Gandhinagar':      { x: 290, y: 130 },
    'Gandhinagar Depot':{ x: 290, y: 130 },
    'Ahmedabad Hub':    { x: 310, y: 200 },
    'Vadodara':         { x: 580, y: 230 },
    'Surat':            { x: 660, y: 400 },
    'Surat Depot':      { x: 660, y: 400 },
    'Rajkot':           { x: 150, y: 200 },
    'Anand':            { x: 460, y: 260 },
    'Mehsana':          { x: 260, y: 75  },
    'Vatva Industrial Area': { x: 340, y: 220 },
    'Sanand Warehouse': { x: 270, y: 230 },
    'Mansa':            { x: 280, y: 105 },
    'Kalol Depot':      { x: 295, y: 150 },
  },

  /* Fuzzy-match a city name to coordinates */
  _getCoord(name) {
    if (!name) return null;
    const exact = this._coords[name];
    if (exact) return exact;
    const lower = name.toLowerCase();
    for (const [key, val] of Object.entries(this._coords)) {
      if (lower.includes(key.toLowerCase()) || key.toLowerCase().includes(lower)) return val;
    }
    // fallback: random-ish but stable position based on string hash
    const h = [...name].reduce((a, c) => a + c.charCodeAt(0), 0);
    return { x: 100 + (h % 700), y: 80 + ((h * 7) % 320) };
  },

  render() {
    this._renderMarkers();
  },

  _renderMarkers() {
    const markers = document.getElementById('mapMarkers');
    if (!markers) return;
    const vMap = Object.fromEntries(DB.vehicles.map(v => [v.id, v]));
    const trips = DB.trips;

    markers.innerHTML = DB.vehicles.map(v => {
      // Find active trip for this vehicle
      const trip = trips.find(t => t.vehicleId === v.id && (t.status === 'Dispatched' || t.status === 'On Trip'));
      const coord = trip ? this._midpoint(
        this._getCoord(trip.source),
        this._getCoord(trip.destination)
      ) : this._getCoord(v.region || v.name);

      const pos = coord || { x: 310, y: 200 };
      const color = v.status === 'Available' ? 'var(--green)'
                  : v.status === 'On Trip'   ? 'var(--blue)'
                  : v.status === 'In Shop'   ? 'var(--orange)'
                  : 'var(--gray)';

      const pct = this._toPercent(pos);
      return `<div class="map-marker" style="left:${pct.x}%;top:${pct.y}%;border-color:${color};"
                   onclick="TripMap._onMarkerClick('${v.id}')" title="${v.name} · ${v.status}">
                <div class="map-marker-inner" style="background:${color};"></div>
                <div class="map-marker-label">${v.name}</div>
                ${v.status === 'On Trip' ? '<div class="map-ping" style="border-color:'+color+';"></div>' : ''}
              </div>`;
    }).join('');
  },

  _midpoint(a, b) {
    if (!a || !b) return a || b || { x: 310, y: 200 };
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  },

  _toPercent(coord) {
    return { x: (coord.x / 900) * 100, y: (coord.y / 480) * 100 };
  },

  showRoute(tripId) {
    const trip    = DB.getById(KEYS.TRIPS, tripId);
    if (!trip) return;

    // Only show routes for dispatched or completed trips
    if (trip.status !== 'Dispatched' && trip.status !== 'Completed') {
      U.toast(`${trip.tripNo} has no route to show (${trip.status}).`, 'info');
      return;
    }

    const vehicle = DB.getById(KEYS.VEHICLES, trip.vehicleId);
    const driver  = DB.getById(KEYS.DRIVERS,  trip.driverId);

    const src  = this._getCoord(trip.source);
    const dest = this._getCoord(trip.destination);

    // ── 1. Highlight the card in Live Board ──
    document.querySelectorAll('.lb-card').forEach(c => {
      c.classList.remove('lb-active');
      const tag = c.querySelector('.lb-map-tag');
      if (tag) tag.innerHTML = '';
    });
    const activeCard = document.querySelector(`.lb-card[data-trip-id="${tripId}"]`);
    if (activeCard) {
      activeCard.classList.add('lb-active');
      const tag = activeCard.querySelector('.lb-map-tag');
      if (tag) tag.innerHTML = '<span class="lb-viewing-tag">🗺 Viewing route ↓</span>';
    }

    // ── 2. Scroll smoothly to the map ──
    const mapWrap = document.getElementById('tripMapWrap');
    if (mapWrap) {
      setTimeout(() => {
        mapWrap.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 80);
    }

    // ── 3. Hide hint ──
    const hint = document.getElementById('mapHint');
    if (hint) hint.style.display = 'none';

    // ── 4. Draw animated route ──
    const path = document.getElementById('activeRoutePath');
    const dot  = document.getElementById('movingDot');
    if (path && src && dest) {
      const mid = { x: (src.x + dest.x) / 2, y: Math.min(src.y, dest.y) - 40 };
      const d   = `M ${src.x} ${src.y} Q ${mid.x} ${mid.y} ${dest.x} ${dest.y}`;
      path.setAttribute('d', d);
      path.style.transition = 'none';
      path.style.strokeDashoffset = '1000';
      setTimeout(() => {
        path.style.transition = 'stroke-dashoffset 1.5s ease';
        path.style.strokeDashoffset = '0';
      }, 50);

      // Draw src/dest city dots on SVG
      this._drawCityDots(src, dest, trip);

      // Animate moving vehicle dot for active trips
      if (trip.status === 'Dispatched') {
        dot.setAttribute('cx', src.x);
        dot.setAttribute('cy', src.y);
        dot.setAttribute('opacity', '1');
        this._animateDot(src, dest, mid);
      } else {
        dot.setAttribute('cx', dest.x);
        dot.setAttribute('cy', dest.y);
        dot.setAttribute('opacity', '1');
        cancelAnimationFrame(this._animFrame);
      }
    }

    // ── 5. Show trip info overlay ──
    const info = document.getElementById('mapTripInfo');
    if (info) {
      const statusColor = trip.status === 'Dispatched' ? 'var(--blue)'
                        : trip.status === 'Completed'  ? 'var(--green)'
                        : 'var(--gray)';
      info.style.display = 'block';
      info.innerHTML = `
        <div class="mti-header">
          <span class="mti-tripno">${trip.tripNo}</span>
          <span class="mti-badge" style="color:${statusColor};">● ${trip.status}</span>
          <button class="mti-close" onclick="TripMap.clearRoute()">✕</button>
        </div>
        <div class="mti-route">📍 ${trip.source} → ${trip.destination}</div>
        <div class="mti-details">
          ${vehicle ? `<span>🚛 ${vehicle.name}</span>` : ''}
          ${driver  ? `<span>👤 ${driver.name}</span>`  : ''}
          ${trip.plannedDist ? `<span>📏 ${trip.plannedDist} km</span>` : ''}
          ${trip.cargoWeight ? `<span>📦 ${trip.cargoWeight} kg</span>` : ''}
        </div>
        ${trip.status === 'Dispatched' ? `<div class="mti-eta">🕐 ETA ~45 min · Live tracking active</div>` : 
          trip.status === 'Completed'  ? `<div class="mti-eta" style="color:var(--green);">✓ Trip delivered · ${trip.actualDist || trip.plannedDist} km covered</div>` : ''}
      `;
    }

    this._activeTrip = tripId;
    this._renderMarkers();
  },

  /* Draw glowing src/dest dots on the route SVG */
  _drawCityDots(src, dest, trip) {
    const svg = document.getElementById('mapRouteSvg');
    if (!svg) return;
    // Remove old city dots
    svg.querySelectorAll('.city-dot-group').forEach(e => e.remove());
    const color = trip.status === 'Dispatched' ? 'var(--blue)' : 'var(--green)';
    // Source dot
    const srcG = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    srcG.setAttribute('class', 'city-dot-group');
    srcG.innerHTML = `
      <circle cx="${src.x}" cy="${src.y}" r="8" fill="rgba(212,147,10,0.2)" stroke="var(--accent)" stroke-width="2"/>
      <circle cx="${src.x}" cy="${src.y}" r="4" fill="var(--accent)"/>
      <text x="${src.x}" y="${src.y - 13}" fill="var(--accent)" font-size="9" text-anchor="middle" font-family="Caveat, cursive">FROM</text>`;
    svg.appendChild(srcG);
    // Dest dot
    const dstG = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    dstG.setAttribute('class', 'city-dot-group');
    dstG.innerHTML = `
      <circle cx="${dest.x}" cy="${dest.y}" r="8" fill="rgba(34,197,94,0.2)" stroke="var(--green)" stroke-width="2"/>
      <circle cx="${dest.x}" cy="${dest.y}" r="4" fill="var(--green)"/>
      <text x="${dest.x}" y="${dest.y - 13}" fill="var(--green)" font-size="9" text-anchor="middle" font-family="Caveat, cursive">TO</text>`;
    svg.appendChild(dstG);
  },

  _animateDot(src, dest, mid) {
    cancelAnimationFrame(this._animFrame);
    const start = performance.now();
    const duration = 3000;
    const dot = document.getElementById('movingDot');
    const animate = (now) => {
      const t = Math.min((now - start) / duration, 1);
      // Quadratic bezier
      const x = (1-t)*(1-t)*src.x + 2*(1-t)*t*mid.x + t*t*dest.x;
      const y = (1-t)*(1-t)*src.y + 2*(1-t)*t*mid.y + t*t*dest.y;
      dot?.setAttribute('cx', x);
      dot?.setAttribute('cy', y);
      if (t < 1) this._animFrame = requestAnimationFrame(animate);
    };
    this._animFrame = requestAnimationFrame(animate);
  },

  clearRoute() {
    const path = document.getElementById('activeRoutePath');
    const dot  = document.getElementById('movingDot');
    const info = document.getElementById('mapTripInfo');
    const hint = document.getElementById('mapHint');
    const svg  = document.getElementById('mapRouteSvg');
    if (path) { path.setAttribute('d', ''); }
    if (dot)  { dot.setAttribute('opacity', '0'); }
    if (info) { info.style.display = 'none'; }
    if (hint) { hint.style.display = 'flex'; }
    if (svg)  { svg.querySelectorAll('.city-dot-group').forEach(e => e.remove()); }
    // Clear card highlight and tag
    document.querySelectorAll('.lb-card').forEach(c => {
      c.classList.remove('lb-active');
      const tag = c.querySelector('.lb-map-tag');
      if (tag) tag.innerHTML = '';
    });
    cancelAnimationFrame(this._animFrame);
    this._activeTrip = null;
  },

  _onMarkerClick(vehicleId) {
    const vehicle = DB.getById(KEYS.VEHICLES, vehicleId);
    if (!vehicle) return;
    const trip = DB.trips.find(t => t.vehicleId === vehicleId && (t.status === 'Dispatched'));
    if (trip) {
      this.showRoute(trip.id);
    } else {
      U.toast(`${vehicle.name} · ${vehicle.status}`, 'info');
    }
  },
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

  /* Duration helper – days between two dates */
  _days(fromStr, toStr) {
    const from = new Date(fromStr);
    const to   = toStr ? new Date(toStr) : new Date();
    return Math.max(0, Math.round((to - from) / 86400000));
  },

  /* Category badge */
  _catBadge(cat) {
    const map = {
      Routine:   { bg: 'rgba(34,197,94,0.12)',  color: '#22c55e', label: '● Routine'   },
      Urgent:    { bg: 'rgba(251,191,36,0.15)',  color: '#fbbf24', label: '⚡ Urgent'   },
      Emergency: { bg: 'rgba(244,63,94,0.15)',   color: '#f43f5e', label: '🚨 Emergency' },
    };
    const s = map[cat] || map.Routine;
    return `<span style="background:${s.bg};color:${s.color};border:1px solid ${s.color}33;
      border-radius:20px;padding:2px 10px;font-size:10px;font-weight:600;white-space:nowrap;">${s.label}</span>`;
  },

  renderLog() {
    const vMap = Object.fromEntries(DB.vehicles.map(v => [v.id, v]));
    const today = U.today();

    document.getElementById('maintTbody').innerHTML = DB.maintenance.length
      ? DB.maintenance.map(m => {
          const vehicle  = vMap[m.vehicleId];
          const days     = this._days(m.date, m.closedDate || (m.status === 'Completed' ? m.date : null));
          const isActive = m.status === 'Active';
          const duration = isActive
            ? `<span style="color:var(--orange);font-weight:600;">Ongoing (${this._days(m.date)} days)</span>`
            : `<span style="color:var(--text-2);">${days} day${days !== 1 ? 's' : ''}</span>`;

          // Next service due warning
          let nextDueCell = '--';
          if (m.nextServiceDue) {
            const isOverdue = new Date(m.nextServiceDue) < new Date();
            const label     = U.fmtDate(m.nextServiceDue);
            nextDueCell = isOverdue
              ? `<span style="color:var(--red);font-weight:600;">⚠ ${label}</span>`
              : `<span style="color:var(--green);">${label}</span>`;
          }

          return `
          <tr>
            <td class="fw-600">${vehicle?.name ?? 'Unknown'}</td>
            <td>${this._catBadge(m.category || 'Routine')}</td>
            <td>${m.serviceType}</td>
            <td style="color:var(--text-2);font-size:12px;">${m.vendor || '<span style="color:var(--text-3);">—</span>'}</td>
            <td style="font-variant-numeric:tabular-nums;">${m.odometer ? U.fmt(m.odometer) + ' km' : '<span style="color:var(--text-3);">—</span>'}</td>
            <td>${U.fmtDate(m.date)}</td>
            <td>${duration}</td>
            <td>${nextDueCell}</td>
            <td>₹${U.fmt(m.cost)}</td>
            <td>${U.badge(m.status)}</td>
            <td>
              <div class="row-actions">
                ${isActive
                  ? `<button class="act-btn close-btn" onclick="Maint.closeRecord('${m.id}')">Close</button>`
                  : ''}
                <button class="act-btn del" onclick="Maint.del('${m.id}')">Delete</button>
              </div>
            </td>
          </tr>`;
        }).join('')
      : `<tr class="empty-row"><td colspan="11">No maintenance records yet</td></tr>`;
  },

  save() {
    const vId      = document.getElementById('m-vehicle').value;
    const sType    = document.getElementById('m-service').value.trim();
    const cost     = parseFloat(document.getElementById('m-cost').value) || 0;
    const date     = document.getElementById('m-date').value;
    const status   = document.getElementById('m-status').value;
    // New fields
    const category = document.getElementById('m-category')?.value || 'Routine';
    const vendor   = document.getElementById('m-vendor')?.value.trim() || '';
    const odometer = parseFloat(document.getElementById('m-odo')?.value) || 0;
    const nextDue  = document.getElementById('m-next')?.value || '';

    if (!vId || !sType || !date) {
      U.toast('Please fill all required fields.', 'error'); return;
    }

    DB.add(KEYS.MAINTENANCE, {
      id: DB.genId(),
      vehicleId: vId,
      serviceType: sType,
      cost, date, status,
      category, vendor,
      odometer: odometer || null,
      nextServiceDue: nextDue || null,
      closedDate: status === 'Completed' ? date : null,
    });

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
    document.getElementById('m-category').value = 'Routine';
    this.render();
  },

  closeRecord(id) {
    const rec = DB.getById(KEYS.MAINTENANCE, id);
    if (!rec) return;
    // Stamp the closing date so duration is accurate
    DB.update(KEYS.MAINTENANCE, id, { status: 'Completed', closedDate: U.today() });
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
  /* ─────────────────────────────────────────────
     FUEL MODULE — render
     ───────────────────────────────────────────── */
  _activeVehicle: null,   // null = show all

  render() {
    this.renderVehicleCostCards();
    this.renderBudget();
    this.renderFuel();
    this.renderExpenses();
    this.renderTotal();
    // Set default budget month to current month
    const bm = document.getElementById('budgetMonth');
    if (bm && !bm.value) bm.value = new Date().toISOString().slice(0, 7);
  },

  /* ── Per-vehicle cumulative cost cards ── */
  renderVehicleCostCards() {
    const container = document.getElementById('vehicleCostCards');
    if (!container) return;

    container.innerHTML = DB.vehicles.map(v => {
      const fuel  = DB.fuelLogs.filter(f => f.vehicleId === v.id)
                                .reduce((s, f) => s + (f.cost  || 0), 0);
      const exp   = DB.expenses.filter(e => e.vehicleId === v.id)
                                .reduce((s, e) => s + (e.toll || 0) + (e.other || 0), 0);
      const maint = DB.maintenance.filter(m => m.vehicleId === v.id)
                                   .reduce((s, m) => s + (m.cost || 0), 0);
      const total = fuel + exp + maint;

      // Revenue from completed trips
      const revenue = DB.trips
        .filter(t => t.vehicleId === v.id && t.status === 'Completed')
        .reduce((s, t) => s + (t.revenue || 0), 0);

      // Simple ROI contribution: (revenue - total cost)
      const roi    = total > 0 ? (((revenue - total) / total) * 100).toFixed(1) : null;
      const roiPos = roi !== null && parseFloat(roi) >= 0;

      const isActive = this._activeVehicle === v.id;
      const statusColor = v.status === 'Available' ? 'var(--green)'
                        : v.status === 'On Trip'   ? 'var(--blue)'
                        : v.status === 'In Shop'   ? 'var(--orange)'
                        : 'var(--gray)';

      // Fuel share bar %
      const fuelPct  = total > 0 ? Math.round((fuel / total) * 100)  : 0;
      const expPct   = total > 0 ? Math.round((exp  / total) * 100)  : 0;
      const maintPct = total > 0 ? Math.round((maint/ total) * 100)  : 0;

      return `
        <div class="vcost-card${isActive ? ' vcost-active' : ''}"
             onclick="Fuel.filterByVehicle('${v.id}')"
             title="Click to filter logs for ${v.name}">
          <div class="vcost-header">
            <div class="vcost-name">${v.name}</div>
            <span style="font-size:10px;font-weight:600;color:${statusColor};">● ${v.status}</span>
          </div>
          <div class="vcost-total">₹${U.fmt(total)}</div>
          <div class="vcost-sub">Total Op. Cost</div>

          <!-- Breakdown bar -->
          <div class="vcost-bar-wrap" title="Fuel: ₹${U.fmt(fuel)} · Expenses: ₹${U.fmt(exp)} · Maint: ₹${U.fmt(maint)}">
            <div class="vcost-bar-seg" style="width:${fuelPct}%;background:var(--blue);"></div>
            <div class="vcost-bar-seg" style="width:${expPct}%;background:var(--orange);"></div>
            <div class="vcost-bar-seg" style="width:${maintPct}%;background:var(--red);"></div>
          </div>
          <div class="vcost-legend">
            <span><span class="vcl-dot" style="background:var(--blue);"></span>Fuel ₹${U.fmt(fuel)}</span>
            <span><span class="vcl-dot" style="background:var(--orange);"></span>Exp ₹${U.fmt(exp)}</span>
            <span><span class="vcl-dot" style="background:var(--red);"></span>Maint ₹${U.fmt(maint)}</span>
          </div>
          ${roi !== null ? `
          <div class="vcost-roi" style="color:${roiPos ? 'var(--green)' : 'var(--red)'};">
            ${roiPos ? '▲' : '▼'} ROI ${roi}%
            <span style="color:var(--text-3);font-weight:400;"> · Rev ₹${U.fmt(revenue)}</span>
          </div>` : ''}
          ${isActive ? '<div class="vcost-filter-tag">Filtering ↓</div>' : ''}
        </div>`;
    }).join('');

    // If no vehicles
    if (!DB.vehicles.length) {
      container.innerHTML = '<p class="text-muted" style="font-size:12px;">No vehicles found. Add vehicles in the Fleet section.</p>';
    }
  },

  /* ── Budget vs Actual ── */
  renderBudget() {
    const panel  = document.getElementById('budgetPanel');
    if (!panel) return;
    const budget = parseFloat(document.getElementById('fleetBudgetInput')?.value) || 0;
    const month  = document.getElementById('budgetMonth')?.value || new Date().toISOString().slice(0, 7);

    if (!budget) {
      panel.innerHTML = `<p class="text-muted" style="font-size:12px;text-align:center;padding:16px 0;">
        Enter a monthly budget above to see variance per vehicle and fleet.</p>`;
      return;
    }

    const budgetPerVehicle = Math.round(budget / Math.max(1, DB.vehicles.length));

    const rows = DB.vehicles.map(v => {
      // Filter to selected month
      const inMonth = (dateStr) => dateStr && dateStr.startsWith(month);

      const fuel  = DB.fuelLogs.filter(f => f.vehicleId === v.id && inMonth(f.date))
                                .reduce((s, f) => s + (f.cost  || 0), 0);
      const exp   = DB.expenses.filter(e => e.vehicleId === v.id)
                                .reduce((s, e) => s + (e.toll || 0) + (e.other || 0), 0);
      const maint = DB.maintenance.filter(m => m.vehicleId === v.id && inMonth(m.date))
                                   .reduce((s, m) => s + (m.cost || 0), 0);
      const actual   = fuel + exp + maint;
      const variance = budgetPerVehicle - actual;
      const pct      = Math.min(100, Math.round((actual / budgetPerVehicle) * 100));
      const over     = actual > budgetPerVehicle;

      return { v, actual, variance, pct, over, budgetPerVehicle };
    });

    // Fleet totals
    const fleetActual  = rows.reduce((s, r) => s + r.actual, 0);
    const fleetVar     = budget - fleetActual;
    const fleetPct     = Math.min(100, Math.round((fleetActual / budget) * 100));
    const fleetOver    = fleetActual > budget;

    panel.innerHTML = `
      <!-- Fleet summary row -->
      <div class="bva-fleet-row">
        <div class="bva-fleet-label">
          <span style="font-weight:700;color:var(--text-1);">Fleet Total</span>
          <span style="font-size:11px;color:var(--text-3);">${month}</span>
        </div>
        <div class="bva-fleet-nums">
          <span>Budget <strong>₹${U.fmt(budget)}</strong></span>
          <span>Actual <strong style="color:${fleetOver ? 'var(--red)' : 'var(--green)'};">₹${U.fmt(fleetActual)}</strong></span>
          <span class="bva-var ${fleetOver ? 'over' : 'under'}">
            ${fleetOver ? '▲ Over' : '▼ Under'} by ₹${U.fmt(Math.abs(fleetVar))}
          </span>
        </div>
      </div>
      <div class="bva-bar-wrap" style="margin-bottom:18px;">
        <div class="bva-bar-fill ${fleetOver ? 'over' : ''}" style="width:${fleetPct}%;"></div>
        <span class="bva-bar-pct">${fleetPct}%</span>
      </div>

      <!-- Per-vehicle rows -->
      <div class="bva-grid">
        ${rows.map(r => `
          <div class="bva-row">
            <div class="bva-vname">${r.v.name}</div>
            <div class="bva-progress">
              <div class="bva-bar-wrap bva-bar-sm">
                <div class="bva-bar-fill ${r.over ? 'over' : ''}" style="width:${r.pct}%;"></div>
                <span class="bva-bar-pct">${r.pct}%</span>
              </div>
            </div>
            <div class="bva-nums">
              <span style="color:var(--text-2);">₹${U.fmt(r.budgetPerVehicle)}</span>
              <span style="font-weight:600;color:${r.over ? 'var(--red)' : 'var(--text-1)'};">₹${U.fmt(r.actual)}</span>
              <span class="bva-var ${r.over ? 'over' : 'under'}" style="font-size:10px;">
                ${r.over ? '▲' : '▼'} ₹${U.fmt(Math.abs(r.variance))}
              </span>
            </div>
          </div>`).join('')}
      </div>
      <div style="margin-top:10px;font-size:10px;color:var(--text-3);text-align:right;">
        Budget split equally per vehicle · Expenses column uses all-time values (no date filter)
      </div>`;
  },

  /* ── Filter logs by vehicle card click ── */
  filterByVehicle(vehicleId) {
    const wasActive = this._activeVehicle === vehicleId;
    this._activeVehicle = wasActive ? null : vehicleId;

    // Show/hide clear button
    const clearBtn = document.getElementById('fuelClearFilter');
    if (clearBtn) clearBtn.style.display = this._activeVehicle ? 'inline-flex' : 'none';

    this.renderVehicleCostCards();
    this.renderFilteredFuel();
    this.renderFilteredExp();
  },

  clearVehicleFilter() {
    this._activeVehicle = null;
    const clearBtn = document.getElementById('fuelClearFilter');
    if (clearBtn) clearBtn.style.display = 'none';
    this.renderVehicleCostCards();
    this.renderFuel();
    this.renderExpenses();
  },

  renderFilteredFuel() {
    const vMap = Object.fromEntries(DB.vehicles.map(v => [v.id, v]));
    const logs = this._activeVehicle
      ? DB.fuelLogs.filter(f => f.vehicleId === this._activeVehicle)
      : DB.fuelLogs;
    document.getElementById('fuelTbody').innerHTML = logs.length
      ? logs.map(f => `
        <tr>
          <td class="fw-600">${vMap[f.vehicleId]?.name ?? 'Unknown'}</td>
          <td>${U.fmtDate(f.date)}</td>
          <td>${f.liters} L</td>
          <td>₹${U.fmt(f.cost)}</td>
          <td><button class="act-btn del" onclick="Fuel.delFuel('${f.id}')">Delete</button></td>
        </tr>`).join('')
      : `<tr class="empty-row"><td colspan="5">No fuel logs for this vehicle</td></tr>`;
  },

  renderFilteredExp() {
    const tMap = Object.fromEntries(DB.trips.map(t => [t.id, t]));
    const vMap = Object.fromEntries(DB.vehicles.map(v => [v.id, v]));
    const exps = this._activeVehicle
      ? DB.expenses.filter(e => e.vehicleId === this._activeVehicle)
      : DB.expenses;
    document.getElementById('expTbody').innerHTML = exps.length
      ? exps.map(e => {
          const trip = tMap[e.tripId];
          return `<tr>
            <td class="fw-600">${trip?.tripNo ?? '--'}</td>
            <td>${vMap[e.vehicleId]?.name ?? '--'}</td>
            <td>${U.fmt(e.toll || 0)}</td>
            <td>${U.fmt(e.other || 0)}</td>
            <td>${U.fmt(e.maintLinked || 0)}</td>
            <td>${trip ? U.badge(trip.status) : '--'}</td>
            <td><button class="act-btn del" onclick="Fuel.delExp('${e.id}')">Delete</button></td>
          </tr>`;
        }).join('')
      : `<tr class="empty-row"><td colspan="7">No expenses for this vehicle</td></tr>`;
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
  _rc: null, _cc: null, _bc: null, _tc: null,

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
    this.renderCostBreakdown();
    this.renderCostTrend();
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
  },

  /* ══ NEW: Cost Breakdown Doughnut ══ */
  renderCostBreakdown() {
    const ctx = document.getElementById('costBreakdownChart');
    if (!ctx) return;
    if (this._bc) { this._bc.destroy(); }

    const fuelCost  = DB.fuelLogs.reduce((s, f) => s + (f.cost  || 0), 0);
    const maintCost = DB.maintenance.reduce((s, m) => s + (m.cost || 0), 0);
    const tollCost  = DB.expenses.reduce((s, e) => s + (e.toll  || 0), 0);
    const otherCost = DB.expenses.reduce((s, e) => s + (e.other || 0), 0);
    const total     = fuelCost + maintCost + tollCost + otherCost;

    // Update center total
    const totalEl = document.getElementById('costBreakdownTotal');
    if (totalEl) totalEl.textContent = total > 0 ? '₹' + U.fmt(total) : '₹0';

    const categories = [
      { label: 'Fuel',        value: fuelCost,  color: '#3b82f6' },
      { label: 'Maintenance', value: maintCost, color: '#f43f5e' },
      { label: 'Toll',        value: tollCost,  color: '#f97316' },
      { label: 'Other',       value: otherCost, color: '#a855f7' },
    ].filter(c => c.value > 0);

    // Legend
    const legend = document.getElementById('costBreakdownLegend');
    if (legend) {
      legend.innerHTML = categories.map(c => {
        const pct = total > 0 ? ((c.value / total) * 100).toFixed(1) : 0;
        return `
          <div style="display:flex;flex-direction:column;gap:3px;">
            <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
              <div style="display:flex;align-items:center;gap:6px;">
                <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${c.color};"></span>
                <span style="font-size:12px;color:var(--text-2);">${c.label}</span>
              </div>
              <span style="font-size:11px;font-weight:700;color:var(--text-1);">₹${U.fmt(c.value)}</span>
            </div>
            <div style="height:4px;border-radius:3px;background:rgba(255,255,255,0.06);overflow:hidden;">
              <div style="height:100%;width:${pct}%;background:${c.color};border-radius:3px;transition:width 0.6s ease;"></div>
            </div>
            <div style="font-size:10px;color:var(--text-3);">${pct}% of total</div>
          </div>`;
      }).join('');
      if (categories.length === 0) {
        legend.innerHTML = '<p style="color:var(--text-3);font-size:12px;">No cost data yet. Log fuel, maintenance, or expenses to see breakdown.</p>';
      }
    }

    if (categories.length === 0) {
      // Draw empty state ring
      this._bc = new Chart(ctx, {
        type: 'doughnut',
        data: { labels: ['No data'], datasets: [{ data: [1], backgroundColor: ['rgba(255,255,255,0.05)'], borderWidth: 0 }] },
        options: { cutout: '72%', responsive: true, plugins: { legend: { display: false }, tooltip: { enabled: false } } }
      });
      return;
    }

    this._bc = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: categories.map(c => c.label),
        datasets: [{
          data: categories.map(c => c.value),
          backgroundColor: categories.map(c => c.color),
          borderColor: '#0d0d0d',
          borderWidth: 3,
          hoverOffset: 6,
        }]
      },
      options: {
        cutout: '72%',
        responsive: true,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: ctx => ` ₹${U.fmt(ctx.parsed)} (${((ctx.parsed/total)*100).toFixed(1)}%)`
            }
          }
        }
      }
    });
  },

  /* ══ NEW: Monthly Operational Cost Trend ══ */
  renderCostTrend() {
    const ctx = document.getElementById('costTrendChart');
    if (!ctx) return;
    if (this._tc) { this._tc.destroy(); }

    // Build last 8 calendar months
    const months = [];
    const labels = [];
    const now = new Date();
    for (let i = 7; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = d.toISOString().slice(0, 7);          // 'YYYY-MM'
      const lbl = d.toLocaleString('en-IN', { month: 'short', year: '2-digit' }); // 'Jul 25'
      months.push(key);
      labels.push(lbl);
    }

    const inMonth = (dateStr, key) => dateStr && dateStr.startsWith(key);

    const fuelByMonth  = months.map(m => DB.fuelLogs.filter(f => inMonth(f.date, m)).reduce((s, f) => s + (f.cost || 0), 0));
    const maintByMonth = months.map(m => DB.maintenance.filter(r => inMonth(r.date, m)).reduce((s, r) => s + (r.cost || 0), 0));
    const tollByMonth  = months.map(m => DB.expenses.reduce((s, e) => s + (e.toll  || 0), 0) / months.length); // approx
    const otherByMonth = months.map(m => DB.expenses.reduce((s, e) => s + (e.other || 0), 0) / months.length);

    const totalByMonth = months.map((_, i) => fuelByMonth[i] + maintByMonth[i] + (tollByMonth[i] || 0) + (otherByMonth[i] || 0));

    // Find spike month for annotation
    const maxVal = Math.max(...totalByMonth);
    const maxIdx = totalByMonth.indexOf(maxVal);

    const gridColor = 'rgba(255,255,255,0.04)';
    const tickColor = '#6b7280';

    this._tc = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Fuel',
            data: fuelByMonth,
            backgroundColor: 'rgba(59,130,246,0.15)',
            borderColor: '#3b82f6',
            borderWidth: 2,
            pointRadius: 3,
            fill: true,
            tension: 0.4,
          },
          {
            label: 'Maintenance',
            data: maintByMonth,
            backgroundColor: 'rgba(244,63,94,0.10)',
            borderColor: '#f43f5e',
            borderWidth: 2,
            pointRadius: 3,
            fill: true,
            tension: 0.4,
          },
          {
            label: 'Total',
            data: totalByMonth,
            backgroundColor: 'transparent',
            borderColor: '#d4930a',
            borderWidth: 2.5,
            borderDash: [5, 3],
            pointRadius: 4,
            pointBackgroundColor: '#d4930a',
            fill: false,
            tension: 0.4,
          },
        ]
      },
      options: {
        responsive: true,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: {
            display: true,
            labels: { color: '#9a9a9a', font: { size: 11 }, boxWidth: 12, padding: 16 }
          },
          tooltip: {
            callbacks: {
              label: ctx => ` ${ctx.dataset.label}: ₹${U.fmt(ctx.parsed.y)}`
            }
          },
          // Spike annotation via afterDraw
        },
        scales: {
          x: { grid: { color: gridColor }, ticks: { color: tickColor, font: { size: 11 } } },
          y: {
            grid: { color: gridColor },
            ticks: { color: tickColor, font: { size: 11 }, callback: v => '₹' + (v >= 1000 ? (v/1000).toFixed(0) + 'k' : v) }
          }
        }
      }
    });
  },

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

  // Trip vehicle/cargo change (inside the modal)
  document.getElementById('t-vehicle')?.addEventListener('change', () => Trips.onVehicleChange());
  document.getElementById('t-cargo')?.addEventListener('input',  () => Trips.validateCargo());

  // Modal backdrop close – Add Trip
  document.getElementById('addTripModal')?.addEventListener('click', e => {
    if (e.target === document.getElementById('addTripModal')) Trips.closeForm();
  });

  // Modal backdrop close – Driver Profile
  document.getElementById('driverProfileModal')?.addEventListener('click', e => {
    if (e.target === document.getElementById('driverProfileModal')) DriverProfile.close();
  });

  // Action modal backdrop close
  document.getElementById('actionModal')?.addEventListener('click', e => {
    if (e.target === document.getElementById('actionModal')) Trips.closeAction();
  });

  // Auto-refresh live board every 30 seconds
  setInterval(() => {
    const tripsPage = document.getElementById('pg-trips');
    if (tripsPage && tripsPage.classList.contains('active')) {
      Trips.renderLiveBoard();
      TripMap._renderMarkers();
    }
  }, 30000);

  // Start on dashboard
  Router.go('dashboard');
})();

/* ====================================================
   DRIVER PROFILE POPUP MODULE
   ==================================================== */
const DriverProfile = {

  /* ── Static review bank (keyed by driver id for realism) ── */
  _reviews: {
    d1: [
      { reviewer: 'Fleet Manager', stars: 5, date: 'Jun 2026', text: 'Alex is consistently punctual and handles cargo with great care. Zero incidents this quarter.' },
      { reviewer: 'Safety Officer', stars: 5, date: 'May 2026', text: 'Passed all compliance checks. Pre-trip inspection done without reminders.' },
    ],
    d2: [
      { reviewer: 'Fleet Manager', stars: 3, date: 'Mar 2026', text: 'Decent driver but license renewal was delayed. Needs to be more proactive on documentation.' },
      { reviewer: 'Dispatcher',    stars: 2, date: 'Feb 2026', text: 'Missed two scheduled pickups this month. Communication during trips needs improvement.' },
    ],
    d3: [
      { reviewer: 'Safety Officer', stars: 5, date: 'Jun 2026', text: 'Priya is our top performer. 99 safety score is well deserved — no violations in 2 years.' },
      { reviewer: 'Fleet Manager',  stars: 5, date: 'May 2026', text: 'Handles the heaviest routes flawlessly. Clients always request her for Surat corridor.' },
    ],
    d4: [
      { reviewer: 'Fleet Manager', stars: 4, date: 'Jun 2026', text: 'Suresh is reliable on HMV routes. Could improve on fuel efficiency slightly.' },
      { reviewer: 'Dispatcher',    stars: 4, date: 'Apr 2026', text: 'Always reachable and cooperative. Rarely needs follow-ups.' },
    ],
  },

  /* ── Generate a deterministic weekly schedule for any driver ── */
  _buildSchedule(driver) {
    const days  = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
    const today = new Date().getDay(); // 0=Sun … 6=Sat
    // Map JS day index to Mon-first index
    const todayMon = today === 0 ? 6 : today - 1;

    // Get this driver's trips
    const driverTrips = DB.trips.filter(t => t.driverId === driver.id);
    const hasActive   = driverTrips.some(t => t.status === 'Dispatched' || t.status === 'On Trip');

    return days.map((day, i) => {
      let pill, hours;
      if (driver.status === 'Suspended') {
        pill = 'suspended'; hours = '--';
      } else if (driver.status === 'Off Duty' && (i === 5 || i === 6)) {
        pill = 'off-duty'; hours = 'Off';
      } else if (hasActive && i === todayMon) {
        pill = 'booked'; hours = '8h';
      } else {
        // Use driver id + day index for stable pseudo-random schedule
        const seed = (driver.id.charCodeAt(driver.id.length - 1) + i) % 7;
        if (seed === 0 || seed === 4) { pill = 'off-duty'; hours = 'Off'; }
        else if (seed === 2 || seed === 5) { pill = 'booked'; hours = seed === 2 ? '6h' : '9h'; }
        else { pill = 'free'; hours = '—'; }
      }
      // Override if globally off-duty or suspended
      if (driver.status === 'Off Duty')  { pill = 'off-duty'; hours = 'Off'; }
      if (driver.status === 'Suspended') { pill = 'suspended'; hours = '--'; }
      if (driver.status === 'On Trip' && i === todayMon) { pill = 'booked'; hours = '8h'; }

      return { day, pill, hours, isToday: i === todayMon };
    });
  },

  /* ── Compute avg hrs/week based on trips completed ── */
  _avgHours(driver) {
    const trips = driver.tripsCompleted || 0;
    // Rough estimate: each trip ~5-8 hrs average
    return Math.min(56, Math.round((trips * 6.5) / Math.max(1, Math.ceil(trips / 8)))).toString();
  },

  /* ── Stars renderer ── */
  _stars(n) {
    return '★'.repeat(n) + '☆'.repeat(5 - n);
  },

  /* ── Open the popup ── */
  open(id) {
    const d = DB.getById(KEYS.DRIVERS, id);
    if (!d) return;

    const expired  = U.isExpired(d.expiry);
    const canEdit  = Auth.canEdit('drivers');
    const schedule = this._buildSchedule(d);
    const reviews  = this._reviews[d.id] || [];
    const freeDays = schedule.filter(s => s.pill === 'free').length;

    /* ─ Avatar initials ─ */
    const initials = d.name.split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase();
    document.getElementById('dpc-avatar').textContent = initials;

    /* ─ Header info ─ */
    document.getElementById('dpc-name').textContent = d.name;
    document.getElementById('dpc-meta').textContent =
      `${d.category} License · ${d.contact}`;
    document.getElementById('dpc-status-badge').innerHTML = U.badge(d.status);

    /* ─ Safety ring ─ */
    const score    = d.safetyScore || 0;
    const circ     = 150.8;
    const offset   = circ - (score / 100) * circ;
    const ringEl   = document.getElementById('dpc-ring-fill');
    ringEl.style.strokeDashoffset = circ; // reset for animation
    // Choose ring color by score
    const ringColor = score >= 90 ? 'var(--green)' : score >= 70 ? 'var(--orange)' : 'var(--red)';
    ringEl.style.stroke = ringColor;
    document.getElementById('dpc-ring-val').textContent = score;
    // Animate after a tick
    setTimeout(() => { ringEl.style.strokeDashoffset = offset; }, 60);

    /* ─ Stats row ─ */
    document.getElementById('dpc-trips').textContent    = d.tripsCompleted ?? 0;
    document.getElementById('dpc-hours').textContent    = this._avgHours(d);
    document.getElementById('dpc-category').textContent = d.category;
    document.getElementById('dpc-expiry-stat').innerHTML =
      expired
        ? `<span style="color:var(--red);font-size:11px;">EXPIRED</span>`
        : d.expiry ? d.expiry.slice(0, 7).replace('-', '/') : '--';

    /* ─ Details grid ─ */
    document.getElementById('dpc-details').innerHTML = [
      { label: 'License No',    val: d.licenseNo },
      { label: 'Contact',       val: d.contact },
      { label: 'Category',      val: d.category },
      { label: 'Safety Score',  val: `<span style="color:${ringColor};font-weight:700;">${score}/100</span>` },
      { label: 'Status',        val: U.badge(d.status) },
      { label: 'Trips Completed', val: d.tripsCompleted ?? 0 },
    ].map(item => `
      <div class="dpc-detail-item">
        <div class="dpc-detail-label">${item.label}</div>
        <div class="dpc-detail-val">${item.val}</div>
      </div>`).join('');

    /* ─ Reviews ─ */
    document.getElementById('dpc-reviews').innerHTML = reviews.length
      ? reviews.map(r => `
          <div class="dpc-review-card">
            <div class="dpc-review-top">
              <div>
                <span class="dpc-reviewer">${r.reviewer}</span>
                <span class="dpc-stars" style="margin-left:8px;">${this._stars(r.stars)}</span>
              </div>
              <span class="dpc-review-date">${r.date}</span>
            </div>
            <div class="dpc-review-text">${r.text}</div>
          </div>`).join('')
      : `<div class="dpc-review-card"><div class="dpc-review-text" style="color:var(--text-3);">No reviews yet.</div></div>`;

    /* ─ Weekly Schedule ─ */
    document.getElementById('dpc-week').innerHTML = schedule.map(s => `
      <div class="dpc-day-row${s.isToday ? ' today' : ''}">
        <span class="dpc-day-name">${s.day}${s.isToday ? ' ◀' : ''}</span>
        <span class="dpc-day-pill ${s.pill}">${
          s.pill === 'free'      ? '✓ Available' :
          s.pill === 'booked'    ? '⬤ On Duty'   :
          s.pill === 'off-duty'  ? '○ Off Duty'  :
                                   '✕ Suspended'
        }</span>
        <span class="dpc-day-hours">${s.hours}</span>
      </div>`).join('');

    /* ─ Booking section ─ */
    const bookSection = document.getElementById('dpc-book-section');
    const isAvail = d.status === 'Available';
    const isOnTrip = d.status === 'On Trip';
    const isSuspended = d.status === 'Suspended';

    if (isSuspended || expired) {
      bookSection.innerHTML = `
        <div class="dpc-book-title">⚠ Booking Blocked</div>
        <div class="dpc-book-msg">${expired ? 'License has expired and must be renewed before booking.' : 'Driver is suspended and cannot be assigned to trips.'}</div>
        ${canEdit ? `<div class="dpc-book-btns">
          <button class="dpc-book-btn secondary" onclick="DriverProfile._setStatus('${d.id}','Available')">Reinstate Driver</button>
        </div>` : ''}`;
    } else if (isOnTrip) {
      bookSection.innerHTML = `
        <div class="dpc-book-title">🚛 Currently On Trip</div>
        <div class="dpc-book-msg">${d.name} is currently assigned to an active trip. They will be available once the trip is completed.</div>
        <div class="dpc-book-btns">
          <button class="dpc-book-btn secondary" onclick="DriverProfile.close(); Router.go('trips');">View Active Trip</button>
        </div>`;
    } else if (isAvail && freeDays > 0) {
      bookSection.innerHTML = `
        <div class="dpc-book-title">✓ Available for Booking</div>
        <div class="dpc-book-msg">${d.name} has <strong style="color:var(--green);">${freeDays} free day(s)</strong> this week and is ready to be assigned to a trip.</div>
        ${canEdit ? `<div class="dpc-book-btns">
          <button class="dpc-book-btn primary" onclick="DriverProfile.close(); Router.go('trips');">Assign to Trip</button>
          <button class="dpc-book-btn danger" onclick="DriverProfile._setStatus('${d.id}','Off Duty')">Mark Off Duty</button>
          <button class="dpc-book-btn secondary" onclick="DriverProfile._setStatus('${d.id}','Suspended')">Suspend</button>
        </div>` : `<div class="dpc-book-msg" style="color:var(--text-3);font-style:italic;">You don't have edit permissions.</div>`}`;
    } else {
      bookSection.innerHTML = `
        <div class="dpc-book-title">○ Off Duty</div>
        <div class="dpc-book-msg">${d.name} is currently off duty. Mark them available to assign trips.</div>
        ${canEdit ? `<div class="dpc-book-btns">
          <button class="dpc-book-btn primary" onclick="DriverProfile._setStatus('${d.id}','Available')">Mark Available</button>
        </div>` : ''}`;
    }

    /* ─ Footer actions ─ */
    document.getElementById('dpc-footer').innerHTML = `
      ${canEdit ? `
        <button class="btn btn-secondary btn-sm" onclick="DriverProfile.close(); Drivers.openEdit('${d.id}');">✏ Edit Driver</button>
        <button class="btn btn-danger btn-sm" onclick="DriverProfile._delete('${d.id}')">🗑 Delete</button>
      ` : ''}
      <button class="btn btn-primary btn-sm" onclick="DriverProfile.close()">Close</button>`;

    /* ─ Show modal ─ */
    document.getElementById('driverProfileModal').classList.add('show');
  },

  _setStatus(id, status) {
    Drivers.setStatus(id, status);
    this.open(id); // refresh popup
  },

  _delete(id) {
    if (!confirm('Delete this driver? This cannot be undone.')) return;
    const active = DB.trips.find(t => t.driverId === id && (t.status === 'Dispatched' || t.status === 'On Trip'));
    if (active) { U.toast('Cannot delete a driver currently On Trip.', 'error'); return; }
    DB.remove(KEYS.DRIVERS, id);
    U.toast('Driver deleted.');
    this.close();
    Drivers.render();
  },

  close() {
    document.getElementById('driverProfileModal').classList.remove('show');
  },

  closeOnBackdrop(e) {
    if (e.target === document.getElementById('driverProfileModal')) this.close();
  },
};



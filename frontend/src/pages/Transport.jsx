import React, { useEffect, useState, useMemo } from 'react';
import { 
  Bus, MapPin, Users, Plus, Search, Edit2, Trash2, X, Save,
  TrendingUp, DollarSign, Navigation, Shield, ChevronRight,
  AlertCircle, CheckCircle, Clock, LayoutDashboard, Wrench, Receipt
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { backendRequest } from '../services/apiClient';

const EMPTY_ROUTE = { id: '', name: '', code: '', stops: '', distance: '', travelTime: '', fee: '' };
const EMPTY_BUS   = { id: '', reg: '', capacity: '', routeId: '', driverName: '', status: 'Active' };
const EMPTY_LIST = [];

const STATUS_COLORS = {
  Active:      { bg: 'rgba(16,185,129,0.12)', color: '#10b981', border: 'rgba(16,185,129,0.25)' },
  Maintenance: { bg: 'rgba(245,158,11,0.12)', color: '#f59e0b', border: 'rgba(245,158,11,0.25)' },
  Inactive:    { bg: 'rgba(239,68,68,0.12)',  color: '#ef4444', border: 'rgba(239,68,68,0.25)'  },
};

function StatusBadge({ status }) {
  const c = STATUS_COLORS[status] || STATUS_COLORS.Active;
  return (
    <span style={{
      padding: '4px 12px', borderRadius: '20px', fontSize: '11px', fontWeight: 800,
      letterSpacing: '0.5px', textTransform: 'uppercase',
      background: c.bg, color: c.color, border: `1.5px solid ${c.border}`
    }}>{status}</span>
  );
}

function StatCard({ icon: Icon, label, value, sub, tone = 'blue' }) {
  return (
    <article className={`dashboard-kpi-card tone-${tone}`}>
      <span className="dashboard-kpi-icon"><Icon size={22} /></span>
      <span className="dashboard-kpi-copy"><small>{label}</small><strong>{value}</strong>{sub && <em>{sub}</em>}</span>
    </article>
  );
}

export default function Transport({
  students = [], setStudents, routes: propRoutes = EMPTY_LIST, buses: propBuses = EMPTY_LIST,
  drivers: propDrivers = [], enrollments = [], setEnrollments, invoices = [],
  currency = '₵', convertAmount = v => v, allClasses = [], syncWithBackend,
  backendUrl, token, userRole = 'ADMIN', maintenanceRecords: propMaintenance = [], setMaintenanceRecords
}) {
  const [tab, setTab] = useState('dashboard');
  const [routes, setRoutes] = useState(propRoutes);
  const [buses,  setBuses]  = useState(propBuses);
  const [search, setSearch] = useState('');
  const [maintenanceRecords, setLocalMaintenance] = useState(propMaintenance);
  const [maintenanceForm, setMaintenanceForm] = useState({ busId: '', description: '', dueDate: '', status: 'scheduled' });
  const [invoiceState, setInvoiceState] = useState(invoices);
  const [transportMessage, setTransportMessage] = useState('');

  useEffect(() => setRoutes(propRoutes), [propRoutes]);
  useEffect(() => setBuses(propBuses), [propBuses]);
  useEffect(() => setLocalMaintenance(propMaintenance), [propMaintenance]);
  useEffect(() => setInvoiceState(invoices), [invoices]);

  const specializedRequest = async (path, options) => {
    const normalized = { ...options };
    if (typeof normalized.body === 'string') normalized.body = JSON.parse(normalized.body);
    return backendRequest(backendUrl, token, path, normalized);
  };

  // Route modal state
  const [showRouteModal, setShowRouteModal] = useState(false);
  const [editRoute, setEditRoute] = useState(null);
  const [routeForm, setRouteForm] = useState(EMPTY_ROUTE);
  const [routeErrors, setRouteErrors] = useState({});

  // Bus modal state
  const [showBusModal, setShowBusModal] = useState(false);
  const [editBus, setEditBus] = useState(null);
  const [busForm, setBusForm] = useState(EMPTY_BUS);
  const [busErrors, setBusErrors] = useState({});
  // Enrollment modal state
  const [showEnrollModal, setShowEnrollModal] = useState(false);
  const [enrollForm, setEnrollForm] = useState({
    mode: 'existing', // existing or new
    studentId: '',
    newName: '',
    newClass: '',
    newContact: '',
    routeId: '',
    pickupPoint: ''
  });
  const [selectedClass, setSelectedClass] = useState('');
  const [selectedStudentIds, setSelectedStudentIds] = useState({});
  const [studentSearch, setStudentSearch] = useState('');

  const uniqueClassesList = useMemo(() => {
    const list = [...new Set(students.map(s => s.class).filter(Boolean))];
    return list.sort((a, b) => a.localeCompare(b));
  }, [students]);

  const studentsInSelectedClass = useMemo(() => {
    if (!selectedClass) return [];
    return students
      .filter(s => s.class === selectedClass)
      .filter(s => {
        if (!studentSearch) return true;
        return s.name?.toLowerCase().includes(studentSearch.toLowerCase());
      })
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }, [students, selectedClass, studentSearch]);

  const closeEnrollModal = () => {
    setShowEnrollModal(false);
    setEnrollForm({ mode: 'existing', studentId: '', newName: '', newClass: '', newContact: '', routeId: '', pickupPoint: '' });
    setSelectedClass('');
    setSelectedStudentIds({});
    setStudentSearch('');
  };

  // Stats
  const activeEnrollments = enrollments.filter(e => e.status === 'active');
  const totalRevenue = activeEnrollments.reduce((s, e) => {
    const r = routes.find(x => x.id === e.routeId);
    return s + (parseFloat(r?.fee) || 0);
  }, 0);
  const activeBuses = buses.filter(b => b.status === 'Active').length;

  const chartData = useMemo(() =>
    routes.map(r => ({
      name: r.name?.split(' ')[0] || 'Route',
      students: activeEnrollments.filter(e => e.routeId === r.id).length,
      revenue: parseFloat(r.fee) || 0
    })), [routes, activeEnrollments]
  );

  // ---- Route CRUD ----
  const openRoute = (r = null) => {
    setEditRoute(r);
    setRouteForm(r ? { ...EMPTY_ROUTE, ...r } : { ...EMPTY_ROUTE, id: `r-${Date.now()}` });
    setRouteErrors({});
    setShowRouteModal(true);
  };
  const saveRoute = async () => {
    const normalizedCode = routeForm.code.trim();
    const errors = {};
    if (!routeForm.name.trim()) errors.name = 'Route name is required.';
    if (!normalizedCode) errors.code = 'Route code is required.';
    else if (routes.some(r => r.id !== editRoute?.id && (r.code || '').trim().toLowerCase() === normalizedCode.toLowerCase())) {
      errors.code = 'Route code must be unique.';
    }
    if (!(Number(routeForm.distance) > 0)) errors.distance = 'Enter a distance greater than 0.';
    if (!routeForm.travelTime.trim()) errors.travelTime = 'Travel time is required.';
    if (!(Number(routeForm.fee) > 0)) errors.fee = 'Enter a monthly fee greater than 0.';
    if (Object.keys(errors).length) {
      setRouteErrors(errors);
      return;
    }
    const cleanForm = { ...routeForm, name: routeForm.name.trim(), code: normalizedCode };
    if (!syncWithBackend) return setTransportMessage('Route persistence is unavailable.');
    const saved = await syncWithBackend('transportRoutes', cleanForm, editRoute ? 'update' : 'add', editRoute?.id || null);
    if (!saved) return setTransportMessage('The route was not saved.');
    setRoutes(editRoute ? routes.map(r => r.id === editRoute.id ? cleanForm : r) : [...routes, cleanForm]);
    setShowRouteModal(false);
  };
  const deleteRoute = async (id) => {
    const busCount = buses.filter(b => b.routeId === id).length;
    const enrollmentCount = enrollments.filter(e => e.routeId === id).length;
    if (busCount || enrollmentCount) {
      alert(`This route cannot be deleted because it is used by ${busCount} bus${busCount === 1 ? '' : 'es'} and ${enrollmentCount} enrollment${enrollmentCount === 1 ? '' : 's'}. Reassign or remove those records first.`);
      return;
    }
    if (!confirm('Delete this route?')) return;
    const saved = await syncWithBackend?.('transportRoutes', null, 'delete', id);
    if (!saved) return setTransportMessage('The route was not deleted.');
    setRoutes(routes.filter(r => r.id !== id));
  };

  // ---- Bus CRUD ----
  const openBus = (b = null) => {
    setEditBus(b);
    setBusForm(b ? { ...EMPTY_BUS, ...b } : { ...EMPTY_BUS, id: `b-${Date.now()}` });
    setBusErrors({});
    setShowBusModal(true);
  };
  const saveBus = async () => {
    const normalizedReg = busForm.reg.trim();
    const errors = {};
    if (!normalizedReg) errors.reg = 'Registration number is required.';
    else if (buses.some(b => b.id !== editBus?.id && (b.reg || '').trim().toLowerCase() === normalizedReg.toLowerCase())) {
      errors.reg = 'Registration number must be unique.';
    }
    if (!(Number(busForm.capacity) > 0)) errors.capacity = 'Enter a capacity greater than 0.';
    if (Object.keys(errors).length) {
      setBusErrors(errors);
      return;
    }
    const cleanForm = { ...busForm, reg: normalizedReg };
    if (!syncWithBackend) return setTransportMessage('Bus persistence is unavailable.');
    const saved = await syncWithBackend('buses', cleanForm, editBus ? 'update' : 'add', editBus?.id || null);
    if (!saved) return setTransportMessage('The bus was not saved.');
    setBuses(editBus ? buses.map(b => b.id === editBus.id ? cleanForm : b) : [...buses, cleanForm]);
    setShowBusModal(false);
  };
  const deleteBus = async (id) => {
    if (!confirm('Remove this bus?')) return;
    const saved = await syncWithBackend?.('buses', null, 'delete', id);
    if (!saved) return setTransportMessage('The bus was not removed.');
    setBuses(buses.filter(b => b.id !== id));
  };

  const persistEnrollment = async (enrollment, changes) => {
    try {
      if (!syncWithBackend) throw new Error('Transport enrollment persistence is unavailable.');
      const savedEnrollment = { ...enrollment, ...changes };
      const result = await syncWithBackend('studentTransport', savedEnrollment, 'update', enrollment.id);
      if (result === false) throw new Error('The backend rejected the enrollment update.');
      setEnrollments(items => items.map(item => item.id === enrollment.id ? savedEnrollment : item));
      setTransportMessage(navigator.onLine === false ? 'Enrollment update queued for synchronization.' : 'Enrollment updated.');
    } catch (error) { setTransportMessage(`${error.message} No enrollment changes were applied.`); }
  };

  const reassignEnrollment = (enrollment, routeId) => {
    persistEnrollment(enrollment, { routeId, updatedAt: new Date().toISOString() });
  };

  const removeEnrollment = (enrollment) => {
    if (!confirm('Remove this student from transport service?')) return;
    persistEnrollment(enrollment, { status: 'removed', removedAt: new Date().toISOString() });
  };

  const updateInvoiceStatus = async (invoice, status) => {
    try {
      const data = await specializedRequest(`/transport/invoices/${encodeURIComponent(invoice.id)}/status`, { method: 'POST', body: JSON.stringify({ status }) });
      setInvoiceState(items => items.map(item => item.id === invoice.id ? (data.item || item) : item));
      setTransportMessage(`Invoice marked ${status}.`);
    } catch (error) { setTransportMessage(`${error.message} Invoice status was not changed.`); }
  };

  const saveMaintenance = async () => {
    if (!maintenanceForm.busId || !maintenanceForm.description.trim()) return setTransportMessage('Select a bus and enter maintenance details.');
    try {
      const data = await specializedRequest('/transport/maintenance', { method: 'POST', body: JSON.stringify(maintenanceForm) });
      if (!data?.item) throw new Error('The backend did not return the scheduled maintenance item.');
      const updated = [...maintenanceRecords, data.item];
      setLocalMaintenance(updated);
      setMaintenanceRecords?.(updated);
      setTransportMessage('Maintenance item scheduled.');
    } catch (error) { setTransportMessage(`${error.message} Maintenance was not scheduled.`); }
    setMaintenanceForm({ busId: '', description: '', dueDate: '', status: 'scheduled' });
  };

  const updateMaintenanceStatus = async (record, status) => {
    try {
      const data = await specializedRequest(`/transport/maintenance/${encodeURIComponent(record.id)}/status`, { method: 'POST', body: JSON.stringify({ status }) });
      if (!data?.item) throw new Error('The backend did not return the updated maintenance item.');
      const updated = maintenanceRecords.map(item => item.id === record.id ? data.item : item);
      setLocalMaintenance(updated);
      setMaintenanceRecords?.(updated);
      setTransportMessage(`Maintenance marked ${status.replace('_', ' ')}.`);
    } catch (error) { setTransportMessage(`${error.message} Maintenance status was not changed.`); }
  };

  // ---- Enrollment CRUD ----
  const saveEnrollment = async () => {
    if (!enrollForm.routeId) return alert('Select a route');

    let updatedEnrollments = [...enrollments];

    // Handle new student creation
    if (enrollForm.mode === 'new') {
      if (!enrollForm.newName || !enrollForm.newClass) return alert('Fill name and class');
      const newId = Date.now().toString();
      const newSid = `SID-${Math.floor(1000 + Math.random() * 9000)}`;
      const newStudent = {
        id: newId,
        sid: newSid,
        name: enrollForm.newName.toUpperCase(),
        class: enrollForm.newClass,
        contact: enrollForm.newContact,
        status: 'active'
      };
      
      const studentSaved = await syncWithBackend?.('students', newStudent, 'add');
      if (!studentSaved) return setTransportMessage('The new student could not be saved, so enrollment was cancelled.');
      setStudents([...students, newStudent]);

      const newEnrollment = {
        id: `e-${Date.now()}`,
        studentId: newId,
        routeId: enrollForm.routeId,
        pickupPoint: enrollForm.pickupPoint,
        status: 'active',
        date: new Date().toISOString()
      };
      updatedEnrollments.push(newEnrollment);
    } else {
      // Existing mode: bulk enrollment via ticked checkboxes
      const selectedIds = Object.keys(selectedStudentIds).filter(id => selectedStudentIds[id]);
      if (selectedIds.length === 0) return alert('Select at least one student');

      const now = new Date().toISOString();
      const newEnrollmentsList = selectedIds.map((id, index) => ({
        id: `e-${Date.now()}-${index}`,
        studentId: id,
        routeId: enrollForm.routeId,
        pickupPoint: enrollForm.pickupPoint,
        status: 'active',
        date: now
      }));
      updatedEnrollments = [...updatedEnrollments, ...newEnrollmentsList];
    }

    const existingIds = new Set(enrollments.map(item => item.id));
    const newEnrollments = updatedEnrollments.filter(item => !existingIds.has(item.id));
    const results = await Promise.all(newEnrollments.map(item => syncWithBackend?.('studentTransport', item, 'add')));
    if (results.some(result => !result)) return setTransportMessage('One or more enrollments could not be saved. Refresh before trying again.');
    setEnrollments(updatedEnrollments);
    closeEnrollModal();
  };

  const filteredRoutes = routes.filter(r =>
    r.name?.toLowerCase().includes(search.toLowerCase()) ||
    r.code?.toLowerCase().includes(search.toLowerCase())
  );
  const normalizedSearch = search.trim().toLowerCase();
  const filteredBuses = buses.filter(b => {
    const route = routes.find(r => r.id === b.routeId);
    return !normalizedSearch || [b.reg, b.driverName, b.status, route?.name, route?.code]
      .some(value => (value || '').toLowerCase().includes(normalizedSearch));
  });
  const filteredEnrollments = activeEnrollments.filter(e => {
    const student = students.find(s => s.id === e.studentId);
    const route = routes.find(r => r.id === e.routeId);
    return !normalizedSearch || [student?.name, student?.sid, student?.class, route?.name, route?.code, e.pickupPoint]
      .some(value => (value || '').toLowerCase().includes(normalizedSearch));
  });

  const TABS = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'routes',    label: 'Routes', icon: MapPin },
    { id: 'fleet',     label: 'Fleet', icon: Bus },
    { id: 'students',  label: 'Students', icon: Users },
    { id: 'billing', label: 'Billing', icon: Receipt },
    { id: 'maintenance', label: 'Maintenance', icon: Wrench },
  ];

  return (
    <div className="view active" style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {/* Header */}
      <div className="view-header" style={{ marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 900, letterSpacing: '-0.5px', display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ width: 40, height: 40, borderRadius: 14, background: 'var(--accent-glow)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
              <Bus size={22} style={{ color: 'var(--accent)' }} />
            </span>
            Transport Management
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 4 }}>Fleet operations, route planning &amp; billing</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-secondary" onClick={() => setShowEnrollModal(true)}>
            <Users size={15} /> Enroll Student
          </button>
          <button className="btn btn-secondary" onClick={() => openBus()}>
            <Bus size={15} /> Add Bus
          </button>
          <button className="btn btn-primary" onClick={() => openRoute()}>
            <Plus size={15} /> New Route
          </button>
        </div>
      </div>
      {transportMessage && <div role="status" className="card" style={{ padding: 10, marginBottom: 14, fontSize: 12, fontWeight: 700 }}>{transportMessage}</div>}

      {/* Stats */}
      <div className="dashboard-kpi-grid" style={{ marginTop: 0, marginBottom: 24 }}>
        <StatCard icon={Users} label="Students Enrolled" value={activeEnrollments.length} sub="Using transport service" tone="blue" />
        <StatCard icon={Navigation} label="Active Routes" value={routes.length} sub={`${activeBuses} buses operating`} tone="blue" />
        <StatCard icon={Bus} label="Fleet Size" value={buses.length} sub={`${activeBuses} active`} tone="green" />
        <StatCard icon={DollarSign} label="Expected Monthly Revenue" value={`${currency}${convertAmount(totalRevenue).toLocaleString()}`} sub="From active enrollments" tone="amber" />
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, borderBottom: '2px solid var(--border-color)', marginBottom: 24 }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => { setTab(t.id); setSearch(''); }} style={{
            padding: '10px 20px', border: 'none', background: 'transparent', cursor: 'pointer',
            fontFamily: 'inherit', fontSize: 13, fontWeight: 700,
            color: tab === t.id ? 'var(--accent)' : 'var(--text-muted)',
            borderBottom: tab === t.id ? '2px solid var(--accent)' : '2px solid transparent',
            marginBottom: -2, transition: 'all 0.2s'
          }}><t.icon size={15} style={{ marginRight: 7, verticalAlign: 'middle' }} />{t.label}</button>
        ))}
      </div>

      {/* DASHBOARD */}
      {tab === 'dashboard' && (
        <div className="animate-fade-in transport-dashboard-grid">
          <div className="card" style={{ padding: 28 }}>
            <h3 style={{ fontWeight: 900, fontSize: 14, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 20 }}>
              Student Distribution by Route
            </h3>
            {chartData.length > 0 ? (
              <div style={{ width: '100%', height: 280 }}>
                <ResponsiveContainer>
                  <BarChart data={chartData} barSize={32}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-color)" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 11, fontWeight: 700, fill: 'var(--text-muted)' }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fontWeight: 700, fill: 'var(--text-muted)' }} />
                    <Tooltip
                      contentStyle={{ borderRadius: 12, border: '1px solid var(--border-color)', boxShadow: 'var(--shadow-lg)', fontFamily: 'inherit', fontWeight: 700, fontSize: 12 }}
                      cursor={{ fill: 'var(--accent-glow)' }}
                    />
                    <Bar dataKey="students" name="Students" radius={[8, 8, 0, 0]}>
                      {chartData.map((_, i) => <Cell key={i} fill={i % 2 === 0 ? 'var(--accent)' : '#0ea5e9'} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div style={{ height: 200, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', gap: 12 }}>
                <Navigation size={40} style={{ opacity: 0.3 }} />
                <p style={{ fontSize: 13, fontWeight: 700 }}>Add routes to see distribution data</p>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="card" style={{ padding: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                <Shield size={20} style={{ color: '#10b981' }} />
                <h3 style={{ fontWeight: 900, fontSize: 14 }}>Fleet Health</h3>
              </div>
              {['Active', 'Maintenance', 'Inactive'].map(s => {
                const count = buses.filter(b => b.status === s).length;
                return (
                  <div key={s} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--border-color)' }}>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{s}</span>
                    <StatusBadge status={s} />
                  </div>
                );
              })}
              {buses.length === 0 && <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 12, fontStyle: 'italic' }}>No buses registered yet.</p>}
            </div>

            <div className="card" style={{ padding: 24 }}>
              <h3 style={{ fontWeight: 900, fontSize: 14, marginBottom: 16 }}>Quick Actions</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <button className="btn btn-secondary" style={{ justifyContent: 'flex-start', gap: 10 }} onClick={() => { setTab('routes'); openRoute(); }}>
                  <Plus size={14} /> Create New Route
                </button>
                <button className="btn btn-secondary" style={{ justifyContent: 'flex-start', gap: 10 }} onClick={() => { setTab('fleet'); openBus(); }}>
                  <Bus size={14} /> Register Bus
                </button>
                <button className="btn btn-secondary" style={{ justifyContent: 'flex-start', gap: 10 }} onClick={() => setTab('students')}>
                  <Users size={14} /> Enroll Students
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ROUTES */}
      {tab === 'routes' && (
        <div className="animate-fade-in">
          <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
            <div style={{ position: 'relative', flex: 1, maxWidth: 360 }}>
              <Search size={15} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search routes..."
                style={{ width: '100%', padding: '10px 14px 10px 40px', border: '1.5px solid var(--border-color)', borderRadius: 12, fontFamily: 'inherit', fontSize: 13, fontWeight: 600, background: 'var(--bg-page)', color: 'var(--text-main)' }} />
            </div>
          </div>

          {filteredRoutes.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: 60 }}>
              <MapPin size={48} style={{ color: 'var(--text-muted)', opacity: 0.3, margin: '0 auto 16px' }} />
              <h3 style={{ fontWeight: 800, fontSize: 18 }}>No Routes Yet</h3>
              <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: '8px 0 20px' }}>Create your first bus route to get started.</p>
              <button className="btn btn-primary" onClick={() => openRoute()}><Plus size={15} /> Create Route</button>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 20 }}>
              {filteredRoutes.map(route => {
                const enrolled = activeEnrollments.filter(e => e.routeId === route.id).length;
                const routeBuses = buses.filter(b => b.routeId === route.id && b.status !== 'Inactive');
                const bus = routeBuses[0];
                const capacity = routeBuses.reduce((sum, item) => sum + (Number(item.capacity) || 0), 0);
                const utilization = capacity ? Math.round(enrolled / capacity * 100) : null;
                return (
                  <div key={route.id} className="card" style={{ padding: 24, position: 'relative', overflow: 'hidden' }}>
                    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 4, background: 'linear-gradient(90deg, var(--accent), #0ea5e9)' }} />
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                      <div>
                        <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 4 }}>{route.code}</div>
                        <h4 style={{ fontWeight: 900, fontSize: 16, letterSpacing: '-0.3px' }}>{route.name}</h4>
                      </div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="btn btn-icon btn-secondary" aria-label={`Edit route ${route.name}`} onClick={() => openRoute(route)}><Edit2 size={13} /></button>
                        <button className="btn btn-icon btn-secondary" aria-label={`Delete route ${route.name}`} style={{ color: 'var(--danger)' }} onClick={() => deleteRoute(route.id)}><Trash2 size={13} /></button>
                      </div>
                    </div>
                    <div style={{ marginBottom: 14 }}>
                      <div className="flex-between" style={{ fontSize: 11, fontWeight: 800 }}><span>Route capacity</span><span style={{ color: utilization > 100 ? '#ef4444' : utilization >= 85 ? '#f59e0b' : '#10b981' }}>{capacity ? `${enrolled}/${capacity} seats (${utilization}%)` : 'No bus capacity assigned'}</span></div>
                      <div style={{ height: 7, background: 'var(--border-color)', borderRadius: 9, overflow: 'hidden', marginTop: 6 }}><div style={{ width: `${Math.min(100, utilization || 0)}%`, height: '100%', background: utilization > 100 ? '#ef4444' : utilization >= 85 ? '#f59e0b' : '#10b981' }} /></div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
                      {[['Distance', `${route.distance} km`], ['Travel Time', route.travelTime], ['Students', enrolled], ['Monthly Fee', `${currency}${route.fee}`]].map(([k, v]) => (
                        <div key={k} style={{ padding: '10px 12px', background: 'var(--bg-page)', borderRadius: 10, border: '1px solid var(--border-color)' }}>
                          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{k}</div>
                          <div style={{ fontWeight: 800, fontSize: 14, marginTop: 2 }}>{v || '—'}</div>
                        </div>
                      ))}
                    </div>
                    {route.stops && (
                      <div style={{ padding: '8px 12px', background: 'var(--accent-glow)', borderRadius: 8 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)' }}>STOPS: </span>
                        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)' }}>{route.stops}</span>
                      </div>
                    )}
                    {bus && (
                      <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Bus size={13} style={{ color: 'var(--text-muted)' }} />
                        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)' }}>{bus.reg} · Driver: {bus.driverName || 'TBD'}</span>
                      </div>
                    )}
                    {(route.latitude != null && route.longitude != null) || (route.lat != null && route.lng != null) ? <a href={`https://www.openstreetmap.org/?mlat=${route.latitude ?? route.lat}&mlon=${route.longitude ?? route.lng}#map=15/${route.latitude ?? route.lat}/${route.longitude ?? route.lng}`} target="_blank" rel="noreferrer" style={{ display: 'inline-block', marginTop: 10, fontSize: 11, fontWeight: 700, color: 'var(--accent)' }}>Open route coordinates</a> : <p style={{ margin: '10px 0 0', fontSize: 11, color: 'var(--text-muted)' }}>Map unavailable: no route coordinates recorded.</p>}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* FLEET */}
      {tab === 'fleet' && (
        <div className="animate-fade-in">
          <div style={{ position: 'relative', maxWidth: 360, marginBottom: 20 }}>
            <Search size={15} aria-hidden="true" style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <label htmlFor="fleet-search" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>Search fleet</label>
            <input id="fleet-search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search registration, driver, route or status..."
              style={{ width: '100%', padding: '10px 14px 10px 40px', border: '1.5px solid var(--border-color)', borderRadius: 12, fontFamily: 'inherit', fontSize: 13, fontWeight: 600, background: 'var(--bg-page)', color: 'var(--text-main)' }} />
          </div>
          {buses.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: 60 }}>
              <Bus size={48} style={{ color: 'var(--text-muted)', opacity: 0.3, margin: '0 auto 16px' }} />
              <h3 style={{ fontWeight: 800, fontSize: 18 }}>No Buses Registered</h3>
              <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: '8px 0 20px' }}>Register your fleet to begin tracking.</p>
              <button className="btn btn-primary" onClick={() => openBus()}><Plus size={15} /> Add Bus</button>
            </div>
          ) : filteredBuses.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>No buses match your search.</div>
          ) : (
            <div className="card table-responsive" style={{ padding: 0 }}>
              <table className="table" style={{ marginTop: 0 }}>
                <thead>
                  <tr>
                    {['Registration', 'Capacity', 'Assigned Route', 'Driver', 'Status', ''].map(h => (
                      <th key={h}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredBuses.map(bus => {
                    const route = routes.find(r => r.id === bus.routeId);
                    return (
                      <tr key={bus.id}>
                        <td><span style={{ fontWeight: 800, fontSize: 13 }}>{bus.reg}</span></td>
                        <td><span style={{ fontWeight: 700 }}>{bus.capacity} seats</span></td>
                        <td><span style={{ fontWeight: 700, color: 'var(--accent)' }}>{route?.name || '—'}</span></td>
                        <td>{bus.driverName || '—'}</td>
                        <td><StatusBadge status={bus.status} /></td>
                        <td>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button className="btn btn-icon btn-secondary" aria-label={`Edit bus ${bus.reg}`} onClick={() => openBus(bus)}><Edit2 size={13} /></button>
                            <button className="btn btn-icon btn-secondary" aria-label={`Delete bus ${bus.reg}`} style={{ color: 'var(--danger)' }} onClick={() => deleteBus(bus.id)}><Trash2 size={13} /></button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* STUDENTS */}
      {tab === 'students' && (
        <div className="animate-fade-in">
          <div style={{ position: 'relative', maxWidth: 360, marginBottom: 20 }}>
            <Search size={15} aria-hidden="true" style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <label htmlFor="transport-student-search" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>Search enrolled students</label>
            <input id="transport-student-search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search student, class, route or pickup point..."
              style={{ width: '100%', padding: '10px 14px 10px 40px', border: '1.5px solid var(--border-color)', borderRadius: 12, fontFamily: 'inherit', fontSize: 13, fontWeight: 600, background: 'var(--bg-page)', color: 'var(--text-main)' }} />
          </div>
          {activeEnrollments.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: 60 }}>
              <Users size={48} style={{ color: 'var(--text-muted)', opacity: 0.3, margin: '0 auto 16px' }} />
              <h3 style={{ fontWeight: 800, fontSize: 18 }}>No Students Enrolled</h3>
              <p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 8 }}>Enroll students to begin tracking bus usage.</p>
              <button className="btn btn-primary mt-4" onClick={() => setShowEnrollModal(true)}>
                <Plus size={16} /> Enroll Now
              </button>
            </div>
          ) : filteredEnrollments.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>No enrolled students match your search.</div>
          ) : (
            <div className="card table-responsive" style={{ padding: 0 }}>
              <table className="table" style={{ marginTop: 0 }}>
                <thead><tr>{['Student', 'Route', 'Pickup Point', 'Monthly Fee', 'Status', 'Actions'].map(h => <th key={h}>{h}</th>)}</tr></thead>
                <tbody>
                  {filteredEnrollments.map((e, i) => {
                    const student = students.find(s => s.id === e.studentId);
                    const route   = routes.find(r => r.id === e.routeId);
                    return (
                      <tr key={i}>
                        <td style={{ fontWeight: 800 }}>{student?.name || 'Unknown'}</td>
                        <td style={{ fontWeight: 700, color: 'var(--accent)' }}>{route?.name || '—'}</td>
                        <td>{e.pickupPoint || '—'}</td>
                        <td style={{ fontWeight: 800 }}>{currency}{route?.fee || '—'}</td>
                        <td><StatusBadge status="Active" /></td>
                        <td><div style={{ display: 'flex', gap: 6, alignItems: 'center' }}><select aria-label={`Reassign ${student?.name || 'student'}`} value={e.routeId} onChange={event => reassignEnrollment(e, event.target.value)}>{routes.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select><button className="btn btn-icon btn-secondary" aria-label={`Remove ${student?.name || 'student'} from transport`} onClick={() => removeEnrollment(e)}><Trash2 size={13} /></button></div></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === 'billing' && <div className="animate-fade-in card table-responsive" style={{ padding: 0 }}>
        {invoiceState.length ? <table className="table" style={{ margin: 0 }}><thead><tr><th>Invoice</th><th>Student</th><th>Amount</th><th>Due</th><th>Status</th></tr></thead><tbody>{invoiceState.map(invoice => { const student = students.find(s => s.id === invoice.studentId); return <tr key={invoice.id}><td style={{ fontWeight: 800 }}>{invoice.number || invoice.invoiceNumber || invoice.id}</td><td>{student?.name || invoice.studentName || 'Unknown'}</td><td>{currency}{convertAmount(Number(invoice.amount || invoice.total || 0)).toLocaleString()}</td><td>{invoice.dueDate || '—'}</td><td><select value={invoice.status || 'pending'} onChange={e => updateInvoiceStatus(invoice, e.target.value)}><option value="pending">Pending</option><option value="paid">Paid</option><option value="overdue">Overdue</option><option value="void">Void</option></select></td></tr>; })}</tbody></table> : <div style={{ padding: 50, textAlign: 'center', color: 'var(--text-muted)' }}>No transport invoices available.</div>}
      </div>}

      {tab === 'maintenance' && <div className="animate-fade-in" style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, .7fr) minmax(320px, 1.3fr)', gap: 20 }}>
        <div className="card" style={{ padding: 22 }}><h3 style={{ marginBottom: 16 }}>Schedule Maintenance</h3><div className="form-group"><label>Bus</label><select value={maintenanceForm.busId} onChange={e => setMaintenanceForm(p => ({ ...p, busId: e.target.value }))}><option value="">Select bus</option>{buses.map(bus => <option key={bus.id} value={bus.id}>{bus.reg}</option>)}</select></div><div className="form-group"><label>Work required</label><textarea rows="3" value={maintenanceForm.description} onChange={e => setMaintenanceForm(p => ({ ...p, description: e.target.value }))} /></div><div className="form-group"><label>Due date</label><input type="date" value={maintenanceForm.dueDate} onChange={e => setMaintenanceForm(p => ({ ...p, dueDate: e.target.value }))} /></div><button className="btn btn-primary" onClick={saveMaintenance}><Wrench size={14} /> Schedule</button></div>
        <div className="card" style={{ padding: 22 }}><h3 style={{ marginBottom: 16 }}>Maintenance Log</h3>{maintenanceRecords.length ? maintenanceRecords.map(record => { const bus = buses.find(item => item.id === record.busId); return <div key={record.id} className="flex-between" style={{ padding: '12px 0', borderBottom: '1px solid var(--border-color)', gap: 12 }}><div><strong>{bus?.reg || 'Unknown bus'}</strong><p style={{ margin: '3px 0', fontSize: 12 }}>{record.description}</p><small>{record.dueDate || 'No due date'}</small></div><select value={record.status || 'scheduled'} onChange={e => updateMaintenanceStatus(record, e.target.value)}><option value="scheduled">Scheduled</option><option value="in_progress">In progress</option><option value="completed">Completed</option></select></div>; }) : <p style={{ color: 'var(--text-muted)' }}>No maintenance history.</p>}</div>
      </div>}

      {/* ---- ROUTE MODAL ---- */}
      {showRouteModal && (
        <div className="modal" role="presentation">
          <div className="modal-content card" role="dialog" aria-modal="true" aria-labelledby="route-modal-title" style={{ maxWidth: '550px', width: '95%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
              <h3 id="route-modal-title" style={{ fontWeight: 900, fontSize: 18 }}>{editRoute ? 'Edit Route' : 'New Route'}</h3>
              <button className="btn btn-icon btn-secondary" aria-label="Close route dialog" onClick={() => setShowRouteModal(false)}><X size={16} /></button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              {[
                { label: 'Route Name', key: 'name', placeholder: 'e.g. Accra Central Route' },
                { label: 'Route Code', key: 'code', placeholder: 'e.g. RT-001' },
                { label: 'Distance (km)', key: 'distance', placeholder: 'e.g. 12.5', type: 'number' },
                { label: 'Est. Travel Time', key: 'travelTime', placeholder: 'e.g. 45 mins' },
                { label: `Monthly Fee (${currency})`, key: 'fee', placeholder: 'e.g. 120', type: 'number' },
              ].map(f => (
                <div key={f.key} className="form-group" style={{ marginBottom: 0 }}>
                  <label htmlFor={`route-${f.key}`}>{f.label} *</label>
                  <input id={`route-${f.key}`} type={f.type || 'text'} min={f.type === 'number' ? '0.01' : undefined} step={f.type === 'number' ? 'any' : undefined} placeholder={f.placeholder}
                    value={routeForm[f.key]} aria-invalid={!!routeErrors[f.key]} aria-describedby={routeErrors[f.key] ? `route-${f.key}-error` : undefined}
                    onChange={e => { setRouteForm(p => ({ ...p, [f.key]: e.target.value })); setRouteErrors(p => ({ ...p, [f.key]: '' })); }} />
                  {routeErrors[f.key] && <span id={`route-${f.key}-error`} role="alert" style={{ color: 'var(--danger)', fontSize: 11, fontWeight: 700 }}>{routeErrors[f.key]}</span>}
                </div>
              ))}
              <div className="form-group" style={{ marginBottom: 0, gridColumn: '1 / -1' }}>
                <label>Pickup Stops (comma-separated)</label>
                <input type="text" placeholder="Stop 1, Stop 2, Stop 3..."
                  value={routeForm.stops} onChange={e => setRouteForm(p => ({ ...p, stops: e.target.value }))} />
              </div>
            </div>
            <div className="modal-actions" style={{ marginTop: 24 }}>
              <button className="btn btn-secondary" onClick={() => setShowRouteModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={saveRoute}><Save size={15} /> Save Route</button>
            </div>
          </div>
        </div>
      )}

      {/* ---- BUS MODAL ---- */}
      {showBusModal && (
        <div className="modal" role="presentation">
          <div className="modal-content card" role="dialog" aria-modal="true" aria-labelledby="bus-modal-title" style={{ maxWidth: '500px', width: '95%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
              <h3 id="bus-modal-title" style={{ fontWeight: 900, fontSize: 18 }}>{editBus ? 'Edit Bus' : 'Register Bus'}</h3>
              <button className="btn btn-icon btn-secondary" aria-label="Close bus dialog" onClick={() => setShowBusModal(false)}><X size={16} /></button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              {[
                { label: 'Registration No.', key: 'reg', placeholder: 'e.g. GH-1234-21' },
                { label: 'Capacity (seats)', key: 'capacity', placeholder: 'e.g. 45', type: 'number' },
                { label: 'Driver Name', key: 'driverName', placeholder: 'e.g. Kofi Mensah' },
              ].map(f => (
                <div key={f.key} className="form-group" style={{ marginBottom: 0 }}>
                  <label htmlFor={`bus-${f.key}`}>{f.label}{['reg', 'capacity'].includes(f.key) ? ' *' : ''}</label>
                  <input id={`bus-${f.key}`} type={f.type || 'text'} min={f.type === 'number' ? '1' : undefined} step={f.type === 'number' ? '1' : undefined} placeholder={f.placeholder}
                    value={busForm[f.key]} aria-invalid={!!busErrors[f.key]} aria-describedby={busErrors[f.key] ? `bus-${f.key}-error` : undefined}
                    onChange={e => { setBusForm(p => ({ ...p, [f.key]: e.target.value })); setBusErrors(p => ({ ...p, [f.key]: '' })); }} />
                  {busErrors[f.key] && <span id={`bus-${f.key}-error`} role="alert" style={{ color: 'var(--danger)', fontSize: 11, fontWeight: 700 }}>{busErrors[f.key]}</span>}
                </div>
              ))}
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Assigned Route</label>
                <select value={busForm.routeId} onChange={e => setBusForm(p => ({ ...p, routeId: e.target.value }))}>
                  <option value="">— None —</option>
                  {routes.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Status</label>
                <select value={busForm.status} onChange={e => setBusForm(p => ({ ...p, status: e.target.value }))}>
                  <option>Active</option>
                  <option>Maintenance</option>
                  <option>Inactive</option>
                </select>
              </div>
            </div>
            <div className="modal-actions" style={{ marginTop: 24 }}>
              <button className="btn btn-secondary" onClick={() => setShowBusModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={saveBus}><Save size={15} /> Save Bus</button>
            </div>
          </div>
        </div>
      )}

      {/* ---- ENROLLMENT MODAL ---- */}
      {showEnrollModal && (
        <div className="modal" role="presentation">
          <div className="modal-content card" role="dialog" aria-modal="true" aria-labelledby="enrollment-modal-title" style={{ maxWidth: '500px', width: '95%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
              <h3 id="enrollment-modal-title" style={{ fontWeight: 900, fontSize: 18 }}>Transport Enrollment</h3>
              <button className="btn btn-icon btn-secondary" aria-label="Close enrollment dialog" onClick={closeEnrollModal}><X size={16} /></button>
            </div>

            <div style={{ display: 'flex', gap: 4, background: 'var(--bg-page)', padding: 4, borderRadius: 12, marginBottom: 20 }}>
              <button 
                onClick={() => setEnrollForm(p => ({ ...p, mode: 'existing' }))}
                style={{
                  flex: 1, padding: '8px', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                  background: enrollForm.mode === 'existing' ? 'var(--bg-card)' : 'transparent',
                  color: enrollForm.mode === 'existing' ? 'var(--accent)' : 'var(--text-muted)',
                  boxShadow: enrollForm.mode === 'existing' ? 'var(--shadow-sm)' : 'none'
                }}
              >Select Existing</button>
              {userRole === 'ADMIN' && <button 
                onClick={() => setEnrollForm(p => ({ ...p, mode: 'new' }))}
                style={{
                  flex: 1, padding: '8px', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                  background: enrollForm.mode === 'new' ? 'var(--bg-card)' : 'transparent',
                  color: enrollForm.mode === 'new' ? 'var(--accent)' : 'var(--text-muted)',
                  boxShadow: enrollForm.mode === 'new' ? 'var(--shadow-sm)' : 'none'
                }}
              >Create New</button>}
            </div>

            {enrollForm.mode === 'existing' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 12 }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>Select Class</label>
                  <select value={selectedClass} onChange={e => {
                    setSelectedClass(e.target.value);
                    setSelectedStudentIds({});
                    setStudentSearch('');
                  }}>
                    <option value="">— Choose Class —</option>
                    {uniqueClassesList.map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>

                {selectedClass && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <input 
                        type="text" 
                        placeholder="Search student in class..." 
                        value={studentSearch} 
                        onChange={e => setStudentSearch(e.target.value)} 
                        style={{
                          flex: 1,
                          padding: '8px 12px',
                          border: '1.5px solid var(--border-color)',
                          borderRadius: 8,
                          fontFamily: 'inherit',
                          fontSize: 12,
                          background: 'var(--bg-page)',
                          color: 'var(--text-main)',
                          height: '38px',
                          boxSizing: 'border-box'
                        }}
                      />
                      {studentsInSelectedClass.length > 0 && (
                        <button 
                          type="button" 
                          className="btn btn-secondary" 
                          style={{ padding: '8px 12px', minWidth: 'auto', fontSize: 11, height: '38px' }}
                          onClick={() => {
                            const allNonEnrolled = studentsInSelectedClass.filter(s => 
                              !enrollments.some(e => e.studentId === s.id && e.status === 'active')
                            );
                            const allChecked = allNonEnrolled.every(s => selectedStudentIds[s.id]);
                            const nextSelected = { ...selectedStudentIds };
                            allNonEnrolled.forEach(s => {
                              nextSelected[s.id] = !allChecked;
                            });
                            setSelectedStudentIds(nextSelected);
                          }}
                        >
                          {studentsInSelectedClass.filter(s => 
                            !enrollments.some(e => e.studentId === s.id && e.status === 'active')
                          ).every(s => selectedStudentIds[s.id]) ? 'Deselect All' : 'Select All'}
                        </button>
                      )}
                    </div>

                    <div style={{
                      maxHeight: '180px',
                      overflowY: 'auto',
                      border: '1.5px solid var(--border-color)',
                      borderRadius: 12,
                      padding: 10,
                      background: 'rgba(255, 255, 255, 0.02)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 6
                    }}>
                      {studentsInSelectedClass.length === 0 ? (
                        <p style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', margin: '20px 0' }}>
                          No students found in this class.
                        </p>
                      ) : (
                        studentsInSelectedClass.map(s => {
                          const isEnrolled = enrollments.some(e => e.studentId === s.id && e.status === 'active');
                          const isChecked = !!selectedStudentIds[s.id];
                          return (
                            <label 
                              key={s.id} 
                              style={{ 
                                display: 'flex', 
                                alignItems: 'center', 
                                gap: 10, 
                                padding: '8px 10px', 
                                borderRadius: 8, 
                                background: isEnrolled ? 'rgba(0,0,0,0.1)' : isChecked ? 'var(--accent-glow)' : 'transparent',
                                border: '1px solid',
                                borderColor: isChecked ? 'rgba(99,102,241,0.2)' : 'transparent',
                                cursor: isEnrolled ? 'not-allowed' : 'pointer',
                                transition: 'all 0.15s ease'
                              }}
                            >
                              <input 
                                type="checkbox" 
                                checked={isEnrolled || isChecked}
                                disabled={isEnrolled}
                                onChange={e => {
                                  setSelectedStudentIds(p => ({
                                    ...p,
                                    [s.id]: e.target.checked
                                  }));
                                }}
                                style={{ width: 16, height: 16, cursor: isEnrolled ? 'not-allowed' : 'pointer' }}
                              />
                              <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
                                <span style={{ fontSize: 13, fontWeight: 700, color: isEnrolled ? 'var(--text-muted)' : 'var(--text-main)' }}>
                                  {s.name}
                                </span>
                                {isEnrolled && (
                                  <span style={{ 
                                    fontSize: 9, 
                                    fontWeight: 800, 
                                    textTransform: 'uppercase', 
                                    padding: '2px 6px', 
                                    borderRadius: 6,
                                    background: 'rgba(255,255,255,0.05)',
                                    color: 'var(--text-muted)' 
                                  }}>
                                    On Bus
                                  </span>
                                )}
                              </div>
                            </label>
                          );
                        })
                      )}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>Full Name</label>
                  <input placeholder="e.g. EBENEZER ASHONG" value={enrollForm.newName} onChange={e => setEnrollForm(p => ({ ...p, newName: e.target.value }))} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label>Class</label>
                    <select value={enrollForm.newClass} onChange={e => setEnrollForm(p => ({ ...p, newClass: e.target.value }))}>
                      <option value="">— Select —</option>
                      {allClasses.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label>Contact</label>
                    <input placeholder="Phone No." value={enrollForm.newContact} onChange={e => setEnrollForm(p => ({ ...p, newContact: e.target.value }))} />
                  </div>
                </div>
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="form-group">
                <label>Assign Route</label>
                <select value={enrollForm.routeId} onChange={e => setEnrollForm(p => ({ ...p, routeId: e.target.value }))}>
                  <option value="">— Select —</option>
                  {routes.map(r => <option key={r.id} value={r.id}>{r.name} ({currency}{r.fee})</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Pickup Point</label>
                <input placeholder="e.g. Junction Bus Stop" value={enrollForm.pickupPoint} onChange={e => setEnrollForm(p => ({ ...p, pickupPoint: e.target.value }))} />
              </div>
            </div>

            <div className="modal-actions" style={{ marginTop: 24 }}>
              <button className="btn btn-secondary" onClick={closeEnrollModal}>Cancel</button>
              <button className="btn btn-primary" onClick={saveEnrollment}><Save size={15} /> Confirm Enrollment</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

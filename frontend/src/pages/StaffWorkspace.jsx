import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  LayoutDashboard, CheckCircle, XCircle, Clock, AlertCircle, Upload,
  FileText, Award, TrendingUp, Bell, Star, ChevronDown, ChevronUp,
  User, Shield, BookOpen, ClipboardCheck, BarChart2, CalendarDays,
  MapPin, Wifi, Monitor, Smartphone, ThumbsUp, ThumbsDown, RotateCcw,
  Plus, X, CheckSquare, Loader, Send, Eye, Filter, Download, Briefcase,
  MessageSquare, Flag, Target, Sparkles, Zap, Paperclip, ArrowRight
} from 'lucide-react';
import { backendRequest } from '../services/apiClient';

// ─────────────────────────────────────────────
// CONSTANTS & HELPERS
// ─────────────────────────────────────────────

const TEACHING_ROLES = ['TEACHER', 'HEAD TEACHER', 'ASSISTANT HEAD TEACHER', 'HEAD', 'INSTRUCTOR', 'CLASS TEACHER', 'SUBJECT TEACHER', 'FLOATING TEACHER'];

const isTeacher = (role = '') => {
  const r = role.toUpperCase();
  return TEACHING_ROLES.some(t => r.includes(t.split(' ')[0]));
};

const todayStr = () => new Date().toISOString().split('T')[0];
const nowStr = () => new Date().toTimeString().slice(0, 5);
const ts = () => new Date().toISOString();
const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

const workflowRequest = (backendUrl, token, collection, id, action) => backendRequest(
  backendUrl,
  token,
  `/workflows/${encodeURIComponent(collection)}/${encodeURIComponent(id)}/${action}`,
  { method: 'POST', body: {} }
);

const syncChange = async (syncWithBackend, collection, data, type = 'replace', itemId = null) => {
  if (!syncWithBackend) return 'queued';
  const wasOffline = navigator.onLine === false;
  try {
    const result = await syncWithBackend(collection, data, type, itemId);
    if (result === false) return 'failed';
    return wasOffline || navigator.onLine === false || result === undefined || result === 'queued' ? 'queued' : 'saved';
  } catch {
    return 'failed';
  }
};

const syncMessage = (outcome, successText) => {
  if (outcome === 'saved') return successText;
  if (outcome === 'queued') return 'Saved locally and queued for synchronization.';
  return 'Saved locally, but synchronization failed. Please try again when the connection is available.';
};

const withSyncStatus = (items, ids, status) => items.map(item => ids.includes(item.id) ? { ...item, syncStatus: status, syncUpdatedAt: ts() } : item);

const SyncBadge = ({ item }) => {
  const status = item.syncStatus || 'local';
  const color = status === 'saved' ? '#10b981' : status === 'failed' ? '#ef4444' : '#f59e0b';
  return <span title={item.syncUpdatedAt ? `Updated ${new Date(item.syncUpdatedAt).toLocaleString()}` : 'Legacy item with no sync receipt'} style={{ color, fontSize: 10, fontWeight: 800, whiteSpace: 'nowrap' }}>{status === 'saved' ? 'Synced' : status === 'failed' ? 'Sync failed' : status === 'saving' ? 'Syncing' : status === 'queued' ? 'Queued' : 'Local/legacy'}</span>;
};

const STATUS_COLORS = {
  pending: '#f59e0b',
  submitted: '#f59e0b',
  approved: '#10b981',
  rejected: '#ef4444',
  revision: '#8b5cf6',
  present: '#10b981',
  late: '#f59e0b',
  absent: '#ef4444',
  excused: '#8b5cf6',
};

const Badge = ({ status, label }) => (
  <span style={{
    padding: '3px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 800,
    background: (STATUS_COLORS[status] || '#64748b') + '22',
    color: STATUS_COLORS[status] || '#64748b',
    textTransform: 'capitalize', letterSpacing: '0.04em', border: `1px solid ${(STATUS_COLORS[status] || '#64748b')}44`
  }}>{label || status}</span>
);

const Card = ({ children, style = {} }) => (
  <div style={{
    background: 'var(--bg-card)', borderRadius: '20px', padding: '24px',
    border: '1px solid var(--glass-border)', backdropFilter: 'blur(12px)',
    boxShadow: 'var(--shadow-md)', ...style
  }}>
    {children}
  </div>
);

const SectionTitle = ({ icon: Icon, title, subtitle }) => (
  <div style={{ marginBottom: '20px' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
      {Icon && <div style={{ width: 36, height: 36, borderRadius: '10px', background: 'var(--accent-glow)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Icon size={18} style={{ color: 'var(--accent)' }} />
      </div>}
      <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 900, color: 'var(--text-main)' }}>{title}</h2>
    </div>
    {subtitle && <p style={{ margin: '6px 0 0 46px', fontSize: '13px', color: 'var(--text-muted)', opacity: 0.7 }}>{subtitle}</p>}
  </div>
);

const StatMini = ({ label, value, tone = 'blue', icon: Icon, sub }) => (
  <article className={`dashboard-kpi-card tone-${tone}`}>
    <span className="dashboard-kpi-icon">{Icon && <Icon size={22} />}</span>
    <span className="dashboard-kpi-copy"><small>{label}</small><strong>{value}</strong>{sub && <em>{sub}</em>}</span>
  </article>
);

// ─────────────────────────────────────────────
// TABS DEFINITION
// ─────────────────────────────────────────────

const getTabs = (role) => {
  const teaching = isTeacher(role);
  const isAdmin = role?.toUpperCase() === 'ADMIN' || role?.toUpperCase().includes('HEAD');
  const tabs = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'attendance', label: 'Attendance', icon: CalendarDays },
    ...(teaching ? [
      { id: 'lessons', label: 'Lesson Notes', icon: BookOpen },
      { id: 'exams', label: 'Exam Questions', icon: ClipboardCheck },
      { id: 'submissions', label: 'My Submissions', icon: FileText },
    ] : [
      { id: 'tasks', label: 'My Tasks', icon: CheckSquare },
    ]),
    { id: 'performance', label: 'My Performance', icon: TrendingUp },
    { id: 'awards', label: 'Awards', icon: Award },
    { id: 'notifications', label: 'Notifications', icon: Bell },
    ...(isAdmin ? [{ id: 'review', label: 'Review Center', icon: Shield }] : []),
    ...(isAdmin ? [{ id: 'admin-perf', label: 'Performance HQ', icon: BarChart2 }] : []),
  ];
  return tabs;
};

// ─────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────

export default function StaffWorkspace({
  user, staff, staffAttendance, setStaffAttendance,
  staffQuestions, setStaffQuestions, lessonNotes, setLessonNotes,
  staffAwards, setStaffAwards, staffDisciplinary, setStaffDisciplinary,
  staffTasks, setStaffTasks, students, attendance, reports,
  currency, convertAmount, backendUrl, token, syncWithBackend, schoolInfo
}) {
  const role = user?.role || 'TEACHER';
  const staffId = user?.id || user?.email;
  const staffName = user?.name || user?.email || 'Staff Member';
  const tabs = getTabs(role);
  const isAdmin = role.toUpperCase() === 'ADMIN' || role.toUpperCase().includes('HEAD');

  const [activeTab, setActiveTab] = useState(() => {
    const requested = new URLSearchParams(window.location.search).get('workspaceTab');
    return tabs.some(t => t.id === requested) ? requested : 'dashboard';
  });
  const [notifications, setNotifications] = useState(() => {
    try { return JSON.parse(localStorage.getItem(`wsn_${staffId}`) || '[]'); } catch { return []; }
  });
  const [performanceRecords, setPerformanceRecords] = useState([]);

  useEffect(() => {
    if (!backendUrl || !token) return;
    backendRequest(backendUrl, token, '/staff-performance')
      .then(items => setPerformanceRecords(Array.isArray(items) ? items : []))
      .catch(error => console.warn('Staff performance could not be loaded', error));
  }, [backendUrl, token, staffAttendance, lessonNotes, staffQuestions, staffTasks]);

  const addNotification = useCallback((msg, type = 'info') => {
    const n = { id: uid(), message: msg, type, timestamp: ts(), read: false };
    setNotifications(prev => {
      const updated = [n, ...prev];
      localStorage.setItem(`wsn_${staffId}`, JSON.stringify(updated));
      return updated;
    });
  }, [staffId]);

  const unreadCount = notifications.filter(n => !n.read).length;

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    activeTab === 'dashboard' ? params.delete('workspaceTab') : params.set('workspaceTab', activeTab);
    window.history.replaceState(null, '', `${window.location.pathname}${params.size ? `?${params}` : ''}${window.location.hash}`);
  }, [activeTab]);

  // ─── GPS State ───
  const [gpsCoords, setGpsCoords] = useState(null);
  const [gpsError, setGpsError] = useState('');
  const [gpsLoading, setGpsLoading] = useState(false);

  const requestGPS = () => new Promise((resolve, reject) => {
    setGpsLoading(true);
    if (!navigator.geolocation) { setGpsError('GPS not supported.'); reject('unsupported'); return; }
    navigator.geolocation.getCurrentPosition(
      pos => { setGpsCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude, acc: pos.coords.accuracy }); setGpsLoading(false); resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }); },
      err => { setGpsError('Could not get location: ' + err.message); setGpsLoading(false); reject(err); },
      { timeout: 10000 }
    );
  });

  return (
    <section className="view active" style={{ padding: 0 }}>
      {/* ── Header ── */}
      <div style={{
        background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 60%, #312e81 100%)',
        padding: '28px 32px 0', color: '#fff', position: 'relative', overflow: 'hidden'
      }}>
        <div style={{ position: 'absolute', top: -40, right: -40, width: 200, height: 200, borderRadius: '50%', background: 'rgba(99,102,241,0.15)', pointerEvents: 'none' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
          <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'linear-gradient(135deg,#8b5cf6,#6366f1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 900 }}>
            {staffName.charAt(0)}
          </div>
          <div>
            <p style={{ margin: 0, fontSize: 12, opacity: 0.6, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Staff Workspace</p>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 900 }}>Welcome, {staffName.split(' ')[0]}</h1>
            <p style={{ margin: 0, fontSize: 12, opacity: 0.6 }}>{role} · {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
          </div>
          {unreadCount > 0 && (
            <button onClick={() => setActiveTab('notifications')} style={{ marginLeft: 'auto', background: '#ef4444', border: 'none', borderRadius: 20, padding: '6px 14px', color: '#fff', fontWeight: 800, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Bell size={14} /> {unreadCount}
            </button>
          )}
        </div>

        {/* ── Tab Bar ── */}
        <div style={{ display: 'flex', gap: 0, overflowX: 'auto', scrollbarWidth: 'none' }}>
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 7, padding: '12px 20px',
                background: activeTab === t.id ? 'rgba(255,255,255,0.15)' : 'transparent',
                border: 'none', borderBottom: activeTab === t.id ? '3px solid #a78bfa' : '3px solid transparent',
                color: activeTab === t.id ? '#fff' : 'rgba(255,255,255,0.55)',
                fontWeight: activeTab === t.id ? 800 : 600, fontSize: 13, cursor: 'pointer',
                whiteSpace: 'nowrap', transition: 'all 0.2s', borderRadius: '8px 8px 0 0'
              }}
            >
              <t.icon size={15} /> {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Tab Content ── */}
      <div style={{ padding: '28px 32px', background: 'var(--bg-page)', minHeight: 'calc(100vh - 200px)' }}>
        
        {activeTab === 'dashboard' && (
          <DashboardTab user={user} staffId={staffId} staffName={staffName} role={role}
            staffAttendance={staffAttendance} lessonNotes={lessonNotes}
            staffQuestions={staffQuestions} staffAwards={staffAwards}
            staffDisciplinary={staffDisciplinary} notifications={notifications}
            students={students} reports={reports} attendance={attendance}
            setActiveTab={setActiveTab} isAdmin={isAdmin} staff={staff}
          />
        )}

        {activeTab === 'attendance' && (
          <AttendanceTab user={user} staffId={staffId} staffName={staffName} role={role}
            staffAttendance={staffAttendance} setStaffAttendance={setStaffAttendance}
            syncWithBackend={syncWithBackend} addNotification={addNotification}
            gpsCoords={gpsCoords} gpsError={gpsError} gpsLoading={gpsLoading}
            requestGPS={requestGPS} isAdmin={isAdmin} staff={staff}
            schoolInfo={schoolInfo}
          />
        )}

        {activeTab === 'lessons' && (
          <LessonNotesTab user={user} staffId={staffId} staffName={staffName}
            lessonNotes={lessonNotes} setLessonNotes={setLessonNotes}
            syncWithBackend={syncWithBackend} addNotification={addNotification}
            schoolInfo={schoolInfo} backendUrl={backendUrl} token={token}
          />
        )}

        {activeTab === 'exams' && (
          <ExamQuestionsTab user={user} staffId={staffId} staffName={staffName}
            staffQuestions={staffQuestions} setStaffQuestions={setStaffQuestions}
            syncWithBackend={syncWithBackend} addNotification={addNotification}
            schoolInfo={schoolInfo} backendUrl={backendUrl} token={token}
          />
        )}

        {activeTab === 'submissions' && (
          <SubmissionsTab user={user} staff={staff} staffId={staffId} lessonNotes={lessonNotes} staffQuestions={staffQuestions} />
        )}

        {activeTab === 'tasks' && (
          <TasksTab user={user} staffId={staffId} staffTasks={staffTasks}
            setStaffTasks={setStaffTasks} syncWithBackend={syncWithBackend}
            isAdmin={isAdmin} staff={staff} backendUrl={backendUrl} token={token}
          />
        )}

        {activeTab === 'performance' && (
          <PerformanceTab staffId={staffId} staffName={staffName} role={role}
            staffAttendance={staffAttendance} lessonNotes={lessonNotes}
            staffQuestions={staffQuestions} reports={reports} students={students}
            attendance={attendance} staffDisciplinary={staffDisciplinary}
            isTeaching={isTeacher(role)} staffTasks={staffTasks}
            performanceRecords={performanceRecords}
          />
        )}

        {activeTab === 'awards' && (
          <AwardsTab staffId={staffId} staffName={staffName} staffAwards={staffAwards}
            setStaffAwards={setStaffAwards} syncWithBackend={syncWithBackend}
            isAdmin={isAdmin} staff={staff} addNotification={addNotification}
          />
        )}

        {activeTab === 'notifications' && (
          <NotificationsTab notifications={notifications} setNotifications={setNotifications} staffId={staffId} />
        )}

        {activeTab === 'review' && isAdmin && (
          <ReviewCenterTab
            lessonNotes={lessonNotes} setLessonNotes={setLessonNotes}
            staffQuestions={staffQuestions} setStaffQuestions={setStaffQuestions}
            staffTasks={staffTasks} setStaffTasks={setStaffTasks}
            staff={staff} syncWithBackend={syncWithBackend} addNotification={addNotification}
            setNotifications={setNotifications} backendUrl={backendUrl} token={token}
          />
        )}

        {activeTab === 'admin-perf' && isAdmin && (
          <AdminPerformanceTab
            staff={staff} staffAttendance={staffAttendance} lessonNotes={lessonNotes}
            staffQuestions={staffQuestions} reports={reports} students={students}
            attendance={attendance} staffDisciplinary={staffDisciplinary}
            setStaffDisciplinary={setStaffDisciplinary} staffTasks={staffTasks}
            staffAwards={staffAwards} setStaffAwards={setStaffAwards}
            syncWithBackend={syncWithBackend} addNotification={addNotification}
            performanceRecords={performanceRecords}
          />
        )}
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────
// TAB: DASHBOARD
// ─────────────────────────────────────────────

function DashboardTab({ user, staffId, staffName, role, staffAttendance, lessonNotes, staffQuestions, staffAwards, staffDisciplinary, notifications, students, reports, attendance, setActiveTab, isAdmin, staff }) {
  const teaching = isTeacher(role);
  const today = todayStr();

  const myAtt = staffAttendance.filter(r => r.staffId === staffId);
  const todayAtt = myAtt.find(r => r.date === today);
  const presentDays = myAtt.filter(r => r.status === 'present' || r.status === 'late').length;
  const attRate = myAtt.length > 0 ? Math.round((presentDays / myAtt.length) * 100) : 0;

  const myNotes = lessonNotes.filter(n => n.staffId === staffId);
  const pendingNotes = myNotes.filter(n => ['pending', 'submitted'].includes(n.approvalStatus)).length;
  const myQ = staffQuestions.filter(q => q.staffId === staffId);
  const pendingQ = myQ.filter(q => ['pending', 'submitted'].includes(q.approvalStatus)).length;
  const myAwards = staffAwards.filter(a => a.staffId === staffId);
  const myDisc = staffDisciplinary.filter(d => d.staffId === staffId);
  const unread = notifications.filter(n => !n.read).length;

  // Quick perf score estimate
  const score = Math.min(100, Math.round(
    (attRate * 0.25) + (myNotes.length > 0 ? 75 : 50) * 0.25 + 70 * 0.5
  ));

  const scoreColor = score >= 90 ? '#10b981' : score >= 80 ? '#8b5cf6' : score >= 70 ? '#f59e0b' : '#ef4444';
  const scoreLabel = score >= 90 ? 'Excellent' : score >= 80 ? 'Very Good' : score >= 70 ? 'Good' : 'Needs Improvement';

  return (
    <div>
      <SectionTitle icon={LayoutDashboard} title="My Dashboard" subtitle="Your personalized operations hub" />

      {/* Attendance Banner */}
      {!todayAtt && (
        <div style={{ background: 'linear-gradient(135deg,#ef4444,#dc2626)', borderRadius: 16, padding: '16px 24px', color: '#fff', marginBottom: 24, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <AlertCircle size={20} />
            <div>
              <p style={{ margin: 0, fontWeight: 800, fontSize: 15 }}>Attendance Not Marked</p>
              <p style={{ margin: 0, fontSize: 12, opacity: 0.85 }}>You have not marked your attendance for today.</p>
            </div>
          </div>
          <button onClick={() => setActiveTab('attendance')} style={{ background: '#fff', color: '#ef4444', border: 'none', borderRadius: 10, padding: '8px 18px', fontWeight: 800, fontSize: 13, cursor: 'pointer' }}>
            Mark Now
          </button>
        </div>
      )}

      {todayAtt && (
        <div style={{ background: 'linear-gradient(135deg,#10b981,#059669)', borderRadius: 16, padding: '14px 24px', color: '#fff', marginBottom: 24, display: 'flex', alignItems: 'center', gap: 12 }}>
          <CheckCircle size={20} />
          <div>
            <p style={{ margin: 0, fontWeight: 800 }}>Attendance Marked — {todayAtt.status?.toUpperCase()}</p>
            <p style={{ margin: 0, fontSize: 12, opacity: 0.85 }}>Time In: {todayAtt.timeIn} {todayAtt.timeOut ? `· Time Out: ${todayAtt.timeOut}` : ''}</p>
          </div>
        </div>
      )}

      {/* Stat Row */}
      <div className="dashboard-kpi-grid" style={{ marginBottom: 28 }}>
        <StatMini label="Attendance Rate" value={`${attRate}%`} tone="green" icon={CalendarDays} />
        {teaching && <StatMini label="Pending Lessons" value={pendingNotes} tone="amber" icon={BookOpen} />}
        {teaching && <StatMini label="Pending Exams" value={pendingQ} tone="blue" icon={ClipboardCheck} />}
        <StatMini label="Awards" value={myAwards.length} tone="blue" icon={Award} />
        <StatMini label="Notifications" value={unread} tone="red" icon={Bell} />
        {myDisc.length > 0 && <StatMini label="Active Plans" value={myDisc.length} tone="red" icon={Flag} />}
      </div>

      {/* Performance Score Card */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 20, marginBottom: 28 }}>
        <Card>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <h3 style={{ margin: 0, fontWeight: 800, fontSize: 16 }}>Estimated Overall Performance</h3>
            <Sparkles size={18} style={{ color: 'var(--accent)' }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
            <div style={{ position: 'relative', width: 90, height: 90 }}>
              <svg width="90" height="90" viewBox="0 0 90 90">
                <circle cx="45" cy="45" r="36" fill="none" stroke="var(--border-color)" strokeWidth="8" />
                <circle cx="45" cy="45" r="36" fill="none" stroke={scoreColor} strokeWidth="8"
                  strokeDasharray={`${2 * Math.PI * 36}`}
                  strokeDashoffset={`${2 * Math.PI * 36 * (1 - score / 100)}`}
                  strokeLinecap="round" transform="rotate(-90 45 45)"
                />
              </svg>
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}>
                <span style={{ fontWeight: 900, fontSize: 18, color: scoreColor }}>{score}</span>
                <span style={{ fontSize: 9, opacity: 0.5, fontWeight: 700 }}>/ 100</span>
              </div>
            </div>
            <div>
              <Badge status={score >= 70 ? 'approved' : 'rejected'} label={scoreLabel} />
              <p style={{ margin: '8px 0 0', fontSize: 12, opacity: 0.6 }}>Estimate using attendance and submissions plus placeholder evaluation values.</p>
            </div>
          </div>
        </Card>

        {/* Recent Awards */}
        <Card>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <h3 style={{ margin: 0, fontWeight: 800, fontSize: 16 }}>Recent Awards</h3>
            <Award size={18} style={{ color: '#f59e0b' }} />
          </div>
          {myAwards.length === 0 ? (
            <p style={{ fontSize: 13, opacity: 0.5, textAlign: 'center', padding: '20px 0', margin: 0 }}>No awards yet. Keep up the great work!</p>
          ) : myAwards.slice(-3).reverse().map(a => (
            <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border-color)' }}>
              <Star size={16} style={{ color: '#f59e0b', flexShrink: 0 }} />
              <div>
                <p style={{ margin: 0, fontWeight: 800, fontSize: 13 }}>{a.title}</p>
                <p style={{ margin: 0, fontSize: 11, opacity: 0.6 }}>{a.date}</p>
              </div>
            </div>
          ))}
        </Card>

        {/* Improvement Plans */}
        {myDisc.length > 0 && (
          <Card style={{ borderColor: '#ef444433' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontWeight: 800, fontSize: 16, color: '#ef4444' }}>Improvement Plans</h3>
              <Flag size={18} style={{ color: '#ef4444' }} />
            </div>
            {myDisc.slice(-2).map(d => (
              <div key={d.id} style={{ padding: '10px', background: '#ef444411', borderRadius: 10, marginBottom: 8 }}>
                <p style={{ margin: 0, fontWeight: 800, fontSize: 13 }}>{d.type}</p>
                <p style={{ margin: '4px 0 0', fontSize: 12, opacity: 0.7 }}>{d.reason}</p>
                <p style={{ margin: '4px 0 0', fontSize: 11, opacity: 0.5 }}>Issued: {d.date} · Review: {d.reviewDate || 'TBD'}</p>
              </div>
            ))}
          </Card>
        )}

        {/* Quick Links */}
        <Card>
          <h3 style={{ margin: '0 0 16px', fontWeight: 800, fontSize: 16 }}>Quick Actions</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              { id: 'attendance', icon: CalendarDays, label: 'Mark Attendance', color: '#10b981' },
              ...(isTeacher(role) ? [
                { id: 'lessons', icon: BookOpen, label: 'Upload Lesson Notes', color: '#8b5cf6' },
                { id: 'exams', icon: ClipboardCheck, label: 'Submit Exam Questions', color: '#6366f1' },
                { id: 'submissions', icon: FileText, label: 'View My Submissions', color: '#f59e0b' },
              ] : [{ id: 'tasks', icon: CheckSquare, label: 'View My Tasks', color: '#0ea5e9' }]),
              { id: 'performance', icon: TrendingUp, label: 'View My Performance', color: '#ec4899' },
            ].map(({ id, icon: Icon, label, color }) => (
              <button key={id} onClick={() => setActiveTab(id)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: color + '11', border: `1px solid ${color}33`, borderRadius: 10, cursor: 'pointer', fontWeight: 700, fontSize: 13, color: 'var(--text-main)', textAlign: 'left', transition: 'all 0.2s' }}>
                <Icon size={16} style={{ color }} /> {label}
              </button>
            ))}
          </div>
        </Card>
      </div>

      {/* Admin Overview */}
      {isAdmin && (
        <Card>
          <h3 style={{ margin: '0 0 16px', fontWeight: 800, fontSize: 16 }}>School Overview</h3>
          <div className="dashboard-kpi-grid">
            <StatMini label="Total Staff" value={staff.length} tone="blue" icon={User} />
            <StatMini label="Checked In Today" value={staffAttendance.filter(r => r.date === today).length} tone="green" icon={CheckCircle} />
            <StatMini label="Pending Reviews" value={[...lessonNotes, ...staffQuestions].filter(r => ['pending', 'submitted'].includes(r.approvalStatus)).length} tone="amber" icon={AlertCircle} />
          </div>
        </Card>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// TAB: ATTENDANCE
// ─────────────────────────────────────────────

function AttendanceTab({ user, staffId, staffName, role, staffAttendance, setStaffAttendance, syncWithBackend, addNotification, gpsCoords, gpsError, gpsLoading, requestGPS, isAdmin, staff, schoolInfo }) {
  const [status, setStatus] = useState('present');
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState('');
  const [filter, setFilter] = useState('all');
  const [adminFilter, setAdminFilter] = useState('');
  const [visibleCount, setVisibleCount] = useState(50);
  const [syncStatus, setSyncStatus] = useState('');
  const today = todayStr();

  const myAtt = staffAttendance.filter(r => r.staffId === staffId).sort((a, b) => b.date.localeCompare(a.date));
  const todayRecord = myAtt.find(r => r.date === today);

  const handleClockIn = async () => {
    if (todayRecord) { setMsg('You have already marked attendance today.'); return; }
    setSubmitting(true);
    setSyncStatus('saving');
    setMsg('');
    let coords = null;
    try { coords = await requestGPS(); } catch { /* GPS optional */ }

    const record = {
      id: uid(), staffId, staffName, schoolId: user?.schoolId || 'default',
      date: today, timeIn: nowStr(), timeOut: null, status,
      device: navigator.userAgent.slice(0, 80),
      browser: navigator.userAgent.match(/(Chrome|Firefox|Safari|Edge)\//)?.[0] || 'Unknown',
      lat: coords?.lat || null, lng: coords?.lng || null,
      timestamp: ts()
    };

    let updated = [...staffAttendance, { ...record, syncStatus: 'saving' }];
    setStaffAttendance(updated);
    const outcome = await syncChange(syncWithBackend, 'staffAttendance', record, 'add');
    updated = withSyncStatus(updated, [record.id], outcome);
    setStaffAttendance(updated);
    setSyncStatus(outcome);
    if (outcome !== 'failed') addNotification(`Attendance marked as ${status.toUpperCase()} for ${today}.`, outcome === 'queued' ? 'warning' : 'success');
    setMsg(syncMessage(outcome, `Attendance marked as ${status.toUpperCase()}.`));
    setSubmitting(false);
  };

  const handleClockOut = async () => {
    if (!todayRecord || todayRecord.timeOut) { setMsg('Nothing to clock out from.'); return; }
    setSubmitting(true);
    setSyncStatus('saving');
    const clockOutTime = nowStr();
    let updated = staffAttendance.map(r =>
      r.id === todayRecord.id ? { ...r, timeOut: clockOutTime, syncStatus: 'saving' } : r
    );
    setStaffAttendance(updated);
    const updatedRecord = updated.find(record => record.id === todayRecord.id);
    const outcome = await syncChange(syncWithBackend, 'staffAttendance', updatedRecord, 'update', todayRecord.id);
    updated = withSyncStatus(updated, [todayRecord.id], outcome);
    setStaffAttendance(updated);
    setSyncStatus(outcome);
    setMsg(syncMessage(outcome, `Clocked out at ${clockOutTime}.`));
    setSubmitting(false);
  };

  const allAtt = isAdmin ? staffAttendance : myAtt;
  const filteredAtt = allAtt
    .filter(r => filter === 'all' || r.status === filter)
    .filter(r => !adminFilter || r.staffName?.toLowerCase().includes(adminFilter.toLowerCase()))
    .sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div>
      <SectionTitle icon={CalendarDays} title="Staff Attendance" subtitle="Mark daily attendance and view your attendance history." />

      {/* Clock-In Card */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))', gap: 24, marginBottom: 28 }}>
        <Card>
          <h3 style={{ margin: '0 0 18px', fontWeight: 800, fontSize: 16 }}>Today's Attendance — {today}</h3>
          {todayRecord ? (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                <CheckCircle size={28} style={{ color: '#10b981' }} />
                <div>
                  <p style={{ margin: 0, fontWeight: 800, fontSize: 16 }}>Attendance Marked</p>
                  <p style={{ margin: 0, fontSize: 13, opacity: 0.7 }}>Status: <Badge status={todayRecord.status} /> · In: {todayRecord.timeIn} {todayRecord.timeOut ? `· Out: ${todayRecord.timeOut}` : ''}</p>
                </div>
              </div>
              {!todayRecord.timeOut && (
                <button onClick={handleClockOut} disabled={submitting} style={{ width: '100%', padding: '12px', borderRadius: 12, border: 'none', background: 'linear-gradient(135deg,#f59e0b,#d97706)', color: '#fff', fontWeight: 800, fontSize: 14, cursor: submitting ? 'wait' : 'pointer' }}>
                  <Clock size={16} style={{ marginRight: 8, verticalAlign: 'middle' }} /> {submitting ? 'Saving...' : 'Clock Out'}
                </button>
              )}
            </div>
          ) : (
            <div>
              <label style={{ display: 'block', marginBottom: 8, fontWeight: 700, fontSize: 13 }}>Attendance Status</label>
              <select value={status} onChange={e => setStatus(e.target.value)} style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid var(--border-color)', background: 'var(--bg-page)', color: 'var(--text-main)', fontWeight: 700, marginBottom: 16 }}>
                <option value="present">Present</option>
                <option value="late">Late</option>
                <option value="absent">Absent</option>
                <option value="excused">Excused</option>
              </select>

              {gpsCoords && (
                <div style={{ padding: '10px 14px', background: '#10b98122', borderRadius: 10, marginBottom: 12, fontSize: 12, fontWeight: 700, color: '#10b981' }}>
                  <MapPin size={12} style={{ marginRight: 6, verticalAlign: 'middle' }} />
                  GPS: {gpsCoords.lat?.toFixed(5)}, {gpsCoords.lng?.toFixed(5)} (±{Math.round(gpsCoords.acc)}m)
                </div>
              )}
              {gpsError && <p style={{ color: '#ef4444', fontSize: 12, marginBottom: 10 }}>{gpsError}</p>}

              <button onClick={handleClockIn} disabled={submitting} style={{ width: '100%', padding: '13px', borderRadius: 12, border: 'none', background: 'linear-gradient(135deg,#8b5cf6,#6366f1)', color: '#fff', fontWeight: 800, fontSize: 14, cursor: 'pointer' }}>
                {submitting ? <Loader size={16} style={{ animation: 'spin 1s linear infinite', marginRight: 8, verticalAlign: 'middle' }} /> : <CheckCircle size={16} style={{ marginRight: 8, verticalAlign: 'middle' }} />}
                 {submitting ? 'Saving Attendance...' : 'Mark Attendance'}
              </button>
            </div>
          )}
          {msg && <p role={syncStatus === 'failed' ? 'alert' : 'status'} style={{ marginTop: 10, fontSize: 13, fontWeight: 700, color: syncStatus === 'saved' ? '#10b981' : syncStatus === 'queued' ? '#f59e0b' : '#ef4444' }}>{msg}</p>}
        </Card>

        {/* Attendance Stats */}
        <Card>
          <h3 style={{ margin: '0 0 18px', fontWeight: 800, fontSize: 16 }}>Attendance Summary</h3>
          {(() => {
            const mine = staffAttendance.filter(r => r.staffId === staffId);
            const p = mine.filter(r => r.status === 'present').length;
            const l = mine.filter(r => r.status === 'late').length;
            const a = mine.filter(r => r.status === 'absent').length;
            const e = mine.filter(r => r.status === 'excused').length;
            const total = mine.length;
            const rate = total > 0 ? Math.round(((p + l) / total) * 100) : 0;
            return (
              <div>
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
                  <div style={{ position: 'relative', width: 100, height: 100 }}>
                    <svg width="100" height="100" viewBox="0 0 100 100">
                      <circle cx="50" cy="50" r="40" fill="none" stroke="var(--border-color)" strokeWidth="9" />
                      <circle cx="50" cy="50" r="40" fill="none" stroke="#10b981" strokeWidth="9"
                        strokeDasharray={`${2 * Math.PI * 40}`}
                        strokeDashoffset={`${2 * Math.PI * 40 * (1 - rate / 100)}`}
                        strokeLinecap="round" transform="rotate(-90 50 50)"
                      />
                    </svg>
                    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}>
                      <span style={{ fontWeight: 900, fontSize: 20, color: '#10b981' }}>{rate}%</span>
                      <span style={{ fontSize: 9, opacity: 0.5 }}>rate</span>
                    </div>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {[{ label: 'Present', val: p, color: '#10b981' }, { label: 'Late', val: l, color: '#f59e0b' }, { label: 'Absent', val: a, color: '#ef4444' }, { label: 'Excused', val: e, color: '#8b5cf6' }].map(x => (
                    <div key={x.label} style={{ padding: '8px 12px', borderRadius: 10, background: x.color + '11', border: `1px solid ${x.color}33`, textAlign: 'center' }}>
                      <p style={{ margin: 0, fontWeight: 900, fontSize: 18, color: x.color }}>{x.val}</p>
                      <p style={{ margin: 0, fontSize: 11, opacity: 0.7 }}>{x.label}</p>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}
        </Card>
      </div>

      {/* History Table */}
      <Card>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 18 }}>
          <h3 style={{ margin: 0, fontWeight: 800, fontSize: 16 }}>{isAdmin ? 'All Staff Attendance Log' : 'My Attendance History'}</h3>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {isAdmin && <input placeholder="Search staff..." value={adminFilter} onChange={e => setAdminFilter(e.target.value)} style={{ padding: '7px 12px', borderRadius: 10, border: '1px solid var(--border-color)', background: 'var(--bg-page)', color: 'var(--text-main)', fontSize: 13 }} />}
            <select value={filter} onChange={e => setFilter(e.target.value)} style={{ padding: '7px 12px', borderRadius: 10, border: '1px solid var(--border-color)', background: 'var(--bg-page)', color: 'var(--text-main)', fontSize: 13 }}>
              <option value="all">All Statuses</option>
              <option value="present">Present</option>
              <option value="late">Late</option>
              <option value="absent">Absent</option>
              <option value="excused">Excused</option>
            </select>
          </div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border-color)' }}>
                {isAdmin && <th style={{ textAlign: 'left', padding: '8px 12px', fontWeight: 800 }}>Staff</th>}
                <th style={{ textAlign: 'left', padding: '8px 12px', fontWeight: 800 }}>Date</th>
                <th style={{ textAlign: 'left', padding: '8px 12px', fontWeight: 800 }}>Status</th>
                <th style={{ textAlign: 'left', padding: '8px 12px', fontWeight: 800 }}>Time In</th>
                <th style={{ textAlign: 'left', padding: '8px 12px', fontWeight: 800 }}>Time Out</th>
                <th style={{ textAlign: 'left', padding: '8px 12px', fontWeight: 800 }}>Location</th>
                <th style={{ textAlign: 'left', padding: '8px 12px', fontWeight: 800 }}>Sync</th>
              </tr>
            </thead>
            <tbody>
              {filteredAtt.slice(0, visibleCount).map(r => (
                <tr key={r.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                  {isAdmin && <td style={{ padding: '8px 12px', fontWeight: 700 }}>{r.staffName}</td>}
                  <td style={{ padding: '8px 12px' }}>{r.date}</td>
                  <td style={{ padding: '8px 12px' }}><Badge status={r.status} /></td>
                  <td style={{ padding: '8px 12px' }}>{r.timeIn || '—'}</td>
                  <td style={{ padding: '8px 12px' }}>{r.timeOut || '—'}</td>
                  <td style={{ padding: '8px 12px', fontSize: 11, opacity: 0.6 }}>{r.lat ? `${r.lat?.toFixed(4)}, ${r.lng?.toFixed(4)}` : 'N/A'}</td>
                  <td style={{ padding: '8px 12px' }}><SyncBadge item={r} /></td>
                </tr>
              ))}
              {filteredAtt.length === 0 && (
                <tr><td colSpan={isAdmin ? 6 : 5} style={{ textAlign: 'center', padding: 30, opacity: 0.4 }}>No records found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        {filteredAtt.length > visibleCount && (
          <div style={{ textAlign: 'center', marginTop: 14 }}>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 8px' }}>Showing {visibleCount} of {filteredAtt.length} records.</p>
            <button onClick={() => setVisibleCount(c => c + 50)} style={{ padding: '7px 16px', borderRadius: 9, border: '1px solid var(--border-color)', background: 'var(--bg-page)', color: 'var(--text-main)', cursor: 'pointer', fontWeight: 700 }}>Show 50 more</button>
          </div>
        )}
      </Card>
    </div>
  );
}

// ─────────────────────────────────────────────
// TAB: LESSON NOTES
// ─────────────────────────────────────────────

function LessonNotesTab({ user, staffId, staffName, lessonNotes, setLessonNotes, syncWithBackend, addNotification, backendUrl, token }) {
  const [form, setForm] = useState({ subject: '', department: '', className: '', academicYear: '', term: 'Term 1', week: '', notes: '', fileName: '' });
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState('');
  const fileRef = useRef();
  const [fileData, setFileData] = useState(null);
  const [visibleCount, setVisibleCount] = useState(10);
  const [syncStatus, setSyncStatus] = useState('');

  const mine = lessonNotes.filter(n => n.staffId === staffId).sort((a, b) => b.timestamp?.localeCompare(a.timestamp));

  const handleFile = e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => setFileData({ name: file.name, base64: ev.target.result, type: file.type });
    reader.readAsDataURL(file);
    setForm(p => ({ ...p, fileName: file.name }));
  };

  const handleSubmit = async () => {
    if (!form.subject || !form.week) { setMsg('Please fill in Subject and Week.'); return; }
    setSubmitting(true);
    setSyncStatus('saving');
    setMsg('Saving lesson note...');
    const rec = {
      id: uid(), staffId, staffName,
      staffEmail: user?.email || '',
      email: user?.email || '',
      schoolId: user?.schoolId || 'default',
      ...form, approvalStatus: 'draft', adminComment: '',
      uploadDate: todayStr(), uploadTime: nowStr(), timestamp: ts(),
      fileData: fileData?.base64 || null, fileType: fileData?.type || null,
      version: 1
    };
    try {
      if (navigator.onLine === false) throw new Error('Lesson note submission requires a live backend connection.');
      const created = await syncWithBackend?.('lessonNotes', rec, 'add');
      if (created === 'queued') {
        setLessonNotes([...lessonNotes, { ...rec, syncStatus: 'queued', syncUpdatedAt: ts() }]);
        setSyncStatus('queued');
        setMsg('Lesson note draft queued. Submit it after synchronization completes.');
        setSubmitting(false);
        return;
      }
      if (created !== true) throw new Error('The backend did not confirm lesson note creation.');
      const submitted = await workflowRequest(backendUrl, token, 'lessonNotes', rec.id, 'submit');
      if (!submitted?.success || !submitted.item) throw new Error('The backend did not confirm lesson note submission.');
      setLessonNotes([...lessonNotes, { ...submitted.item, syncStatus: 'saved', syncUpdatedAt: ts() }]);
      setSyncStatus('saved');
      setMsg('Lesson note submitted successfully.');
      addNotification(`Lesson note submitted for ${form.subject} — Week ${form.week}.`, 'success');
      setForm({ subject: '', department: '', className: '', academicYear: '', term: 'Term 1', week: '', notes: '', fileName: '' });
      setFileData(null);
    } catch (error) {
      setSyncStatus('failed');
      setMsg(`${error.message} The submission was not completed or queued.`);
    }
    setSubmitting(false);
  };

  return (
    <div>
      <SectionTitle icon={BookOpen} title="Lesson Note Submission" subtitle="Upload weekly lesson notes for administrator review." />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))', gap: 24 }}>
        {/* Upload Form */}
        <Card>
          <h3 style={{ margin: '0 0 18px', fontWeight: 800, fontSize: 16 }}>Submit New Lesson Note</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {[
              { key: 'subject', label: 'Subject *', placeholder: 'e.g. Mathematics' },
              { key: 'department', label: 'Department', placeholder: 'e.g. Upper Primary' },
              { key: 'className', label: 'Class (Optional)', placeholder: 'e.g. Basic 5A' },
              { key: 'academicYear', label: 'Academic Year', placeholder: '2024/2025' },
            ].map(f => (
              <div key={f.key}>
                <label style={{ display: 'block', fontWeight: 700, fontSize: 12, marginBottom: 4 }}>{f.label}</label>
                <input value={form[f.key]} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                  placeholder={f.placeholder} style={{ width: '100%', padding: '9px 12px', borderRadius: 10, border: '1px solid var(--border-color)', background: 'var(--bg-page)', color: 'var(--text-main)', fontSize: 13, boxSizing: 'border-box' }} />
              </div>
            ))}
            <div>
              <label style={{ display: 'block', fontWeight: 700, fontSize: 12, marginBottom: 4 }}>Term</label>
              <select value={form.term} onChange={e => setForm(p => ({ ...p, term: e.target.value }))} style={{ width: '100%', padding: '9px 12px', borderRadius: 10, border: '1px solid var(--border-color)', background: 'var(--bg-page)', color: 'var(--text-main)', fontSize: 13 }}>
                <option>Term 1</option><option>Term 2</option><option>Term 3</option>
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontWeight: 700, fontSize: 12, marginBottom: 4 }}>Week *</label>
              <input type="number" min="1" max="20" value={form.week} onChange={e => setForm(p => ({ ...p, week: e.target.value }))}
                placeholder="e.g. 5" style={{ width: '100%', padding: '9px 12px', borderRadius: 10, border: '1px solid var(--border-color)', background: 'var(--bg-page)', color: 'var(--text-main)', fontSize: 13, boxSizing: 'border-box' }} />
            </div>
          </div>
          <div style={{ marginTop: 12 }}>
            <label style={{ display: 'block', fontWeight: 700, fontSize: 12, marginBottom: 4 }}>Notes / Description</label>
            <textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} rows={3}
              placeholder="Brief description of lesson content..." style={{ width: '100%', padding: '9px 12px', borderRadius: 10, border: '1px solid var(--border-color)', background: 'var(--bg-page)', color: 'var(--text-main)', fontSize: 13, resize: 'vertical', boxSizing: 'border-box' }} />
          </div>
          <div style={{ marginTop: 12 }}>
            <label style={{ display: 'block', fontWeight: 700, fontSize: 12, marginBottom: 8 }}>Attach File (PDF / DOCX)</label>
            <div onClick={() => fileRef.current?.click()} style={{ border: '2px dashed var(--border-color)', borderRadius: 12, padding: '20px', textAlign: 'center', cursor: 'pointer', transition: 'all 0.2s' }}>
              <Upload size={22} style={{ color: 'var(--accent)', marginBottom: 6 }} />
              <p style={{ margin: 0, fontSize: 13, fontWeight: 700 }}>{fileData ? fileData.name : 'Click to browse or drag file here'}</p>
              <p style={{ margin: '4px 0 0', fontSize: 11, opacity: 0.5 }}>PDF, DOCX accepted</p>
            </div>
            <input ref={fileRef} type="file" accept=".pdf,.docx" onChange={handleFile} style={{ display: 'none' }} />
          </div>
          <button onClick={handleSubmit} disabled={submitting} style={{ marginTop: 16, width: '100%', padding: '13px', borderRadius: 12, border: 'none', background: 'linear-gradient(135deg,#8b5cf6,#6366f1)', color: '#fff', fontWeight: 800, fontSize: 14, cursor: 'pointer' }}>
            <Send size={15} style={{ marginRight: 8, verticalAlign: 'middle' }} />
            {submitting ? 'Submitting...' : 'Submit Lesson Note'}
          </button>
           {msg && <p role={syncStatus === 'failed' ? 'alert' : 'status'} style={{ marginTop: 10, fontSize: 13, fontWeight: 700, color: syncStatus === 'saved' ? '#10b981' : syncStatus === 'queued' || syncStatus === 'saving' ? '#f59e0b' : '#ef4444' }}>{msg}</p>}
        </Card>

        {/* History */}
        <Card>
          <h3 style={{ margin: '0 0 18px', fontWeight: 800, fontSize: 16 }}>My Submitted Notes</h3>
          {mine.length === 0 ? (
            <p style={{ textAlign: 'center', opacity: 0.4, padding: '30px 0' }}>No lesson notes submitted yet.</p>
          ) : mine.slice(0, visibleCount).map(n => (
            <div key={n.id} style={{ padding: '12px 0', borderBottom: '1px solid var(--border-color)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
                <p style={{ margin: 0, fontWeight: 800, fontSize: 14 }}>{n.subject} — Week {n.week}</p>
                <Badge status={n.approvalStatus} />
                <SyncBadge item={n} />
              </div>
              <p style={{ margin: '4px 0 0', fontSize: 12, opacity: 0.6 }}>{n.department} · {n.term} · {n.uploadDate}</p>
              {n.adminComment && <p style={{ margin: '6px 0 0', fontSize: 12, background: 'var(--accent-glow)', padding: '6px 10px', borderRadius: 8, fontStyle: 'italic', display: 'flex', alignItems: 'center', gap: 5 }}><MessageSquare size={13} /> {n.adminComment}</p>}
            </div>
          ))}
          {mine.length > visibleCount && <button onClick={() => setVisibleCount(c => c + 10)} style={{ marginTop: 12, width: '100%', padding: 8, borderRadius: 9, border: '1px solid var(--border-color)', background: 'var(--bg-page)', color: 'var(--text-main)', cursor: 'pointer', fontWeight: 700 }}>Showing {visibleCount} of {mine.length}. Show 10 more</button>}
        </Card>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// TAB: EXAM QUESTIONS
// ─────────────────────────────────────────────

function ExamQuestionsTab({ user, staffId, staffName, staffQuestions, setStaffQuestions, syncWithBackend, addNotification, backendUrl, token }) {
  const [examType, setExamType] = useState('midterm');
  const [form, setForm] = useState({ subject: '', department: '', academicYear: '', term: 'Term 1', notes: '', fileName: '' });
  const [fileData, setFileData] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState('');
  const fileRef = useRef();
  const [visibleCount, setVisibleCount] = useState(10);
  const [syncStatus, setSyncStatus] = useState('');

  const mine = staffQuestions.filter(q => q.staffId === staffId).sort((a, b) => b.timestamp?.localeCompare(a.timestamp));

  const handleFile = e => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => setFileData({ name: file.name, base64: ev.target.result, type: file.type });
    reader.readAsDataURL(file);
    setForm(p => ({ ...p, fileName: file.name }));
  };

  const handleSubmit = async () => {
    if (!form.subject || !form.department) { setMsg('Subject and Department are required.'); return; }
    setSubmitting(true);
    setSyncStatus('saving');
    setMsg('Saving examination questions...');
    const existingVersions = staffQuestions.filter(q => q.staffId === staffId && q.subject === form.subject && q.type === examType);
    const version = existingVersions.length + 1;
    const rec = {
      id: uid(), staffId, staffName,
      staffEmail: user?.email || '',
      email: user?.email || '',
      schoolId: user?.schoolId || 'default',
      type: examType, ...form, version, approvalStatus: 'draft', adminComment: '',
      uploadDate: todayStr(), uploadTime: nowStr(), timestamp: ts(),
      fileData: fileData?.base64 || null, fileType: fileData?.type || null,
      uploadedBy: staffName
    };
    try {
      if (navigator.onLine === false) throw new Error('Question submission requires a live backend connection.');
      const created = await syncWithBackend?.('staffQuestions', rec, 'add');
      if (created === 'queued') {
        setStaffQuestions([...staffQuestions, { ...rec, syncStatus: 'queued', syncUpdatedAt: ts() }]);
        setSyncStatus('queued');
        setMsg(`Version ${version} draft queued. Submit it after synchronization completes.`);
        setSubmitting(false);
        return;
      }
      if (created !== true) throw new Error('The backend did not confirm question creation.');
      const submitted = await workflowRequest(backendUrl, token, 'staffQuestions', rec.id, 'submit');
      if (!submitted?.success || !submitted.item) throw new Error('The backend did not confirm question submission.');
      setStaffQuestions([...staffQuestions, { ...submitted.item, syncStatus: 'saved', syncUpdatedAt: ts() }]);
      setSyncStatus('saved');
      setMsg(`Version ${version} submitted successfully.`);
      addNotification(`${examType === 'midterm' ? 'Midterm' : 'End-of-Term'} questions submitted for ${form.subject}.`, 'success');
      setForm({ subject: '', department: '', academicYear: '', term: 'Term 1', notes: '', fileName: '' });
      setFileData(null);
    } catch (error) {
      setSyncStatus('failed');
      setMsg(`${error.message} The submission was not completed or queued.`);
    }
    setSubmitting(false);
  };

  return (
    <div>
      <SectionTitle icon={ClipboardCheck} title="Examination Question Submission" subtitle="Submit midterm and end-of-term examination questions for review." />

      {/* Type Selector */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
        {[{ val: 'midterm', label: 'Midterm Exam', icon: FileText }, { val: 'endterm', label: 'End-of-Term Exam', icon: ClipboardCheck }].map(t => (
          <button key={t.val} onClick={() => setExamType(t.val)} style={{ padding: '10px 22px', borderRadius: 12, border: '2px solid', borderColor: examType === t.val ? 'var(--accent)' : 'var(--border-color)', background: examType === t.val ? 'var(--accent-glow)' : 'transparent', color: 'var(--text-main)', fontWeight: 800, fontSize: 14, cursor: 'pointer' }}>
            <t.icon size={15} style={{ marginRight: 7, verticalAlign: 'middle' }} />{t.label}
          </button>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))', gap: 24 }}>
        <Card>
          <h3 style={{ margin: '0 0 18px', fontWeight: 800, fontSize: 16 }}>Submit {examType === 'midterm' ? 'Midterm' : 'End-of-Term'} Questions</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {[
              { key: 'subject', label: 'Subject *', placeholder: 'e.g. Science' },
              { key: 'department', label: 'Department *', placeholder: 'e.g. JHS' },
              { key: 'academicYear', label: 'Academic Year', placeholder: '2024/2025' },
            ].map(f => (
              <div key={f.key}>
                <label style={{ display: 'block', fontWeight: 700, fontSize: 12, marginBottom: 4 }}>{f.label}</label>
                <input value={form[f.key]} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                  placeholder={f.placeholder} style={{ width: '100%', padding: '9px 12px', borderRadius: 10, border: '1px solid var(--border-color)', background: 'var(--bg-page)', color: 'var(--text-main)', fontSize: 13, boxSizing: 'border-box' }} />
              </div>
            ))}
            <div>
              <label style={{ display: 'block', fontWeight: 700, fontSize: 12, marginBottom: 4 }}>Term</label>
              <select value={form.term} onChange={e => setForm(p => ({ ...p, term: e.target.value }))} style={{ width: '100%', padding: '9px 12px', borderRadius: 10, border: '1px solid var(--border-color)', background: 'var(--bg-page)', color: 'var(--text-main)', fontSize: 13 }}>
                <option>Term 1</option><option>Term 2</option><option>Term 3</option>
              </select>
            </div>
          </div>
          <div style={{ marginTop: 12 }}>
            <label style={{ display: 'block', fontWeight: 700, fontSize: 12, marginBottom: 4 }}>Additional Notes</label>
            <textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} rows={2}
              placeholder="Any special instructions..." style={{ width: '100%', padding: '9px 12px', borderRadius: 10, border: '1px solid var(--border-color)', background: 'var(--bg-page)', color: 'var(--text-main)', fontSize: 13, resize: 'vertical', boxSizing: 'border-box' }} />
          </div>
          <div style={{ marginTop: 12 }}>
            <label style={{ display: 'block', fontWeight: 700, fontSize: 12, marginBottom: 8 }}>Attach Questions File (PDF / DOCX)</label>
            <div onClick={() => fileRef.current?.click()} style={{ border: '2px dashed var(--border-color)', borderRadius: 12, padding: '18px', textAlign: 'center', cursor: 'pointer' }}>
              <Upload size={20} style={{ color: 'var(--accent)', marginBottom: 6 }} />
              <p style={{ margin: 0, fontSize: 13, fontWeight: 700 }}>{fileData ? fileData.name : 'Attach exam questions file'}</p>
            </div>
            <input ref={fileRef} type="file" accept=".pdf,.docx" onChange={handleFile} style={{ display: 'none' }} />
          </div>
          <button onClick={handleSubmit} disabled={submitting} style={{ marginTop: 16, width: '100%', padding: '13px', borderRadius: 12, border: 'none', background: 'linear-gradient(135deg,#6366f1,#4f46e5)', color: '#fff', fontWeight: 800, fontSize: 14, cursor: 'pointer' }}>
            <Send size={15} style={{ marginRight: 8, verticalAlign: 'middle' }} />
            {submitting ? 'Submitting...' : 'Submit Questions'}
          </button>
           {msg && <p role={syncStatus === 'failed' ? 'alert' : 'status'} style={{ marginTop: 10, fontSize: 13, fontWeight: 700, color: syncStatus === 'saved' ? '#10b981' : syncStatus === 'queued' || syncStatus === 'saving' ? '#f59e0b' : '#ef4444' }}>{msg}</p>}
        </Card>

        <Card>
          <h3 style={{ margin: '0 0 18px', fontWeight: 800, fontSize: 16 }}>My Submission History</h3>
          {mine.length === 0 ? (
            <p style={{ textAlign: 'center', opacity: 0.4, padding: '30px 0' }}>No exam question submissions yet.</p>
          ) : mine.slice(0, visibleCount).map(q => (
            <div key={q.id} style={{ padding: '12px 0', borderBottom: '1px solid var(--border-color)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
                <p style={{ margin: 0, fontWeight: 800, fontSize: 14 }}>{q.subject}</p>
                <div style={{ display: 'flex', gap: 6 }}>
                  <Badge status={q.type === 'midterm' ? 'pending' : 'revision'} label={q.type === 'midterm' ? 'Midterm' : 'End-Term'} />
                  <Badge status={q.approvalStatus} />
                  <SyncBadge item={q} />
                </div>
              </div>
              <p style={{ margin: '4px 0 0', fontSize: 12, opacity: 0.6 }}>{q.department} · {q.term} · v{q.version} · {q.uploadDate}</p>
              {q.adminComment && <p style={{ margin: '6px 0 0', fontSize: 12, background: 'var(--accent-glow)', padding: '6px 10px', borderRadius: 8, fontStyle: 'italic', display: 'flex', alignItems: 'center', gap: 5 }}><MessageSquare size={13} /> {q.adminComment}</p>}
            </div>
          ))}
          {mine.length > visibleCount && <button onClick={() => setVisibleCount(c => c + 10)} style={{ marginTop: 12, width: '100%', padding: 8, borderRadius: 9, border: '1px solid var(--border-color)', background: 'var(--bg-page)', color: 'var(--text-main)', cursor: 'pointer', fontWeight: 700 }}>Showing {visibleCount} of {mine.length}. Show 10 more</button>}
        </Card>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// TAB: MY SUBMISSIONS
// ─────────────────────────────────────────────

function SubmissionsTab({ user, staff, staffId, lessonNotes, staffQuestions }) {
  const params = new URLSearchParams(window.location.search);
  const [typeFilter, setTypeFilter] = useState(() => params.get('submissionType') || 'all');
  const [statusFilter, setStatusFilter] = useState(() => params.get('submissionStatus') || 'all');
  const [page, setPage] = useState(1);

  const userEmail = (user?.email || '').toLowerCase().trim();

  const notes = lessonNotes.filter(n => {
    const byId = staffId && n.staffId === staffId;
    const byEmail = userEmail && (
      (n.staffEmail || '').toLowerCase() === userEmail ||
      (n.email || '').toLowerCase() === userEmail
    );
    const rec = staff?.find(s => s.id === n.staffId);
    const byRecEmail = rec && (rec.email || '').toLowerCase() === userEmail;
    return byId || byEmail || byRecEmail;
  }).map(n => ({ ...n, _type: 'Lesson Note' }));

  const questions = staffQuestions.filter(q => {
    const byId = staffId && q.staffId === staffId;
    const byEmail = userEmail && (
      (q.staffEmail || '').toLowerCase() === userEmail ||
      (q.email || '').toLowerCase() === userEmail
    );
    const rec = staff?.find(s => s.id === q.staffId);
    const byRecEmail = rec && (rec.email || '').toLowerCase() === userEmail;
    return byId || byEmail || byRecEmail;
  }).map(q => ({ ...q, _type: q.type === 'midterm' ? 'Midterm Questions' : 'End-Term Questions' }));

  const all = [...notes, ...questions].sort((a, b) => b.timestamp?.localeCompare(a.timestamp));

  const filtered = all
    .filter(r => typeFilter === 'all' || r._type === typeFilter)
    .filter(r => statusFilter === 'all' || r.approvalStatus === statusFilter);
  const pageSize = 20;
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  useEffect(() => {
    const next = new URLSearchParams(window.location.search);
    typeFilter === 'all' ? next.delete('submissionType') : next.set('submissionType', typeFilter);
    statusFilter === 'all' ? next.delete('submissionStatus') : next.set('submissionStatus', statusFilter);
    window.history.replaceState(null, '', `${window.location.pathname}${next.size ? `?${next}` : ''}${window.location.hash}`);
    setPage(1);
  }, [typeFilter, statusFilter]);

  return (
    <div>
      <SectionTitle icon={FileText} title="My Submissions" subtitle="Full history of all your lesson notes and examination question submissions." />
      <Card>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
          <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} style={{ padding: '8px 12px', borderRadius: 10, border: '1px solid var(--border-color)', background: 'var(--bg-page)', color: 'var(--text-main)', fontSize: 13, fontWeight: 700 }}>
            <option value="all">All Types</option>
            <option value="Lesson Note">Lesson Notes</option>
            <option value="Midterm Questions">Midterm Questions</option>
            <option value="End-Term Questions">End-Term Questions</option>
          </select>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ padding: '8px 12px', borderRadius: 10, border: '1px solid var(--border-color)', background: 'var(--bg-page)', color: 'var(--text-main)', fontSize: 13, fontWeight: 700 }}>
            <option value="all">All Statuses</option>
            <option value="submitted">Submitted</option>
            <option value="pending">Pending (legacy)</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="revision">Needs Revision</option>
          </select>
          <div style={{ marginLeft: 'auto', fontSize: 13, fontWeight: 700, opacity: 0.6, alignSelf: 'center' }}>
            {filtered.length} record(s)
          </div>
        </div>

        {filtered.length === 0 ? (
          <p style={{ textAlign: 'center', opacity: 0.4, padding: '40px 0' }}>No submissions match your filter.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--border-color)' }}>
                  <th style={{ textAlign: 'left', padding: '8px 12px', fontWeight: 800 }}>Type</th>
                  <th style={{ textAlign: 'left', padding: '8px 12px', fontWeight: 800 }}>Subject</th>
                  <th style={{ textAlign: 'left', padding: '8px 12px', fontWeight: 800 }}>Term / Week</th>
                  <th style={{ textAlign: 'left', padding: '8px 12px', fontWeight: 800 }}>Submitted</th>
                  <th style={{ textAlign: 'left', padding: '8px 12px', fontWeight: 800 }}>Status</th>
                  <th style={{ textAlign: 'left', padding: '8px 12px', fontWeight: 800 }}>Comment</th>
                </tr>
              </thead>
              <tbody>
                {filtered.slice((page - 1) * pageSize, page * pageSize).map(r => (
                  <tr key={r.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                    <td style={{ padding: '10px 12px', fontWeight: 700 }}>{r._type}</td>
                    <td style={{ padding: '10px 12px' }}>
                      <div>{r.subject}</div>
                      {r.fileData && (
                        <a href={r.fileData} download={r.fileName || `${r.subject}_document`} style={{ fontSize: '11px', color: 'var(--accent)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4, marginTop: 4, fontWeight: 700 }}>
                          <Download size={12} /> Download Document
                        </a>
                      )}
                    </td>
                    <td style={{ padding: '10px 12px', opacity: 0.7 }}>{r.term}{r.week ? ` · Wk ${r.week}` : ''}{r.version ? ` · v${r.version}` : ''}</td>
                    <td style={{ padding: '10px 12px', opacity: 0.7 }}>{r.uploadDate} {r.uploadTime}</td>
                    <td style={{ padding: '10px 12px' }}><Badge status={r.approvalStatus} /> <SyncBadge item={r} /></td>
                    <td style={{ padding: '10px 12px', fontStyle: 'italic', opacity: 0.7, maxWidth: 200 }}>{r.adminComment || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {filtered.length > pageSize && <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}><button className="btn btn-secondary" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Previous</button><span style={{ alignSelf: 'center', fontSize: 12 }}>Page {page} of {pageCount}</span><button className="btn btn-secondary" disabled={page === pageCount} onClick={() => setPage(p => p + 1)}>Next</button></div>}
      </Card>
    </div>
  );
}

// ─────────────────────────────────────────────
// TAB: TASKS (Non-Teaching)
// ─────────────────────────────────────────────

function TasksTab({ user, staffId, staffTasks, setStaffTasks, syncWithBackend, isAdmin, staff, backendUrl, token }) {
  // Match tasks to the current user by email (the common link between user auth and staff records)
  // Admins see ALL tasks; staff see only tasks assigned to them
  const userEmail = (user?.email || '').toLowerCase().trim();
  const myTasks = isAdmin
    ? [...staffTasks].sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''))
    : staffTasks.filter(t => {
        // Try matching by the timestamp-based staff record ID
        const byId = t.staffId === staffId || t.assignTo === staffId;
        // Try matching by email fields stored on task creation
        const byEmail = userEmail && (
          (t.assigneeEmail || '').toLowerCase() === userEmail ||
          (t.staffEmail || '').toLowerCase() === userEmail
        );
        // Try looking up the staff record and comparing emails
        const rec = staff.find(s => s.id === t.staffId || s.id === t.assignTo);
        const byRecEmail = rec && (rec.email || '').toLowerCase() === userEmail;
        return byId || byEmail || byRecEmail;
      }).sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));
  const [newTask, setNewTask] = useState({ title: '', description: '', assignTo: '', dueDate: '' });
  const [msg, setMsg] = useState('');
  const [fileData, setFileData] = useState(null);
  const taskFileRef = useRef(null);
  const [adminView, setAdminView] = useState('all');

  useEffect(() => {
    if (staff && staff.length > 0 && !newTask.assignTo) {
      setNewTask(p => ({ ...p, assignTo: staff[0].id }));
    }
  }, [staff]);

  const handleMarkDone = async (taskId) => {
    const updated = staffTasks.map(t => t.id === taskId ? { ...t, status: 'completed', completedAt: ts() } : t);
    setStaffTasks(updated);
    const updatedTask = updated.find(task => task.id === taskId);
    await syncWithBackend('staffTasks', updatedTask, 'update', taskId);
  };

  const handleTaskFile = e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => setFileData({ name: file.name, base64: ev.target.result, type: file.type });
    reader.readAsDataURL(file);
  };

  const handleTaskSubmitFile = (e, taskId) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const updated = staffTasks.map(t => {
        if (t.id === taskId) {
          return {
            ...t,
            fileName: file.name,
            fileData: ev.target.result,
            fileType: file.type,
            uploadDate: todayStr(),
            uploadTime: nowStr(),
            approvalStatus: 'draft',
            status: 'pending',
            assignedBy: t.assignedBy || t.createdBy,
            createdBy: userEmail,
            email: userEmail
          };
        }
        return t;
      });
      try {
        if (navigator.onLine === false) throw new Error('Task submission requires a live backend connection.');
        const updatedTask = updated.find(task => task.id === taskId);
        const created = await syncWithBackend('staffTasks', updatedTask, 'update', taskId);
        if (created === 'queued') {
          setStaffTasks(updated.map(task => task.id === taskId ? { ...task, syncStatus: 'queued', syncUpdatedAt: ts() } : task));
          setMsg('Task document update queued. Submit it after synchronization completes.');
          return;
        }
        if (created !== true) throw new Error('The backend did not confirm the task document update.');
        const submitted = await workflowRequest(backendUrl, token, 'staffTasks', taskId, 'submit');
        if (!submitted?.success || !submitted.item) throw new Error('The backend did not confirm task submission.');
        setStaffTasks(staffTasks.map(task => task.id === taskId ? { ...task, ...submitted.item, syncStatus: 'saved', syncUpdatedAt: ts() } : task));
        setMsg('Task document submitted successfully.');
      } catch (error) {
        setMsg(`${error.message} The task submission was not completed or queued.`);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleAdd = async () => {
    if (!newTask.title) return;
    const assignedRec = staff.find(s => s.id === (newTask.assignTo || staff[0]?.id));
    const assignedName = assignedRec ? assignedRec.name : (user?.name || user?.email || 'Staff Member');
    const assignedEmail = ((assignedRec?.email) || userEmail || '').toLowerCase();

    const t = {
      id: uid(),
      staffId: assignedRec?.id || staffId,
      assignTo: assignedRec?.id || staffId,
      assigneeEmail: assignedEmail,
      staffName: assignedName,
      staffEmail: assignedEmail,
      schoolId: user?.schoolId || 'default',
      title: newTask.title,
      description: newTask.description,
      dueDate: newTask.dueDate,
      status: 'pending',
      approvalStatus: fileData ? 'pending' : '',
      fileName: fileData ? fileData.name : null,
      fileData: fileData ? fileData.base64 : null,
      fileType: fileData ? fileData.type : null,
      uploadDate: fileData ? todayStr() : null,
      uploadTime: fileData ? nowStr() : null,
      createdBy: assignedEmail,
      assignedBy: user?.name || user?.email,
      createdByEmail: userEmail,
      timestamp: ts()
    };
    const created = await syncWithBackend('staffTasks', t, 'add');
    if (!created) {
      setMsg('Task could not be assigned. Please try again.');
      return;
    }
    setStaffTasks([...staffTasks, t]);
    setNewTask({ title: '', description: '', assignTo: staff[0]?.id || '', dueDate: '' });
    setFileData(null);
    setMsg('Task assigned successfully!');
    setTimeout(() => setMsg(''), 3000);
  };

  // Tasks that have an uploaded document pending admin review
  const pendingDocTasks = staffTasks.filter(t => t.fileData && (!t.approvalStatus || ['pending', 'submitted'].includes(t.approvalStatus)));

  // Reusable task row component
  const TaskCard = ({ t }) => {
    const isDone = t.status === 'completed' || t.approvalStatus === 'approved';
    const rec = staff.find(s => s.id === t.staffId || s.id === t.assignTo);
    const displayName = t.staffName || rec?.name || 'Staff Member';
    return (
      <div style={{ padding: '14px 0', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <button
          onClick={() => !isDone && handleMarkDone(t.id)}
          style={{ width: 22, height: 22, borderRadius: 6, border: '2px solid', borderColor: isDone ? '#10b981' : 'var(--border-color)', background: isDone ? '#10b981' : 'transparent', cursor: isDone ? 'default' : 'pointer', flexShrink: 0, marginTop: 2, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          {isDone && <CheckCircle size={12} style={{ color: '#fff' }} />}
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <p style={{ margin: 0, fontWeight: 800, fontSize: 14, textDecoration: isDone ? 'line-through' : 'none', opacity: isDone ? 0.5 : 1 }}>{t.title}</p>
            {isAdmin && displayName && <span style={{ fontSize: 11, opacity: 0.5, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}><ArrowRight size={12} aria-hidden="true" /> {displayName}</span>}
          </div>
          {t.description && <p style={{ margin: '3px 0 0', fontSize: 12, opacity: 0.6 }}>{t.description}</p>}

          {t.fileName && (
            <p style={{ margin: '6px 0 0', fontSize: 11, fontWeight: 700, color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
              <Paperclip size={12} /> {t.fileName}
              {t.fileData && <a href={t.fileData} download={t.fileName} style={{ fontSize: 10, color: 'var(--accent)', marginLeft: 4, textDecoration: 'underline' }}>(Download)</a>}
              {['pending', 'submitted'].includes(t.approvalStatus) && <span style={{ background: '#f59e0b22', color: '#f59e0b', padding: '1px 7px', borderRadius: 4, fontWeight: 800, fontSize: 10 }}>Pending Review</span>}
              {t.approvalStatus === 'approved' && <span style={{ background: '#10b98122', color: '#10b981', padding: '1px 7px', borderRadius: 4, fontWeight: 800, fontSize: 10 }}>Approved</span>}
              {t.approvalStatus === 'rejected' && <span style={{ background: '#ef444422', color: '#ef4444', padding: '1px 7px', borderRadius: 4, fontWeight: 800, fontSize: 10 }}>Rejected</span>}
            </p>
          )}

          {t.adminComment && (
            <p style={{ margin: '6px 0 0', fontSize: 12, background: 'rgba(99,102,241,0.08)', padding: '6px 10px', borderRadius: 8, fontStyle: 'italic', display: 'flex', alignItems: 'center', gap: 5 }}>
              <MessageSquare size={13} /> Admin: {t.adminComment}
            </p>
          )}

          {!isDone && !isAdmin && (
            <div style={{ marginTop: 8 }}>
              <input type="file" id={`task-upload-${t.id}`} accept=".pdf,.docx,image/*" onChange={(e) => handleTaskSubmitFile(e, t.id)} style={{ display: 'none' }} />
              <button
                onClick={() => document.getElementById(`task-upload-${t.id}`).click()}
                style={{ padding: '5px 12px', borderRadius: 8, border: '1px solid var(--accent)', background: 'transparent', color: 'var(--accent)', fontSize: 11, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}
              >
                <Upload size={11} /> {t.fileData ? 'Re-upload Document' : 'Upload Document for Review'}
              </button>
            </div>
          )}

          <p style={{ margin: '6px 0 0', fontSize: 11, opacity: 0.4 }}>
            Due: {t.dueDate || 'No deadline'} · Assigned by {t.createdBy || 'Admin'}
          </p>
        </div>
      </div>
    );
  };

  return (
    <div>
      <SectionTitle icon={CheckSquare} title={isAdmin ? 'Task Management' : 'My Tasks'} subtitle={isAdmin ? 'Assign tasks and review submitted documents from staff.' : 'View tasks assigned to you and upload required documents for review.'} />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', gap: 24 }}>

        {/* Form */}
        <Card style={{ flex: 1, minWidth: 280 }}>
          <h3 style={{ margin: '0 0 16px', fontWeight: 800, fontSize: 16 }}>
            {isAdmin ? 'Assign New Task' : 'Submit Task / Document'}
          </h3>
          <input placeholder="Task title *" value={newTask.title} onChange={e => setNewTask(p => ({ ...p, title: e.target.value }))} style={{ width: '100%', padding: '9px 12px', borderRadius: 10, border: '1px solid var(--border-color)', background: 'var(--bg-page)', color: 'var(--text-main)', fontSize: 13, marginBottom: 10, boxSizing: 'border-box' }} />
          <textarea placeholder="Description (optional)..." value={newTask.description} onChange={e => setNewTask(p => ({ ...p, description: e.target.value }))} rows={2} style={{ width: '100%', padding: '9px 12px', borderRadius: 10, border: '1px solid var(--border-color)', background: 'var(--bg-page)', color: 'var(--text-main)', fontSize: 13, marginBottom: 10, resize: 'vertical', boxSizing: 'border-box' }} />
          {isAdmin && staff.length > 0 && (
            <select value={newTask.assignTo} onChange={e => setNewTask(p => ({ ...p, assignTo: e.target.value }))} style={{ width: '100%', padding: '9px 12px', borderRadius: 10, border: '1px solid var(--border-color)', background: 'var(--bg-page)', color: 'var(--text-main)', fontSize: 13, marginBottom: 10 }}>
              <option value="">-- Select Staff Member --</option>
              {staff.map(s => <option key={s.id} value={s.id}>{s.name}{s.email ? ` (${s.email})` : ''}</option>)}
            </select>
          )}
          <input type="date" value={newTask.dueDate} onChange={e => setNewTask(p => ({ ...p, dueDate: e.target.value }))} style={{ width: '100%', padding: '9px 12px', borderRadius: 10, border: '1px solid var(--border-color)', background: 'var(--bg-page)', color: 'var(--text-main)', fontSize: 13, marginBottom: 10, boxSizing: 'border-box' }} />

          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontWeight: 700, fontSize: 12, marginBottom: 6, opacity: 0.7 }}><Paperclip size={13} /> Attach Document (Optional)</label>
            <div onClick={() => taskFileRef.current?.click()} style={{ border: `2px dashed ${fileData ? 'var(--accent)' : 'var(--border-color)'}`, borderRadius: 12, padding: '14px', textAlign: 'center', cursor: 'pointer', background: fileData ? 'rgba(99,102,241,0.08)' : 'var(--bg-page)', transition: 'all 0.2s' }}>
              <Upload size={18} style={{ color: 'var(--accent)', marginBottom: 4 }} />
              <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: fileData ? 'var(--accent)' : 'var(--text-muted)' }}>{fileData ? fileData.name : 'Choose file (PDF / DOCX / Image)'}</p>
            </div>
            <input ref={taskFileRef} type="file" accept=".pdf,.docx,image/*" onChange={handleTaskFile} style={{ display: 'none' }} />
            {fileData && <button onClick={() => setFileData(null)} style={{ marginTop: 4, fontSize: 11, background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontWeight: 700 }}><X size={12} style={{ marginRight: 4, verticalAlign: 'middle' }} />Remove file</button>}
          </div>

          <button onClick={handleAdd} disabled={!newTask.title.trim() || (isAdmin && !newTask.assignTo)} style={{ width: '100%', padding: '11px', borderRadius: 12, border: 'none', background: (!newTask.title.trim() || (isAdmin && !newTask.assignTo)) ? '#6b7280' : 'linear-gradient(135deg,#8b5cf6,#6366f1)', color: '#fff', fontWeight: 800, cursor: (!newTask.title.trim() || (isAdmin && !newTask.assignTo)) ? 'not-allowed' : 'pointer' }}>
            {isAdmin ? 'Assign Task' : 'Submit Task'}
          </button>
          {msg && <p style={{ color: '#10b981', fontWeight: 700, marginTop: 10, fontSize: 13 }}>{msg}</p>}
        </Card>

        {/* Task list */}
        <Card style={{ flex: 1, minWidth: 280 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
            <h3 style={{ margin: 0, fontWeight: 800, fontSize: 16 }}>{isAdmin ? `All Tasks (${myTasks.length})` : `My Tasks (${myTasks.length})`}</h3>
            {isAdmin && pendingDocTasks.length > 0 && (
              <span style={{ background: '#f59e0b22', color: '#f59e0b', padding: '4px 10px', borderRadius: 8, fontSize: 11, fontWeight: 800 }}><AlertCircle size={12} style={{ marginRight: 4, verticalAlign: 'middle' }} />{pendingDocTasks.length} doc(s) pending review</span>
            )}
            {isAdmin && (
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={() => setAdminView('all')} style={{ padding: '4px 10px', borderRadius: 8, border: '1px solid var(--border-color)', background: adminView === 'all' ? 'var(--accent)' : 'transparent', color: adminView === 'all' ? '#fff' : 'var(--text-main)', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>All</button>
                <button onClick={() => setAdminView('pending-docs')} style={{ padding: '4px 10px', borderRadius: 8, border: '1px solid var(--border-color)', background: adminView === 'pending-docs' ? '#f59e0b' : 'transparent', color: adminView === 'pending-docs' ? '#fff' : 'var(--text-main)', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>Docs Pending</button>
              </div>
            )}
          </div>
          {(() => {
            const displayTasks = isAdmin && adminView === 'pending-docs' ? pendingDocTasks : myTasks;
            if (displayTasks.length === 0) return <p style={{ textAlign: 'center', opacity: 0.4, padding: '30px 0' }}>{isAdmin && adminView === 'pending-docs' ? 'No pending document reviews.' : 'No tasks yet.'}</p>;
            return displayTasks.map(t => <TaskCard key={t.id} t={t} />);
          })()}
        </Card>

      </div>
    </div>
  );
}


// ─────────────────────────────────────────────
// TAB: PERFORMANCE (Staff View)
// ─────────────────────────────────────────────

function PerformanceTab({ staffId, staffName, role, staffAttendance, lessonNotes, staffQuestions, reports, students, attendance, staffDisciplinary, isTeaching, staffTasks, performanceRecords }) {
  const myAtt = staffAttendance.filter(r => r.staffId === staffId);
  const presentDays = myAtt.filter(r => r.status === 'present').length;
  const lateDays = myAtt.filter(r => r.status === 'late').length;
  const attRate = myAtt.length > 0 ? Math.round(((presentDays + lateDays) / myAtt.length) * 100) : 0;
  const punctRate = myAtt.length > 0 ? Math.round((1 - lateDays / myAtt.length) * 100) : 0;

  const myNotes = lessonNotes.filter(n => n.staffId === staffId);
  const approvedNotes = myNotes.filter(n => n.approvalStatus === 'approved').length;
  const noteScore = myNotes.length > 0 ? Math.round((approvedNotes / myNotes.length) * 100) : 0;

  const myQ = staffQuestions.filter(q => q.staffId === staffId);
  const approvedQ = myQ.filter(q => q.approvalStatus === 'approved').length;
  const qScore = myQ.length > 0 ? Math.round((approvedQ / myQ.length) * 100) : 0;

  const myTasks = staffTasks.filter(t => t.staffId === staffId);
  const doneT = myTasks.filter(t => t.status === 'completed').length;
  const taskScore = myTasks.length > 0 ? Math.round((doneT / myTasks.length) * 100) : 0;

  const disc = staffDisciplinary.filter(d => d.staffId === staffId);

  const overallRaw = isTeaching
    ? (attRate * 0.15 + punctRate * 0.10 + noteScore * 0.10 + qScore * 0.10 + 75 * 0.30 + 80 * 0.25)
    : (attRate * 0.30 + taskScore * 0.30 + 80 * 0.40);
  const backendPerformance = performanceRecords.find(item => item.staffId === staffId);
  const overall = backendPerformance?.finalScore ?? Math.max(0, Math.min(100, Math.round(overallRaw - disc.length * 5)));
  const usesEstimates = !backendPerformance;

  const scoreColor = overall >= 90 ? '#10b981' : overall >= 80 ? '#8b5cf6' : overall >= 70 ? '#f59e0b' : '#ef4444';
  const scoreLabel = overall >= 90 ? 'Excellent' : overall >= 80 ? 'Very Good' : overall >= 70 ? 'Good' : overall >= 60 ? 'Needs Improvement' : 'Poor Performance';

  const metrics = isTeaching ? [
    { label: 'Attendance Rate', score: attRate, color: '#10b981', icon: CalendarDays, source: myAtt.length ? 'Measured' : 'No data' },
    { label: 'Punctuality', score: punctRate, color: '#6366f1', icon: Clock, source: myAtt.length ? 'Measured' : 'No data' },
    { label: 'Lesson Notes', score: noteScore, total: myNotes.length, color: '#8b5cf6', icon: BookOpen, source: myNotes.length ? 'Measured' : 'No data' },
    { label: 'Exam Submissions', score: qScore, total: myQ.length, color: '#f59e0b', icon: ClipboardCheck, source: myQ.length ? 'Measured' : 'No data' },
  ] : [
    { label: 'Attendance Rate', score: attRate, color: '#10b981', icon: CalendarDays, source: myAtt.length ? 'Measured' : 'No data' },
    { label: 'Task Completion', score: taskScore, total: myTasks.length, color: '#8b5cf6', icon: CheckSquare, source: myTasks.length ? 'Measured' : 'No data' },
  ];

  return (
    <div>
      <SectionTitle icon={TrendingUp} title="My Performance" subtitle="Recorded metrics and an estimated overall score based on available workspace data." />

      {/* Big Score */}
      <Card style={{ marginBottom: 24, background: `linear-gradient(135deg, ${scoreColor}11, ${scoreColor}05)`, borderColor: scoreColor + '44' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 28, flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', width: 140, height: 140 }}>
            <svg width="140" height="140" viewBox="0 0 140 140">
              <circle cx="70" cy="70" r="56" fill="none" stroke="var(--border-color)" strokeWidth="12" />
              <circle cx="70" cy="70" r="56" fill="none" stroke={scoreColor} strokeWidth="12"
                strokeDasharray={`${2 * Math.PI * 56}`}
                strokeDashoffset={`${2 * Math.PI * 56 * (1 - overall / 100)}`}
                strokeLinecap="round" transform="rotate(-90 70 70)"
              />
            </svg>
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}>
              <span style={{ fontWeight: 900, fontSize: 34, color: scoreColor }}>{overall}</span>
              <span style={{ fontSize: 11, opacity: 0.5, fontWeight: 700 }}>/ 100</span>
            </div>
          </div>
          <div>
            <h2 style={{ margin: 0, fontSize: 28, fontWeight: 900, color: scoreColor }}>{usesEstimates ? 'Estimated: ' : ''}{scoreLabel}</h2>
            <p style={{ margin: '6px 0', fontSize: 14, opacity: 0.7 }}>{staffName} · {role}</p>
            <Badge status={overall >= 70 ? 'approved' : overall >= 60 ? 'pending' : 'rejected'} label={scoreLabel} />
            {disc.length > 0 && <p style={{ margin: '8px 0 0', fontSize: 12, color: '#ef4444', fontWeight: 700 }}><AlertCircle size={13} style={{ marginRight: 5, verticalAlign: 'middle' }} />Score reduced by {disc.length * 5}% due to {disc.length} disciplinary record(s).</p>}
            <p style={{ margin: '8px 0 0', fontSize: 12, opacity: 0.6 }}>Estimate only: placeholder evaluation values are used where this workspace has no recorded evaluation data.</p>
          </div>
        </div>
      </Card>

      {/* Metric Breakdown */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 16, marginBottom: 24 }}>
        {metrics.map(m => (
          <Card key={m.label}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <m.icon size={16} style={{ color: m.color }} />
              <span style={{ fontWeight: 800, fontSize: 14 }}>{m.label}</span>
              <span style={{ marginLeft: 'auto', fontSize: 9, fontWeight: 900, color: m.source === 'Measured' ? '#10b981' : '#64748b', textTransform: 'uppercase' }}>{m.source}</span>
            </div>
            <div style={{ background: 'var(--border-color)', borderRadius: 20, height: 8, overflow: 'hidden', marginBottom: 8 }}>
              <div style={{ height: '100%', width: `${m.score}%`, background: m.color, borderRadius: 20, transition: 'width 0.8s ease' }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, opacity: 0.7 }}>
              <span style={{ fontWeight: 800, color: m.color }}>{m.total === 0 || ((m.label === 'Attendance Rate' || m.label === 'Punctuality') && myAtt.length === 0) ? 'N/A' : `${m.score}%`}</span>
              {m.total !== undefined && <span>{m.total} record(s)</span>}
            </div>
          </Card>
        ))}
      </div>

      {/* Attendance History */}
      <Card>
        <h3 style={{ margin: '0 0 16px', fontWeight: 800, fontSize: 16 }}>Attendance History (Last 30 Days)</h3>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {myAtt.slice(-30).map(r => (
            <div key={r.id} title={`${r.date}: ${r.status}`} style={{ width: 24, height: 24, borderRadius: 6, background: STATUS_COLORS[r.status] || '#64748b', cursor: 'default', position: 'relative' }} />
          ))}
        </div>
        <div style={{ display: 'flex', gap: 16, marginTop: 12, flexWrap: 'wrap' }}>
          {Object.entries(STATUS_COLORS).map(([k, v]) => (
            <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, opacity: 0.8 }}>
              <div style={{ width: 10, height: 10, borderRadius: 3, background: v }} />
              <span style={{ textTransform: 'capitalize' }}>{k}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

// ─────────────────────────────────────────────
// TAB: AWARDS
// ─────────────────────────────────────────────

function AwardsTab({ staffId, staffName, staffAwards, setStaffAwards, syncWithBackend, isAdmin, staff, addNotification }) {
  const [form, setForm] = useState({ title: 'Best Teacher of the Month', customTitle: '', reason: '', recipientId: staffId, recipientName: staffName, date: todayStr() });
  const [msg, setMsg] = useState('');

  const AWARD_TYPES = [
    'Best Teacher of the Month', 'Best Performing Staff', 'Most Improved Staff',
    'Best Attendance Award', 'Academic Excellence Award', 'Outstanding Service Award', 'Custom...'
  ];

  const myAwards = staffAwards.filter(a => a.staffId === staffId);

  const handleGrant = async () => {
    const title = form.title === 'Custom...' ? form.customTitle : form.title;
    if (!title || !form.recipientId) { setMsg('Title and recipient are required.'); return; }
    const rec = { id: uid(), staffId: form.recipientId, staffName: form.recipientName || staffName, schoolId: 'default', title, reason: form.reason, date: form.date, timestamp: ts() };
    const saved = await syncWithBackend('staffAwards', rec, 'add');
    if (!saved) return setMsg('Award could not be saved.');
    setStaffAwards([...staffAwards, rec]);
    addNotification(`Award "${title}" granted to ${form.recipientName}.`);
    setMsg(`Award granted to ${form.recipientName}!`);
    setTimeout(() => setMsg(''), 3000);
  };

  return (
    <div>
      <SectionTitle icon={Award} title="Awards & Recognition" subtitle="View your earned recognitions and achievements." />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', gap: 24 }}>
        {/* Grant Award (Admin Only) */}
        {isAdmin && (
          <Card>
            <h3 style={{ margin: '0 0 16px', fontWeight: 800, fontSize: 16 }}>Grant Award</h3>
            <label style={{ display: 'block', fontWeight: 700, fontSize: 12, marginBottom: 4 }}>Award Type</label>
            <select value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} style={{ width: '100%', padding: '9px 12px', borderRadius: 10, border: '1px solid var(--border-color)', background: 'var(--bg-page)', color: 'var(--text-main)', fontSize: 13, marginBottom: 10 }}>
              {AWARD_TYPES.map(a => <option key={a}>{a}</option>)}
            </select>
            {form.title === 'Custom...' && (
              <input placeholder="Custom award title..." value={form.customTitle} onChange={e => setForm(p => ({ ...p, customTitle: e.target.value }))} style={{ width: '100%', padding: '9px 12px', borderRadius: 10, border: '1px solid var(--border-color)', background: 'var(--bg-page)', color: 'var(--text-main)', fontSize: 13, marginBottom: 10, boxSizing: 'border-box' }} />
            )}
            <label style={{ display: 'block', fontWeight: 700, fontSize: 12, marginBottom: 4 }}>Recipient</label>
            <select value={form.recipientId} onChange={e => {
              const s = staff.find(x => x.id === e.target.value);
              setForm(p => ({ ...p, recipientId: e.target.value, recipientName: s?.name || '' }));
            }} style={{ width: '100%', padding: '9px 12px', borderRadius: 10, border: '1px solid var(--border-color)', background: 'var(--bg-page)', color: 'var(--text-main)', fontSize: 13, marginBottom: 10 }}>
              {staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <label style={{ display: 'block', fontWeight: 700, fontSize: 12, marginBottom: 4 }}>Reason</label>
            <textarea value={form.reason} onChange={e => setForm(p => ({ ...p, reason: e.target.value }))} rows={2} placeholder="Why this award is being given..." style={{ width: '100%', padding: '9px 12px', borderRadius: 10, border: '1px solid var(--border-color)', background: 'var(--bg-page)', color: 'var(--text-main)', fontSize: 13, resize: 'vertical', marginBottom: 10, boxSizing: 'border-box' }} />
            <input type="date" value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))} style={{ width: '100%', padding: '9px 12px', borderRadius: 10, border: '1px solid var(--border-color)', background: 'var(--bg-page)', color: 'var(--text-main)', fontSize: 13, marginBottom: 12, boxSizing: 'border-box' }} />
            <button onClick={handleGrant} style={{ width: '100%', padding: '12px', borderRadius: 12, border: 'none', background: 'linear-gradient(135deg,#f59e0b,#d97706)', color: '#fff', fontWeight: 800, cursor: 'pointer' }}>
              <Star size={15} style={{ marginRight: 8, verticalAlign: 'middle' }} /> Grant Award
            </button>
            {msg && <p style={{ marginTop: 10, fontSize: 13, fontWeight: 700, color: msg.startsWith('Award granted') ? '#10b981' : '#ef4444' }}>{msg}</p>}
          </Card>
        )}

        {/* My Awards */}
        <Card style={{ gridColumn: isAdmin ? 'auto' : '1 / -1' }}>
          <h3 style={{ margin: '0 0 16px', fontWeight: 800, fontSize: 16 }}>My Awards ({myAwards.length})</h3>
          {myAwards.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 0', opacity: 0.4 }}>
              <Award size={40} style={{ marginBottom: 12 }} />
              <p style={{ margin: 0 }}>No awards received yet. Keep up the great work!</p>
            </div>
          ) : myAwards.map(a => (
            <div key={a.id} style={{ padding: '14px 18px', borderRadius: 14, background: 'linear-gradient(135deg,#f59e0b11,#d9770611)', border: '1px solid #f59e0b44', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'linear-gradient(135deg,#f59e0b,#d97706)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Award size={22} style={{ color: '#fff' }} />
              </div>
              <div>
                <p style={{ margin: 0, fontWeight: 900, fontSize: 15 }}>{a.title}</p>
                {a.reason && <p style={{ margin: '3px 0 0', fontSize: 12, opacity: 0.7 }}>{a.reason}</p>}
                <p style={{ margin: '3px 0 0', fontSize: 11, opacity: 0.5 }}>{a.date}</p>
              </div>
            </div>
          ))}
        </Card>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// TAB: NOTIFICATIONS
// ─────────────────────────────────────────────

function NotificationsTab({ notifications, setNotifications, staffId }) {
  const markAllRead = () => {
    const updated = notifications.map(n => ({ ...n, read: true }));
    setNotifications(updated);
    localStorage.setItem(`wsn_${staffId}`, JSON.stringify(updated));
  };
  const clear = () => {
    if (!window.confirm(`Clear all ${notifications.length} notifications? This cannot be undone.`)) return;
    setNotifications([]);
    localStorage.removeItem(`wsn_${staffId}`);
  };

  const TYPE_ICON = { info: Bell, success: CheckCircle, warning: AlertCircle, error: XCircle };

  return (
    <div>
      <SectionTitle icon={Bell} title="Notifications" subtitle="All your workspace activity notifications." />
      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
          <p style={{ margin: 0, fontWeight: 700, opacity: 0.6 }}>{notifications.length} notification(s) · {notifications.filter(n => !n.read).length} unread</p>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={markAllRead} style={{ padding: '7px 14px', borderRadius: 10, border: '1px solid var(--border-color)', background: 'transparent', color: 'var(--text-main)', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Mark All Read</button>
            <button onClick={clear} style={{ padding: '7px 14px', borderRadius: 10, border: '1px solid #ef444444', background: '#ef444411', color: '#ef4444', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Clear All</button>
          </div>
        </div>
        {notifications.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 0', opacity: 0.4 }}>
            <Bell size={36} style={{ marginBottom: 12 }} />
            <p>You're all caught up!</p>
          </div>
        ) : notifications.map(n => {
          const Icon = TYPE_ICON[n.type] || Bell;
          return (
            <div key={n.id} onClick={() => {
              const updated = notifications.map(x => x.id === n.id ? { ...x, read: true } : x);
              setNotifications(updated);
              localStorage.setItem(`wsn_${staffId}`, JSON.stringify(updated));
            }} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '14px 0', borderBottom: '1px solid var(--border-color)', cursor: 'pointer', opacity: n.read ? 0.55 : 1 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: n.read ? 'transparent' : 'var(--accent)', marginTop: 6, flexShrink: 0 }} />
              <Icon size={18} style={{ color: n.type === 'error' ? '#ef4444' : n.type === 'success' ? '#10b981' : 'var(--accent)', flexShrink: 0 }} />
              <div>
                <p style={{ margin: 0, fontSize: 14, fontWeight: n.read ? 600 : 800 }}>{n.message}</p>
                <p style={{ margin: '3px 0 0', fontSize: 11, opacity: 0.5 }}>{new Date(n.timestamp).toLocaleString()}</p>
              </div>
            </div>
          );
        })}
      </Card>
    </div>
  );
}

// ─────────────────────────────────────────────
// TAB: REVIEW CENTER (Admin)
// ─────────────────────────────────────────────

function ReviewCenterTab({ lessonNotes, setLessonNotes, staffQuestions, setStaffQuestions, staffTasks = [], setStaffTasks, addNotification, backendUrl, token }) {
  const [docType, setDocType] = useState('all');
  const [statusFilter, setStatusFilter] = useState('submitted');
  const [actionModal, setActionModal] = useState(null); // { item, collection, newStatus }
  const [comment, setComment] = useState('');
  const [processing, setProcessing] = useState(false);
  const [actionStatus, setActionStatus] = useState('');

  const all = [
    ...lessonNotes.map(n => ({ ...n, _type: 'Lesson Note', _coll: 'lessonNotes' })),
    ...staffQuestions.map(q => ({ ...q, _type: q.type === 'midterm' ? 'Midterm Questions' : 'End-Term Questions', _coll: 'staffQuestions' })),
    ...(staffTasks || []).filter(t => t.fileData).map(t => ({ ...t, subject: t.title, _type: 'Task Document', _coll: 'staffTasks' }))
  ];
  const filtered = all
    .filter(r => docType === 'all' || r._type === docType)
    .filter(r => statusFilter === 'all' || r.approvalStatus === statusFilter)
    .sort((a, b) => b.timestamp?.localeCompare(a.timestamp));

  const handleAction = async () => {
    if (!actionModal) return;
    setProcessing(true);
    setActionStatus('Saving review decision...');
    const { item, newStatus } = actionModal;
    try {
      if (newStatus === 'revision') throw new Error('Revision requests are not supported by the backend workflow. Reject the submission with a reason instead.');
      const data = await workflowRequest(backendUrl, token, item._coll, item.id, newStatus === 'approved' ? 'approve' : 'reject');
      if (!data?.success || !data.item) throw new Error('The backend did not confirm the review decision.');
      const applyItem = arr => arr.map(record => record.id === item.id ? { ...record, ...data.item, syncStatus: 'saved', syncUpdatedAt: ts() } : record);
      if (item._coll === 'lessonNotes') setLessonNotes(applyItem(lessonNotes));
      else if (item._coll === 'staffQuestions') setStaffQuestions(applyItem(staffQuestions));
      else if (item._coll === 'staffTasks') setStaffTasks(applyItem(staffTasks));
      setActionStatus(`Review decision saved: ${newStatus}.`);
      addNotification(`Submission "${item.subject}" marked as ${newStatus.toUpperCase()}.`, 'success');
      setActionModal(null);
      setComment('');
    } catch (error) {
      setActionStatus(`${error.message} No review decision was applied or queued.`);
    }
    setProcessing(false);
  };

  return (
    <div>
      <SectionTitle icon={Shield} title="Administrator Review Center" subtitle="Review and approve staff lesson notes and examination question submissions." />

      {/* Pending Alert */}
      {all.filter(r => ['pending', 'submitted'].includes(r.approvalStatus)).length > 0 && (
        <div style={{ background: 'linear-gradient(135deg,#f59e0b22,#d9770622)', border: '1px solid #f59e0b44', borderRadius: 14, padding: '14px 20px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10 }}>
          <AlertCircle size={18} style={{ color: '#f59e0b' }} />
          <p style={{ margin: 0, fontWeight: 800, color: '#f59e0b' }}>{all.filter(r => ['pending', 'submitted'].includes(r.approvalStatus)).length} submission(s) awaiting review.</p>
        </div>
      )}

      {/* Filters */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
        <select value={docType} onChange={e => setDocType(e.target.value)} style={{ padding: '8px 12px', borderRadius: 10, border: '1px solid var(--border-color)', background: 'var(--bg-page)', color: 'var(--text-main)', fontSize: 13, fontWeight: 700 }}>
          <option value="all">All Types</option>
          <option value="Lesson Note">Lesson Notes</option>
          <option value="Midterm Questions">Midterm Questions</option>
          <option value="End-Term Questions">End-Term Questions</option>
          <option value="Task Document">Task Documents</option>
        </select>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ padding: '8px 12px', borderRadius: 10, border: '1px solid var(--border-color)', background: 'var(--bg-page)', color: 'var(--text-main)', fontSize: 13, fontWeight: 700 }}>
          <option value="all">All Statuses</option>
          <option value="submitted">Submitted</option>
          <option value="pending">Pending (legacy)</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="revision">Needs Revision</option>
        </select>
        <span style={{ marginLeft: 'auto', fontWeight: 700, opacity: 0.5, fontSize: 13, alignSelf: 'center' }}>{filtered.length} record(s)</span>
      </div>

      <Card>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border-color)' }}>
                <th style={{ textAlign: 'left', padding: '8px 12px', fontWeight: 800 }}>Teacher</th>
                <th style={{ textAlign: 'left', padding: '8px 12px', fontWeight: 800 }}>Type</th>
                <th style={{ textAlign: 'left', padding: '8px 12px', fontWeight: 800 }}>Subject</th>
                <th style={{ textAlign: 'left', padding: '8px 12px', fontWeight: 800 }}>Submitted</th>
                <th style={{ textAlign: 'left', padding: '8px 12px', fontWeight: 800 }}>Status</th>
                <th style={{ textAlign: 'left', padding: '8px 12px', fontWeight: 800 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => (
                <tr key={r.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                  <td style={{ padding: '10px 12px', fontWeight: 700 }}>{r.staffName}</td>
                  <td style={{ padding: '10px 12px', opacity: 0.7 }}>{r._type}</td>
                  <td style={{ padding: '10px 12px' }}>
                    <div>{r.subject}</div>
                    {r.fileData && (
                      <a href={r.fileData} download={r.fileName || `${r.subject}_document`} style={{ fontSize: '11px', color: 'var(--accent)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4, marginTop: 4, fontWeight: 700 }}>
                        <Download size={12} /> Download Document
                      </a>
                    )}
                  </td>
                  <td style={{ padding: '10px 12px', opacity: 0.7, fontSize: 12 }}>{r.uploadDate} {r.uploadTime}</td>
                  <td style={{ padding: '10px 12px' }}><Badge status={r.approvalStatus} /></td>
                  <td style={{ padding: '10px 12px' }}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={() => setActionModal({ item: r, newStatus: 'approved' })} style={{ padding: '5px 10px', borderRadius: 8, border: 'none', background: '#10b98122', color: '#10b981', fontWeight: 800, fontSize: 11, cursor: 'pointer' }}>Approve</button>
                      <button disabled title="The backend has no revision workflow; reject with a reason instead." style={{ padding: '5px 10px', borderRadius: 8, border: 'none', background: '#8b5cf622', color: '#8b5cf6', fontWeight: 800, fontSize: 11, cursor: 'not-allowed', opacity: .55 }}>Revise</button>
                      <button onClick={() => setActionModal({ item: r, newStatus: 'rejected' })} style={{ padding: '5px 10px', borderRadius: 8, border: 'none', background: '#ef444422', color: '#ef4444', fontWeight: 800, fontSize: 11, cursor: 'pointer' }}>Reject</button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={6} style={{ textAlign: 'center', padding: 30, opacity: 0.4 }}>No submissions match your filter.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Action Modal */}
      {actionModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: 20 }}>
          <div style={{ background: 'var(--bg-card)', backdropFilter: 'blur(20px)', borderRadius: 20, padding: 28, maxWidth: 480, width: '100%', border: '1px solid var(--glass-border)' }}>
            <h3 style={{ margin: '0 0 6px', fontWeight: 900, fontSize: 18 }}>
              {actionModal.newStatus === 'approved' ? 'Approve' : actionModal.newStatus === 'rejected' ? 'Reject' : 'Request Revision'}
            </h3>
            <p style={{ margin: '0 0 16px', opacity: 0.6, fontSize: 13 }}>{actionModal.item.staffName} · {actionModal.item.subject} · {actionModal.item._type}</p>
            <label style={{ display: 'block', fontWeight: 700, fontSize: 12, marginBottom: 6 }}>
              {actionModal.newStatus !== 'approved' ? 'Reason / Comment *' : 'Optional Comment'}
            </label>
            <textarea value={comment} onChange={e => setComment(e.target.value)} rows={3}
              placeholder={actionModal.newStatus === 'rejected' ? 'Please provide a reason for rejection...' : actionModal.newStatus === 'revision' ? 'Describe what needs to be changed...' : 'Optional feedback...'}
              style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border-color)', background: 'var(--bg-page)', color: 'var(--text-main)', fontSize: 13, resize: 'vertical', boxSizing: 'border-box', marginBottom: 16 }} />
            {actionStatus && <p role={actionStatus.includes('failed') ? 'alert' : 'status'} style={{ fontSize: 12, fontWeight: 700, color: actionStatus.includes('failed') ? '#ef4444' : '#f59e0b' }}>{actionStatus}</p>}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
               <button onClick={() => { setActionModal(null); setComment(''); setActionStatus(''); }} style={{ padding: '10px 20px', borderRadius: 10, border: '1px solid var(--border-color)', background: 'transparent', color: 'var(--text-main)', fontWeight: 700, cursor: 'pointer' }}>Cancel review</button>
              <button onClick={handleAction} disabled={processing || (actionModal.newStatus !== 'approved' && !comment.trim())} style={{ padding: '10px 20px', borderRadius: 10, border: 'none', background: actionModal.newStatus === 'approved' ? '#10b981' : actionModal.newStatus === 'rejected' ? '#ef4444' : '#8b5cf6', color: '#fff', fontWeight: 800, cursor: 'pointer' }}>
                {processing ? 'Processing...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// TAB: ADMIN PERFORMANCE HQ
// ─────────────────────────────────────────────

function AdminPerformanceTab({ staff, staffAttendance, lessonNotes, staffQuestions, reports, students, attendance, staffDisciplinary, setStaffDisciplinary, staffTasks, staffAwards, setStaffAwards, syncWithBackend, addNotification, performanceRecords }) {
  const [deptFilter, setDeptFilter] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [sortBy, setSortBy] = useState('score');
  const [selected, setSelected] = useState(null);
  const [discModal, setDiscModal] = useState(null);
  const [discForm, setDiscForm] = useState({ type: 'Warning', reason: '', reviewDate: '' });
  const [discMsg, setDiscMsg] = useState('');

  const calcScore = (member) => {
    const persisted = performanceRecords.find(item => item.staffId === member.id);
    if (persisted) return { score: persisted.finalScore, estimated: false };
    const sid = member.id;
    const teaching = isTeacher(member.role || '');
    const myAtt = staffAttendance.filter(r => r.staffId === sid);
    const p = myAtt.filter(r => r.status === 'present').length;
    const l = myAtt.filter(r => r.status === 'late').length;
    const attRate = myAtt.length > 0 ? ((p + l) / myAtt.length) * 100 : 85;
    const punct = myAtt.length > 0 ? (1 - l / myAtt.length) * 100 : 100;
    const notes = lessonNotes.filter(n => n.staffId === sid);
    const noteScore = notes.length > 0 ? (notes.filter(n => n.approvalStatus === 'approved').length / notes.length) * 100 : 80;
    const qs = staffQuestions.filter(q => q.staffId === sid);
    const qScore = qs.length > 0 ? (qs.filter(q => q.approvalStatus === 'approved').length / qs.length) * 100 : 80;
    const disc = staffDisciplinary.filter(d => d.staffId === sid);
    const tasks = staffTasks.filter(t => t.staffId === sid);
    const taskScore = tasks.length > 0 ? (tasks.filter(t => t.status === 'completed').length / tasks.length) * 100 : 90;
    const raw = teaching
      ? (attRate * 0.15 + punct * 0.10 + noteScore * 0.10 + qScore * 0.10 + 75 * 0.30 + 80 * 0.25)
      : (attRate * 0.30 + taskScore * 0.30 + 80 * 0.40);
    return { score: Math.max(0, Math.min(100, Math.round(raw - disc.length * 5))), estimated: true };
  };

  const enriched = staff.map(s => {
    const performance = calcScore(s);
    return ({
    ...s, score: performance.score, scoreEstimated: performance.estimated,
    awards: staffAwards.filter(a => a.staffId === s.id).length,
    disc: staffDisciplinary.filter(d => d.staffId === s.id).length,
    attCount: staffAttendance.filter(r => r.staffId === s.id).length,
  });
  }).filter(s => (!deptFilter || (s.department || '').toLowerCase().includes(deptFilter.toLowerCase())) && (!roleFilter || (s.role || '').toLowerCase().includes(roleFilter.toLowerCase())));

  const sorted = [...enriched].sort((a, b) => sortBy === 'score' ? b.score - a.score : a.name?.localeCompare(b.name));

  const handleIssueDisciplinary = async () => {
    if (!discForm.reason || !selected) return;
    const rec = { id: uid(), staffId: selected.id, staffName: selected.name, schoolId: 'default', ...discForm, date: todayStr(), timestamp: ts() };
    const saved = await syncWithBackend('staffDisciplinary', rec, 'add');
    if (!saved) return setDiscMsg('Record could not be saved.');
    setStaffDisciplinary([...staffDisciplinary, rec]);
    addNotification(`Disciplinary record issued for ${selected.name}.`);
    setDiscMsg('Record issued.');
    setTimeout(() => { setDiscModal(null); setDiscMsg(''); }, 1500);
  };

  return (
    <div>
      <SectionTitle icon={BarChart2} title="Performance Headquarters" subtitle="Administrator view of all staff performance rankings and disciplinary records." />

      {/* Summary Stats */}
      <div className="dashboard-kpi-grid" style={{ marginBottom: 28 }}>
        {(() => {
          const avg = sorted.length > 0 ? Math.round(sorted.reduce((s, x) => s + x.score, 0) / sorted.length) : 0;
          const excellent = sorted.filter(x => x.score >= 90).length;
          const poor = sorted.filter(x => x.score < 60).length;
          return <>
            <StatMini label="Total Staff" value={staff.length} tone="blue" icon={User} />
            <StatMini label="Est. Avg. Score" value={sorted.length ? `${avg}%` : 'N/A'} tone="green" icon={TrendingUp} />
            <StatMini label="Excellent" value={excellent} tone="green" icon={Star} />
            <StatMini label="Poor Performance" value={poor} tone="red" icon={Flag} />
          </>;
        })()}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
        <input placeholder="Filter by department..." value={deptFilter} onChange={e => setDeptFilter(e.target.value)} style={{ padding: '8px 12px', borderRadius: 10, border: '1px solid var(--border-color)', background: 'var(--bg-page)', color: 'var(--text-main)', fontSize: 13 }} />
        <input placeholder="Filter by role..." value={roleFilter} onChange={e => setRoleFilter(e.target.value)} style={{ padding: '8px 12px', borderRadius: 10, border: '1px solid var(--border-color)', background: 'var(--bg-page)', color: 'var(--text-main)', fontSize: 13 }} />
        <select value={sortBy} onChange={e => setSortBy(e.target.value)} style={{ padding: '8px 12px', borderRadius: 10, border: '1px solid var(--border-color)', background: 'var(--bg-page)', color: 'var(--text-main)', fontSize: 13, fontWeight: 700 }}>
          <option value="score">Sort by Score</option>
          <option value="name">Sort by Name</option>
        </select>
      </div>

      <Card>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border-color)' }}>
                <th style={{ textAlign: 'left', padding: '8px 12px', fontWeight: 800 }}>#</th>
                <th style={{ textAlign: 'left', padding: '8px 12px', fontWeight: 800 }}>Name</th>
                <th style={{ textAlign: 'left', padding: '8px 12px', fontWeight: 800 }}>Role</th>
                <th style={{ textAlign: 'left', padding: '8px 12px', fontWeight: 800 }}>Estimated Score</th>
                <th style={{ textAlign: 'left', padding: '8px 12px', fontWeight: 800 }}>Level</th>
                <th style={{ textAlign: 'left', padding: '8px 12px', fontWeight: 800 }}>Att. Days</th>
                <th style={{ textAlign: 'left', padding: '8px 12px', fontWeight: 800 }}>Awards</th>
                <th style={{ textAlign: 'left', padding: '8px 12px', fontWeight: 800 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((s, i) => {
                const sc = s.score;
                const color = sc >= 90 ? '#10b981' : sc >= 80 ? '#8b5cf6' : sc >= 70 ? '#f59e0b' : '#ef4444';
                const level = sc >= 90 ? 'Excellent' : sc >= 80 ? 'Very Good' : sc >= 70 ? 'Good' : sc >= 60 ? 'Needs Improvement' : 'Poor';
                return (
                  <tr key={s.id} style={{ borderBottom: '1px solid var(--border-color)', background: selected?.id === s.id ? 'var(--accent-glow)' : 'transparent' }}>
                    <td style={{ padding: '10px 12px', fontWeight: 900, opacity: 0.5 }}>#{i + 1}</td>
                    <td style={{ padding: '10px 12px', fontWeight: 800 }}>{s.name}</td>
                    <td style={{ padding: '10px 12px', opacity: 0.7 }}>{s.role}</td>
                    <td style={{ padding: '10px 12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 60, height: 6, background: 'var(--border-color)', borderRadius: 3, overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${sc}%`, background: color, borderRadius: 3 }} />
                        </div>
                         <span style={{ fontWeight: 900, color }}>{sc}% est.</span>
                      </div>
                    </td>
                    <td style={{ padding: '10px 12px' }}><Badge status={sc >= 70 ? 'approved' : sc >= 60 ? 'pending' : 'rejected'} label={level} /></td>
                    <td style={{ padding: '10px 12px', opacity: 0.7 }}>{s.attCount}</td>
                    <td style={{ padding: '10px 12px' }}>{s.awards > 0 ? <span style={{ color: '#f59e0b', fontWeight: 800 }}><Award size={14} style={{ marginRight: 4, verticalAlign: 'middle' }} />{s.awards}</span> : '—'}</td>
                    <td style={{ padding: '10px 12px' }}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button onClick={() => setSelected(s)} style={{ padding: '5px 10px', borderRadius: 8, border: 'none', background: 'var(--accent-glow)', color: 'var(--accent)', fontWeight: 800, fontSize: 11, cursor: 'pointer' }}>Detail</button>
                        <button onClick={() => { setSelected(s); setDiscModal(true); }} style={{ padding: '5px 10px', borderRadius: 8, border: 'none', background: '#ef444422', color: '#ef4444', fontWeight: 800, fontSize: 11, cursor: 'pointer' }}>Action</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Disciplinary Modal */}
      {discModal && selected && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: 20 }}>
          <div style={{ background: 'var(--bg-card)', backdropFilter: 'blur(20px)', borderRadius: 20, padding: 28, maxWidth: 480, width: '100%', border: '1px solid var(--glass-border)' }}>
            <h3 style={{ margin: '0 0 4px', fontWeight: 900, fontSize: 18 }}>Disciplinary Action</h3>
            <p style={{ margin: '0 0 18px', opacity: 0.6, fontSize: 13 }}>{selected.name}</p>
            <label style={{ display: 'block', fontWeight: 700, fontSize: 12, marginBottom: 6 }}>Action Type</label>
            <select value={discForm.type} onChange={e => setDiscForm(p => ({ ...p, type: e.target.value }))} style={{ width: '100%', padding: '9px 12px', borderRadius: 10, border: '1px solid var(--border-color)', background: 'var(--bg-page)', color: 'var(--text-main)', fontSize: 13, marginBottom: 12 }}>
              <option>Warning</option>
              <option>Performance Improvement Plan</option>
              <option>Training Recommendation</option>
              <option>Formal Caution</option>
            </select>
            <label style={{ display: 'block', fontWeight: 700, fontSize: 12, marginBottom: 6 }}>Reason *</label>
            <textarea value={discForm.reason} onChange={e => setDiscForm(p => ({ ...p, reason: e.target.value }))} rows={3} style={{ width: '100%', padding: '9px 12px', borderRadius: 10, border: '1px solid var(--border-color)', background: 'var(--bg-page)', color: 'var(--text-main)', fontSize: 13, resize: 'vertical', boxSizing: 'border-box', marginBottom: 12 }} placeholder="Detailed reason for action..." />
            <label style={{ display: 'block', fontWeight: 700, fontSize: 12, marginBottom: 6 }}>Review Date</label>
            <input type="date" value={discForm.reviewDate} onChange={e => setDiscForm(p => ({ ...p, reviewDate: e.target.value }))} style={{ width: '100%', padding: '9px 12px', borderRadius: 10, border: '1px solid var(--border-color)', background: 'var(--bg-page)', color: 'var(--text-main)', fontSize: 13, boxSizing: 'border-box', marginBottom: 16 }} />
            {discMsg && <p style={{ color: '#10b981', fontWeight: 700, marginBottom: 10 }}>{discMsg}</p>}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setDiscModal(null)} style={{ padding: '10px 20px', borderRadius: 10, border: '1px solid var(--border-color)', background: 'transparent', color: 'var(--text-main)', fontWeight: 700, cursor: 'pointer' }}>Cancel</button>
              <button onClick={handleIssueDisciplinary} style={{ padding: '10px 20px', borderRadius: 10, border: 'none', background: '#ef4444', color: '#fff', fontWeight: 800, cursor: 'pointer' }}>Issue Record</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

import React, { useState, useMemo, useEffect } from 'react';
import { Search, Users, BarChart2, UserCheck, UserX, Clock3, Percent, Check, X, Save, Undo2 } from 'lucide-react';

export default function Attendance({ 
  students = [], 
  attendanceData = {}, 
  onSave, 
  userRole = 'ADMIN',
  assignedClass = ''
}) {
  const allClasses = useMemo(() => {
    const list = [...new Set((students || []).map(s => (s.class || '').trim()))].filter(Boolean);
    return list.sort((a, b) => a.localeCompare(b));
  }, [students]);

  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split('T')[0]);
  
  const [selectedClass, setSelectedClass] = useState(() => {
    if (userRole === 'TEACHER' && assignedClass) {
      const match = allClasses.find(c => c.toUpperCase().replace(/\s+/g, '') === assignedClass.toUpperCase().replace(/\s+/g, ''));
      if (match) return match;
    }
    const crecheMatch = allClasses.find(c => c.toUpperCase().includes('CRECHE'));
    if (crecheMatch) return crecheMatch;
    return allClasses[0] || '';
  });

  const [searchQuery, setSearchQuery] = useState('');
  const [showReport, setShowReport] = useState(false);
  const [reportTab, setReportTab] = useState('class'); // 'class' or 'students'
  const initialDay = attendanceData[selectedDate] || {};
  const [draftAttendance, setDraftAttendance] = useState(() => ({ ...(initialDay.records || initialDay) }));
  const [notes, setNotes] = useState(initialDay.notes || '');
  const [dirty, setDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [bulkUndo, setBulkUndo] = useState(null);

  useEffect(() => {
    const day = attendanceData[selectedDate] || {};
    if (!dirty) {
      setDraftAttendance({ ...(day.records || day) });
      setNotes(day.notes || '');
    }
  }, [attendanceData, selectedDate]);

  useEffect(() => {
    const warn = event => { if (dirty) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  // Ensure selectedClass syncs when allClasses updates (e.g. after async fetch)
  useEffect(() => {
    if (allClasses.length > 0) {
      if (userRole === 'TEACHER' && assignedClass) {
        const teacherMatch = allClasses.find(c => c.toUpperCase().replace(/\s+/g, '') === assignedClass.toUpperCase().replace(/\s+/g, ''));
        if (teacherMatch && selectedClass !== teacherMatch) {
          setSelectedClass(teacherMatch);
          return;
        }
      }
      if (!selectedClass || !allClasses.includes(selectedClass)) {
        const creche = allClasses.find(c => c.toUpperCase().includes('CRECHE'));
        setSelectedClass(creche || allClasses[0]);
      }
    }
  }, [allClasses, assignedClass, userRole]);

  const classStudents = useMemo(() => {
    if (!selectedClass) return [];
    const target = selectedClass.toUpperCase().replace(/\s+/g, '');
    return (students || []).filter(s => {
      if (!s || !s.class) return false;
      const sClass = s.class.toUpperCase().replace(/\s+/g, '');
      return sClass === target;
    }).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }, [students, selectedClass]);

  const visibleStudents = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return classStudents;
    return classStudents.filter(s =>
        (s.name || '').toLowerCase().includes(q) ||
        (s.sid || '').toLowerCase().includes(q)
    );
  }, [classStudents, searchQuery]);

  const rawDayData = attendanceData[selectedDate] || {};
  const currentAttendance = draftAttendance;

  const presentCount = classStudents.filter(s => currentAttendance[s.sid] === 'present').length;
  const absentCount = classStudents.filter(s => currentAttendance[s.sid] === 'absent').length;
  const notMarked = classStudents.length - presentCount - absentCount;
  const attendanceRate = classStudents.length > 0
    ? Math.round((presentCount / classStudents.length) * 100) : 0;

  const toggleAttendance = (sid, status) => {
    const current = currentAttendance[sid];
    const updated = { ...currentAttendance, [sid]: current === status ? undefined : status };
    if (updated[sid] === undefined) delete updated[sid];
    setDraftAttendance(updated);
    setDirty(true);
    setBulkUndo(null);
  };

  const markStudents = (status, targetStudents) => {
    const updated = { ...currentAttendance };
    targetStudents.forEach(s => { updated[s.sid] = status; });
    setBulkUndo({ attendance: currentAttendance, label: `${targetStudents.length} bulk changes` });
    setDraftAttendance(updated);
    setDirty(true);
  };

  const saveDraft = async () => {
    if (!dirty) return;
    if (notMarked > 0 && !window.confirm(`${notMarked} students are not marked. Save this pending register anyway?`)) return;
    setIsSaving(true);
    try {
      const result = await onSave?.(selectedDate, draftAttendance, { notes });
      if (result === false) throw new Error('Attendance could not be saved.');
      setDirty(false);
      setBulkUndo(null);
    } catch (error) {
      window.alert(error?.message || 'Attendance could not be saved.');
    } finally { setIsSaving(false); }
  };

  const changeDate = value => {
    if (dirty && !window.confirm('Discard unsaved attendance changes and switch date?')) return;
    setDirty(false); setBulkUndo(null); setSelectedDate(value);
    const day = attendanceData[value] || {};
    setDraftAttendance({ ...(day.records || day) }); setNotes(day.notes || '');
  };

  const undoBulk = () => {
    if (!bulkUndo) return;
    setDraftAttendance({ ...bulkUndo.attendance }); setBulkUndo(null); setDirty(true);
  };

  // Student-level statistics
  const studentStats = useMemo(() => {
    const stats = {};
    Object.values(attendanceData || {}).forEach(dayEntry => {
      const dayData = dayEntry.records || dayEntry;
      Object.entries(dayData).forEach(([sid, status]) => {
        if (!stats[sid]) stats[sid] = { present: 0, absent: 0 };
        if (status === 'present') stats[sid].present++;
        if (status === 'absent') stats[sid].absent++;
      });
    });
    return stats;
  }, [attendanceData]);

  // History report for selected class
  const attendanceHistory = useMemo(() => {
    const classSize = (students || []).filter(s => (s.class || '').toUpperCase().replace(/\s+/g, '') === (selectedClass || '').toUpperCase().replace(/\s+/g, '')).length;
    return Object.entries(attendanceData || {})
      .map(([date, dayEntry]) => {
        const dayData = dayEntry.records || dayEntry;
        const present = students.filter(s => (s.class || '').toUpperCase().replace(/\s+/g, '') === (selectedClass || '').toUpperCase().replace(/\s+/g, '') && dayData[s.sid] === 'present').length;
        const absent  = students.filter(s => (s.class || '').toUpperCase().replace(/\s+/g, '') === (selectedClass || '').toUpperCase().replace(/\s+/g, '') && dayData[s.sid] === 'absent').length;
        const rate = classSize > 0 ? Math.round((present / classSize) * 100) : 0;
        return { date, present, absent, total: classSize, rate };
      })
      .filter(d => d.present + d.absent > 0)
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 14);
  }, [attendanceData, selectedClass, students]);

  return (
    <section className="view active attendance-page-view">
      <style>{`
        .attendance-toolbar { display:flex; flex-wrap:wrap; gap:10px; align-items:center; flex:1; justify-content:flex-end; }
        .attendance-row { display:flex; align-items:center; padding:14px 20px; gap:16px; }
        .attendance-details { display:flex; align-items:center; gap:8px; margin-top:2px; font-size:11px; opacity:.65; flex-wrap:wrap; }
        @media (max-width: 680px) {
          .attendance-page-view .view-header { align-items:stretch !important; }
          .attendance-toolbar { width:100%; justify-content:stretch; }
          .attendance-toolbar > * { flex:1 1 145px; min-width:0 !important; }
          .attendance-toolbar .premium-search { flex-basis:100%; max-width:none !important; }
          .attendance-row { padding:12px; gap:10px; flex-wrap:wrap; }
          .attendance-row-index { display:none; }
          .attendance-student { flex:1 1 calc(100% - 52px) !important; }
          .attendance-status { order:3; width:auto !important; text-align:left !important; flex:1 1 auto; }
          .attendance-actions { order:4; }
          .attendance-details span:nth-child(n+4) { display:none; }
          .attendance-page-view .stats-grid { grid-template-columns:repeat(2, minmax(0, 1fr)); }
        }
      `}</style>
      {/* Sticky Header with Search Bar Included */}
      <div className="view-header" style={{ flexWrap: 'wrap', gap: '12px', alignItems: 'center' }}>
        <div>
          <h1 style={{ margin: 0 }}>Attendance Tracker</h1>
          <p style={{ margin: '2px 0 0', fontSize: '13px', color: 'var(--text-main)' }}>
            Class: <strong>{selectedClass || 'Select Class'}</strong> &middot; {classStudents.length} students enrolled
            {searchQuery.trim() && <> &middot; {visibleStudents.length} shown</>}
          </p>
        </div>

        <div className="toolbar-group attendance-toolbar">
          {/* Prominent Search Input inside Header Toolbar */}
          <div className="premium-search" style={{ minWidth: '220px', maxWidth: '320px', flex: '1 1 220px' }}>
            <input
              type="text"
              placeholder={`Search ${classStudents.length} students...`}
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{ padding: '8px 12px 8px 36px', fontSize: '13px' }}
            />
            <Search className="search-icon" size={16} style={{ left: '10px' }} />
          </div>

          <input
            type="date"
            value={selectedDate}
            onChange={e => changeDate(e.target.value)}
            className="btn btn-secondary"
            style={{ fontFamily: 'inherit', fontWeight: 600 }}
          />

          {userRole !== 'TEACHER' ? (
            <select
              value={selectedClass}
              onChange={e => setSelectedClass(e.target.value)}
              className="btn btn-secondary"
              style={{ minWidth: '150px', fontWeight: 700 }}
            >
              {allClasses.map(c => (
                <option key={c} value={c}>
                  {c} ({students.filter(s => (s.class || '').toUpperCase().replace(/\s+/g, '') === c.toUpperCase().replace(/\s+/g, '')).length})
                </option>
              ))}
            </select>
          ) : (
            <div className="btn btn-secondary" style={{ pointerEvents: 'none', background: 'var(--bg-card)', fontWeight: 700 }}>
              Class: {selectedClass || assignedClass}
            </div>
          )}

          <button className="btn btn-secondary" onClick={() => setShowReport(v => !v)}>
            <BarChart2 size={16} /> {showReport ? 'Hide Analytics' : 'Analytics & History'}
          </button>

          <button
            className="btn btn-primary"
            style={{ background: 'var(--success)', borderColor: 'var(--success)', color: '#fff' }}
            onClick={() => markStudents('present', classStudents)}
            disabled={classStudents.length === 0}
            title={`Mark all ${classStudents.length} enrolled students present`}
          >
            ALL {classStudents.length} PRESENT
          </button>
          <button className="btn btn-primary" disabled={!dirty || isSaving} onClick={saveDraft} title={dirty ? 'Persist pending attendance changes' : 'No pending changes'}><Save size={16} /> {isSaving ? 'Saving...' : dirty ? 'Save attendance' : 'Saved'}</button>
          <button
            className="btn btn-secondary"
            style={{ color: 'var(--danger)', borderColor: 'var(--danger)' }}
            onClick={() => markStudents('absent', classStudents)}
            disabled={classStudents.length === 0}
            title={`Mark all ${classStudents.length} enrolled students absent`}
          >
            ALL {classStudents.length} ABSENT
          </button>
          {searchQuery.trim() && visibleStudents.length > 0 && visibleStudents.length < classStudents.length && (
            <>
              <button className="btn btn-secondary" onClick={() => markStudents('present', visibleStudents)}>
                Mark {visibleStudents.length} shown present
              </button>
              <button className="btn btn-secondary" onClick={() => markStudents('absent', visibleStudents)}>
                Mark {visibleStudents.length} shown absent
              </button>
            </>
          )}
        </div>
      </div>

      <div className="card no-print" style={{ padding: '12px 16px', marginBottom: '16px', display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap', borderColor: dirty ? 'var(--warning)' : undefined }}>
        <label style={{ flex: '1 1 300px', fontSize: '12px', fontWeight: 700 }}>Register notes<input type="text" value={notes} placeholder="Optional context, late arrivals, closure notes..." onChange={e => { setNotes(e.target.value); setDirty(true); }} style={{ width: '100%', marginTop: '5px' }} /></label>
        <strong style={{ color: dirty ? 'var(--warning)' : 'var(--success)', fontSize: '12px' }}>{dirty ? 'Pending changes not yet saved' : 'Register is saved'}</strong>
        {bulkUndo && <button className="btn btn-secondary" onClick={undoBulk}><Undo2 size={15} /> Undo {bulkUndo.label}</button>}
      </div>

      {/* Summary Stat Cards */}
      <div className="dashboard-kpi-grid attendance-summary-grid" style={{ marginBottom: '16px' }}>
        <article className="dashboard-kpi-card tone-green attendance-kpi-card">
          <span className="dashboard-kpi-icon"><UserCheck size={22} /></span>
          <span className="dashboard-kpi-copy"><small>Present</small><strong>{presentCount}</strong><em>Marked in class</em></span>
        </article>
        <article className="dashboard-kpi-card tone-red attendance-kpi-card">
          <span className="dashboard-kpi-icon"><UserX size={22} /></span>
          <span className="dashboard-kpi-copy"><small>Absent</small><strong>{absentCount}</strong><em>Marked in class</em></span>
        </article>
        <article className="dashboard-kpi-card tone-amber attendance-kpi-card">
          <span className="dashboard-kpi-icon"><Clock3 size={22} /></span>
          <span className="dashboard-kpi-copy"><small>Not marked</small><strong>{notMarked}</strong><em>Awaiting status</em></span>
        </article>
        <article className="dashboard-kpi-card tone-blue attendance-kpi-card">
          <span className="dashboard-kpi-icon"><Percent size={22} /></span>
          <span className="dashboard-kpi-copy">
            <small>Attendance rate</small><strong>{attendanceRate}%</strong>
            <span className="attendance-rate-track"><span style={{ width: `${attendanceRate}%`, background: attendanceRate >= 80 ? 'var(--success)' : attendanceRate >= 60 ? 'var(--warning)' : 'var(--danger)' }} /></span>
          </span>
        </article>
      </div>

      {/* Analytics & History Drawer */}
      {showReport && (
        <div className="card mb-3" style={{ padding: '20px', marginBottom: '16px' }}>
          <div className="flex-between mb-2">
            <h3 style={{ margin: 0, fontSize: '15px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <BarChart2 size={17} /> Class Analytics — {selectedClass}
              {rawDayData.lastUpdatedBy && <span style={{ fontSize: '11px', opacity: 0.7, marginLeft: '10px', fontWeight: 400 }}>(Last updated by: {rawDayData.lastUpdatedBy})</span>}
            </h3>
            <div className="flex-gap">
              <button className={`btn btn-sm ${reportTab === 'class' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setReportTab('class')}>Daily History</button>
              <button className={`btn btn-sm ${reportTab === 'students' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setReportTab('students')}>Student Totals</button>
            </div>
          </div>

          {reportTab === 'class' ? (
            <div>
              {attendanceHistory.length === 0 ? (
                <p style={{ opacity: 0.5, textAlign: 'center', padding: '16px' }}>No recorded history for {selectedClass}. Mark attendance to generate reports.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {attendanceHistory.map(({ date, present, absent, total, rate }) => (
                    <div key={date} style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                      <span style={{ width: '100px', fontWeight: 600, fontSize: '12px', flexShrink: 0 }}>{date}</span>
                      <div style={{ flex: 1, minWidth: '100px', background: 'var(--bg-page)', borderRadius: '20px', overflow: 'hidden', height: '18px' }}>
                        <div style={{ width: `${rate}%`, background: rate >= 80 ? 'var(--success)' : rate >= 60 ? 'var(--warning)' : 'var(--danger)', height: '100%', transition: 'width 0.5s ease' }} />
                      </div>
                      <span style={{ fontSize: '12px', fontWeight: 800, color: rate >= 80 ? 'var(--success)' : 'var(--danger)', width: '45px', flexShrink: 0 }}>{rate}%</span>
                      <span style={{ fontSize: '11px', opacity: 0.6, flexShrink: 0 }}>{present} Present &middot; {absent} Absent / {total} Total</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="table-responsive">
              <table className="table" style={{ fontSize: '13px' }}>
                <thead>
                  <tr>
                    <th>Student Name</th>
                    <th style={{ textAlign: 'center' }}>Present</th>
                    <th style={{ textAlign: 'center' }}>Absent</th>
                    <th style={{ textAlign: 'center' }}>Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {classStudents.map(s => {
                    const stats = studentStats[s.sid] || { present: 0, absent: 0 };
                    const total = stats.present + stats.absent;
                    const rate = total > 0 ? Math.round((stats.present / total) * 100) : 0;
                    return (
                      <tr key={s.sid}>
                        <td style={{ fontWeight: 600 }}>{s.name} <small style={{ opacity: 0.6, fontFamily: 'monospace' }}>({s.sid})</small></td>
                        <td style={{ textAlign: 'center', color: 'var(--success)', fontWeight: 800 }}>{stats.present}</td>
                        <td style={{ textAlign: 'center', color: 'var(--danger)', fontWeight: 800 }}>{stats.absent}</td>
                        <td style={{ textAlign: 'center' }}>
                          <span className="badge" style={{ background: rate >= 80 ? 'var(--success)' : rate >= 60 ? 'var(--warning)' : 'var(--danger)', color: 'white' }}>
                            {rate}%
                          </span>
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

      {/* Borderless Full-Height Student List */}
      <div className="attendance-table-wrapper" style={{ margin: 0, padding: 0, border: 'none', boxShadow: 'none', background: 'transparent' }}>
        {visibleStudents.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: '60px 20px', opacity: 0.5 }}>
            <Users size={48} />
            <p style={{ marginTop: '12px', fontWeight: 700, fontSize: '15px' }}>
              {allClasses.length === 0
                ? 'No students enrolled in system.'
                : classStudents.length === 0
                  ? `No active students found in ${selectedClass}.`
                  : `No students match “${searchQuery}”.`}
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', width: '100%', background: 'var(--bg-card)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
            {visibleStudents.map((s, i) => {
              const status = currentAttendance[s.sid];
              const isPresent = status === 'present';
              const isAbsent = status === 'absent';

              return (
                <div
                  key={s.sid}
                  className="attendance-row"
                  style={{
                    borderBottom: i < visibleStudents.length - 1 ? '1px solid var(--border-color)' : 'none',
                    background: isPresent
                      ? 'rgba(16, 185, 129, 0.05)'
                      : isAbsent
                      ? 'rgba(239, 68, 68, 0.05)'
                      : 'var(--bg-card)',
                    transition: 'background 0.15s ease',
                  }}
                >
                  {/* Row Index */}
                  <span className="attendance-row-index" style={{ fontSize: '12px', fontWeight: 600, opacity: 0.4, width: '24px', flexShrink: 0, textAlign: 'center' }}>
                    {i + 1}
                  </span>

                  {/* Avatar */}
                  <div style={{
                    width: '40px', height: '40px', borderRadius: '50%',
                    background: 'var(--accent-glow)', overflow: 'hidden', flexShrink: 0,
                    border: `2px solid ${isPresent ? 'var(--success)' : isAbsent ? 'var(--danger)' : 'var(--glass-border)'}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontWeight: 800, fontSize: '15px', color: 'var(--accent)'
                  }}>
                    {s.photoUrl
                      ? <img src={s.photoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      : (s.name || 'S').charAt(0)
                    }
                  </div>

                  {/* Student Details */}
                  <div className="attendance-student" style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 800, fontSize: '14px', color: 'var(--text-main)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {s.name}
                    </div>
                    <div className="attendance-details">
                      <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>ID: {s.sid}</span>
                      <span>&middot;</span>
                      <span>Class: <strong>{s.class}</strong></span>
                      <span>&middot;</span>
                      <span style={{ color: 'var(--success)', fontWeight: 700 }}>{studentStats[s.sid]?.present || 0} Present</span>
                      <span>&middot;</span>
                      <span style={{ color: 'var(--danger)', fontWeight: 700 }}>{studentStats[s.sid]?.absent || 0} Absent</span>
                    </div>
                  </div>

                  {/* Status Badge */}
                  <div className="attendance-status" style={{ width: '110px', textAlign: 'center', flexShrink: 0 }}>
                    {isPresent ? (
                      <span style={{ background: 'var(--success)', color: 'white', padding: '4px 12px', borderRadius: '20px', fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        PRESENT
                      </span>
                    ) : isAbsent ? (
                      <span style={{ background: 'var(--danger)', color: 'white', padding: '4px 12px', borderRadius: '20px', fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        ABSENT
                      </span>
                    ) : (
                      <span style={{ opacity: 0.35, fontSize: '11px', fontStyle: 'italic' }}>
                        Not Marked
                      </span>
                    )}
                  </div>

                  {/* Action Toggle Buttons (P / A) */}
                  <div className="attendance-actions" style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                    <button
                      onClick={() => toggleAttendance(s.sid, 'present')}
                      title="Mark Present"
                      style={{
                        width: '38px', height: '38px', borderRadius: '10px', border: '2px solid',
                        borderColor: isPresent ? 'var(--success)' : 'var(--border-color)',
                        background: isPresent ? 'var(--success)' : 'transparent',
                        color: isPresent ? 'white' : 'var(--text-muted)',
                        cursor: 'pointer', fontWeight: 900, fontSize: '16px',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        transition: 'all 0.15s ease', flexShrink: 0,
                        boxShadow: isPresent ? '0 2px 8px rgba(16, 185, 129, 0.25)' : 'none'
                      }}
                    >
                      <Check size={18} aria-hidden="true" />
                    </button>
                    <button
                      onClick={() => toggleAttendance(s.sid, 'absent')}
                      title="Mark Absent"
                      style={{
                        width: '38px', height: '38px', borderRadius: '10px', border: '2px solid',
                        borderColor: isAbsent ? 'var(--danger)' : 'var(--border-color)',
                        background: isAbsent ? 'var(--danger)' : 'transparent',
                        color: isAbsent ? 'white' : 'var(--text-muted)',
                        cursor: 'pointer', fontWeight: 900, fontSize: '16px',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        transition: 'all 0.15s ease', flexShrink: 0,
                        boxShadow: isAbsent ? '0 2px 8px rgba(239, 68, 68, 0.25)' : 'none'
                      }}
                    >
                      <X size={18} aria-hidden="true" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Printer, Calendar, Pencil, Trash2, Utensils, Save, X } from 'lucide-react';
import { usePagination, useUrlFilters } from '../workflows/finance';

const DEFAULT_FEEDING_FEE = 5;

// ── Credit Names multi-select — fully dark-mode aware ──────────────────────
const StudentCreditSelect = ({ students, selectedSids, onToggle, onSelectAll, onDeselectAll }) => {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef(null);

  // Close when clicking outside
  useEffect(() => {
    const handleClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  useEffect(() => {
    if (!isOpen) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
        ref.current?.querySelector('button')?.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  const allSelected = students.length > 0 && students.every(s => selectedSids.includes(s.sid));

  return (
    <div ref={ref} style={{ position: 'relative', width: '100%' }}>

      {/* ── Trigger pill ── */}
      <button
        type="button"
        onClick={() => setIsOpen(o => !o)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        style={{
          minHeight: '38px',
          padding: '5px 10px',
          background: 'var(--bg-page)',
          border: '1px solid var(--border-color)',
          borderRadius: '8px',
          display: 'flex',
          flexWrap: 'wrap',
          gap: '4px',
          alignItems: 'center',
          cursor: 'pointer',
          color: 'var(--text-main)',
          width: '100%',
          textAlign: 'left',
        }}
      >
        {selectedSids.length === 0 && (
          <span style={{ opacity: 0.45, fontSize: '12px', color: 'var(--text-muted)' }}>
            Select Credits...
          </span>
        )}
        {selectedSids.map(sid => {
          const s = students.find(x => x.sid === sid);
          return (
            <span key={sid} style={{
              background: 'var(--accent-glow)',
              border: '1px solid var(--accent)',
              color: 'var(--accent)',
              padding: '2px 6px',
              borderRadius: '4px',
              fontSize: '10px',
              fontWeight: 700,
            }}>
              {s?.name || sid}
            </span>
          );
        })}
      </button>

      {/* ── Dropdown panel ── */}
      {isOpen && (
        <div role="listbox" aria-label="Students receiving feeding credit" style={{
          position: 'absolute',
          top: 'calc(100% + 4px)',
          left: 0,
          width: '230px',
          maxHeight: '270px',
          overflowY: 'auto',
          zIndex: 300,
          background: 'var(--bg-card)',
          border: '1px solid var(--border-color)',
          borderRadius: '10px',
          padding: '8px',
          boxShadow: '0 8px 28px rgba(0,0,0,0.22)',
          backdropFilter: 'blur(14px)',
        }}>

          {/* Select All row */}
          <label
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '6px 6px 8px',
              borderBottom: '1px solid var(--border-color)',
              marginBottom: '6px',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: 800,
              color: 'var(--accent)',
            }}
          >
            <span>{allSelected ? 'Deselect All' : 'Select All'}</span>
            <input
              type="checkbox"
              checked={allSelected}
              onChange={() => (allSelected ? onDeselectAll() : onSelectAll())}
              style={{ accentColor: 'var(--accent)', width: '15px', height: '15px' }}
            />
          </label>

          {/* Individual students */}
          {students.map(s => (
            <label
              key={s.sid}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '5px 6px',
                borderRadius: '6px',
                fontSize: '12px',
                cursor: 'pointer',
                color: 'var(--text-main)',
                transition: 'background 0.15s',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--accent-glow)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              <span>{s.name}</span>
              <input
                type="checkbox"
                checked={selectedSids.includes(s.sid)}
                onChange={() => onToggle(s.sid)}
                style={{ accentColor: 'var(--accent)', width: '14px', height: '14px' }}
              />
            </label>
          ))}

          {students.length === 0 && (
            <div style={{ padding: '8px', opacity: 0.5, fontSize: '12px', color: 'var(--text-muted)' }}>
              Select a class first
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ── Main Feeding component ──────────────────────────────────────────────────
export default function Feeding({ students = [], classes = [], feedingConfig = {}, onSave, feedingRecords = [], onDelete, onUpdate, currency = 'GH₵', currentUser = 'Admin' }) {
  const [filters, setFilters] = useUrlFilters({ date: new Date().toISOString().split('T')[0], class: '', page: '1' }, 'feeding_');
  const [newEntry, setNewEntry] = useState({
    date: filters.date,
    class: '',
    numStudents: '',
    discount: '0',
    creditStudentSids: [],
  });
  const [isLoading, setIsLoading] = useState(false);
  const [actionError, setActionError] = useState('');
  const [editingRecord, setEditingRecord] = useState(null);

  const classStudents = useMemo(() => {
    if (!newEntry.class) return [];
    return (students || []).filter(s => s.class === newEntry.class);
  }, [students, newEntry.class]);

  const feedingFee    = Number(feedingConfig[newEntry.class]) || DEFAULT_FEEDING_FEE;
  const totalArrears  = newEntry.creditStudentSids.length * feedingFee;
  const presentCount = newEntry.numStudents === '' ? null : Number(newEntry.numStudents);
  const discountCount = newEntry.discount === '' ? null : Number(newEntry.discount);
  const isNonnegativeInteger = value => Number.isInteger(value) && value >= 0;
  const errors = {
    class: newEntry.class ? '' : 'Select a class.',
    numStudents: presentCount === null
      ? 'Enter students present.'
      : !isNonnegativeInteger(presentCount)
        ? 'Present must be a nonnegative whole number.'
        : presentCount > classStudents.length
          ? `Present cannot exceed enrollment (${classStudents.length}).`
          : '',
    discount: discountCount === null || !isNonnegativeInteger(discountCount)
      ? 'Discount must be a nonnegative whole number.'
      : '',
  };
  if (!errors.numStudents && !errors.discount && discountCount + newEntry.creditStudentSids.length > presentCount) {
    errors.allocation = `Discount (${discountCount}) plus credit (${newEntry.creditStudentSids.length}) cannot exceed present (${presentCount}).`;
  }
  const hasErrors = Object.values(errors).some(Boolean);
  const payingCount = hasErrors ? 0 : presentCount - newEntry.creditStudentSids.length - discountCount;
  const totalIncome   = payingCount * feedingFee;

  const filteredRecords = useMemo(() => {
    return (feedingRecords || []).filter(r => r.date === filters.date && (!filters.class || r.class === filters.class));
  }, [feedingRecords, filters.date, filters.class]);
  const pagination = usePagination(filteredRecords, filters.page, 8, page => setFilters(previous => ({ ...previous, page: String(page) })));

  const handleToggleCredit = (sid) => {
    setNewEntry(prev => ({
      ...prev,
      creditStudentSids: prev.creditStudentSids.includes(sid)
        ? prev.creditStudentSids.filter(id => id !== sid)
        : [...prev.creditStudentSids, sid],
    }));
  };

  const handleSelectAll    = () => setNewEntry(prev => ({ ...prev, creditStudentSids: classStudents.map(s => s.sid) }));
  const handleDeselectAll  = () => setNewEntry(prev => ({ ...prev, creditStudentSids: [] }));

  const handleSave = async () => {
    if (hasErrors || !newEntry.date) return;
    setActionError('');
    setIsLoading(true);
    const record = {
      id: `${Date.now()}`,
      date: newEntry.date,
      class: newEntry.class,
      numStudents: presentCount,
      discount: discountCount,
      creditStudentSids: newEntry.creditStudentSids,
      totalIncome: Math.max(0, totalIncome),
      totalArrears,
      feePerStudent: feedingFee,
      createdAt: editingRecord?.createdAt || new Date().toISOString(),
      createdBy: editingRecord?.createdBy || currentUser,
      updatedAt: editingRecord ? new Date().toISOString() : undefined,
      updatedBy: editingRecord ? currentUser : undefined,
    };
    try {
      if (editingRecord) record.id = editingRecord.id;
      let result;
      if (editingRecord && onUpdate) result = await onUpdate(editingRecord.id, record);
      else if (editingRecord && onDelete) {
        const removed = await onDelete(editingRecord.id);
        if (removed === false) throw new Error('The original feeding record could not be updated.');
        result = await onSave?.(record);
      } else result = await onSave?.(record);
      if (result === false) throw new Error('The feeding record could not be saved.');
      setEditingRecord(null);
      setNewEntry({ date: filters.date, class: '', numStudents: '', discount: '0', creditStudentSids: [] });
    } catch (err) {
      setActionError(err?.message || 'The feeding record could not be saved.');
    } finally {
      setIsLoading(false);
    }
  };

  const startEditing = record => {
    setEditingRecord(record);
    setNewEntry({ date: record.date, class: record.class || '', numStudents: String(record.numStudents ?? ''), discount: String(record.discount ?? 0), creditStudentSids: (record.creditStudentSids || []).filter(sid => students.some(s => s.sid === sid && s.class === record.class)) });
    setFilters(previous => ({ ...previous, date: record.date, page: '1' }));
    setActionError('');
  };

  const cancelEditing = () => {
    setEditingRecord(null);
    setNewEntry({ date: filters.date, class: '', numStudents: '', discount: '0', creditStudentSids: [] });
  };

  const handleDelete = async (record, correction = false) => {
    if (!onDelete) return;
    const message = correction
      ? 'Remove this record and load its values for correction? You must save the corrected replacement afterward.'
      : 'Permanently delete this feeding record?';
    if (!window.confirm(message)) return;
    setActionError('');
    try {
      const result = await onDelete(record.id);
      if (result === false) return;
      if (correction) {
        setNewEntry({
          date: record.date,
          class: record.class || '',
          numStudents: String(record.numStudents ?? ''),
          discount: String(record.discount ?? 0),
          creditStudentSids: (record.creditStudentSids || []).filter(sid => students.some(s => s.sid === sid && s.class === record.class)),
        });
      }
    } catch (err) {
      setActionError(err?.message || 'The feeding record could not be changed.');
    }
  };

  /* ── shared cell style ── */
  const cellInput = {
    padding: '8px 10px',
    border: '1px solid var(--border-color)',
    borderRadius: '8px',
    fontSize: '13px',
    background: 'var(--bg-page)',
    color: 'var(--text-main)',
    fontFamily: 'inherit',
    width: '100%',
  };

  return (
    <div className="view active feeding-page-view">
      <div className="view-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '15px' }}>
        <div>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: '10px' }}><Utensils size={24} /> Daily Feeding Records</h1>
           <p>Select a date to enter new records or view history for that day. {editingRecord && <strong>Editing {editingRecord.class}; save or cancel your changes.</strong>}</p>
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          <div style={{ background: 'var(--bg-card)', padding: '6px 12px', borderRadius: '10px', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '10px' }}>
             <Calendar size={18} style={{ color: 'var(--accent)' }} />
             <input 
               type="date" 
               value={filters.date}
               onChange={e => { setFilters(previous => ({ ...previous, date: e.target.value, page: '1' })); setNewEntry(previous => ({ ...previous, date: e.target.value })); }}
               style={{ 
                 background: 'transparent', 
                 border: 'none', 
                 color: 'var(--text-main)', 
                 fontFamily: 'inherit', 
                 fontSize: '14px', 
                 fontWeight: 700,
                 outline: 'none'
               }} 
             />
          </div>

          <button
            className="btn btn-secondary no-print"
            onClick={() => window.print()}
            title="Print Feeding Records"
            style={{ height: '40px' }}
          >
            <Printer size={16} /> Print
          </button>
        </div>
      </div>

      <div className="card no-print" style={{ padding: '12px 16px', marginBottom: '12px', display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}><label>History class <select value={filters.class} onChange={e => setFilters(previous => ({ ...previous, class: e.target.value, page: '1' }))}><option value="">All classes</option>{(classes || []).map(item => <option key={item}>{item}</option>)}</select></label><span style={{ marginLeft: 'auto', fontSize: '12px' }}>Expected {currency} {filteredRecords.reduce((sum, record) => sum + Number(record.numStudents || 0) * Number(record.feePerStudent || feedingConfig[record.class] || DEFAULT_FEEDING_FEE), 0).toFixed(2)} · Collected {currency} {filteredRecords.reduce((sum, record) => sum + Number(record.totalIncome || 0), 0).toFixed(2)}</span></div>

      <div className="feeding-table-wrapper table-responsive">

        <div className="table-responsive">
          <table className="table" style={{ borderCollapse: 'separate', borderSpacing: 0 }}>
            <thead>
              <tr style={{ background: 'var(--bg-card)' }}>
                <th style={{ padding: '18px 14px', color: 'var(--text-muted)' }}>CLASS</th>
                <th style={{ padding: '18px 14px', color: 'var(--text-muted)' }}>STUDENTS PRESENT</th>
                <th style={{ padding: '18px 14px', color: 'var(--text-muted)' }}>DISCOUNT</th>
                <th style={{ padding: '18px 14px', color: 'var(--text-muted)' }}>CREDIT (NAMES)</th>
                <th style={{ padding: '18px 14px', color: 'var(--text-muted)' }}>TOTAL INCOME</th>
                 <th style={{ padding: '18px 14px', color: 'var(--text-muted)' }}>TOTAL ARREARS</th>
                 {onDelete && <th className="no-print" style={{ padding: '18px 14px', color: 'var(--text-muted)' }}>ACTIONS</th>}
              </tr>
            </thead>
            <tbody>
              {/* ── NEW ENTRY ROW ── */}
              <tr style={{ background: 'var(--accent-glow)', borderBottom: '2px solid var(--accent)' }}>
                <td style={{ padding: '10px 14px' }}>
                   <select value={newEntry.class}
                    onChange={e => setNewEntry({ ...newEntry, class: e.target.value, numStudents: '', creditStudentSids: [] })}
                    aria-invalid={Boolean(errors.class)}
                    style={{ ...cellInput, width: '150px' }}>
                    <option value="">Select Class</option>
                    {(classes || []).map(c => <option key={c} value={c}>{c}</option>)}
                   </select>
                   {errors.class && <div role="alert" style={{ color: 'var(--danger)', fontSize: '11px', marginTop: '5px' }}>{errors.class}</div>}
                </td>
                <td style={{ padding: '10px 14px' }}>
                  <input type="number" min="0" step="1" inputMode="numeric" placeholder="0 Students" value={newEntry.numStudents}
                    onChange={e => setNewEntry({ ...newEntry, numStudents: e.target.value })}
                    aria-invalid={Boolean(errors.numStudents)} style={{ ...cellInput, width: '110px' }} />
                  {errors.numStudents && <div role="alert" style={{ color: 'var(--danger)', fontSize: '11px', marginTop: '5px', maxWidth: '170px' }}>{errors.numStudents}</div>}
                </td>
                <td style={{ padding: '10px 14px' }}>
                  <input type="number" min="0" step="1" inputMode="numeric" placeholder="0 Students" value={newEntry.discount}
                    onChange={e => setNewEntry({ ...newEntry, discount: e.target.value })}
                    aria-invalid={Boolean(errors.discount)} style={{ ...cellInput, width: '110px' }} />
                  {errors.discount && <div role="alert" style={{ color: 'var(--danger)', fontSize: '11px', marginTop: '5px' }}>{errors.discount}</div>}
                </td>
                <td style={{ padding: '10px 14px', minWidth: '180px' }}>
                  <StudentCreditSelect
                    students={classStudents}
                    selectedSids={newEntry.creditStudentSids}
                    onToggle={handleToggleCredit}
                    onSelectAll={handleSelectAll}
                    onDeselectAll={handleDeselectAll}
                  />
                </td>
                <td style={{ padding: '10px 14px', fontWeight: 700, color: 'var(--success)', whiteSpace: 'nowrap' }}>
                  {currency} {Math.max(0, totalIncome).toFixed(2)}
                </td>
                <td style={{ padding: '10px 14px', fontWeight: 700, color: 'var(--danger)', whiteSpace: 'nowrap' }}>
                  {currency} {totalArrears.toFixed(2)}
                </td>
                {onDelete && <td className="no-print" />}
              </tr>

              {/* ── SAVE BUTTON ROW ── */}
              <tr style={{ background: 'var(--accent-glow)' }}>
                 <td colSpan={onDelete ? 7 : 6} style={{ padding: '10px 14px' }}>
                   {errors.allocation && <div role="alert" style={{ color: 'var(--danger)', fontSize: '12px', marginBottom: '8px' }}>{errors.allocation}</div>}
                   {actionError && <div role="alert" style={{ color: 'var(--danger)', fontSize: '12px', marginBottom: '8px' }}>{actionError}</div>}
                   {editingRecord && <button type="button" className="btn btn-secondary" style={{ marginBottom: '8px' }} onClick={cancelEditing}><X size={15} /> Cancel edit</button>}
                  <button
                    onClick={handleSave}
                    className="btn btn-primary btn-block"
                    disabled={isLoading || hasErrors || !newEntry.date}
                  >
                     {!isLoading && <Save size={16} aria-hidden="true" />} {isLoading ? 'Saving...' : editingRecord ? 'Save corrected record' : 'Save & Add To Log'}
                  </button>
                </td>
              </tr>

              {/* ── HISTORY ── */}
              {pagination.pageItems.map(record => {
                const expected = Number(record.numStudents || 0) * Number(record.feePerStudent || feedingConfig[record.class] || DEFAULT_FEEDING_FEE);
                const collected = Number(record.totalIncome || 0);
                return (
                <tr key={record.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                   <td style={{ padding: '14px', color: 'var(--text-main)', fontWeight: 700 }}>{record.class}<small style={{ display: 'block', opacity: 0.6 }}>Created {record.createdAt ? new Date(record.createdAt).toLocaleString() : 'before audit tracking'}{record.updatedAt ? ` · Edited ${new Date(record.updatedAt).toLocaleString()} by ${record.updatedBy || 'Unknown'}` : ''}</small></td>
                  <td style={{ padding: '14px', color: 'var(--text-main)' }}>{record.numStudents}</td>
                  <td style={{ padding: '14px', color: 'var(--text-main)' }}>{record.discount || 0}</td>
                  <td style={{ padding: '14px' }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', maxWidth: '300px' }}>
                      {(record.creditStudentSids || []).map(sid => {
                        const s = students.find(x => x.sid === sid);
                        return (
                          <span key={sid} style={{
                            border: '1px solid var(--danger)',
                            color: 'var(--danger)',
                            fontSize: '10px',
                            padding: '2px 5px',
                            borderRadius: '4px',
                            fontWeight: 600,
                          }}>
                            {s?.name || sid}
                          </span>
                        );
                      })}
                      {(!record.creditStudentSids || record.creditStudentSids.length === 0) && (
                        <span style={{ fontSize: '12px', opacity: 0.4, color: 'var(--text-muted)' }}>None</span>
                      )}
                    </div>
                  </td>
                  <td style={{ padding: '14px', fontWeight: 700, color: 'var(--success)' }}>
                     {currency} {collected.toFixed(2)}<small style={{ display: 'block', color: collected >= expected ? 'var(--success)' : 'var(--danger)' }}>Expected {currency} {expected.toFixed(2)} · {collected >= expected ? 'Met' : `${currency} ${(expected - collected).toFixed(2)} short`}</small>
                  </td>
                  <td style={{ padding: '14px', fontWeight: 700, color: 'var(--danger)' }}>
                     {currency} {Number(record.totalArrears || 0).toFixed(2)}
                   </td>
                   {onDelete && (
                     <td className="no-print" style={{ padding: '14px', whiteSpace: 'nowrap' }}>
                        <button type="button" className="btn btn-icon btn-secondary" title="Correct record" aria-label={`Correct ${record.class} feeding record`} onClick={() => startEditing(record)}><Pencil size={15} /></button>{' '}
                       <button type="button" className="btn btn-icon btn-secondary" title="Delete record" aria-label={`Delete ${record.class} feeding record`} style={{ color: 'var(--danger)' }} onClick={() => handleDelete(record)}><Trash2 size={15} /></button>
                     </td>
                   )}
                 </tr>
                );
              })}

              {filteredRecords.length === 0 && (
                <tr>
                   <td colSpan={onDelete ? 7 : 6} style={{ textAlign: 'center', padding: '32px', opacity: 0.45, color: 'var(--text-muted)' }}>
                    No feeding records entered yet for this date.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          <nav aria-label="Feeding record pages" className="no-print" style={{ display: 'flex', justifyContent: 'space-between', padding: '12px' }}><small>Showing {pagination.total ? (pagination.page - 1) * pagination.pageSize + 1 : 0}-{Math.min(pagination.total, pagination.page * pagination.pageSize)} of {pagination.total}</small><span><button className="btn btn-sm btn-secondary" disabled={pagination.page === 1} onClick={() => setFilters(previous => ({ ...previous, page: String(pagination.page - 1) }))}>Previous</button>{' '}{pagination.page}/{pagination.pageCount}{' '}<button className="btn btn-sm btn-secondary" disabled={pagination.page === pagination.pageCount} onClick={() => setFilters(previous => ({ ...previous, page: String(pagination.page + 1) }))}>Next</button></span></nav>
        </div>
      </div>
    </div>
  );
}

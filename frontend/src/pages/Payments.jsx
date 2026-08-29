import React, { useState, useEffect } from 'react';
import { Search, Printer, RefreshCcw, CheckSquare, Trash2, Trash, ReceiptText, WalletCards } from 'lucide-react';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import { dateKey, isDateInPeriod, parseDate } from '../utils/date';
import { usePagination, useUrlFilters } from '../workflows/finance';
import { useFeedback } from '../context/FeedbackContext';
import { backendRequest } from '../services/apiClient';

const PERIODS = new Set(['all', 'today', 'week', 'month']);

const getInitialPeriod = (initialPeriod) => {
  const propPeriod = typeof initialPeriod === 'string' ? initialPeriod.toLowerCase() : initialPeriod;
  if (PERIODS.has(propPeriod)) return propPeriod;
  const params = new URLSearchParams(window.location.search);
  const queryPeriod = (params.get('period') || params.get('filter') || '').toLowerCase();
  return PERIODS.has(queryPeriod) ? queryPeriod : 'all';
};

export default function Payments({
  payments: localPayments = [],
  setPayments: setGlobalPayments,
  setDeleted,
  currency = '₵',
  convertAmount = (val) => val,
  backendUrl,
  token,
  schoolInfo = { schoolName: 'TRUE STAR ACADEMY', academicYear: '2024/2025', term: 'TERM 1' },
  settings = {},
  userRole = 'ADMIN',
  syncWithBackend = () => {},
  initialPeriod
}) {
  const ui = useFeedback();
  const [payments, setPayments] = useState(localPayments);
  const [isLoading, setIsLoading] = useState(false);
  const [urlFilters, setUrlFilters] = useUrlFilters({ search: '', period: getInitialPeriod(initialPeriod), sort: 'newest', page: '1' }, 'payments_');
  const searchQuery = urlFilters.search;
  const filter = PERIODS.has(urlFilters.period) ? urlFilters.period : 'all';
  const sortBy = ['newest', 'oldest', 'amount'].includes(urlFilters.sort) ? urlFilters.sort : 'newest';
  const [selectedPayments, setSelectedPayments] = useState([]);
  const [receiptLayout, setReceiptLayout] = useState('A5');
  const [feedback, setFeedback] = useState(null);

  // Sync with local payments (from App state) whenever they change
  useEffect(() => {
    setPayments(localPayments);
  }, [localPayments]);

  useEffect(() => {
    if (initialPeriod) setUrlFilters(previous => ({ ...previous, period: getInitialPeriod(initialPeriod), page: '1' }));
  }, [initialPeriod]);

  const filterByTime = (p) => filter === 'all' || isDateInPeriod(p.date, filter);

  const filteredPayments = payments
    .filter(p =>
      filterByTime(p) &&
      ((p.studentName || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
       (p.studentClass || '').toLowerCase().includes(searchQuery.toLowerCase()))
    )
    .sort((a, b) => {
      if (sortBy === 'amount') return b.amount - a.amount;
      const aTime = parseDate(a.date)?.getTime() ?? 0;
      const bTime = parseDate(b.date)?.getTime() ?? 0;
      return sortBy === 'newest' ? bTime - aTime : aTime - bTime;
    });

  const visibleIds = new Set(filteredPayments.map(p => p.id));
  const visibleSelectedPayments = selectedPayments.filter(id => visibleIds.has(id));

  useEffect(() => {
    setSelectedPayments(prev => prev.filter(id => visibleIds.has(id)));
  }, [filter, searchQuery, payments]);

  const totalAmount = filteredPayments.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);
  const reconciledPayments = filteredPayments.filter(p => ['reconciled', 'matched', 'settled'].includes(String(p.reconciliationStatus || p.status || '').toLowerCase()));
  const pageData = usePagination(filteredPayments, urlFilters.page, 12, page => setUrlFilters(previous => ({ ...previous, page: String(page) })));

  const toggleSelection = (id) =>
    setSelectedPayments(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  const toggleAll = () =>
    setSelectedPayments(visibleSelectedPayments.length === filteredPayments.length ? [] : filteredPayments.map(p => p.id));

  const printSelectedReceipts = () => {
    if (!visibleSelectedPayments.length) return alert('Select at least one payment first.');
    const selectedData = filteredPayments.filter(p => visibleSelectedPayments.includes(p.id));
    const isDouble = receiptLayout === 'A4-DOUBLE';
    const isQuad   = receiptLayout === 'A4-QUAD';
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: (isDouble || isQuad) ? 'a4' : [148, 210] });
    if (!isDouble && !isQuad) { doc.deletePage(1); doc.addPage([148, 210], 'landscape'); }

    const drawReceipt = (p, x, y, w, h) => {
      const cx = x + w / 2;
      // Robust check: Handle both singular '₵' and prefixed 'GH₵' or 'GH¢' to ensure a safe fallback.
      const pdfCurrency = (currency.includes('₵') || currency.includes('¢')) ? 'GHS' : currency;

      doc.setFontSize(10); doc.setTextColor(126, 34, 206); doc.setFont('helvetica', 'bold');
      try { 
        const logo = settings.logoUrl || '/logo.png';
        doc.addImage(logo, 'PNG', cx - 12.5, y + 5, 25, 25); 
      }
      catch { 
        doc.text(schoolInfo.schoolName || 'SCHOOL', cx, y + 15, { align: 'center' }); 
      }
      let cy = y + 33;
      doc.setFontSize(7); doc.setTextColor(100); doc.setFont('helvetica', 'normal');
      doc.text('EXCELLENCE IN EDUCATION & CHARACTER', cx, cy, { align: 'center' });
      cy += 4; doc.setDrawColor(126, 34, 206); doc.line(x + 10, cy, x + w - 10, cy);
      cy += 8; doc.setFontSize(10); doc.setTextColor(0); doc.setFont('helvetica', 'bold');
      doc.text('OFFICIAL PAYMENT RECEIPT', cx, cy, { align: 'center' });
      cy += 6; doc.setFontSize(8); doc.setFont('helvetica', 'normal');
      const code = `${(p.studentName || 'STU').substring(0, 3).toUpperCase()}-P${(p.id || '0000').toString().slice(-4)}`;
      doc.text(`Receipt: ${code}`, x + 15, cy); cy += 4;
      doc.text(`Student: ${(p.studentName || 'UNKNOWN').toUpperCase()}`, x + 15, cy); cy += 4;
      doc.text(`Class: ${p.studentClass || 'N/A'}  |  Date: ${p.date}  |  Year: ${schoolInfo.academicYear}  |  ${schoolInfo.term}`, x + 15, cy);
      doc.autoTable({
        startY: cy + 4,
        margin: { left: x + 15, right: (210 - (x + w)) + 15 },
        tableWidth: w - 30,
        head: [['Description', `Amount (${pdfCurrency})`]],
        body: [
          ['Amount Paid', `${pdfCurrency} ${convertAmount(p.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}`],
          ['OUTSTANDING BALANCE', `${pdfCurrency} ${convertAmount(p.balance || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`],
          ['Method', p.paymentMethod || p.method || 'Not recorded'],
        ],
        theme: 'striped',
        headStyles: { fillColor: [126, 34, 206], fontSize: isQuad ? 8 : 10 },
        styles: { fontSize: isQuad ? 7 : 9, cellPadding: isQuad ? 2 : 3 },
        didParseCell: (data) => {
          if (data.row.index === 1) {
            data.cell.styles.fontStyle = 'bold';
            data.cell.styles.textColor = [239, 68, 68];
            data.cell.styles.fontSize = isQuad ? 8 : 10;
          }
        }
      });
      const fy = doc.lastAutoTable.finalY;
      doc.setFontSize(6); doc.setFont('helvetica', 'italic'); doc.setTextColor(80);
      doc.text('"Thank you for your prompt payment."', cx, fy + 5, { align: 'center', maxWidth: w - 20 });
      doc.setDrawColor(180); doc.setLineWidth(0.3); doc.rect(x + 1, y + 1, w - 2, h - 2);
    };

    if (isQuad) {
      selectedData.forEach((p, i) => {
        if (i > 0 && i % 4 === 0) doc.addPage();
        const pos = i % 4; const col = pos % 2; const row = Math.floor(pos / 2);
        drawReceipt(p, col * 105, row * 148.5, 105, 148.5);
      });
    } else if (isDouble) {
      selectedData.forEach((p, i) => {
        if (i > 0 && i % 2 === 0) doc.addPage();
        drawReceipt(p, 0, (i % 2) * 148.5, 210, 148.5);
      });
    } else {
      selectedData.forEach((p, i) => {
        if (i > 0) doc.addPage([148, 210], 'landscape');
        drawReceipt(p, 0, 0, 210, 148);
      });
    }
    window.open(doc.output('bloburl'), '_blank');
    setSelectedPayments([]);
  };

  const recyclePayment = async (payment) => {
    if (navigator.onLine === false) throw new Error('Payments cannot be moved to the Recycle Bin while offline.');
    const payload = await backendRequest(backendUrl, token, `/recycle/payments/${encodeURIComponent(payment.id)}`, { method: 'POST', body: { reason: 'Removed from payment ledger' } });
    if (!payload?.item) throw new Error('The backend did not return the recycled payment.');
    return payload.item;
  };

  const handleDelete = async (id) => {
    const payment = payments.find(p => p.id === id);
    if (!payment) return;
    if (!await ui.confirm({ title: 'Move payment to Recycle Bin?', message: 'The payment can be restored during the retention period.', confirmLabel: 'Move to Recycle Bin' })) return;
    try {
      const recycleItem = await recyclePayment(payment);
      setGlobalPayments?.(prev => prev.filter(p => p.id !== id));
      setDeleted?.(prev => [...prev, recycleItem]);
      setSelectedPayments(prev => prev.filter(x => x !== id));
      setFeedback({ message: 'Payment moved to the Recycle Bin.', payments: [payment], recycleItems: [recycleItem] });
    } catch (error) { ui.toast.error(error.message); }
  };

  const handleBulkDelete = async () => {
    if (!visibleSelectedPayments.length || !await ui.confirm({ title: 'Move selected payments?', message: `${visibleSelectedPayments.length} payments will be moved to the Recycle Bin.`, confirmLabel: 'Move payments' })) return;
    const toDelete = payments.filter(p => visibleSelectedPayments.includes(p.id));
    try {
      const recycleItems = await Promise.all(toDelete.map(recyclePayment));
      setGlobalPayments?.(prev => prev.filter(p => !visibleSelectedPayments.includes(p.id)));
      setDeleted?.(prev => [...prev, ...recycleItems]);
      setSelectedPayments([]);
      setFeedback({ message: `${toDelete.length} payments moved to the Recycle Bin.`, payments: toDelete, recycleItems });
    } catch (error) { ui.toast.error(error.message); }
  };

  const undoDelete = async () => {
    if (!feedback?.payments?.length) return;
    try {
      let restored = feedback.payments;
      if (feedback.recycleItems?.some(item => item.originalCollection)) {
        restored = await Promise.all(feedback.recycleItems.map(async item => {
          if (!item.originalCollection) { await syncWithBackend('payments', item, 'create'); return item; }
          if (navigator.onLine === false) throw new Error('Payments cannot be restored while offline.');
          const payload = await backendRequest(backendUrl, token, `/recycle/${encodeURIComponent(item.id)}/restore`, { method: 'POST', body: {} });
          if (!payload?.item) throw new Error('The backend did not return the restored payment.');
          return payload.item;
        }));
      } else await Promise.all(restored.map(payment => syncWithBackend('payments', payment, 'create')));
      setGlobalPayments?.(previous => [...restored, ...previous.filter(item => !restored.some(payment => payment.id === item.id))]);
      const recycleIds = new Set((feedback.recycleItems || []).map(item => item.id));
      setDeleted?.(previous => previous.filter(item => !recycleIds.has(item.id)));
      setFeedback({ message: `${restored.length} payment${restored.length === 1 ? '' : 's'} restored.` });
    } catch (error) { ui.toast.error(error.message); }
  };

  return (
    <div className="view active payments-page-view">

      <style>{`
        @media print {
          .no-print { display: none !important; }
          .content-area { margin-left: 0 !important; width: 100% !important; }
          .card { border: none !important; box-shadow: none !important; }
        }
      `}</style>

      {/* Header */}
      <div className="view-header" style={{ flexWrap: 'wrap', gap: '12px' }}>
        <h1>Payment Management</h1>
        <div className="toolbar-group no-print" style={{ flexWrap: 'wrap', gap: '8px' }}>
          {visibleSelectedPayments.length > 0 && (
            <>
              <select className="btn btn-secondary" value={receiptLayout} onChange={e => setReceiptLayout(e.target.value)}>
                <option value="A5">A5 Single</option>
                <option value="A4-DOUBLE">A4 Double</option>
                <option value="A4-QUAD">A4 Quad</option>
              </select>
              <button className="btn btn-primary" onClick={printSelectedReceipts}>
                <CheckSquare size={16} aria-hidden="true" /> Print {visibleSelectedPayments.length}
              </button>
              {userRole !== 'TEACHER' && (
                <button className="btn btn-outline" style={{ color: 'var(--danger)', borderColor: 'var(--danger)' }} onClick={handleBulkDelete}>
                  <Trash2 size={16} aria-hidden="true" /> Delete {visibleSelectedPayments.length}
                </button>
              )}
            </>
          )}
          <button className="btn btn-secondary" onClick={() => window.print()}>
            <Printer size={16} aria-hidden="true" /> Print Table
          </button>
          <button className="btn btn-secondary" onClick={() => window.location.reload()}>
            <RefreshCcw size={16} aria-hidden="true" /> Refresh
          </button>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="dashboard-kpi-grid no-print" style={{ marginBottom: '20px' }}>
        <article className="dashboard-kpi-card tone-blue">
          <span className="dashboard-kpi-icon"><ReceiptText size={22} /></span>
          <span className="dashboard-kpi-copy"><small>Total Records</small><strong>{filteredPayments.length}</strong><em>Matching payments</em></span>
        </article>
        <article className="dashboard-kpi-card tone-green">
          <span className="dashboard-kpi-icon"><RefreshCcw size={22} /></span>
          <span className="dashboard-kpi-copy"><small>Reconciled</small><strong>{reconciledPayments.length}/{filteredPayments.length}</strong><em>{filteredPayments.length ? `${Math.round((reconciledPayments.length / filteredPayments.length) * 100)}% matched` : 'No matching transactions'}</em></span>
        </article>
        <article className="dashboard-kpi-card tone-green">
          <span className="dashboard-kpi-icon"><WalletCards size={22} /></span>
          <span className="dashboard-kpi-copy"><small>Total Collected</small><strong>{currency}{convertAmount(totalAmount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong><em>For the selected period</em></span>
        </article>
        <article className="dashboard-kpi-card tone-blue">
          <span className="dashboard-kpi-icon"><CheckSquare size={22} /></span>
          <span className="dashboard-kpi-copy"><small>Selected</small><strong>{visibleSelectedPayments.length}</strong><em>Ready for bulk actions</em></span>
        </article>
      </div>

      {/* Filters */}
      <div className="card no-print" style={{ padding: '16px 20px', marginBottom: '16px' }}>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
          <div className="premium-search" style={{ flex: '1 1 220px', minWidth: '180px' }}>
            <input
              type="text"
              placeholder="Search by student name or class..."
              value={searchQuery}
              onChange={e => setUrlFilters(previous => ({ ...previous, search: e.target.value, page: '1' }))}
            />
            <Search className="search-icon" size={18} aria-hidden="true" />
          </div>
          <select className="btn btn-outline" value={filter} onChange={e => setUrlFilters(previous => ({ ...previous, period: e.target.value, page: '1' }))} style={{ flex: '0 0 auto' }}>
            <option value="all">Time: All Time</option>
            <option value="today">Time: Today</option>
            <option value="week">Time: This Week</option>
            <option value="month">Time: This Month</option>
          </select>
          <select className="btn btn-outline" value={sortBy} onChange={e => setUrlFilters(previous => ({ ...previous, sort: e.target.value, page: '1' }))} style={{ flex: '0 0 auto' }}>
            <option value="newest">Sort: Newest First</option>
            <option value="oldest">Sort: Oldest First</option>
            <option value="amount">Sort: Highest Amount</option>
          </select>
        </div>
      </div>

      {/* Table */}
      {filteredPayments.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '60px' }}>
          <p style={{ color: 'var(--text-main)', fontSize: '16px' }}>
            {payments.length === 0 ? 'No payment records have been recorded.' : 'No payments match the current filters.'}
          </p>
          {isLoading && <p style={{ color: 'var(--text-main)' }}>Loading from server...</p>}
        </div>
      ) : (
        <div className="payments-table-wrapper table-responsive">
          <div style={{ overflowX: 'auto' }}>
              <table className="table" style={{ minWidth: '900px' }}>
              <thead>
                <tr>
                  <th style={{ width: '40px' }}>
                    <input
                      type="checkbox"
                      checked={filteredPayments.length > 0 && visibleSelectedPayments.length === filteredPayments.length}
                      onChange={toggleAll}
                      aria-label="Select all visible payments"
                    />
                  </th>
                  <th>Date</th>
                  <th>Student Name</th>
                  <th>Class</th>
                  <th>Amount</th>
                  <th>Method / Reference</th>
                  <th>Receipt</th>
                  <th>Collected By</th>
                  <th>Receipt ID</th>
                  {userRole !== 'TEACHER' && <th style={{ textAlign: 'right' }}>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {pageData.pageItems.map(p => (
                  <tr key={p.id} className={selectedPayments.includes(p.id) ? 'selected-row' : ''}>
                    <td>
                      <input type="checkbox" checked={visibleSelectedPayments.includes(p.id)} onChange={() => toggleSelection(p.id)} aria-label={`Select payment for ${p.studentName || 'student'} on ${dateKey(p.date) || p.date}`} />
                    </td>
                    <td style={{ fontSize: '13px' }}>{p.date}</td>
                    <td style={{ fontWeight: 600 }}>{p.studentName}</td>
                    <td>{p.studentClass || 'N/A'}</td>
                    <td style={{ fontWeight: 800, color: 'var(--success)' }}>
                      {currency}{convertAmount(p.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </td>
                    <td><strong style={{ display: 'block', fontSize: '12px' }}>{p.paymentMethod || p.method || 'Not recorded'}</strong><small style={{ fontFamily: 'monospace', opacity: 0.7 }}>{p.transactionReference || p.reference || p.transactionId || 'No reference'}</small></td>
                    <td><span className="badge" style={{ color: p.receiptStatus === 'void' ? 'var(--danger)' : 'var(--success)' }}>{p.receiptStatus || (p.receiptIssued === false ? 'Pending' : 'Issued')}</span><small style={{ display: 'block', opacity: 0.65 }}>{p.reconciliationStatus || 'Unreconciled'}</small></td>
                    <td style={{ fontSize: '12px', color: 'var(--text-main)' }}>{p.addedBy || 'Admin'}</td>
                    <td style={{ fontSize: '11px', color: 'var(--text-main)', fontFamily: 'monospace' }}>#{(p.id || '').toString().slice(-6)}</td>
                    {userRole !== 'TEACHER' && (
                      <td style={{ textAlign: 'right' }}>
                        <button 
                          className="btn btn-icon" 
                          style={{ color: 'var(--danger)', padding: '4px' }} 
                          onClick={() => handleDelete(p.id)}
                          aria-label={`Delete payment for ${p.studentName || 'student'}`}
                        >
                          <Trash size={16} aria-hidden="true" />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ fontWeight: 800, background: 'var(--bg-page)', color: 'var(--text-main)' }}>
                  <td colSpan="4">TOTAL: {filteredPayments.length} records</td>
                  <td style={{ color: 'var(--primary)', fontSize: '1rem' }}>
                    {currency}{convertAmount(totalAmount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </td>
                  <td />
                  <td />
                  <td />
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
          <nav aria-label="Payment pages" className="no-print" style={{ display: 'flex', justifyContent: 'space-between', padding: '12px', alignItems: 'center' }}>
            <small>Showing {pageData.total ? (pageData.page - 1) * pageData.pageSize + 1 : 0}-{Math.min(pageData.total, pageData.page * pageData.pageSize)} of {pageData.total}</small>
            <span><button className="btn btn-secondary btn-sm" disabled={pageData.page === 1} onClick={() => setUrlFilters(previous => ({ ...previous, page: String(pageData.page - 1) }))}>Previous</button>{' '}<strong>{pageData.page}/{pageData.pageCount}</strong>{' '}<button className="btn btn-secondary btn-sm" disabled={pageData.page === pageData.pageCount} onClick={() => setUrlFilters(previous => ({ ...previous, page: String(pageData.page + 1) }))}>Next</button></span>
          </nav>
        </div>
      )}
      {feedback && <div role="status" aria-live="polite" className="card no-print" style={{ position: 'fixed', right: '20px', bottom: '20px', zIndex: 400, padding: '12px 16px', display: 'flex', gap: '12px', alignItems: 'center' }}><span>{feedback.message}</span>{feedback.payments?.length > 0 && <button className="btn btn-primary btn-sm" onClick={undoDelete}>Undo</button>}<button className="btn btn-icon" aria-label="Dismiss message" onClick={() => setFeedback(null)}>×</button></div>}
    </div>
  );
}

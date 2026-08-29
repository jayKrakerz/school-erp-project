import React, { useEffect, useState, useMemo } from 'react';
import { Plus, DollarSign, Calendar, Tag, UserCheck, Printer, Search, ReceiptText, Layers, X, Pencil, Ban, Paperclip, Repeat2, History } from 'lucide-react';
import ProfitLoss from './ProfitLoss';
import { financeRequest, usePagination, useUrlFilters } from '../workflows/finance';

export default function Expenditure({ 
    expenditures = [], 
    onSave, 
    currency = 'GH₵', 
    schoolInfo = {},
    // Props for ProfitLoss sub-section
    payments = [],
    attendanceData = {},
    students = [],
    feedingConfig = {},
    feedingRecords,
    termMetadata,
    termStartDate,
    termEndDate,
    backendUrl,
    token,
    onUpdate,
    onCancel,
    onApproval,
    currentUser = 'Admin'
}) {
    const [activeTab, setActiveTab] = useState('entries'); // options: 'entries', 'analysis'
    const [expenseState, setExpenseState] = useState(expenditures);
    const [showModal, setShowModal] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [saveError, setSaveError] = useState('');
    const [filters, setFilters] = useUrlFilters({ search: '', startDate: '', endDate: '', category: '', approval: '', page: '1' }, 'expenses_');
    const [editing, setEditing] = useState(null);
    const [detail, setDetail] = useState(null);
    const [feedback, setFeedback] = useState('');
    const [rules, setRules] = useState([]);
    const [showRules, setShowRules] = useState(false);
    const [formData, setFormData] = useState({
        date: new Date().toISOString().split('T')[0],
        description: '',
        category: 'Miscellaneous',
        amount: '',
        approvedBy: '',
        approvalStatus: 'pending',
        recurring: false,
        frequency: 'monthly',
        attachment: null
    });

    useEffect(() => {
        if (!backendUrl || !token) return;
        financeRequest(backendUrl, token, '/api/recurring-expense-rules')
            .then(data => setRules(data.items || data.rules || []))
            .catch(() => {});
    }, [backendUrl, token]);

    useEffect(() => setExpenseState(expenditures), [expenditures]);

    const categories = [
        "Salary", "Feeding", "Utilities", "Transport", "Maintenance", "Stationery", "Events", "Miscellaneous"
    ];

    const filteredExpenditures = useMemo(() => {
        const query = filters.search.trim().toLowerCase();
        return (expenseState || []).filter(exp => {
            const matchesSearch = !query || [exp.description, exp.approvedBy, exp.category]
                .some(value => String(value || '').toLowerCase().includes(query));
            return matchesSearch &&
                (!filters.category || exp.category === filters.category) &&
                (!filters.approval || (exp.status === 'cancelled' ? 'cancelled' : (exp.approvalStatus || 'approved')) === filters.approval) &&
                (!filters.startDate || exp.date >= filters.startDate) &&
                (!filters.endDate || exp.date <= filters.endDate);
        }).sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')) || String(b.id || '').localeCompare(String(a.id || '')));
    }, [expenseState, filters]);

    const totalExpenditure = useMemo(() =>
        filteredExpenditures.reduce((sum, exp) => sum + (parseFloat(exp.amount) || 0), 0)
    , [filteredExpenditures]);

    const hasFilters = Object.entries(filters).some(([key, value]) => key !== 'page' && Boolean(value));
    const pagination = usePagination(filteredExpenditures, filters.page, 10, page => setFilters(previous => ({ ...previous, page: String(page) })));

    const emptyForm = () => ({ date: new Date().toISOString().split('T')[0], description: '', category: 'Miscellaneous', amount: '', approvedBy: '', approvalStatus: 'pending', recurring: false, frequency: 'monthly', attachment: null });

    const openEditor = exp => {
        setEditing(exp || null);
        setFormData(exp ? { ...emptyForm(), ...exp, amount: String(exp.amount ?? ''), attachment: null } : emptyForm());
        setSaveError('');
        setShowModal(true);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!formData.description || Number(formData.amount) <= 0 || !formData.approvedBy) {
            alert("Please fill in all required fields.");
            return;
        }
        setIsSaving(true);
        setSaveError('');
        try {
            const attachmentMetadata = formData.attachment ? { name: formData.attachment.name, size: formData.attachment.size, type: formData.attachment.type } : editing?.attachmentMetadata;
            const payload = { ...formData, attachment: undefined, attachmentMetadata, id: editing?.id, updatedAt: new Date().toISOString(), updatedBy: currentUser };
            let result;
            if (editing && backendUrl && token) result = await financeRequest(backendUrl, token, `/api/expenditure/${editing.id}/update`, { method: 'POST', body: JSON.stringify(payload) });
            else result = await (editing && onUpdate ? onUpdate(editing.id, payload) : onSave?.(payload));
            if (result === false) throw new Error('The transaction could not be saved. Please try again.');
            if (result?.expenditure) setExpenseState(previous => previous.map(exp => exp.id === result.expenditure.id ? result.expenditure : exp));
            if (formData.attachment && backendUrl && token && (editing?.id || result?.expenditure?.id)) {
                await financeRequest(backendUrl, token, `/api/expenditure/${editing?.id || result.expenditure.id}/attachments`, { method: 'POST', body: JSON.stringify(attachmentMetadata) });
            }
            if (formData.recurring && backendUrl && token) {
                const rule = await financeRequest(backendUrl, token, '/api/recurring-expense-rules', { method: 'POST', body: JSON.stringify({ ...payload, frequency: formData.frequency, startDate: payload.date }) });
                setRules(previous => [rule.rule || rule, ...previous]);
            }
            setShowModal(false);
            setFeedback(editing ? 'Expense updated.' : 'Expense saved.');
            setEditing(null);
            setFormData(emptyForm());
        } catch (error) {
            setSaveError(error?.message || 'The transaction could not be saved. Please try again.');
        } finally {
            setIsSaving(false);
        }
    };

    const cancelExpense = async exp => {
        const reason = window.prompt('Reason for cancelling this expense:');
        if (!reason) return;
        try {
            const result = onCancel
                ? await onCancel(exp.id, reason)
                : await financeRequest(backendUrl, token, `/api/expenditure/${exp.id}/cancel`, { method: 'POST', body: JSON.stringify({ reason }) });
            if (result === false) throw new Error('The expense cancellation was rejected.');
            const cancelled = result?.expenditure || { ...exp, status: 'cancelled', cancelReason: reason };
            setExpenseState(previous => previous.map(item => item.id === exp.id ? cancelled : item));
            if (detail?.id === exp.id) setDetail(cancelled);
            setFeedback('Expense cancellation recorded.');
        } catch (error) { setFeedback(error.message); }
    };

    const changeApproval = async (exp, approvalStatus) => {
        const comment = approvalStatus === 'rejected' ? window.prompt('Rejection reason:') : '';
        if (approvalStatus === 'rejected' && !comment) return;
        try {
            let result;
            if (onApproval) result = await onApproval(exp.id, approvalStatus, comment);
            else if (backendUrl && token) result = await financeRequest(backendUrl, token, `/api/expenditure/${exp.id}/approval`, { method: 'POST', body: JSON.stringify({ approvalStatus, comment, approvedBy: currentUser }) });
            else if (onUpdate) result = await onUpdate(exp.id, { ...exp, approvalStatus, approvalComment: comment, updatedAt: new Date().toISOString(), updatedBy: currentUser });
            else throw new Error('Connect the finance backend to persist approval decisions.');
            if (result === false) throw new Error('The approval decision was rejected.');
            const updated = result?.expenditure || { ...exp, approvalStatus, approvalComment: comment };
            setExpenseState(previous => previous.map(item => item.id === exp.id ? updated : item));
            setFeedback(`Expense ${approvalStatus}.`);
        } catch (error) { setFeedback(error.message); }
    };

    return (
        <section className="view active expenditure-page-view">
            <div className="expense-hero no-print">
                <div className="expense-hero-copy">
                    <span className="expense-eyebrow"><ReceiptText size={15} /> Finance control</span>
                    <h1>{schoolInfo.schoolName || 'School'} Expenditure</h1>
                    <p>Track approvals, filter transactions, and review profit/loss without leaving the finance workspace.</p>
                    <div className="expense-tabs" role="tablist" aria-label="Expenditure sections">
                        <button 
                            className={activeTab === 'entries' ? 'active' : ''}
                            onClick={() => setActiveTab('entries')}
                            role="tab"
                            aria-selected={activeTab === 'entries'}
                        >
                            Transaction Entries
                        </button>
                        <button 
                            className={activeTab === 'analysis' ? 'active' : ''}
                            onClick={() => setActiveTab('analysis')}
                            role="tab"
                            aria-selected={activeTab === 'analysis'}
                        >
                            P&L Analysis
                        </button>
                    </div>
                </div>
                <div className="expense-actions">
                    <button className="btn btn-secondary no-print" onClick={() => window.print()} title="Print Report">
                        <Printer size={16} /> Print
                    </button>
                    {activeTab === 'entries' && (
                        <button className="btn btn-primary shadow-lg no-print" onClick={() => openEditor(null)}>
                            <Plus size={18} /> Add Expense
                        </button>
                    )}
                    {activeTab === 'entries' && <button className="btn btn-secondary no-print" onClick={() => setShowRules(value => !value)}><Repeat2 size={16} /> Recurring rules ({rules.length})</button>}
                </div>
            </div>

            {activeTab === 'entries' ? (
                <>
                    <div className="dashboard-kpi-grid" style={{ marginBottom: '20px' }}>
                        <article className="dashboard-kpi-card tone-red">
                            <span className="dashboard-kpi-icon"><DollarSign size={22} /></span>
                            <span className="dashboard-kpi-copy">
                                <small>{hasFilters ? 'Filtered Expenses' : 'Total Expenses'}</small>
                                <strong>{currency}{totalExpenditure.toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong>
                                <em>{hasFilters ? 'Total for matching transactions' : 'Cumulative total expenditures'}</em>
                            </span>
                        </article>
                        <article className="dashboard-kpi-card tone-blue">
                            <span className="dashboard-kpi-icon"><Layers size={22} /></span>
                            <span className="dashboard-kpi-copy">
                                <small>Entries</small>
                                <strong>{filteredExpenditures.length}</strong>
                                <em>{hasFilters ? `Matching ${expenseState.length} recorded transactions` : 'Total recorded transactions'}</em>
                            </span>
                        </article>
                    </div>

                    <div className="expense-filter-card no-print">
                        <label className="expense-search-field">
                            <span>Search</span>
                            <Search size={16} />
                            <input type="search" value={filters.search} placeholder="Description, approver, category" onChange={e => setFilters({ ...filters, search: e.target.value })} />
                        </label>
                        <label>
                            <span>From date</span>
                            <input type="date" value={filters.startDate} max={filters.endDate || undefined} onChange={e => setFilters({ ...filters, startDate: e.target.value })} />
                        </label>
                        <label>
                            <span>To date</span>
                            <input type="date" value={filters.endDate} min={filters.startDate || undefined} onChange={e => setFilters({ ...filters, endDate: e.target.value })} />
                        </label>
                        <label>
                            <span>Category</span>
                            <select value={filters.category} onChange={e => setFilters({ ...filters, category: e.target.value })}>
                                <option value="">All categories</option>
                                {[...new Set([...categories, ...expenseState.map(exp => exp.category).filter(Boolean)])].map(category => <option key={category} value={category}>{category}</option>)}
                            </select>
                        </label>
                        <label><span>Approval</span><select value={filters.approval} onChange={e => setFilters(previous => ({ ...previous, approval: e.target.value, page: '1' }))}><option value="">All statuses</option><option value="pending">Pending</option><option value="approved">Approved</option><option value="rejected">Rejected</option><option value="cancelled">Cancelled</option></select></label>
                        <button type="button" className="btn btn-secondary" disabled={!hasFilters} onClick={() => setFilters({ search: '', startDate: '', endDate: '', category: '', approval: '', page: '1' })}>Clear</button>
                    </div>

                    {showRules && <div className="card no-print" style={{ padding: '16px', marginBottom: '16px' }}><h3 style={{ marginTop: 0 }}><Repeat2 size={16} /> Recurring expense rules</h3>{rules.length ? rules.map(rule => <div key={rule.id || `${rule.description}-${rule.frequency}`} className="flex-between" style={{ borderTop: '1px solid var(--border-color)', padding: '10px 0' }}><span><strong>{rule.description}</strong><small style={{ display: 'block' }}>{rule.frequency || 'Monthly'} · next {rule.nextRun || 'when scheduled'}</small></span><span className="badge">{rule.status || 'active'}</span></div>) : <p style={{ opacity: 0.65 }}>{backendUrl && token ? 'No recurring rules configured.' : 'Connect the finance backend to load and persist recurring rules. You can mark a new expense as recurring.'}</p>}</div>}

                    <div className="expense-table-card expenditure-table-wrapper table-responsive">

                        <table className="table">
                            <thead>
                                <tr>
                                    <th>Date</th>
                                    <th>Description</th>
                                    <th>Category</th>
                                    <th>Amount</th>
                                    <th>Approved By</th>
                                    <th>Status / Evidence</th>
                                    <th className="no-print">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredExpenditures.length === 0 ? (
                                    <tr>
                                            <td colSpan="7">
                                                <div className="expense-empty-state">
                                                    <ReceiptText size={36} />
                                                    <strong>{hasFilters ? 'No matching expenses' : 'No expenses recorded'}</strong>
                                                    <span>{hasFilters ? 'Try clearing filters or widening the date range.' : 'Add your first expense to begin tracking school costs.'}</span>
                                                </div>
                                            </td>
                                    </tr>
                                ) : (
                                    pagination.pageItems.map(exp => (
                                        <tr key={exp.id}>
                                            <td className="expense-date-cell">{exp.date}</td>
                                            <td className="expense-description-cell">{exp.description}</td>
                                            <td>
                                                <span className="expense-category-pill">
                                                    {exp.category}
                                                </span>
                                            </td>
                                            <td className="expense-amount-cell">
                                                {currency}{parseFloat(exp.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                            </td>
                                            <td className="expense-approver-cell">{exp.approvedBy}</td>
                                            <td><span className="badge">{exp.status === 'cancelled' ? 'cancelled' : (exp.approvalStatus || 'approved')}</span>{(exp.attachmentMetadata || exp.attachment) && <small style={{ display: 'block' }}><Paperclip size={11} /> {exp.attachmentMetadata?.name || exp.attachment?.name || exp.attachmentName || 'Attachment'}</small>}</td>
                                            <td className="no-print" style={{ whiteSpace: 'nowrap' }}><button className="btn btn-icon btn-secondary" title="Edit" onClick={() => openEditor(exp)}><Pencil size={14} /></button>{' '}<button className="btn btn-icon btn-secondary" title="Audit details" onClick={() => setDetail(detail?.id === exp.id ? null : exp)}><History size={14} /></button>{' '}{exp.status !== 'cancelled' && (exp.approvalStatus || 'approved') === 'pending' && <><button className="btn btn-sm btn-secondary" title="Approve" onClick={() => changeApproval(exp, 'approved')}>Approve</button>{' '}<button className="btn btn-sm btn-secondary" title="Reject" onClick={() => changeApproval(exp, 'rejected')}>Reject</button>{' '}</>}{exp.status !== 'cancelled' && <button className="btn btn-icon btn-secondary" title="Cancel expense" onClick={() => cancelExpense(exp)}><Ban size={14} /></button>}</td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                        <nav className="no-print" aria-label="Expense pages" style={{ padding: '12px', display: 'flex', justifyContent: 'space-between' }}><small>Showing {pagination.total ? (pagination.page - 1) * pagination.pageSize + 1 : 0}-{Math.min(pagination.total, pagination.page * pagination.pageSize)} of {pagination.total}</small><span><button className="btn btn-sm btn-secondary" disabled={pagination.page === 1} onClick={() => setFilters(previous => ({ ...previous, page: String(pagination.page - 1) }))}>Previous</button>{' '}{pagination.page}/{pagination.pageCount}{' '}<button className="btn btn-sm btn-secondary" disabled={pagination.page === pagination.pageCount} onClick={() => setFilters(previous => ({ ...previous, page: String(pagination.page + 1) }))}>Next</button></span></nav>
                    </div>
                    {detail && <div className="card no-print" style={{ padding: '16px', marginTop: '12px' }}><div className="flex-between"><h3 style={{ margin: 0 }}>Audit detail: {detail.description}</h3><button className="btn btn-icon" onClick={() => setDetail(null)}><X size={15} /></button></div><p>Created {detail.createdAt || 'before audit tracking'} by {detail.createdBy || detail.addedBy || 'Unknown'} · Last changed {detail.updatedAt || 'Never'} by {detail.updatedBy || 'N/A'}</p>{detail.cancelReason && <p><strong>Cancellation reason:</strong> {detail.cancelReason}</p>}</div>}
                </>
            ) : (
                <ProfitLoss 
                    isSubSection={true}
                    payments={payments}
                    expenditures={expenseState}
                    attendanceData={attendanceData}
                    students={students}
                    feedingConfig={feedingConfig}
                    feedingRecords={feedingRecords}
                    currency={currency}
                    schoolInfo={schoolInfo}
                    termMetadata={termMetadata}
                    termStartDate={termStartDate}
                    termEndDate={termEndDate}
                />
            )}

            {showModal && (
                <div className="modal" role="presentation">
                    <div className="modal-content card expense-modal-card" role="dialog" aria-modal="true" aria-labelledby="expense-modal-title">
                        <div className="expense-modal-header">
                            <div>
                                <span className="expense-eyebrow"><Plus size={14} /> New transaction</span>
                                <h2 id="expense-modal-title">{editing ? 'Edit School Expense' : 'Add School Expense'}</h2>
                            </div>
                            <button className="btn btn-icon btn-secondary" aria-label="Close expense dialog" disabled={isSaving} onClick={() => setShowModal(false)}><X size={16} /></button>
                        </div>
                        <form onSubmit={handleSubmit} className="premium-form">
                            <div className="form-group mb-3">
                                <label htmlFor="expense-date"><Calendar size={14} /> Date</label>
                                <input id="expense-date" type="date" value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} required />
                            </div>
                            <div className="form-group mb-3">
                                <label htmlFor="expense-category"><Tag size={14} /> Category</label>
                                <select id="expense-category" value={formData.category} onChange={e => setFormData({...formData, category: e.target.value})} required>
                                    {categories.map(c => <option key={c} value={c}>{c}</option>)}
                                </select>
                            </div>
                            <div className="form-group mb-3">
                                <label htmlFor="expense-description">Description/Item</label>
                                <input id="expense-description" type="text" placeholder="e.g. Electricity Bill, Staff Lunch" value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} required />
                            </div>
                            <div className="form-group mb-3">
                                <label htmlFor="expense-amount"><DollarSign size={14} /> Amount ({currency})</label>
                                <input id="expense-amount" type="number" min="0.01" step="0.01" placeholder="0.00" value={formData.amount} onChange={e => setFormData({...formData, amount: e.target.value})} required />
                            </div>
                            <div className="form-group mb-4">
                                <label htmlFor="expense-approver"><UserCheck size={14} /> Approved By</label>
                                <input id="expense-approver" type="text" placeholder="Manager/Admin Name" value={formData.approvedBy} onChange={e => setFormData({...formData, approvedBy: e.target.value})} required />
                            </div>
                            <div className="form-group mb-3"><label htmlFor="expense-status"><UserCheck size={14} /> Approval status</label><select id="expense-status" value={formData.approvalStatus} onChange={e => setFormData({...formData, approvalStatus: e.target.value})}><option value="pending">Pending</option><option value="approved">Approved</option><option value="rejected">Rejected</option></select></div>
                            <div className="form-group mb-3"><label htmlFor="expense-attachment"><Paperclip size={14} /> Evidence attachment</label><input id="expense-attachment" type="file" accept="image/*,.pdf,.doc,.docx" onChange={e => setFormData({...formData, attachment: e.target.files?.[0] || null})} />{(formData.attachment || editing?.attachmentMetadata) && <small>{formData.attachment?.name || editing.attachmentMetadata.name} · {Math.round((formData.attachment?.size || editing.attachmentMetadata.size || 0) / 1024)} KB</small>}</div>
                            <label style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '12px' }}><input type="checkbox" checked={formData.recurring} onChange={e => setFormData({...formData, recurring: e.target.checked})} /> Create recurring rule</label>
                            {formData.recurring && <div className="form-group mb-3"><label>Frequency</label><select value={formData.frequency} onChange={e => setFormData({...formData, frequency: e.target.value})}><option value="weekly">Weekly</option><option value="monthly">Monthly</option><option value="yearly">Yearly</option></select>{!backendUrl && <small>Backend connection is required to persist this rule.</small>}</div>}
                            {saveError && <p role="alert" style={{ color: 'var(--danger)', fontSize: '13px', margin: '0 0 12px' }}>{saveError}</p>}
                            <button type="submit" className="btn btn-primary btn-block" disabled={isSaving}>{isSaving ? 'SAVING...' : editing ? 'SAVE CHANGES' : 'SAVE TRANSACTION'}</button>
                        </form>
                    </div>
                </div>
            )}
            {feedback && <div role="status" aria-live="polite" className="card no-print" style={{ position: 'fixed', right: 20, bottom: 20, zIndex: 500, padding: '12px 16px' }}>{feedback} <button className="btn btn-icon" onClick={() => setFeedback('')}>×</button></div>}
        </section>
    );
}

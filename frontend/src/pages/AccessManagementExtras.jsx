import React, { useEffect, useState } from 'react';
import { Clipboard, History, MailPlus, RefreshCw, ShieldCheck, UserX } from 'lucide-react';
import { useFeedback } from '../context/FeedbackContext';
import { backendRequest } from '../services/apiClient';

export default function AccessManagementExtras({ backendUrl, token, classes = [] }) {
  const { toast, confirm } = useFeedback();
  const [invitations, setInvitations] = useState([]);
  const [audit, setAudit] = useState([]);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ email: '', name: '', role: 'TEACHER', assignedClass: '' });

  const request = async (path, options = {}) => {
    const normalized = { ...options };
    if (typeof normalized.body === 'string') normalized.body = JSON.parse(normalized.body);
    return backendRequest(backendUrl, token, path, normalized);
  };

  const load = async () => {
    setLoading(true);
    try {
      const [inviteData, auditData] = await Promise.all([request('/invitations'), request('/audit')]);
      setInvitations(inviteData.items || []);
      setAudit((auditData.items || []).slice(0, 20));
    } catch (error) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const invite = async (event) => {
    event.preventDefault();
    try {
      const data = await request('/invitations', { method: 'POST', body: JSON.stringify(form) });
      setInvitations(previous => [data.invitation, ...previous]);
      const link = `${window.location.origin}/?invite=${encodeURIComponent(data.token)}&email=${encodeURIComponent(form.email)}`;
      await navigator.clipboard?.writeText(link);
      toast.success({ title: 'Invitation created', message: 'The one-time invitation link was copied to your clipboard.' });
      setForm({ email: '', name: '', role: 'TEACHER', assignedClass: '' });
    } catch (error) { toast.error(error.message); }
  };

  const revoke = async (item) => {
    if (!await confirm({ title: 'Revoke invitation?', message: `Revoke the invitation for ${item.email}?`, confirmLabel: 'Revoke' })) return;
    try {
      await request(`/invitations/${item.id}/revoke`, { method: 'POST' });
      setInvitations(previous => previous.map(entry => entry.id === item.id ? { ...entry, status: 'revoked' } : entry));
      toast.success('Invitation revoked.');
    } catch (error) { toast.error(error.message); }
  };

  return (
    <div className="access-extras-grid">
      <section className="card">
        <div className="flex-between mb-1"><h3><MailPlus size={18} /> Invite Staff</h3><button className="btn btn-icon btn-secondary" onClick={load} aria-label="Refresh invitations"><RefreshCw size={15} className={loading ? 'animate-spin' : ''} /></button></div>
        <form onSubmit={invite} className="form-grid">
          <div className="form-group"><label htmlFor="invite-name">Name</label><input id="invite-name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
          <div className="form-group"><label htmlFor="invite-email">Email</label><input id="invite-email" type="email" required value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></div>
          <div className="form-group"><label htmlFor="invite-role">Role</label><select id="invite-role" value={form.role} onChange={e => setForm({ ...form, role: e.target.value, assignedClass: '' })}><option>TEACHER</option><option>ACCOUNTANT</option></select></div>
          {form.role === 'TEACHER' && <div className="form-group"><label htmlFor="invite-class">Assigned class</label><select id="invite-class" value={form.assignedClass} onChange={e => setForm({ ...form, assignedClass: e.target.value })}><option value="">Select class</option>{classes.map(name => <option key={name}>{name}</option>)}</select></div>}
          <button className="btn btn-primary" type="submit"><Clipboard size={15} /> Create & Copy Link</button>
        </form>
        <div className="access-record-list">
          {invitations.map(item => <div key={item.id} className="access-record"><div><strong>{item.email}</strong><small>{item.role} · {item.status}</small></div>{item.status === 'pending' && <button className="btn btn-icon btn-secondary" onClick={() => revoke(item)} aria-label={`Revoke invitation for ${item.email}`}><UserX size={15} /></button>}</div>)}
          {!loading && invitations.length === 0 && <p className="table-empty-state">No invitations created.</p>}
        </div>
      </section>
      <section className="card">
        <h3><History size={18} /> Recent Audit Trail</h3>
        <div className="access-record-list">
          {audit.map(item => <div key={item.id} className="access-record"><ShieldCheck size={16} /><div><strong>{item.action}</strong><small>{item.actor || 'System'} · {item.createdAt ? new Date(item.createdAt).toLocaleString() : ''}</small></div></div>)}
          {!loading && audit.length === 0 && <p className="table-empty-state">No audited changes yet.</p>}
        </div>
      </section>
    </div>
  );
}

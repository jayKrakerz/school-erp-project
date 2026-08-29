import React, { useState, useEffect } from 'react';
import { Upload, FileText, CheckCircle, Trash, Eye, Layout, Settings, Layers, ShieldCheck, RotateCcw, Copy, History } from 'lucide-react';
import { backendRequest } from '../services/apiClient';

export default function ReportTemplateSettings({ backendUrl, token, departments = {}, reportTemplates = [], setReportTemplates }) {
  const [activeTab, setActiveTab] = useState('templates');
  const [uploading, setUploading] = useState(false);
  const [deploying, setDeploying] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [pendingTemplate, setPendingTemplate] = useState(null);
  const [actionError, setActionError] = useState('');
  const [actionMessage, setActionMessage] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [deploymentHistory, setDeploymentHistory] = useState(() => reportTemplates.flatMap(t => t.deploymentHistory || []));
  const [historyTemplate, setHistoryTemplate] = useState(null);
  const [formData, setFormData] = useState({ 
    name: '', 
    assignedTo: '', 
    type: 'custom', // 'builtin' or 'custom'
    builtinId: 'preschool_default'
  });

  const selectFile = (file) => {
    if (!file) return;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setSelectedFile(file);
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    setActionError('');
  };

  const handleFileChange = (e) => selectFile(e.target.files[0]);

  const apiRequest = async (path, options = {}) => {
    const normalized = { ...options };
    if (typeof normalized.body === 'string') normalized.body = JSON.parse(normalized.body);
    return backendRequest(backendUrl, token, path, normalized);
  };

  const templatePreviewUrl = url => {
    if (!url || /^(?:data:|blob:|https?:\/\/)/i.test(url)) return url;
    const base = String(backendUrl || window.location.origin).replace(/\/$/, '');
    return `${base}/${String(url).replace(/^\//, '')}`;
  };

  const fileAsDataUrl = file => new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(file); });

  const handleUpload = async (e) => {
    e.preventDefault();
    setActionError('');
    setActionMessage('');
    if (!formData.assignedTo) {
      const result = { success: false, error: 'Please select a target department or class.' };
      setActionError(result.error);
      return result;
    }

    setUploading(true);

    try {
      let templateData = pendingTemplate;
      if (formData.type === 'builtin') {
        let newTemplate = templateData || {
          id: `builtin-${Date.now()}`,
          name: formData.name || 'Preschool Official Template',
          assignedTo: formData.assignedTo,
          type: 'builtin',
          builtinId: formData.builtinId,
          createdAt: new Date().toLocaleDateString()
        };
        if (!templateData) {
          const createdAt = new Date().toISOString();
          newTemplate = { ...newTemplate, version: 1, versions: [{ version: 1, createdAt, snapshot: { ...newTemplate, version: 1 } }] };
        }
        
        if (!templateData) {
          const saved = await apiRequest('/data/reportTemplates', { method: 'POST', body: JSON.stringify([...reportTemplates, newTemplate]) });
          if (!saved?.success) throw new Error('The backend did not confirm template creation.');
          templateData = newTemplate;
          setReportTemplates(prev => [...prev, newTemplate]);
          setPendingTemplate(newTemplate);
        }
      } else {
        if (!templateData) {
          const file = selectedFile || e.target.templateFile?.files[0];
          if (!file) throw new Error('Select a file first.');

          const createdAt = new Date().toISOString();
          const template = { id: `custom-${Date.now()}`, name: formData.name || file.name, assignedTo: formData.assignedTo, type: 'custom', url: await fileAsDataUrl(file), fileName: file.name, version: 1, createdAt };
          templateData = { ...template, versions: [{ version: 1, createdAt, snapshot: template }] };
          const saved = await apiRequest('/data/reportTemplates', { method: 'POST', body: JSON.stringify([...reportTemplates, templateData]) });
          if (!saved?.success) throw new Error('The backend did not confirm template creation.');
          setReportTemplates(prev => [...prev, templateData]);
          setPendingTemplate(templateData);
        }
      }

      if (templateData) {
        const deployment = await handleDeploy(templateData.id, formData.assignedTo);
        if (!deployment.success) return deployment;
        setFormData({ name: '', assignedTo: '', type: 'custom', builtinId: 'preschool_default' });
        setPendingTemplate(null);
        setSelectedFile(null);
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        setPreviewUrl(null);
        if (e.target.reset) e.target.reset();
        setActiveTab('templates');
        return { success: true, template: templateData };
      }
    } catch (err) {
      console.error(err);
      const result = { success: false, error: err.message || 'Template action failed.' };
      setActionError(result.error);
      return result;
    } finally {
      setUploading(false);
    }
    return { success: false, error: 'Template action failed.' };
  };

  const handleDeploy = async (templateId, target) => {
    setDeploying(true);
    setActionError('');
    setActionMessage('');
    try {
      const startedAt = new Date().toISOString();
      const data = await apiRequest('/deploy-template', { method: 'POST', body: JSON.stringify({ templateId, target }) });
      if (!data?.success || !data.deploymentId) throw new Error(data?.error || 'The backend did not confirm deployment.');
      const event = { id: data.deploymentId, templateId, target, status: 'deployed', createdAt: startedAt, message: data.message || 'Template deployed successfully.' };
      setDeploymentHistory(prev => [event, ...prev]);
      setReportTemplates(prev => prev.map(t => t.id === templateId ? { ...t, deploymentStatus: 'deployed', lastDeployedAt: startedAt, deploymentHistory: [event, ...(t.deploymentHistory || [])] } : t));
      setActionMessage(event.message);
      return { success: true, data };
    } catch (e) {
      const event = { id: `deployment-${Date.now()}`, templateId, target, status: 'failed', createdAt: new Date().toISOString(), message: e.message || 'Deployment failed.' };
      setDeploymentHistory(prev => [event, ...prev]);
      setReportTemplates(prev => prev.map(t => t.id === templateId ? { ...t, deploymentStatus: 'failed', deploymentHistory: [event, ...(t.deploymentHistory || [])] } : t));
      const result = { success: false, error: e.message || 'Deployment failed.' };
      setActionError(result.error);
      return result;
    } finally {
      setDeploying(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm("Are you sure you want to remove this template assignment? Existing report data will remain but will use the next available template.")) return { success: false, cancelled: true };
    
    setDeletingId(id);
    setActionError('');
    setActionMessage('');
    try {
      await apiRequest(`/report-template/delete/${id}`, { method: 'DELETE' });
      setReportTemplates(prev => prev.filter(t => t.id !== id));
      setActionMessage('Template assignment deleted.');
      return { success: true };
    } catch (e) {
      const result = { success: false, error: e.message || 'Delete failed.' };
      setActionError(result.error);
      return result;
    } finally {
      setDeletingId(null);
    }
  };

  const duplicateTemplate = async (template) => {
    setActionError('');
    try {
      const data = await apiRequest(`/report-template/${template.id}/duplicate`, { method: 'POST', body: JSON.stringify({ name: `${template.name} Copy` }) });
      const copy = data?.template || { ...template, id: `copy-${Date.now()}`, name: `${template.name} Copy`, deploymentStatus: 'draft', deploymentHistory: [], createdAt: new Date().toLocaleDateString(), version: 1, localOnly: !data };
      setReportTemplates(prev => [...prev, copy]);
      setActionMessage('Template duplicated as a draft.');
    } catch (error) { setActionError(error.message); }
  };

  const rollbackTemplate = async (template, version) => {
    setActionError('');
    try {
      const data = await apiRequest(`/report-template/${template.id}/rollback`, { method: 'POST', body: JSON.stringify({ version }) });
      const rolledBack = data?.template || { ...template, version, deploymentStatus: 'draft', updatedAt: new Date().toISOString() };
      setReportTemplates(prev => prev.map(item => item.id === template.id ? rolledBack : item));
      setActionMessage(`Rolled back ${template.name} to version ${version}. Review and redeploy when ready.`);
    } catch (error) { setActionError(error.message); }
  };

  return (
    <div className="animate-fade-in">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="flex items-center gap-3" style={{ color: 'var(--primary)', margin: 0, fontSize: '1.8rem', fontWeight: 900 }}>
            <Layout size={32} /> Report Template Management
          </h2>
          <p style={{ opacity: 0.6, margin: '4px 0 0 44px', fontSize: '0.9rem' }}>
            Configure and assign official report structures for each department.
          </p>
        </div>
      </div>

      <div className="flex gap-6 mb-8" style={{ borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
        <button 
          className={`pb-3 px-2 flex items-center gap-2 transition-all ${activeTab === 'templates' ? 'border-b-4 border-primary font-bold text-primary scale-105' : 'text-gray-500 opacity-60 hover:opacity-100'}`}
          onClick={() => setActiveTab('templates')}
        >
          <Layers size={18} /> Active Assignments
        </button>
        <button 
          className={`pb-3 px-2 flex items-center gap-2 transition-all ${activeTab === 'upload' ? 'border-b-4 border-primary font-bold text-primary scale-105' : 'text-gray-500 opacity-60 hover:opacity-100'}`}
          onClick={() => setActiveTab('upload')}
        >
          <Settings size={18} /> Configure New Template
        </button>
        <button className={`pb-3 px-2 flex items-center gap-2 transition-all ${activeTab === 'history' ? 'border-b-4 border-primary font-bold text-primary' : 'text-gray-500 opacity-60'}`} onClick={() => setActiveTab('history')}><History size={18} /> Deployment History</button>
      </div>

      {actionError && <div role="alert" style={{ marginBottom: '18px', padding: '12px 14px', border: '1px solid #fecaca', borderRadius: '10px', background: '#fef2f2', color: '#b91c1c', fontWeight: 700 }}>{actionError}</div>}
      {actionMessage && <div role="status" style={{ marginBottom: '18px', padding: '12px 14px', border: '1px solid #bbf7d0', borderRadius: '10px', background: '#f0fdf4', color: '#166534', fontWeight: 700 }}>{actionMessage}</div>}

      {activeTab === 'upload' && (
        <div className="card p-8 animate-slide-up">
          <form onSubmit={handleUpload} className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {pendingTemplate && (
              <div className="md:col-span-2" style={{ padding: '12px 14px', borderRadius: '10px', background: '#fff7ed', border: '1px solid #fed7aa', color: '#9a3412', fontWeight: 700 }}>
                The template was created but deployment is incomplete. Retry to deploy the same assignment without uploading it again.
              </div>
            )}
            <div className="form-group">
              <label className="font-bold mb-2 block">Assignment Name</label>
              <input 
                type="text" 
                className="premium-input"
                placeholder="e.g., Official Preschool Template" 
                value={formData.name}
                onChange={e => setFormData({...formData, name: e.target.value})}
                required 
              />
            </div>
            
            <div className="form-group">
              <label className="font-bold mb-2 block">Target Department / Class</label>
              <select 
                className="premium-input"
                value={formData.assignedTo} 
                onChange={e => setFormData({...formData, assignedTo: e.target.value})}
                required
              >
                <option value="">-- Choose Target --</option>
                <optgroup label="Entire Departments">
                  {Object.keys(departments).map(dept => (
                    <option key={dept} value={dept}>{dept}</option>
                  ))}
                </optgroup>
                <optgroup label="Specific Classes">
                  {Object.values(departments).flat().sort().map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </optgroup>
              </select>
            </div>

            <div className="form-group md:col-span-2">
              <label className="font-bold mb-2 block">Template Structure Type</label>
              <div className="flex gap-4">
                <div 
                  className={`flex-1 p-4 rounded-xl border-2 cursor-pointer transition-all flex items-center gap-3 ${formData.type === 'builtin' ? 'border-primary bg-primary bg-opacity-5' : 'border-gray-100 opacity-60'}`}
                  onClick={() => setFormData({...formData, type: 'builtin'})}
                >
                  <ShieldCheck className={formData.type === 'builtin' ? 'text-primary' : ''} />
                  <div>
                    <div className="font-bold">Built-in (Recommended)</div>
                    <div className="text-xs">Use the official TSA preschool report structure.</div>
                  </div>
                </div>
                <div 
                  className={`flex-1 p-4 rounded-xl border-2 cursor-pointer transition-all flex items-center gap-3 ${formData.type === 'custom' ? 'border-primary bg-primary bg-opacity-5' : 'border-gray-100 opacity-60'}`}
                  onClick={() => setFormData({...formData, type: 'custom'})}
                >
                  <Upload className={formData.type === 'custom' ? 'text-primary' : ''} />
                  <div>
                    <div className="font-bold">Custom Upload</div>
                    <div className="text-xs">Upload your own Image, PDF, or Word template.</div>
                  </div>
                </div>
              </div>
            </div>

            {formData.type === 'custom' && (
              <div className="form-group md:col-span-2">
                <label className="font-bold mb-2 block">Upload Template File (Image/PDF/Word)</label>
                <div className="premium-upload-box" style={{ 
                  border: dragActive ? '2px solid var(--primary)' : (previewUrl ? '2px solid var(--accent)' : '2px dashed #ddd'),
                  borderRadius: '16px', 
                  padding: previewUrl ? '20px' : '50px', 
                  textAlign: 'center',
                  cursor: 'pointer',
                  background: dragActive ? '#f0f7ff' : '#fafafa',
                  position: 'relative',
                  overflow: 'hidden',
                  minHeight: '200px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
                  onClick={() => document.getElementById('templateFile').click()}
                  onDragEnter={(e) => { e.preventDefault(); setDragActive(true); }}
                  onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; setDragActive(true); }}
                  onDragLeave={(e) => { e.preventDefault(); if (!e.currentTarget.contains(e.relatedTarget)) setDragActive(false); }}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragActive(false);
                    selectFile(e.dataTransfer.files?.[0]);
                  }}
                >
                  {previewUrl ? (
                    <div className="w-full">
                      {selectedFile?.type.includes('image') ? (
                        <img src={previewUrl} alt="Preview" style={{ maxHeight: '300px', margin: '0 auto', borderRadius: '8px' }} />
                      ) : (
                        <div className="flex flex-col items-center py-8">
                          <FileText size={64} className="text-primary mb-4" />
                          <p className="font-bold text-lg">{selectedFile?.name}</p>
                          <p className="text-sm opacity-60">Ready to upload</p>
                        </div>
                      )}
                      <div className="mt-4 flex justify-center gap-4">
                        <button type="button" className="btn btn-secondary btn-sm" onClick={(e) => { e.stopPropagation(); if (previewUrl) URL.revokeObjectURL(previewUrl); setSelectedFile(null); setPreviewUrl(null); }}>Remove</button>
                        <button type="button" className="btn btn-primary btn-sm">Change File</button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <Upload size={40} style={{ color: 'var(--primary)', marginBottom: '12px' }} />
                      <p className="font-bold">Click to browse or drag & drop</p>
                      <p className="text-xs opacity-50">Supported formats: JPG, PNG, PDF, DOC, DOCX</p>
                    </>
                  )}
                  <input type="file" id="templateFile" name="templateFile" className="hidden" accept="image/*,application/pdf,.doc,.docx" onChange={handleFileChange} />
                </div>
              </div>
            )}

            {formData.type === 'builtin' && (
              <div className="form-group md:col-span-2 bg-gray-50 p-6 rounded-xl border border-dashed">
                <div className="flex items-start gap-4">
                  <div className="bg-primary bg-opacity-10 p-3 rounded-lg text-primary">
                    <FileText size={24} />
                  </div>
                  <div>
                    <h4 className="font-bold m-0">Preschool Official Template v2.8</h4>
                    <p className="text-sm opacity-60 mb-0">This template includes the Two-Page layout, Terminal Composition, and Financial Bill structure designed specifically for Preschool departments.</p>
                  </div>
                </div>
              </div>
            )}

            <button type="submit" className="btn btn-primary btn-lg md:col-span-2 py-4 text-lg font-bold" disabled={uploading || deploying}>
              {uploading ? (
                <span className="flex items-center gap-2"><div className="spinner-sm"></div> Processing Upload...</span>
              ) : deploying ? (
                <span className="flex items-center gap-2"><div className="spinner-sm"></div> Replicating to Students...</span>
              ) : pendingTemplate ? "Retry Deployment" : "Deploy Template Assignment"}
            </button>
          </form>
        </div>
      )}

      {activeTab === 'templates' && (
        <div className="animate-slide-up">
          {reportTemplates.length > 0 && <div className="card p-6 mb-6" style={{ overflowX: 'auto' }}><h3 style={{ marginBottom: 12 }}>Assignment Matrix</h3><table className="table"><thead><tr><th>Target</th>{reportTemplates.map(t => <th key={t.id}>{t.name}</th>)}</tr></thead><tbody>{[...Object.keys(departments), ...Object.values(departments).flat()].map(target => <tr key={target}><td style={{ fontWeight: 800 }}>{target}</td>{reportTemplates.map(t => <td key={t.id} style={{ textAlign: 'center' }}>{t.assignedTo === target ? <CheckCircle size={16} style={{ color: '#10b981' }} /> : '—'}</td>)}</tr>)}</tbody></table></div>}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {reportTemplates.length === 0 ? (
            <div className="col-span-full py-20 text-center opacity-30 card border-dashed">
              <FileText size={64} className="mx-auto mb-4" />
              <p className="text-xl font-bold">No templates assigned yet.</p>
              <button className="btn btn-primary mt-4" onClick={() => setActiveTab('upload')}>Add First Template</button>
            </div>
          ) : (
            reportTemplates.map(tmp => {
              // Calculate students assigned (locally for speed, though backend handles the truth)
              let studentCount = 0;
              if (Object.keys(departments).includes(tmp.assignedTo)) {
                const classes = departments[tmp.assignedTo];
                // Note: 'students' would need to be passed as a prop to do this perfectly locally
                // For now, we'll rely on the backend message or just show the target
              }

              return (
                <div key={tmp.id} className="card p-6 relative hover:shadow-xl transition-all border-t-4 border-primary group">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h4 className="font-bold text-xl m-0 leading-tight">{tmp.name}</h4>
                      <div className="flex gap-2 mt-2">
                        <span className="badge badge-primary">{tmp.assignedTo}</span>
                        <span className="badge" style={{ background: '#f0f0f0', color: '#666' }}>{tmp.type === 'builtin' ? 'BUILT-IN' : 'CUSTOM'}</span>
                      </div>
                    </div>
                    <div className="flex gap-2 transition-opacity" style={{ opacity: 1 }}>
                      {tmp.url && (
                        <button className="btn btn-icon btn-secondary" title="View Template" onClick={() => window.open(templatePreviewUrl(tmp.url), '_blank', 'noopener,noreferrer')}>
                          <Eye size={18} />
                        </button>
                      )}
                      <button 
                        className="btn btn-icon btn-secondary text-primary" 
                        title="Redeploy to all students" 
                        disabled={deploying}
                        onClick={() => handleDeploy(tmp.id, tmp.assignedTo)}
                      >
                        <RotateCcw size={18} className={deploying ? 'animate-spin' : ''} />
                      </button>
                      <button className="btn btn-icon btn-secondary" title="Duplicate template" onClick={() => duplicateTemplate(tmp)}><Copy size={18} /></button>
                      <button className="btn btn-icon btn-secondary" title="Version history" onClick={() => setHistoryTemplate(tmp)}><History size={18} /></button>
                      <button className="btn btn-icon btn-secondary text-danger" title="Delete Assignment" disabled={deletingId === tmp.id} onClick={() => handleDelete(tmp.id)}>
                        <Trash size={18} className={deletingId === tmp.id ? 'animate-pulse' : ''} />
                      </button>
                    </div>
                  </div>
                  
                  <div className="mt-6 pt-4 border-t flex justify-between items-center text-xs opacity-60">
                    <div className="flex flex-col">
                      <span>Last Updated: {tmp.createdAt}</span>
                      <span>Version {tmp.version || 1} · {tmp.deploymentStatus || (tmp.localOnly ? 'local draft' : 'legacy')}</span>
                      <span className="font-bold text-primary mt-1">Targets: {tmp.assignedTo}</span>
                    </div>
                    {tmp.type === 'builtin' && <span className="flex items-center gap-1"><CheckCircle size={12} className="text-success" /> Verified TSA</span>}
                  </div>
                </div>
              );
            })
          )}
          </div>
        </div>
      )}

      {activeTab === 'history' && <div className="card p-6"><h3 style={{ marginBottom: 16 }}>Deployment History</h3>{deploymentHistory.length ? <div style={{ overflowX: 'auto' }}><table className="table"><thead><tr><th>Template</th><th>Target</th><th>Status</th><th>Date</th><th>Action</th></tr></thead><tbody>{deploymentHistory.map(event => { const template = reportTemplates.find(t => t.id === event.templateId); return <tr key={event.id}><td>{template?.name || event.templateId}</td><td>{event.target}</td><td>{event.status}</td><td>{event.createdAt ? new Date(event.createdAt).toLocaleString() : '—'}</td><td>{event.status === 'failed' && template ? <button className="btn btn-secondary" onClick={() => handleDeploy(template.id, event.target)}>Retry</button> : '—'}</td></tr>; })}</tbody></table></div> : <p style={{ opacity: .55 }}>No deployment events recorded yet.</p>}</div>}

      {historyTemplate && <div className="modal"><div className="modal-content card" role="dialog" aria-modal="true" style={{ maxWidth: 520 }}><div className="flex justify-between items-center mb-4"><h3>Version History: {historyTemplate.name}</h3><button className="btn btn-icon btn-secondary" onClick={() => setHistoryTemplate(null)}>×</button></div>{(historyTemplate.versions || [{ version: historyTemplate.version || 1, createdAt: historyTemplate.createdAt }]).map(item => <div key={item.version} className="flex justify-between items-center" style={{ padding: 12, borderBottom: '1px solid var(--border-color)' }}><span><strong>Version {item.version}</strong><br /><small>{item.createdAt || 'Date unavailable'}</small></span><button className="btn btn-secondary" disabled={Number(item.version) === Number(historyTemplate.version || 1)} onClick={() => rollbackTemplate(historyTemplate, item.version)}>Rollback</button></div>)}</div></div>}
    </div>
  );
}

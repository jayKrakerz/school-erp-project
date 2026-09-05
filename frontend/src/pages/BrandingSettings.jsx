import React, { useState } from 'react';
import { Palette, Globe, Image as ImageIcon, Save, RotateCcw, Eye, X, CheckCircle, Monitor, Smartphone, LogIn, Upload } from 'lucide-react';
import { useBranding } from '../context/BrandingContext';

const PRESETS = [
  { name: 'Indigo Pro',  primary: '#6366f1', accent: '#10b981' },
  { name: 'Royal Purple',primary: '#7e22ce', accent: '#f59e0b' },
  { name: 'Ocean Blue', primary: '#0ea5e9', accent: '#10b981' },
  { name: 'Forest',     primary: '#059669', accent: '#f59e0b' },
  { name: 'Crimson',    primary: '#dc2626', accent: '#0ea5e9' },
  { name: 'Slate Dark', primary: '#334155', accent: '#7e22ce' },
];

function SectionHeader({ icon: Icon, title, sub }) {
  return (
    <div style={{ borderBottom: '1.5px solid var(--border-color)', paddingBottom: 16, marginBottom: 24 }}>
      <h3 style={{ fontWeight: 900, fontSize: 15, display: 'flex', alignItems: 'center', gap: 10 }}>
        <Icon size={17} style={{ color: 'var(--accent)' }} />
        {title}
      </h3>
      {sub && <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{sub}</p>}
    </div>
  );
}

const luminance = (hex) => {
  const value = /^#[0-9a-f]{6}$/i.test(hex || '') ? hex.slice(1) : '000000';
  const channels = [0, 2, 4].map(i => parseInt(value.slice(i, i + 2), 16) / 255).map(v => v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
  return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
};
const contrast = (a, b) => { const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x); return (light + .05) / (dark + .05); };

export default function BrandingSettings({ syncWithBackend }) {
  const { branding, setBranding } = useBranding();
  const [form, setForm] = useState({ ...branding, logoUrl: branding.logoUrl || '' });
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewMode, setPreviewMode] = useState('desktop');

  const set = (key, value) => setForm(p => ({ ...p, [key]: value }));

  const applyPreset = (p) => setForm(prev => ({ ...prev, primaryColor: p.primary, accentColor: p.accent }));
  const primaryContrast = contrast(form.primaryColor, '#ffffff');
  const accentContrast = contrast(form.accentColor, '#ffffff');
  const contrastValid = primaryContrast >= 4.5 && accentContrast >= 4.5;

  const handleImageUpload = (key, file) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) return alert('Select an image file.');
    if (file.size > 2 * 1024 * 1024) return alert('Image must be 2 MB or smaller.');
    const reader = new FileReader();
    reader.onload = e => set(key, e.target.result);
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    if (!contrastValid) return alert('Brand colors must reach WCAG AA contrast (4.5:1) against white text.');
    setIsSaving(true);
    try {
      if (!syncWithBackend) throw new Error('Branding publishing is not connected to the backend.');
      if (navigator.onLine === false) throw new Error('Branding cannot be published while offline.');
      const result = await syncWithBackend('branding', form);
      if (result === false) throw new Error('The backend rejected the branding update.');
      setBranding({ ...form, isLoaded: true });
      // Apply immediately
      const root = document.documentElement;
      if (form.primaryColor) root.style.setProperty('--primary', form.primaryColor);
      if (form.accentColor)  root.style.setProperty('--accent', form.accentColor);
      if (form.metaTitle)    document.title = form.metaTitle;
      if (result === 'queued') alert('Branding saved locally and queued for synchronization.');
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (error) {
      alert(error.message || 'Failed to save branding.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    const defaults = {
      primaryColor: '#8b5cf6', accentColor: '#10b981',
      customDomain: '', metaTitle: branding.schoolName || 'True Star ERP',
      metaDescription: '', faviconUrl: '', logoUrl: '', slogan: ''
    };
    setForm(defaults);
  };

  return (
    <div className="view active">
      {/* Header */}
      <div className="view-header" style={{ marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 900, letterSpacing: '-0.5px', display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ width: 40, height: 40, borderRadius: 14, background: 'var(--accent-glow)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
              <Palette size={20} style={{ color: 'var(--accent)' }} />
            </span>
            White-Label Branding
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 4 }}>Customize the portal identity for your institution</p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {saved && (
            <span style={{ fontSize: 12, fontWeight: 800, color: '#10b981', background: 'rgba(16,185,129,0.1)', padding: '6px 14px', borderRadius: 20, border: '1.5px solid rgba(16,185,129,0.2)' }}>
              <CheckCircle size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} /> Published!
            </span>
          )}
          <button className="btn btn-secondary" onClick={() => setPreviewOpen(true)} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Eye size={15} /> Preview
          </button>
          <button className="btn btn-secondary" onClick={handleReset} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <RotateCcw size={15} /> Reset Defaults
          </button>
          <button className="btn btn-primary" onClick={handleSave} disabled={isSaving || !contrastValid} title={!contrastValid ? 'Resolve color contrast before publishing' : ''} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Save size={15} /> {isSaving ? 'Publishing…' : 'Publish Changes'}
          </button>
        </div>
      </div>

      <div className="responsive-two-column">
        {/* ─── LEFT: Identity ─── */}
        <div className="card" style={{ padding: 28 }}>
          <SectionHeader icon={ImageIcon} title="School Identity" sub="Basic info displayed throughout the portal" />
          <div className="form-group">
            <label htmlFor="branding-school-name">Institution Name</label>
            <input id="branding-school-name" type="text" value={form.schoolName || ''} onChange={e => set('schoolName', e.target.value)} placeholder="e.g. Sunrise Academy" />
          </div>
          <div className="form-group">
            <label htmlFor="branding-slogan">Slogan / Motto</label>
            <input id="branding-slogan" type="text" value={form.slogan || ''} onChange={e => set('slogan', e.target.value)} placeholder="e.g. Excellence in Every Child" />
          </div>
          <div className="form-group">
            <label htmlFor="branding-logo-url">Logo URL</label>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <input id="branding-logo-url" type="text" value={form.logoUrl} onChange={e => set('logoUrl', e.target.value)} placeholder="https://..." style={{ flex: 1 }} />
              <div style={{
                width: 56, height: 56, borderRadius: 14, border: '2px solid var(--border-color)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                overflow: 'hidden', background: 'var(--bg-page)', flexShrink: 0
              }}>
                {form.logoUrl
                  ? <img src={form.logoUrl} alt="School logo preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { e.target.style.display = 'none'; }} />
                  : <ImageIcon size={22} style={{ color: 'var(--text-muted)', opacity: 0.4 }} />}
              </div>
            </div>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>Paste a public image URL. Use a square image for best results.</p>
            <label className="btn btn-secondary" style={{ display: 'inline-flex', marginTop: 8, cursor: 'pointer' }}><Upload size={14} /> Upload logo<input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => handleImageUpload('logoUrl', e.target.files?.[0])} /></label>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label htmlFor="branding-favicon-url">Favicon URL</label>
            <input id="branding-favicon-url" type="text" value={form.faviconUrl || ''} onChange={e => set('faviconUrl', e.target.value)} placeholder="https://..." />
            <label className="btn btn-secondary" style={{ display: 'inline-flex', marginTop: 8, cursor: 'pointer' }}><Upload size={14} /> Upload favicon<input type="file" accept="image/png,image/x-icon,image/svg+xml" style={{ display: 'none' }} onChange={e => handleImageUpload('faviconUrl', e.target.files?.[0])} /></label>
          </div>
        </div>

        {/* ─── RIGHT: Theme ─── */}
        <div className="card" style={{ padding: 28 }}>
          <SectionHeader icon={Palette} title="Visual Theme" sub="Brand colors applied across all pages" />

          <p style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>Quick Presets</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 24 }}>
            {PRESETS.map(p => (
              <button key={p.name} onClick={() => applyPreset(p)} style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '6px 12px', borderRadius: 20, border: '1.5px solid var(--border-color)',
                background: 'var(--bg-page)', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 700
              }}>
                <span style={{ display: 'flex' }}>
                  <span style={{ width: 12, height: 12, borderRadius: '50%', background: p.primary, display: 'inline-block' }} />
                  <span style={{ width: 12, height: 12, borderRadius: '50%', background: p.accent, display: 'inline-block', marginLeft: -3 }} />
                </span>
                {p.name}
              </button>
            ))}
          </div>

          {[
            { label: 'Primary Brand Color', key: 'primaryColor' },
            { label: 'Accent Color',        key: 'accentColor'  },
          ].map(f => (
            <div key={f.key} className="form-group">
              <label htmlFor={`branding-${f.key}-picker`}>{f.label}</label>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <input id={`branding-${f.key}-picker`} type="color" aria-label={`${f.label} color picker`} value={form[f.key] || '#7e22ce'}
                  onChange={e => set(f.key, e.target.value)}
                  style={{ width: 52, height: 48, padding: '4px 6px', border: '2px solid var(--border-color)', borderRadius: 12, cursor: 'pointer', background: 'var(--bg-page)' }}
                />
                <input type="text" aria-label={`${f.label} hex value`} value={form[f.key] || ''} onChange={e => set(f.key, e.target.value)}
                  style={{ flex: 1, fontFamily: 'monospace', fontWeight: 700, textTransform: 'uppercase' }} />
              </div>
            </div>
          ))}

          <div role="status" style={{ padding: 12, borderRadius: 12, marginBottom: 16, background: contrastValid ? '#10b98111' : '#ef444411', border: `1px solid ${contrastValid ? '#10b98144' : '#ef444444'}` }}>
            <strong style={{ color: contrastValid ? '#047857' : '#b91c1c' }}>{contrastValid ? 'WCAG AA contrast passed' : 'Contrast needs attention'}</strong>
            <p style={{ margin: '4px 0 0', fontSize: 12 }}>Primary on white: {primaryContrast.toFixed(2)}:1 · Accent on white: {accentContrast.toFixed(2)}:1. Required: 4.5:1.</p>
          </div>

          {/* Live Preview Buttons */}
          <div style={{ padding: 16, background: 'var(--bg-page)', borderRadius: 14, border: '1.5px dashed var(--border-color)', marginTop: 8 }}>
            <p style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12 }}>
              <Eye size={11} style={{ display: 'inline', marginRight: 4 }} /> LIVE PREVIEW
            </p>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button style={{ padding: '10px 20px', borderRadius: 10, border: 'none', background: form.primaryColor || '#7e22ce', color: 'white', fontFamily: 'inherit', fontWeight: 800, fontSize: 13, cursor: 'default' }}>
                Primary Button
              </button>
              <button style={{ padding: '10px 20px', borderRadius: 10, border: `2px solid ${form.accentColor || '#10b981'}`, background: 'transparent', color: form.accentColor || '#10b981', fontFamily: 'inherit', fontWeight: 800, fontSize: 13, cursor: 'default' }}>
                Accent Action
              </button>
              <span style={{ padding: '6px 14px', borderRadius: 20, background: `${form.primaryColor}20`, color: form.primaryColor, fontWeight: 800, fontSize: 11, alignSelf: 'center' }}>
                Active Badge
              </span>
            </div>
          </div>
        </div>

        {/* ─── Domain & SEO (full width) ─── */}
        <div className="card" style={{ padding: 28, gridColumn: '1 / -1' }}>
          <SectionHeader icon={Globe} title="Domain & SEO" sub="Custom domain mapping and search engine metadata" />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 24 }}>
            <div>
              <div className="form-group" style={{ marginBottom: 20 }}>
                <label htmlFor="branding-custom-domain">Custom Vanity Domain</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Globe size={16} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                  <input id="branding-custom-domain" type="text" value={form.customDomain || ''} onChange={e => set('customDomain', e.target.value)} placeholder="erp.yourschool.com" />
                </div>
                <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6, lineHeight: 1.5 }}>
                  Add a CNAME record: <strong>erp.yourschool.com → app.wavserp.com</strong><br />DNS changes may take up to 24h.
                </p>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label htmlFor="branding-meta-title">SEO Page Title</label>
                <input id="branding-meta-title" type="text" value={form.metaTitle || ''} onChange={e => set('metaTitle', e.target.value)} placeholder="e.g. Sunrise Academy Management Portal" />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label htmlFor="branding-meta-description">Meta Description</label>
                <textarea id="branding-meta-description" rows={2} value={form.metaDescription || ''} onChange={e => set('metaDescription', e.target.value)}
                  placeholder="Describe this portal for search engines…"
                  style={{ width: '100%', padding: '12px 16px', borderRadius: 12, border: '1.5px solid var(--border-color)', fontFamily: 'inherit', resize: 'vertical', background: 'var(--bg-page)', color: 'var(--text-main)' }} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Preview Modal */}
      {previewOpen && (
        <div className="modal">
          <div className="modal-content card" role="dialog" aria-modal="true" aria-labelledby="branding-preview-title" style={{ maxWidth: 480, textAlign: 'center' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 id="branding-preview-title" style={{ fontWeight: 900 }}>Brand Preview</h3>
              <button className="btn btn-icon btn-secondary" aria-label="Close preview" onClick={() => setPreviewOpen(false)}><X size={16} /></button>
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginBottom: 16 }}>{[{ id: 'desktop', label: 'Desktop', icon: Monitor }, { id: 'mobile', label: 'Mobile', icon: Smartphone }, { id: 'login', label: 'Login', icon: LogIn }].map(mode => <button key={mode.id} className={previewMode === mode.id ? 'btn btn-primary' : 'btn btn-secondary'} onClick={() => setPreviewMode(mode.id)}><mode.icon size={14} /> {mode.label}</button>)}</div>
            <div style={{
              background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
              borderRadius: 16, padding: previewMode === 'mobile' ? 18 : 30, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, maxWidth: previewMode === 'mobile' ? 260 : '100%', margin: 'auto', minHeight: 300
            }}>
              <div style={{ width: 70, height: 70, borderRadius: 18, background: form.primaryColor, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: `0 8px 24px ${form.primaryColor}60`, overflow: 'hidden' }}>
                {form.logoUrl
                  ? <img src={form.logoUrl} alt="School logo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : <Palette size={32} style={{ color: 'white', opacity: 0.8 }} />}
              </div>
              <h2 style={{ fontWeight: 900, fontSize: 20, color: 'white', letterSpacing: '-0.5px' }}>{form.schoolName || 'Your School Name'}</h2>
              {form.slogan && <p style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.5)', letterSpacing: '1px', textTransform: 'uppercase' }}>{form.slogan}</p>}
              {previewMode === 'login' ? <div style={{ width: '100%', background: 'rgba(255,255,255,0.06)', borderRadius: 12, padding: 20, marginTop: 8 }}>
                <div style={{ background: 'rgba(255,255,255,0.1)', height: 40, borderRadius: 8, marginBottom: 10 }} />
                <div style={{ background: 'rgba(255,255,255,0.1)', height: 40, borderRadius: 8, marginBottom: 14 }} />
                <div style={{ background: form.primaryColor, height: 42, borderRadius: 10 }} />
              </div> : <div style={{ width: '100%', display: 'grid', gridTemplateColumns: previewMode === 'mobile' ? '1fr' : '100px 1fr', gap: 10 }}><div style={{ minHeight: 150, borderRadius: 10, background: form.primaryColor }} /><div><div style={{ height: 45, borderRadius: 10, background: 'rgba(255,255,255,.1)', marginBottom: 10 }} /><div style={{ display: 'grid', gridTemplateColumns: previewMode === 'mobile' ? '1fr' : '1fr 1fr', gap: 8 }}><div style={{ height: 80, borderRadius: 10, background: 'rgba(255,255,255,.08)' }} /><div style={{ height: 80, borderRadius: 10, background: `${form.accentColor}55` }} /></div></div></div>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

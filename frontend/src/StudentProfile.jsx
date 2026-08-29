import React, { useState, useRef } from 'react';
import { X, User, DollarSign, Calendar, MapPin, Phone, ShieldAlert, Camera, Contact } from 'lucide-react';

export default function StudentProfile({ 
  student, onClose, onEdit, currency, getTermFee, payments, onQuickPay, 
  onUpdatePhoto, userRole = 'ADMIN'
}) {
  const [quickPayAmount, setQuickPayAmount] = useState('');
  const [paymentStatus, setPaymentStatus] = useState({ type: '', message: '' });
  const [isPaying, setIsPaying] = useState(false);
  const [photoStatus, setPhotoStatus] = useState({ type: '', message: '' });
  const [photoProgress, setPhotoProgress] = useState(0);
  const fileInputRef = useRef(null);

  if (!student) return null;

  const originalFee = getTermFee(student.class);
  let termFee = originalFee;
  let discountDisplay = "";

  if (student.discountType === 'full') {
    termFee = 0;
    discountDisplay = "Full Discount (100%)";
  } else if (student.discountType === 'partial') {
    const val = parseFloat(student.discountValue) || 0;
    termFee = Math.max(0, originalFee - val);
    discountDisplay = `Partial Discount (${currency}${val})`;
  }

  const prevArrears = parseFloat(student.prevArrears) || 0;
  const totalCommitment = termFee + prevArrears;
  
  const studentPayments = (payments || []).filter(p => p.studentSid === student.sid);
  const totalPaid = studentPayments.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
  const currentBalance = totalCommitment - totalPaid;

  const handlePhotoChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setPhotoStatus({ type: '', message: '' });
    setPhotoProgress(0);
    if (!file.type.startsWith('image/')) { setPhotoStatus({ type: 'error', message: 'Select an image file.' }); return; }
    if (file.size > 2 * 1024 * 1024) { setPhotoStatus({ type: 'error', message: 'Image is too large. Select a photo under 2MB.' }); return; }
    const reader = new FileReader();
    reader.onprogress = event => {
      if (event.lengthComputable) setPhotoProgress(Math.round((event.loaded / event.total) * 100));
    };
    reader.onerror = () => setPhotoStatus({ type: 'error', message: 'The photo could not be read. Try another image.' });
    reader.onload = async () => {
      setPhotoProgress(100);
      setPhotoStatus({ type: 'info', message: 'Saving photo...' });
      try {
        if (!onUpdatePhoto) throw new Error('Photo updates are unavailable.');
        const result = await onUpdatePhoto(student.id, reader.result);
        if (result === false) throw new Error('The photo could not be saved.');
        setPhotoStatus({ type: 'success', message: 'Photo updated.' });
      } catch (error) {
        setPhotoStatus({ type: 'error', message: error.message || 'The photo could not be saved.' });
      }
    };
    reader.readAsDataURL(file);
  };

  const handleQuickPay = async () => {
    const amount = Number(quickPayAmount);
    const outstanding = Math.max(0, currentBalance);
    if (!Number.isFinite(amount) || amount <= 0) {
      setPaymentStatus({ type: 'error', message: 'Enter a valid payment amount greater than zero.' });
      return;
    }
    if (outstanding <= 0) {
      setPaymentStatus({ type: 'error', message: 'No outstanding balance is available for payment.' });
      return;
    }
    if (amount > outstanding) {
      setPaymentStatus({ type: 'error', message: `Payment cannot exceed the outstanding balance of ${currency}${outstanding.toFixed(2)}.` });
      return;
    }
    setIsPaying(true);
    setPaymentStatus({ type: 'info', message: 'Saving payment...' });
    try {
      const result = await onQuickPay(amount);
      if (result === false) throw new Error('Payment was not saved.');
      setQuickPayAmount('');
      setPaymentStatus({ type: 'success', message: 'Payment saved.' });
    } catch (error) {
      setPaymentStatus({ type: 'error', message: error.message || 'Payment was not saved.' });
    } finally {
      setIsPaying(false);
    }
  };

  return (
    <div className="modal">
      <div className="modal-content card" id="mod-student-view" role="dialog" aria-modal="true" aria-labelledby="student-profile-title" style={{ maxWidth: '700px' }}>
        <div className="flex-between mb-2" style={{ position: 'sticky', top: '-24px', background: 'var(--bg-card)', zIndex: 10, padding: '10px 0', borderBottom: '1px solid var(--border-color)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <User size={24} color="var(--accent)" />
            <h2 id="student-profile-title" style={{ margin: 0 }}>Student Profile: {student.name}</h2>
          </div>
          <button className="btn btn-icon btn-secondary" onClick={onClose} aria-label={`Close ${student.name}'s profile`} title="Close student profile"><X size={20} /></button>
        </div>
        
        <div className="profile-header mb-2" style={{ textAlign: 'center', padding: '20px' }}>
          <div
            className="profile-avatar-container"
            style={{ 
              width: '120px', height: '120px', borderRadius: '50%', background: 'var(--accent-glow)', 
              display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', 
              border: '4px solid var(--accent)', overflow: 'hidden', boxShadow: 'var(--shadow-md)',
               position: 'relative', transition: 'all 0.3s ease'
            }}
          >
            {student.photoUrl 
              ? <img src={student.photoUrl} alt={`${student.name}'s profile`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : <User size={60} color="var(--accent)" />}
            <div className="avatar-overlay" style={{
              position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.4)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0, transition: 'opacity 0.3s ease'
            }}>
              <Camera color="white" size={30} />
            </div>
          </div>
          <input id="student-photo-input" type="file" ref={fileInputRef} onChange={handlePhotoChange} accept="image/*" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' }} />
          <button type="button" className="btn btn-secondary" onClick={() => fileInputRef.current?.click()} aria-describedby="photo-upload-status">
            <Camera size={16} /> {student.photoUrl ? 'Change profile photo' : 'Upload profile photo'}
          </button>
          {(photoProgress > 0 && photoProgress < 100) && <progress value={photoProgress} max="100" aria-label="Photo upload progress" style={{ display: 'block', width: 220, margin: '10px auto 0' }} />}
          {photoStatus.message && <p id="photo-upload-status" role={photoStatus.type === 'error' ? 'alert' : 'status'} style={{ margin: '8px 0 0', fontSize: 12, color: photoStatus.type === 'error' ? 'var(--danger)' : photoStatus.type === 'success' ? 'var(--success)' : 'var(--text-main)' }}>{photoStatus.message}</p>}

          <style>{`
            .profile-avatar-container:hover .avatar-overlay { opacity: 1; }
            .profile-avatar-container:hover { transform: scale(1.05); border-color: var(--primary); }
            .report-item {
              display: flex; align-items: center; justify-content: space-between; padding: 10px 14px;
              background: var(--bg-page); border-radius: 12px; border: 1px solid var(--glass-border);
              margin-bottom: 8px; transition: all 0.2s ease;
            }
            .report-item:hover { border-color: var(--accent); background: var(--accent-glow); }
          `}</style>

          <h2 style={{ margin: '0 0 4px 0', fontSize: '24px' }}>{student.name}</h2>
          <div className="flex-gap" style={{ justifyContent: 'center' }}>
            <span className="filter-pill">{student.class}</span>
            <span className="filter-pill" style={{ background: 'var(--primary-light)', color: 'white', borderColor: 'var(--primary-light)' }}>{student.sid}</span>
          </div>
        </div>

        <div className="grid-2" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px' }}>
          {/* Information Section */}
          <div className="card" style={{ padding: '20px', background: 'var(--bg-page)' }}>
            <h3 style={{ fontSize: '13px', textTransform: 'uppercase', color: 'var(--text-main)', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <User size={14} /> Personal Details
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div className="flex-gap" style={{ fontSize: '14px' }}><Phone size={16} color="var(--text-main)" /> <strong>Parent:</strong> {student.contact || 'N/A'}</div>
              <div className="flex-gap" style={{ fontSize: '14px' }}><Calendar size={16} color="var(--text-main)" /> <strong>DOB:</strong> {student.dob || 'N/A'}</div>
              <div className="flex-gap" style={{ fontSize: '14px' }}><MapPin size={16} color="var(--text-main)" /> <strong>Residence:</strong> {student.residence || 'N/A'}</div>
              <div className="flex-gap" style={{ fontSize: '14px', color: student.medical ? 'var(--danger)' : 'var(--text-main)' }}>
                <ShieldAlert size={16} color="var(--text-main)" /> <strong>Medical:</strong> {student.medical || 'None listed'}
              </div>
            </div>
          </div>

          {/* Financial Section */}
          <div className="card" style={{ padding: '20px', background: 'var(--primary)', color: 'white' }}>
            <div className="flex-between mb-1">
              <h3 style={{ fontSize: '13px', textTransform: 'uppercase', opacity: 0.8, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <DollarSign size={14} /> Financial Status
              </h3>
            </div>
            <div style={{ marginBottom: '16px' }}>
              <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.9)', textTransform: 'uppercase' }}>Current Balance</div>
               <div style={{ fontSize: '28px', fontWeight: 900 }}>{currency}{Math.max(0, currentBalance).toLocaleString(undefined, {minimumFractionDigits: 2})}</div>
               {currentBalance < 0 && <div style={{ fontSize: 12, marginTop: 4 }}>Account credit: {currency}{Math.abs(currentBalance).toFixed(2)}</div>}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px' }}>
              <div className="flex-between" style={{ color: 'rgba(255,255,255,0.9)' }}><span>Term Fees:</span> <span>{currency}{termFee.toLocaleString()}</span></div>
              <div className="flex-between" style={{ color: 'rgba(255,255,255,0.9)' }}><span>Arrears:</span> <span>{currency}{prevArrears.toLocaleString()}</span></div>
              <div className="flex-between" style={{ paddingTop: '8px', borderTop: '1px solid rgba(255,255,255,0.2)', fontWeight: 700 }}>
                <span>Total Paid:</span> <span>{currency}{totalPaid.toLocaleString()}</span>
              </div>
            </div>
          </div>
        </div>

        {userRole !== 'TEACHER' && (
          <div className="card mt-2" style={{ padding: '24px' }}>
            <h3 style={{ fontSize: '14px', fontWeight: 800, marginBottom: '16px' }}>Quick Payment Entry</h3>
            <div className="toolbar-group">
              <input 
                type="number" placeholder={`Enter amount in ${currency}`} 
                value={quickPayAmount} onChange={(e) => setQuickPayAmount(e.target.value)}
                min="0.01" max={Math.max(0, currentBalance)} step="0.01"
                aria-label={`Payment amount for ${student.name}`}
                className="form-group" style={{ flex: 1, margin: 0 }}
              />
              <button 
                className="btn btn-primary" 
                onClick={handleQuickPay}
                disabled={isPaying || Math.max(0, currentBalance) === 0}
              >
                {isPaying ? 'Saving Payment...' : `Record Payment for ${student.name}`}
              </button>
            </div>
            {paymentStatus.message && <p role={paymentStatus.type === 'error' ? 'alert' : 'status'} style={{ margin: '10px 0 0', color: paymentStatus.type === 'error' ? 'var(--danger)' : paymentStatus.type === 'success' ? 'var(--success)' : 'var(--text-main)', fontSize: 13 }}>{paymentStatus.message}</p>}
          </div>
        )}

        <div className="modal-actions" style={{ position: 'sticky', bottom: '-24px', background: 'var(--bg-card)', zIndex: 10, padding: '20px 0', borderTop: '1px solid var(--border-color)', marginTop: '20px' }}>
          <button className="btn btn-secondary" onClick={onClose}>Close {student.name}'s Profile</button>
          {userRole !== 'TEACHER' && <button className="btn btn-outline" onClick={() => { onEdit(student); onClose(); }}>Edit {student.name}'s Details</button>}
          <button className="btn btn-primary" onClick={() => { window.dispatchEvent(new CustomEvent('generate-id-card', { detail: student })); }}>
            <Contact size={16} aria-hidden="true" /> Generate ID Card
          </button>
        </div>
      </div>
    </div>
  );
}

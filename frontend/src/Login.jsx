import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useBranding } from './context/BrandingContext';
import { ArrowLeft } from 'lucide-react';

const DEFAULT_CLASSES = [
  'CRECHE', 'NURSERY 1A', 'NURSERY 1B', 'NURSERY 2A', 'NURSERY 2B',
  'KG1A', 'KG1B', 'KG2A', 'KG2B',
  'BASIC 1', 'BASIC 2', 'BASIC 3',
  'BASIC 4', 'BASIC 5', 'BASIC 6', 'BASIC 6 A', 'BASIC 6 B',
  'BASIC 7', 'BASIC 8', 'BASIC 9'
];

// Auth modes: 'login' | 'staff' (join existing school) | 'register' (new institution)
export default function Login({ onLogin, onSignup, onRegisterInstitution, settings, schoolInfo = {}, allClasses = [], backendUrl }) {
  const { branding } = useBranding();
  const [registrationSuccess, setRegistrationSuccess] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem('erp_registration_success') || 'null'); } catch { return null; }
  });
  const [mode, setMode] = useState(() => sessionStorage.getItem('erp_registration_success') ? 'registration-success' : 'login');
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [email, setEmail] = useState(localStorage.getItem('erp_last_email') || '');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [name, setName] = useState('');
  const [institutionName, setInstitutionName] = useState('');
  const [schoolCode, setSchoolCode] = useState('');
  const [error, setError] = useState('');
  const [feedbackType, setFeedbackType] = useState('error');
  const [copyStatus, setCopyStatus] = useState('');

  const [role, setRole] = useState('TEACHER');
  const [assignedClass, setAssignedClass] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [searchParams] = useSearchParams();
  const resetToken = searchParams.get('token');
  const inviteToken = searchParams.get('invite');
  const invitedEmail = searchParams.get('email');
  const setFeedback = (type, message) => { setFeedbackType(type); setError(message); };

  useEffect(() => {
    if (resetToken) {
      setMode('reset-password');
      setFeedback('info', 'Set a new password below. Reset links expire 30 minutes after they are issued.');
    }
    if (inviteToken) {
      setMode('invitation');
      if (invitedEmail) setEmail(invitedEmail);
      setFeedback('info', 'Complete your invited staff account below. The invitation can only be used once.');
    }
  }, [resetToken, inviteToken, invitedEmail]);

  const getBackendBase = () => {
    let base = (backendUrl || 'https://JarzyWav.pythonanywhere.com/api');
    if (base.endsWith('/api/data')) return base.substring(0, base.length - 9);
    if (base.endsWith('/api'))      return base.substring(0, base.length - 4);
    return base;
  };

  const handleForgotPassword = async (e) => {
    e.preventDefault();
    setError('');
    const emailNormalized = (email || '').toLowerCase().trim();
    if (!emailNormalized) { setFeedback('error', 'Please enter your email address above.'); return; }
    setIsLoading(true);
    try {
      const res = await fetch(`${getBackendBase()}/api/auth/request-password-reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailNormalized })
      });
      const data = await res.json();
      if (res.ok) {
        setFeedback('success', 'Recovery request submitted. If that email exists, a reset link will be sent and will expire in 30 minutes.');
        setIsForgotPassword(false);
      } else {
        setFeedback('error', data.error || 'Failed to submit recovery request.');
      }
    } catch {
      setFeedback('error', 'Connection error. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleExecuteReset = async (e) => {
    e.preventDefault();
    if (password.length < 8) { setFeedback('error', 'New password must be at least 8 characters.'); return; }
    if (password !== confirmPassword) { setFeedback('error', 'New password and confirmation do not match.'); return; }
    setIsLoading(true);
    try {
      const res = await fetch(`${getBackendBase()}/api/auth/execute-password-reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: resetToken, password: password })
      });
      const data = await res.json();
      if (res.ok) {
        setFeedback('success', 'Password updated successfully. You can now log in with the new password.');
        setMode('login');
        setPassword('');
        setConfirmPassword('');
      } else {
        setFeedback('error', data.error || 'Password reset failed. The link may be invalid or expired.');
      }
    } catch {
      setFeedback('error', 'Connection error. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (isForgotPassword) { await handleForgotPassword(e); return; }
    if (mode === 'reset-password') { await handleExecuteReset(e); return; }

    const emailNormalized = (email || '').toLowerCase().trim();
    const passwordRaw = (password || '');

    if ((mode === 'register' || mode === 'staff' || mode === 'invitation') && passwordRaw.length < 8) {
      setFeedback('error', 'Password must be at least 8 characters.');
      return;
    }
    if ((mode === 'register' || mode === 'staff' || mode === 'invitation') && passwordRaw !== confirmPassword) {
      setFeedback('error', 'Password and confirmation do not match.');
      return;
    }

    if (mode === 'register') {
      if (!institutionName.trim()) { setFeedback('error', 'Please enter your institution name.'); return; }
      setIsLoading(true);
      try {
        const res = await onRegisterInstitution({
          institutionName: institutionName.trim(),
          adminName: name,
          adminEmail: emailNormalized,
          password: passwordRaw
        });
        
        const success = { schoolCode: res.schoolCode, institutionName: institutionName.trim() };
        sessionStorage.setItem('erp_registration_success', JSON.stringify(success));
        setRegistrationSuccess(success);
        setMode('registration-success');
        setPassword('');
        setConfirmPassword('');
        setFeedback('success', 'Institution registered successfully. Keep the school code below for staff registration.');
      } catch (err) {
        setFeedback('error', err.message || 'Failed to register institution. Please try again.');
      } finally {
        setIsLoading(false);
      }
      return;
    }

    if (mode === 'staff') {
      if (!schoolCode.trim()) { setFeedback('error', 'Please enter your institution\'s school code.'); return; }
      if (role === 'TEACHER' && !assignedClass) { setFeedback('error', 'Please select your assigned class.'); return; }
      setIsLoading(true);
      try {
        await onSignup({
          name, email: emailNormalized, password: passwordRaw,
          role, assignedClass, schoolCode: schoolCode.trim().toUpperCase()
        });
        // Staff are created pending activation — do NOT auto-login.
        setMode('login');
        setPassword(''); setConfirmPassword(''); setName(''); setAssignedClass(''); setSchoolCode(''); setRole('TEACHER');
        setFeedback('success', 'Account created. It is pending activation by your school administrator; sign in after activation.');
      } catch (err) {
        setFeedback('error', err.message || 'Failed to create account. Please try again.');
      } finally {
        setIsLoading(false);
      }
      return;
    }

    if (mode === 'invitation') {
      setIsLoading(true);
      try {
        const response = await fetch(`${getBackendBase()}/api/invitations/accept`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${inviteToken}` },
          body: JSON.stringify({ name: name.trim(), password: passwordRaw })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Invitation could not be accepted.');
        window.history.replaceState({}, '', window.location.pathname);
        setMode('login'); setPassword(''); setConfirmPassword('');
        setFeedback('success', 'Invitation accepted. Sign in with your email and new password.');
      } catch (err) {
        setFeedback('error', err.message || 'Invitation could not be accepted.');
      } finally { setIsLoading(false); }
      return;
    }

    // mode === 'login'
    setIsLoading(true);
    try {
      await onLogin({ email: emailNormalized, password: passwordRaw });
    } catch (err) {
      setFeedback('error', err.message || 'Unable to log in. Please check your details and try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const resetToLogin = (e) => {
    if (e) e.preventDefault();
    setMode('login');
    setIsForgotPassword(false);
    setError('');
    setConfirmPassword('');
  };

  const getTitle = () => {
    if (isForgotPassword) return 'Forgot Password';
    if (mode === 'reset-password') return 'Set New Password';
    if (mode === 'register') return 'Register Your Institution';
    if (mode === 'registration-success') return 'Registration Complete';
    if (mode === 'invitation') return 'Accept Staff Invitation';
    if (mode === 'staff') return 'Staff Sign Up';
    return branding.schoolName ? `${branding.schoolName} Login` : 'Institution Login';
  };

  const getButtonLabel = () => {
    if (isLoading) return 'Please wait...';
    if (isForgotPassword) return 'Send Reset Link';
    if (mode === 'reset-password') return 'Update Password';
    if (mode === 'register') return 'Create Institution';
    if (mode === 'invitation') return 'Activate Account';
    if (mode === 'staff') return 'Create Account';
    return 'Login';
  };

  const getClassOptions = () => {
    let raw = (allClasses && allClasses.length > 0) ? allClasses : DEFAULT_CLASSES;
    if (raw.length === 1 && typeof raw[0] === 'string' && raw[0].length > 30) {
      const byNewline = raw[0].split('\n').map(s => s.trim()).filter(Boolean);
      const byComma   = raw[0].split(',').map(s => s.trim()).filter(Boolean);
      raw = byNewline.length > 1 ? byNewline : byComma.length > 1 ? byComma : DEFAULT_CLASSES;
    }
    return raw;
  };

  const isSignupLike = mode === 'staff' || mode === 'register' || mode === 'invitation';

  const copySchoolCode = async () => {
    try {
      await navigator.clipboard.writeText(registrationSuccess.schoolCode);
      setCopyStatus('School code copied.');
    } catch {
      setCopyStatus('Could not copy automatically. Select the code and copy it manually.');
    }
  };

  return (
    <div id="login-screen" className="screen full-screen center-content" style={{
      backgroundImage: settings?.backgroundUrl
        ? `linear-gradient(rgba(15, 23, 42, 0.5), rgba(15, 23, 42, 0.5)), url(${settings.backgroundUrl})`
        : undefined
    }}>
      <div className="card login-card animate-fade-in" style={{
        background: 'rgba(15, 23, 42, 0.4)',
        backdropFilter: 'blur(16px)',
        border: '1px solid var(--glass-border)',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
        padding: '20px',
        borderRadius: 'var(--radius-xl)',
        maxWidth: '450px',
        width: '100%'
      }}>
        <div style={{ textAlign: 'center', marginBottom: '30px' }}>
          <div style={{
            width: '80px', height: '80px', margin: '0 auto 15px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(255, 255, 255, 0.03)',
            borderRadius: '24px',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            overflow: 'hidden'
          }}>
            <img 
              src={branding.logoUrl || settings?.logoUrl || "/logo.png"} 
              alt="Logo" 
              style={{ width: '100%', height: '100%', objectFit: 'contain', padding: '10px' }} 
              onError={(e) => e.target.style.display = 'none'} 
            />
          </div>
          { (branding.schoolName || schoolInfo.schoolName) && (
            <h1 style={{ fontSize: '24px', fontWeight: 900, color: 'white', letterSpacing: '-0.5px' }}>
               {branding.schoolName?.toUpperCase() || schoolInfo.schoolName?.toUpperCase()}
            </h1>
          )}
          {branding.slogan && (
            <p style={{ fontSize: '11px', opacity: 0.6, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', marginTop: '4px', color: 'white' }}>
              {branding.slogan}
            </p>
          )}
        </div>


        <h2 style={{ textAlign: 'center', marginBottom: '24px', fontSize: '18px', fontWeight: 800 }}>
          {getTitle()}
        </h2>

        {isForgotPassword && (
          <p style={{ fontSize: '13px', opacity: 0.75, marginBottom: '12px', lineHeight: 1.5 }}>
            Enter your registered email address. If it matches an account, we will email a password reset link that expires in 30 minutes.
          </p>
        )}

        {mode === 'register' && !isForgotPassword && (
          <p style={{ fontSize: '13px', opacity: 0.75, marginBottom: '12px', lineHeight: 1.5 }}>
            Create a new institution. You'll become its administrator and get a <strong>School Code</strong>
            to share with your staff so they can sign up.
          </p>
        )}

        {mode === 'registration-success' && registrationSuccess ? (
          <div aria-live="polite">
            <div style={{ padding: 16, borderRadius: 12, background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.35)', marginBottom: 16 }}>
              <p style={{ margin: '0 0 8px', color: 'var(--success)', fontWeight: 800 }}>Institution registered successfully</p>
              <p style={{ margin: 0, fontSize: 13 }}>Save this school code. Staff will need it to create accounts for {registrationSuccess.institutionName}.</p>
            </div>
            <label htmlFor="registered-school-code" style={{ display: 'block', fontWeight: 700, marginBottom: 6 }}>School Code</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input id="registered-school-code" value={registrationSuccess.schoolCode} readOnly onFocus={e => e.target.select()} style={{ flex: 1, letterSpacing: 3, fontWeight: 900, textAlign: 'center' }} />
              <button type="button" className="btn btn-secondary" onClick={copySchoolCode}>Copy Code</button>
            </div>
            {copyStatus && <p role="status" style={{ fontSize: 12, marginTop: 8 }}>{copyStatus}</p>}
            <div style={{ marginTop: 18, fontSize: 13, lineHeight: 1.6 }}>
              <strong>Activation required:</strong> pay the activation fee by Mobile Money to 0536248044 (WAV ERP). Your account will be activated after payment is received.
            </div>
            <button type="button" className="btn btn-primary btn-block" onClick={() => { sessionStorage.removeItem('erp_registration_success'); setRegistrationSuccess(null); setMode('login'); setError(''); }} style={{ marginTop: 18 }}>Continue to Login</button>
          </div>
        ) : <form onSubmit={handleSubmit}>
          {/* Institution name — register only */}
          {mode === 'register' && (
            <div className="form-group">
              <label htmlFor="institution-name">Institution Name</label>
              <input id="institution-name" type="text" value={institutionName} onChange={e => setInstitutionName(e.target.value)} required placeholder="Greenfield Academy" autoComplete="organization" />
            </div>
          )}

          {/* Full Name — signup-like only */}
          {isSignupLike && (
            <div className="form-group">
              <label htmlFor="full-name">{mode === 'register' ? 'Administrator Full Name' : 'Full Name'}</label>
              <input id="full-name" type="text" value={name} onChange={e => setName(e.target.value)} required placeholder="John Doe" autoComplete="name" />
            </div>
          )}

          {/* Email */}
          {mode !== 'reset-password' && <div className="form-group">
            <label htmlFor="login-email">Email</label>
            <input id="login-email" type="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="admin@school.com" autoComplete="email" inputMode="email" />
          </div>}

          {/* Password — not on forgot-password */}
          {!isForgotPassword && (
            <div className="form-group" style={{ position: 'relative' }}>
              <label htmlFor="login-password">{mode === 'reset-password' ? 'New Password' : 'Password'}</label>
              <input id="login-password" type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} required minLength={mode === 'reset-password' || isSignupLike ? 8 : undefined} placeholder="••••••••" autoComplete={mode === 'reset-password' || isSignupLike ? 'new-password' : 'current-password'} style={{ paddingRight: 90 }} />
              <button type="button" onClick={() => setShowPassword(v => !v)} aria-label={showPassword ? 'Hide password' : 'Show password'} style={{ position: 'absolute', right: 8, bottom: 8, border: 0, background: 'transparent', color: 'inherit', cursor: 'pointer', fontWeight: 700 }}>{showPassword ? 'Hide' : 'Show'}</button>
            </div>
          )}

          {!isForgotPassword && (mode === 'reset-password' || isSignupLike) && (
            <div className="form-group">
              <label htmlFor="confirm-password">Confirm Password</label>
              <input id="confirm-password" type={showPassword ? 'text' : 'password'} value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required minLength={8} placeholder="At least 8 characters" autoComplete="new-password" />
            </div>
          )}

          {/* Staff signup extra fields */}
          {mode === 'staff' && (
            <>
              <div className="form-group">
                <label htmlFor="school-code">School Code</label>
                <input id="school-code" type="text" value={schoolCode} onChange={e => setSchoolCode(e.target.value.toUpperCase())} required placeholder="e.g. K7Q4ZB" autoCapitalize="characters" style={{ textTransform: 'uppercase', letterSpacing: '2px', fontWeight: 700 }} />
              </div>
              <div className="form-group">
                <label htmlFor="account-role">Account Role</label>
                <select
                  id="account-role"
                  value={role}
                  onChange={e => { setRole(e.target.value); setAssignedClass(''); }}
                  className="btn-block"
                  style={{ height: '42px', padding: '0 12px' }}
                >
                  <option value="ACCOUNTANT">Accountant</option>
                  <option value="TEACHER">Teacher</option>
                </select>
              </div>
              {role === 'TEACHER' && (
                <div className="form-group">
                  <label htmlFor="assigned-class">Assigned Class</label>
                  <select
                    id="assigned-class"
                    value={assignedClass}
                    onChange={e => setAssignedClass(e.target.value)}
                    className="btn-block"
                    style={{ height: '42px', padding: '0 12px' }}
                    required
                  >
                    <option value="">Select your class...</option>
                    {getClassOptions().map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              )}
            </>
          )}

          {/* Forgot password link — login screen only */}
          {mode === 'login' && !isForgotPassword && (
            <div className="form-footer">
              <button type="button" className="link-button" id="forgot-pw-link" onClick={() => { setIsForgotPassword(true); setError(''); }}>
                Forgot Password?
              </button>
            </div>
          )}

          <button
            type="submit"
            className="btn btn-primary btn-block"
            id="login-btn"
            disabled={isLoading}
            style={{
              height: '52px', fontSize: '16px', fontWeight: 700,
              background: 'linear-gradient(135deg, var(--accent), #4f46e5)',
              border: 'none', boxShadow: '0 10px 20px -5px var(--accent-glow)', marginTop: '10px'
            }}
          >
            {getButtonLabel()}
          </button>

          {error && (
            <div id="login-error" className="error-text" role={feedbackType === 'error' ? 'alert' : 'status'} aria-live="polite" style={{
              color: feedbackType === 'success' ? 'var(--success)' : feedbackType === 'info' ? 'var(--text-main)' : 'var(--danger)',
              marginTop: '10px', lineHeight: 1.5
            }}>
              {error}
            </div>
          )}

          {/* Mode switching */}
          <div className="mt-1" style={{ textAlign: 'center', lineHeight: 1.9 }}>
            {isForgotPassword ? (
              <a href="#" id="back-to-login" onClick={resetToLogin} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}><ArrowLeft size={14} aria-hidden="true" /> Back to Login</a>
            ) : mode === 'login' ? (
              <>
                <div>New institution? <a href="#" onClick={e => { e.preventDefault(); setMode('register'); setError(''); }}>Register your school</a></div>
                <div>Staff member? <a href="#" id="show-signup" onClick={e => { e.preventDefault(); setMode('staff'); setError(''); }}>Sign up with a school code</a></div>
              </>
            ) : (
              <>Already have an account? <a href="#" id="show-login" onClick={resetToLogin}>Login</a></>
            )}
          </div>
          </form>}
      </div>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';

const icons = {
  success: CheckCircle2,
  error: AlertCircle,
  warning: AlertCircle,
  info: Info
};

function Toast({ toast, onDismiss }) {
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused || toast.duration === 0) return undefined;
    const timer = window.setTimeout(() => onDismiss(toast.id), toast.duration);
    return () => window.clearTimeout(timer);
  }, [onDismiss, paused, toast.duration, toast.id]);

  const Icon = icons[toast.type] || Info;
  const handleAction = async () => {
    try {
      await toast.action?.onClick?.();
    } finally {
      onDismiss(toast.id);
    }
  };

  return (
    <div
      className={`ui-toast ui-toast--${toast.type}`}
      role={toast.type === 'error' ? 'alert' : 'status'}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setPaused(false);
      }}
    >
      <Icon className="ui-toast__icon" aria-hidden="true" size={20} />
      <div className="ui-toast__content">
        {toast.title && <strong>{toast.title}</strong>}
        {toast.message && <p>{toast.message}</p>}
        {toast.action && (
          <button className="ui-toast__action" type="button" onClick={handleAction}>
            {toast.action.label}
          </button>
        )}
      </div>
      <button
        className="ui-toast__close"
        type="button"
        aria-label="Dismiss notification"
        onClick={() => onDismiss(toast.id)}
      >
        <X size={17} aria-hidden="true" />
      </button>
    </div>
  );
}

export default function ToastViewport({ toasts, onDismiss }) {
  return (
    <div className="ui-toast-viewport" aria-label="Notifications">
      {toasts.map((toast) => (
        <Toast key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

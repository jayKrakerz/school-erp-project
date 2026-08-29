import { useEffect, useId, useRef } from 'react';
import { AlertTriangle } from 'lucide-react';

const focusableSelector = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export default function ConfirmationDialog({ request, onResolve }) {
  const dialogRef = useRef(null);
  const cancelRef = useRef(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    if (!request) return undefined;
    const previouslyFocused = document.activeElement;
    cancelRef.current?.focus();

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onResolve(false);
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = [...dialogRef.current.querySelectorAll(focusableSelector)];
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      previouslyFocused?.focus?.();
    };
  }, [onResolve, request]);

  if (!request) return null;

  return (
    <div className="ui-confirm-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onResolve(false);
    }}>
      <div
        ref={dialogRef}
        className="ui-confirm"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
      >
        <div className={`ui-confirm__icon ui-confirm__icon--${request.tone}`} aria-hidden="true">
          <AlertTriangle size={23} />
        </div>
        <div className="ui-confirm__copy">
          <h2 id={titleId}>{request.title}</h2>
          <p id={descriptionId}>{request.message}</p>
        </div>
        <div className="ui-confirm__actions">
          <button ref={cancelRef} className="btn btn-secondary" type="button" onClick={() => onResolve(false)}>
            {request.cancelLabel}
          </button>
          <button
            className={`btn ${request.tone === 'danger' ? 'ui-btn-danger' : 'btn-primary'}`}
            type="button"
            onClick={() => onResolve(true)}
          >
            {request.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

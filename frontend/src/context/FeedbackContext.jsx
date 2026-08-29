import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import ConfirmationDialog from '../components/ui/ConfirmationDialog';
import ToastViewport from '../components/ui/ToastViewport';

const FeedbackContext = createContext(null);
let nextToastId = 0;

export function FeedbackProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const [confirmation, setConfirmation] = useState(null);
  const confirmationRef = useRef(null);
  const confirmationQueue = useRef([]);

  const dismissToast = useCallback((id) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const addToast = useCallback((input, options = {}) => {
    const config = typeof input === 'string' ? { message: input, ...options } : input;
    const id = config.id || `toast-${Date.now()}-${++nextToastId}`;
    setToasts((current) => [
      ...current.filter((toast) => toast.id !== id),
      { id, type: 'info', duration: 5000, ...config }
    ].slice(-5));
    return id;
  }, []);

  const toast = useMemo(() => {
    const notify = (input, options) => addToast(input, options);
    ['success', 'error', 'warning', 'info'].forEach((type) => {
      notify[type] = (input, options = {}) => addToast(
        typeof input === 'string' ? { message: input, ...options, type } : { ...input, type }
      );
    });
    notify.dismiss = dismissToast;
    return notify;
  }, [addToast, dismissToast]);

  const showNextConfirmation = useCallback(() => {
    if (confirmationRef.current || confirmationQueue.current.length === 0) return;
    const next = confirmationQueue.current.shift();
    confirmationRef.current = next;
    setConfirmation(next.options);
  }, []);

  const confirm = useCallback((input) => new Promise((resolve) => {
    const supplied = typeof input === 'string' ? { message: input } : input || {};
    confirmationQueue.current.push({
      resolve,
      options: {
        title: 'Confirm action',
        message: 'Are you sure you want to continue?',
        confirmLabel: 'Confirm',
        cancelLabel: 'Cancel',
        tone: 'danger',
        ...supplied
      }
    });
    showNextConfirmation();
  }), [showNextConfirmation]);

  const resolveConfirmation = useCallback((result) => {
    const current = confirmationRef.current;
    if (!current) return;
    confirmationRef.current = null;
    setConfirmation(null);
    current.resolve(result);
    queueMicrotask(showNextConfirmation);
  }, [showNextConfirmation]);

  const value = useMemo(() => ({
    toast,
    notify: toast,
    dismissToast,
    confirm
  }), [confirm, dismissToast, toast]);

  return (
    <FeedbackContext.Provider value={value}>
      {children}
      {typeof document !== 'undefined' && createPortal(
        <>
          <ToastViewport toasts={toasts} onDismiss={dismissToast} />
          <ConfirmationDialog request={confirmation} onResolve={resolveConfirmation} />
        </>,
        document.body
      )}
    </FeedbackContext.Provider>
  );
}

export function useFeedback() {
  const context = useContext(FeedbackContext);
  if (!context) throw new Error('useFeedback must be used within a FeedbackProvider');
  return context;
}

export default FeedbackContext;

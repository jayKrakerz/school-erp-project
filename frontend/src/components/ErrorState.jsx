import React from 'react';
import { AlertTriangle, Home, RefreshCw, LogIn, WifiOff, ShieldAlert } from 'lucide-react';

const ErrorState = ({ 
  type = 'general', 
  message, 
  onRetry, 
  error 
}) => {
  const configs = {
    general: {
      icon: <AlertTriangle size={48} />,
      title: "Something Went Wrong",
      subtitle: message || "We encountered an unexpected error. Our team has been notified.",
      actionLabel: "Try Again",
      action: onRetry || (() => window.location.reload())
    },
    '404': {
      icon: <ShieldAlert size={48} />,
      title: "Page Not Found",
      subtitle: "The resource you are looking for might have been removed or is temporarily unavailable.",
      actionLabel: "Return Home",
      action: () => window.location.href = '/'
    },
    '401': {
      icon: <LogIn size={48} />,
      title: "Session Expired",
      subtitle: "Your session has timed out for security. Please log in again to continue.",
      actionLabel: "Log In",
      action: () => window.location.href = '/login'
    },
    offline: {
      icon: <WifiOff size={48} />,
      title: "No Internet Connection",
      subtitle: "Please check your network settings and try again.",
      actionLabel: "Retry Connection",
      action: onRetry || (() => window.location.reload())
    }
  };

  const config = configs[type] || configs.general;

  return (
    <div className="error-state" role="alert">
      <div className="error-state-card">
        <div className="error-state-icon">
          {config.icon}
        </div>
        
        <div>
          <h1>
            {config.title}
          </h1>
          <p className="error-state-message">
            {config.subtitle}
          </p>
        </div>

        {error && (
          <div className="error-state-details">
            <p>
              {error.toString()}
            </p>
          </div>
        )}

        <div className="error-state-actions">
          <button
            onClick={config.action}
            className="btn btn-primary"
          >
            {type === 'general' ? <RefreshCw size={18} /> : <Home size={18} />}
            {config.actionLabel}
          </button>
          <button
            onClick={() => window.location.href = '/'}
            className="btn btn-secondary"
          >
            Return Home
          </button>
        </div>
      </div>
    </div>
  );
};

export default ErrorState;

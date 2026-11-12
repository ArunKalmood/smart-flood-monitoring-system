import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { translate } from '../../i18n';

/** Last-resort crash screen. Whatever was thrown is shown as text, never rendered as an object. */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('ErrorBoundary caught:', error, info);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    const details = error instanceof Error ? error.toString() : (() => {
      try { return JSON.stringify(error); } catch { return String(error); }
    })();
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900 p-4">
        <div className="glass-card max-w-md w-full p-8 text-center">
          <div className="w-16 h-16 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mx-auto mb-4">
            <AlertTriangle className="w-8 h-8 text-red-500" aria-hidden="true" />
          </div>
          <h2 className="text-xl font-bold text-slate-800 dark:text-white mb-2">{translate('crash_title')}</h2>
          <p className="text-slate-500 text-sm mb-6">{translate('crash_message')}</p>
          <button type="button" onClick={() => window.location.reload()} className="btn-primary">
            <RefreshCw className="w-4 h-4" aria-hidden="true" /> {translate('crash_reload')}
          </button>
          {process.env.NODE_ENV === 'development' && (
            <details className="mt-4 text-left">
              <summary className="text-xs text-red-500 cursor-pointer">{translate('crash_details')}</summary>
              <pre className="text-xs text-slate-500 mt-2 overflow-auto bg-slate-100 dark:bg-slate-800 p-2 rounded">{details}</pre>
            </details>
          )}
        </div>
      </div>
    );
  }
}

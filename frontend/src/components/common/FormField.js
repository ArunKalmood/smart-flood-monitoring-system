import React from 'react';

/** Label + input + validation message. Pass the react-hook-form error for this field. */
export default function FormField({ label, htmlFor, error, hint, required, children, className = '' }) {
  return (
    <div className={className}>
      {label && (
        <label htmlFor={htmlFor} className="field-label">
          {label}{required && <span aria-hidden="true"> *</span>}
        </label>
      )}
      {children}
      {hint && !error && <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{hint}</p>}
      {error?.message && <p className="field-error" role="alert">{String(error.message)}</p>}
    </div>
  );
}

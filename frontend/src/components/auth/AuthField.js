import React, { forwardRef, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';

/** Input with an optional leading icon, styled for the auth pages; `error` is a react-hook-form field error. */
export const AuthField = forwardRef(function AuthField({ id, label, icon: Icon, error, hint, required, className = '', ...input }, ref) {
  return (
    <div className={className}>
      <label htmlFor={id} className="auth-label">{label}{required && <span aria-hidden="true"> *</span>}</label>
      <div className="relative">
        {Icon && <Icon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" aria-hidden="true" />}
        <input id={id} ref={ref} aria-invalid={!!error} aria-describedby={error ? `${id}-error` : undefined}
          className={`auth-input ${Icon ? 'pl-10' : 'pl-3'} pr-3`} {...input} />
      </div>
      {hint && !error && <p className="auth-muted text-xs mt-1">{hint}</p>}
      {error?.message && <p id={`${id}-error`} className="field-error" role="alert">{String(error.message)}</p>}
    </div>
  );
});

/** Password input with a labelled show/hide toggle. */
export const PasswordField = forwardRef(function PasswordField({ id, label, icon: Icon, error, required, className = '', ...input }, ref) {
  const { t } = useLanguage();
  const [visible, setVisible] = useState(false);
  return (
    <div className={className}>
      <label htmlFor={id} className="auth-label">{label}{required && <span aria-hidden="true"> *</span>}</label>
      <div className="relative">
        {Icon && <Icon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" aria-hidden="true" />}
        <input id={id} ref={ref} type={visible ? 'text' : 'password'} aria-invalid={!!error}
          aria-describedby={error ? `${id}-error` : undefined}
          className={`auth-input ${Icon ? 'pl-10' : 'pl-3'} pr-10`} {...input} />
        <button type="button" onClick={() => setVisible(!visible)}
          aria-label={t(visible ? 'action_hide_password' : 'action_show_password')}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-white">
          {visible ? <EyeOff className="w-4 h-4" aria-hidden="true" /> : <Eye className="w-4 h-4" aria-hidden="true" />}
        </button>
      </div>
      {error?.message && <p id={`${id}-error`} className="field-error" role="alert">{String(error.message)}</p>}
    </div>
  );
});

import React from 'react';
import { CheckCircle } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { PASSWORD_CHECKS } from '../../utils/validation';

const BAR_COLORS = ['bg-red-500', 'bg-orange-500', 'bg-yellow-500', 'bg-lime-500', 'bg-green-500'];

/** Live checklist of the shared password policy (same rules the backend enforces). */
export default function PasswordStrength({ password = '' }) {
  const { t } = useLanguage();
  const results = PASSWORD_CHECKS.map((c) => ({ ...c, ok: c.test(password) }));
  const passed = results.filter((r) => r.ok).length;
  return (
    <div className="mt-2" aria-live="polite">
      <div className="flex gap-1 mb-1" aria-hidden="true">
        {results.map((r, i) => (
          <div key={r.key} className={`h-1 flex-1 rounded-full transition-all ${i < passed ? BAR_COLORS[passed - 1] : 'bg-slate-200 dark:bg-white/20'}`} />
        ))}
      </div>
      <ul className="flex flex-wrap gap-x-3 gap-y-0.5">
        {results.map((r) => (
          <li key={r.key} className={`text-xs flex items-center gap-1 ${r.ok ? 'text-green-600 dark:text-green-400' : 'text-slate-500'}`}>
            <CheckCircle className="w-3 h-3" aria-hidden="true" /> {t(r.key)}
          </li>
        ))}
      </ul>
    </div>
  );
}

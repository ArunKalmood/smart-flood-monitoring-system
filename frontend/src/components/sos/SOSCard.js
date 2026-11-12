import React from 'react';
import { Phone, MapPin, Clock, UserCheck } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { SOS_ACTION_STYLES, SOS_STATUS_STYLES } from '../../constants/status';
import { formatDateTime, formatRelative } from '../../utils/datetime';

/** One SOS request; the action buttons are exactly the transitions the API says this user may make. */
export default function SOSCard({ sos, onChangeStatus, busy }) {
  const { t } = useLanguage();
  const style = SOS_STATUS_STYLES[sos.status] || SOS_STATUS_STYLES.pending;
  const next = sos.next_statuses || [];
  return (
    <li className="p-3 hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <span className={`inline-flex items-center gap-1 ${style.badge}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} aria-hidden="true" /> {t(`sos_status_${sos.status}`)}
            </span>
            <span className="badge-danger">{t(`emergency_${sos.emergency_type}`)}</span>
            <span className="text-xs text-slate-400">#{sos.id}</span>
          </div>
          <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">{sos.name}</p>
          <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
            <Phone className="w-3 h-3" aria-hidden="true" /> <a href={`tel:${sos.phone}`} className="hover:underline">{sos.phone}</a>
          </p>
          {sos.location && (
            <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5 truncate">
              <MapPin className="w-3 h-3 flex-shrink-0" aria-hidden="true" /> {sos.location}
            </p>
          )}
          {sos.description && <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 line-clamp-2">{sos.description}</p>}
          <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5" title={formatRelative(sos.created_at)}>
            <Clock className="w-3 h-3" aria-hidden="true" /> {formatDateTime(sos.created_at)}
          </p>
          {sos.last_change && (
            <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
              <UserCheck className="w-3 h-3" aria-hidden="true" />
              {t('sos_last_change', {
                status: t(`sos_status_${sos.last_change.to_status}`),
                name: sos.last_change.changed_by,
                time: formatDateTime(sos.last_change.changed_at),
              })}
            </p>
          )}
        </div>
        {next.length > 0 && (
          <div className="flex flex-col gap-1 flex-shrink-0">
            {next.map((status) => (
              <button key={status} type="button" disabled={busy} onClick={() => onChangeStatus(sos, status)}
                className={`text-xs px-2 py-1 rounded-lg whitespace-nowrap disabled:opacity-50 ${SOS_ACTION_STYLES[status]}`}>
                {t(`sos_action_${status}`)}
              </button>
            ))}
          </div>
        )}
      </div>
    </li>
  );
}

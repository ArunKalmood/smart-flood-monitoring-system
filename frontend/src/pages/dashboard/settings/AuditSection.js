import React, { useCallback, useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { ScrollText, RefreshCw, AlertTriangle, Filter, ChevronLeft, ChevronRight } from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';
import { useLanguage } from '../../../context/LanguageContext';
import { auditAPI } from '../../../services/api';
import { formatDateTime } from '../../../utils/datetime';
import SettingsSubPage from './SettingsSubPage';

const PERIOD_OPTIONS = [
  { value: 7, label: '7 days' },
  { value: 14, label: '14 days' },
  { value: 30, label: '30 days' },
  { value: 90, label: '90 days' },
];

export default function AuditSection() {
  const { can } = useAuth();
  const { t } = useLanguage();

  const canViewAudit = can('audit.view');

  const [auditLogs, setAuditLogs] = useState([]);
  const [auditTotal, setAuditTotal] = useState(0);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditError, setAuditError] = useState(null);
  const [auditDays, setAuditDays] = useState(7);
  const [auditActionFilter, setAuditActionFilter] = useState('');
  const [auditActorFilter, setAuditActorFilter] = useState('');
  const [auditPage, setAuditPage] = useState(0);
  const auditLimit = 10;

  const fetchAuditLogs = useCallback(async () => {
    if (!canViewAudit) return;
    setAuditLoading(true);
    setAuditError(null);
    try {
      const params = {
        days: auditDays,
        limit: auditLimit,
        skip: auditPage * auditLimit,
      };
      if (auditActionFilter.trim()) params.action = auditActionFilter.trim();
      if (auditActorFilter.trim()) params.actor = auditActorFilter.trim();

      const res = await auditAPI.getAll(params);
      setAuditLogs(res.data?.items || []);
      setAuditTotal(res.data?.total || 0);
    } catch (err) {
      setAuditError(err);
    } finally {
      setAuditLoading(false);
    }
  }, [canViewAudit, auditDays, auditLimit, auditPage, auditActionFilter, auditActorFilter]);

  useEffect(() => {
    fetchAuditLogs();
  }, [fetchAuditLogs]);

  // Guard: if user lacks permission, redirect to /dashboard/settings
  if (!canViewAudit) {
    return <Navigate to="/dashboard/settings" replace />;
  }

  return (
    <SettingsSubPage
      title={t('settings_audit_title')}
      description={t('settings_audit_desc')}
      icon={ScrollText}
      maxWidth="max-w-5xl"
    >
      <section
        aria-labelledby="audit-logs-heading"
        className="glass-card p-6 sm:p-7 border border-slate-200/80 dark:border-white/10 shadow-sm"
      >
        <div className="border-b border-slate-200/60 dark:border-white/5 pb-4 mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 id="audit-logs-heading" className="text-base font-bold text-slate-900 dark:text-white">
              {t('settings_audit_title')}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {t('settings_audit_desc')}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 font-medium">
              {t('settings_audit_total', { total: auditTotal })}
            </span>
            <button
              type="button"
              onClick={fetchAuditLogs}
              disabled={auditLoading}
              aria-label={t('action_retry')}
              className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl border border-slate-200 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${auditLoading ? 'animate-spin' : ''}`} aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Filters Bar */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
          <div>
            <label htmlFor="audit-filter-action" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              {t('settings_audit_filter_action')}
            </label>
            <input
              id="audit-filter-action"
              type="text"
              value={auditActionFilter}
              onChange={(e) => {
                setAuditActionFilter(e.target.value);
                setAuditPage(0);
              }}
              placeholder="e.g. USER_LOGIN"
              className="input-base text-xs"
            />
          </div>

          <div>
            <label htmlFor="audit-filter-actor" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              {t('settings_audit_filter_actor')}
            </label>
            <input
              id="audit-filter-actor"
              type="text"
              value={auditActorFilter}
              onChange={(e) => {
                setAuditActorFilter(e.target.value);
                setAuditPage(0);
              }}
              placeholder="email@example.com"
              className="input-base text-xs"
            />
          </div>

          <div>
            <label htmlFor="audit-filter-period" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              {t('settings_audit_period')}
            </label>
            <select
              id="audit-filter-period"
              value={auditDays}
              onChange={(e) => {
                setAuditDays(Number(e.target.value));
                setAuditPage(0);
              }}
              className="input-base text-xs"
            >
              {PERIOD_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {t('rep_last_days', { days: opt.value })}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Audit Content: Loading, Error, Empty, or Data */}
        {auditLoading && auditLogs.length === 0 ? (
          <div className="space-y-3 animate-pulse py-4" aria-busy="true">
            <div className="h-10 bg-slate-200 dark:bg-white/10 rounded-xl" />
            <div className="h-10 bg-slate-200 dark:bg-white/10 rounded-xl" />
            <div className="h-10 bg-slate-200 dark:bg-white/10 rounded-xl" />
          </div>
        ) : auditError ? (
          <div className="p-6 rounded-2xl bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/30 text-center">
            <AlertTriangle className="w-6 h-6 text-red-500 mx-auto mb-2" aria-hidden="true" />
            <p className="text-sm font-semibold text-red-800 dark:text-red-300 mb-3">
              {t('error_network')}
            </p>
            <button
              type="button"
              onClick={fetchAuditLogs}
              className="btn-outline min-h-[44px] px-4 text-xs font-semibold inline-flex items-center gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{t('action_retry')}</span>
            </button>
          </div>
        ) : auditLogs.length === 0 ? (
          <div className="p-8 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-white/5 text-center">
            <Filter className="w-8 h-8 text-slate-400 mx-auto mb-2" aria-hidden="true" />
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
              {t('settings_audit_empty')}
            </p>
          </div>
        ) : (
          <>
            {/* Desktop Table (>= 640px) */}
            <div className="hidden sm:block overflow-x-auto rounded-xl border border-slate-200 dark:border-white/10">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold border-b border-slate-200 dark:border-white/10">
                  <tr>
                    <th className="p-3">{t('settings_audit_col_time')}</th>
                    <th className="p-3">{t('settings_audit_col_action')}</th>
                    <th className="p-3">{t('settings_audit_col_actor')}</th>
                    <th className="p-3">{t('settings_audit_col_resource')}</th>
                    <th className="p-3">{t('settings_audit_col_ip')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-white/5 text-slate-600 dark:text-slate-300">
                  {auditLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
                      <td className="p-3 whitespace-nowrap font-medium text-slate-700 dark:text-slate-200">
                        {formatDateTime(log.created_at)}
                      </td>
                      <td className="p-3 font-semibold text-blue-600 dark:text-blue-400 whitespace-nowrap">
                        {log.action}
                      </td>
                      <td className="p-3 truncate max-w-[160px]" title={log.actor_email}>
                        {log.actor_email || '—'}
                      </td>
                      <td className="p-3 truncate max-w-[140px]">
                        {log.resource ? `${log.resource}${log.resource_id ? ` #${log.resource_id}` : ''}` : '—'}
                      </td>
                      <td className="p-3 font-mono text-[11px] text-slate-500 whitespace-nowrap">
                        {log.ip_address || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Stacked Cards (< 640px) */}
            <div className="sm:hidden space-y-3">
              {auditLogs.map((log) => (
                <div
                  key={log.id}
                  className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-white/10 space-y-1.5 text-xs"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-blue-600 dark:text-blue-400">
                      {log.action}
                    </span>
                    <span className="text-[11px] text-slate-400">
                      {formatDateTime(log.created_at)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-slate-600 dark:text-slate-300 pt-1">
                    <span className="truncate max-w-[200px]">{log.actor_email || '—'}</span>
                    <span className="font-mono text-[11px] text-slate-500">{log.ip_address || '—'}</span>
                  </div>
                  {log.resource && (
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      {log.resource}{log.resource_id ? ` #${log.resource_id}` : ''}
                    </p>
                  )}
                </div>
              ))}
            </div>

            {/* Pagination Controls */}
            <div className="mt-4 flex items-center justify-between gap-2 pt-3 border-t border-slate-200/60 dark:border-white/5 text-xs">
              <span className="text-slate-500 dark:text-slate-400">
                {auditPage * auditLimit + 1}–{Math.min((auditPage + 1) * auditLimit, auditTotal)} / {auditTotal}
              </span>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setAuditPage((p) => Math.max(0, p - 1))}
                  disabled={auditPage === 0}
                  className="btn-outline min-h-[44px] px-3 font-semibold disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
                >
                  <ChevronLeft className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>{t('settings_audit_prev')}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setAuditPage((p) => p + 1)}
                  disabled={(auditPage + 1) * auditLimit >= auditTotal}
                  className="btn-outline min-h-[44px] px-3 font-semibold disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
                >
                  <span>{t('settings_audit_next')}</span>
                  <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
              </div>
            </div>
          </>
        )}
      </section>
    </SettingsSubPage>
  );
}

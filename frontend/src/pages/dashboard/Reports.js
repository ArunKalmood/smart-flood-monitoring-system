import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Download, RefreshCw, CheckCircle, FileText } from 'lucide-react';
import { reportAPI, downloadBlob } from '../../services/api';
import { useLanguage } from '../../context/LanguageContext';
import PageHeader from '../../components/common/PageHeader';
import { formatDateTime } from '../../utils/datetime';
import toast, { toastError } from '../../utils/toast';

const REPORT_TYPES = [
  { type: 'flood', icon: '🌊' },
  { type: 'sos', icon: '🆘' },
  { type: 'volunteer', icon: '👥' },
  { type: 'feedback', icon: '💬' },
  { type: 'sensor', icon: '📡' },
  { type: 'prediction', icon: '🧠' },
];
const PERIODS = [7, 30, 90, 365];
const today = () => new Date().toISOString().slice(0, 10);

export default function Reports() {
  const { t } = useLanguage();
  const [busy, setBusy] = useState({}); // { [type]: 'json' | 'csv' | 'pdf' }
  const [results, setResults] = useState({});
  const [days, setDays] = useState(30);

  const withBusy = async (type, kind, action) => {
    setBusy((b) => ({ ...b, [type]: kind }));
    try {
      await action();
    } catch (err) {
      toastError(err, t('rep_failed'));
    } finally {
      setBusy((b) => ({ ...b, [type]: null }));
    }
  };

  const generate = (type) => withBusy(type, 'json', async () => {
    const res = await reportAPI.generate(type, days);
    setResults((r) => ({ ...r, [type]: { ...res.data, generatedAt: new Date().toISOString() } }));
    toast.success(t('rep_generated', { count: res.data.records }));
  });

  const download = (type, format) => withBusy(type, format, async () => {
    const res = await reportAPI.generate(type, days, format);
    downloadBlob(res, `${type}_report_${today()}.${format}`);
  });

  const downloadJSON = (type) => {
    const blob = new Blob([JSON.stringify(results[type], null, 2)], { type: 'application/json' });
    downloadBlob({ data: blob, headers: {} }, `${type}_report_${today()}.json`);
  };

  return (
    <div className="page-container">
      <PageHeader icon={FileText} title={t('rep_title')} subtitle={t('rep_subtitle')}>
        <label htmlFor="rep-period" className="text-sm text-slate-600 dark:text-slate-400">{t('rep_period')}</label>
        <select id="rep-period" value={days} onChange={(e) => setDays(Number(e.target.value))} className="input-base w-auto text-sm">
          {PERIODS.map((d) => <option key={d} value={d}>{t('rep_last_days', { days: d })}</option>)}
        </select>
      </PageHeader>

      <ul className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {REPORT_TYPES.map((r, i) => {
          const result = results[r.type];
          const running = busy[r.type];
          return (
            <motion.li key={r.type} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} className="glass-card p-5">
              <div className="flex items-start justify-between mb-3">
                <span className="text-3xl" aria-hidden="true">{r.icon}</span>
                {result && (
                  <span className="badge-safe flex items-center gap-1"><CheckCircle className="w-3 h-3" aria-hidden="true" /> {t('rep_records', { count: result.records })}</span>
                )}
              </div>
              <h2 className="font-bold text-slate-800 dark:text-white text-sm mb-1">{t(`rep_${r.type}_title`)}</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">{t(`rep_${r.type}_desc`)}</p>
              <div className="flex flex-col gap-2">
                <button type="button" onClick={() => generate(r.type)} disabled={!!running}
                  className="w-full py-2 rounded-xl bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 text-xs font-medium disabled:opacity-60 flex items-center justify-center gap-2">
                  <RefreshCw className={`w-3 h-3 ${running === 'json' ? 'animate-spin' : ''}`} aria-hidden="true" />
                  {running === 'json' ? t('rep_generating') : t('rep_generate')}
                </button>
                <div className="flex gap-2">
                  <button type="button" onClick={() => downloadJSON(r.type)} disabled={!result || !!running}
                    className="flex-1 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium disabled:opacity-40 flex items-center justify-center gap-1">
                    <Download className="w-3 h-3" aria-hidden="true" /> JSON
                  </button>
                  {['csv', 'pdf'].map((format) => (
                    <button key={format} type="button" onClick={() => download(r.type, format)} disabled={!!running}
                      className={`flex-1 py-2 rounded-xl text-white text-xs font-medium disabled:opacity-40 flex items-center justify-center gap-1 ${format === 'csv' ? 'bg-green-600 hover:bg-green-500' : 'bg-purple-600 hover:bg-purple-500'}`}>
                      <Download className="w-3 h-3" aria-hidden="true" /> {running === format ? '…' : format.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>
              {result && (
                <p className="mt-3 p-2 rounded-xl text-xs border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400">
                  {result.period_days ? t('rep_period_days', { days: result.period_days }) : t('rep_all_time')} · {t('rep_generated_at', { time: formatDateTime(result.generatedAt) })}
                </p>
              )}
            </motion.li>
          );
        })}
      </ul>
    </div>
  );
}

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Download, RefreshCw, CheckCircle } from 'lucide-react';
import { reportAPI, downloadBlob } from '../../services/api';
import toast from 'react-hot-toast';

const REPORT_TYPES = [
  { type: 'flood', label: 'Flood Data Report', description: 'Sensor readings, water levels, rainfall data', icon: '🌊', color: 'blue' },
  { type: 'sos', label: 'SOS Emergency Report', description: 'Emergency requests, response times, rescue operations', icon: '🆘', color: 'red' },
  { type: 'volunteer', label: 'Volunteer Report', description: 'Registered volunteers, skills, availability', icon: '👥', color: 'green' },
  { type: 'feedback', label: 'Feedback Report', description: 'Citizen feedback, categories, resolution status', icon: '💬', color: 'purple' },
  { type: 'sensor', label: 'Sensor Status Report', description: 'IoT sensor health, battery, uptime', icon: '📡', color: 'cyan' },
  { type: 'prediction', label: 'Prediction Report', description: 'ML model predictions, accuracy, risk levels', icon: '🧠', color: 'amber' },
];

const COLOR_MAP = {
  blue: 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800/30 text-blue-700 dark:text-blue-400',
  red: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800/30 text-red-700 dark:text-red-400',
  green: 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800/30 text-green-700 dark:text-green-400',
  purple: 'bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-800/30 text-purple-700 dark:text-purple-400',
  cyan: 'bg-cyan-50 dark:bg-cyan-900/20 border-cyan-200 dark:border-cyan-800/30 text-cyan-700 dark:text-cyan-400',
  amber: 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800/30 text-amber-700 dark:text-amber-400',
};

export default function Reports() {
  const [generating, setGenerating] = useState({});
  const [results, setResults] = useState({});
  const [days, setDays] = useState(30);

  const generateReport = async (type) => {
    setGenerating(g => ({ ...g, [type]: true }));
    try {
      const res = await reportAPI.generate(type, days);
      setResults(r => ({ ...r, [type]: res.data }));
      toast.success(`${type} report generated — ${res.data.records} records`);
    } catch (err) {
      toast.error('Report generation failed');
    } finally {
      setGenerating(g => ({ ...g, [type]: false }));
    }
  };

  const downloadJSON = (type) => {
    const data = results[type];
    if (!data) return;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${type}_report_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    toast.success(`${type} report downloaded`);
  };

  const downloadCSV = (type) => {
    const data = results[type];
    if (!data?.data?.length) return toast.error('No data to download');
    const headers = Object.keys(data.data[0]).join(',');
    const rows = data.data.map(row => Object.values(row).map(v => `"${v ?? ''}"`).join(',')).join('\n');
    const blob = new Blob([`${headers}\n${rows}`], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${type}_report_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    toast.success('CSV downloaded');
  };

  const downloadPDF = async (type) => {
    try {
      const res = await reportAPI.generatePdf(type, days);
      downloadBlob(res, `${type}_report_${new Date().toISOString().split('T')[0]}.pdf`);
      toast.success('PDF downloaded');
    } catch {
      toast.error('Failed to download PDF');
    }
  };

  return (
    <div className="page-container">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-white">Reports & Analytics</h1>
          <p className="text-slate-500 text-sm mt-0.5">Generate and download flood monitoring reports</p>
        </div>
        <div className="flex items-center gap-3">
          <label className="text-sm text-slate-600 dark:text-slate-400">Period:</label>
          <select value={days} onChange={e => setDays(Number(e.target.value))} className="input-base w-auto text-sm">
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
            <option value={365}>Last year</option>
          </select>
        </div>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {REPORT_TYPES.map((r, i) => {
          const result = results[r.type];
          const isGenerating = generating[r.type];
          const colorCls = COLOR_MAP[r.color];

          return (
            <motion.div
              key={r.type}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className={`glass-card p-5 border-l-4 ${colorCls.includes('border') ? '' : ''}`}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="text-3xl">{r.icon}</div>
                {result && (
                  <span className="badge-safe flex items-center gap-1">
                    <CheckCircle className="w-3 h-3" /> {result.records} records
                  </span>
                )}
              </div>

              <h3 className="font-bold text-slate-800 dark:text-white text-sm mb-1">{r.label}</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">{r.description}</p>

              <div className="flex flex-col gap-2">
                <button
                  onClick={() => generateReport(r.type)}
                  disabled={isGenerating}
                  className="w-full py-2 rounded-xl bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 text-xs font-medium transition-all disabled:opacity-60 flex items-center justify-center gap-2"
                >
                  {isGenerating
                    ? <><div className="w-3 h-3 border-2 border-slate-400/30 border-t-slate-600 rounded-full animate-spin" /> Generating...</>
                    : <><RefreshCw className="w-3 h-3" /> Generate Report</>
                  }
                </button>

                {result && (
                  <div className="flex gap-2">
                    <button onClick={() => downloadJSON(r.type)} className="flex-1 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium transition-all flex items-center justify-center gap-1">
                      <Download className="w-3 h-3" /> JSON
                    </button>
                    <button onClick={() => downloadCSV(r.type)} className="flex-1 py-2 rounded-xl bg-green-600 hover:bg-green-500 text-white text-xs font-medium transition-all flex items-center justify-center gap-1">
                      <Download className="w-3 h-3" /> CSV
                    </button>
                    <button onClick={() => downloadPDF(r.type)} className="flex-1 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-medium transition-all flex items-center justify-center gap-1">
                      <Download className="w-3 h-3" /> PDF
                    </button>
                  </div>
                )}
              </div>

              {result && (
                <div className={`mt-3 p-2 rounded-xl text-xs border ${colorCls}`}>
                  Period: {result.period_days || 'All'} days · {result.report_type} · Generated now
                </div>
              )}
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

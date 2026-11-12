import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Brain, Droplets, CloudRain, Thermometer, Wind, Activity, Zap, FlaskConical, Info } from 'lucide-react';
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line,
} from 'recharts';
import { dashboardAPI, predictionAPI } from '../../services/api';
import { useLanguage } from '../../context/LanguageContext';
import PageHeader from '../../components/common/PageHeader';
import EmptyState from '../../components/common/EmptyState';
import { RISK_LEVELS, RISK_STYLES } from '../../constants/status';
import { formatDayMonth, formatTime } from '../../utils/datetime';
import { formatNumber, formatReading, unitFor } from '../../utils/units';
import { timeAxisProps, withTime } from '../../utils/charts';
import { toastError } from '../../utils/toast';

/** Slider ranges stay inside the backend's accepted physical ranges. */
const INPUTS = [
  { key: 'water_level', labelKey: 'reading_water_level', icon: Droplets, min: 0, max: 20, step: 0.1 },
  { key: 'rainfall', labelKey: 'reading_rainfall', icon: CloudRain, min: 0, max: 300, step: 1 },
  { key: 'temperature', labelKey: 'reading_temperature', icon: Thermometer, min: -10, max: 50, step: 0.5 },
  { key: 'humidity', labelKey: 'reading_humidity', icon: Wind, min: 0, max: 100, step: 1 },
  { key: 'river_flow', labelKey: 'reading_river_flow', icon: Activity, min: 0, max: 10, step: 0.1 },
];
const HISTORY_HOURS = 48;
const DAILY_DAYS = 14;
const clamp = (v, { min, max }) => Math.min(max, Math.max(min, v));

export default function FloodPrediction() {
  const { t } = useLanguage();
  const [inputs, setInputs] = useState(() => Object.fromEntries(INPUTS.map((f) => [f.key, f.min])));
  const [fromLive, setFromLive] = useState(null); // timestamp of the readings used as defaults
  const [result, setResult] = useState(null);
  const [running, setRunning] = useState(false);
  const [history, setHistory] = useState([]);
  const [daily, setDaily] = useState([]);
  const [weights, setWeights] = useState({});

  useEffect(() => {
    Promise.allSettled([
      dashboardAPI.getStats(), predictionAPI.getHistory(HISTORY_HOURS), predictionAPI.getDaily(DAILY_DAYS), predictionAPI.getStats(7),
    ]).then(([stats, hist, days, pstats]) => {
      const readings = stats.status === 'fulfilled' ? stats.value.data.readings : null;
      if (readings?.recorded_at) {
        setInputs((prev) => Object.fromEntries(INPUTS.map((f) => {
          const value = readings[f.key]?.value;
          return [f.key, value === undefined || value === null ? prev[f.key] : clamp(value, f)];
        })));
        setFromLive(readings.recorded_at);
      }
      if (hist.status === 'fulfilled') setHistory(withTime(hist.value.data || [], 'predicted_at'));
      if (days.status === 'fulfilled') setDaily(days.value.data || []);
      if (pstats.status === 'fulfilled') setWeights(pstats.value.data.model_info?.feature_weights || {});
    });
  }, []);

  const simulate = async () => {
    setRunning(true);
    try {
      const res = await predictionAPI.simulate(inputs);
      setResult(res.data);
    } catch (err) {
      toastError(err);
    } finally {
      setRunning(false);
    }
  };

  const riskCfg = result ? RISK_STYLES[result.risk_level] || RISK_STYLES.safe : null;
  const radarData = INPUTS.map((f) => ({ subject: t(f.labelKey), value: ((inputs[f.key] - f.min) / (f.max - f.min)) * 100 }));
  const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0);
  const weightData = INPUTS.filter((f) => weights[f.key] !== undefined)
    .map((f) => ({ feature: t(f.labelKey), weight: Math.round((weights[f.key] / totalWeight) * 100) }));
  const dailyHasData = daily.some((d) => RISK_LEVELS.some((l) => d[l] > 0));

  return (
    <div className="page-container">
      <PageHeader icon={Brain} iconClass="text-purple-500" title={t('pred_title')} subtitle={t('pred_subtitle')} />

      <div className="mb-6 flex items-start gap-3 p-4 rounded-xl border border-purple-200 bg-purple-50 text-purple-800 dark:border-purple-800/40 dark:bg-purple-900/20 dark:text-purple-200" role="note">
        <FlaskConical className="w-5 h-5 flex-shrink-0" aria-hidden="true" />
        <div>
          <p className="font-semibold text-sm">{t('pred_simulation_banner')}</p>
          <p className="text-xs mt-0.5">{t('pred_simulation_banner_hint')}</p>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <section className="glass-card p-5" aria-labelledby="sim-inputs-title">
          <h2 id="sim-inputs-title" className="font-semibold text-slate-700 dark:text-slate-200 mb-1 flex items-center gap-2">
            <Zap className="w-4 h-4 text-amber-500" aria-hidden="true" /> {t('pred_inputs')}
          </h2>
          <p className="text-xs text-slate-500 mb-4 flex items-center gap-1">
            <Info className="w-3 h-3" aria-hidden="true" />
            {fromLive ? t('pred_inputs_from_live', { time: formatTime(fromLive) }) : t('pred_inputs_no_live')}
          </p>
          <div className="space-y-4">
            {INPUTS.map((f) => (
              <div key={f.key}>
                <div className="flex items-center justify-between mb-1">
                  <label htmlFor={`sim-${f.key}`} className="text-xs font-medium text-slate-600 dark:text-slate-400 flex items-center gap-1.5">
                    <f.icon className="w-3.5 h-3.5" aria-hidden="true" /> {t(f.labelKey)}
                  </label>
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-200">{formatReading(inputs[f.key], f.key)}</span>
                </div>
                <input id={`sim-${f.key}`} type="range" min={f.min} max={f.max} step={f.step} value={inputs[f.key]}
                  onChange={(e) => setInputs((prev) => ({ ...prev, [f.key]: Number(e.target.value) }))}
                  className="w-full h-2 rounded-full appearance-none cursor-pointer accent-purple-500 bg-slate-200 dark:bg-slate-700" />
                <div className="flex justify-between text-xs text-slate-400 mt-0.5" aria-hidden="true">
                  <span>{f.min}</span><span>{f.max} {unitFor(f.key)}</span>
                </div>
              </div>
            ))}
          </div>
          <button type="button" onClick={simulate} disabled={running}
            className="w-full mt-6 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-medium text-sm disabled:opacity-60 flex items-center justify-center gap-2">
            <FlaskConical className="w-4 h-4" aria-hidden="true" /> {running ? t('pred_running') : t('pred_run')}
          </button>
        </section>

        <div className="space-y-4">
          {result ? (
            <motion.section initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} aria-live="polite"
              className="glass-card p-6 border-2 border-purple-200 dark:border-purple-800/40">
              <div className="text-center mb-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-purple-600 dark:text-purple-400 mb-1">{t('pred_simulated_result')}</p>
                <p className={`text-4xl font-black ${riskCfg.text}`}>{t(riskCfg.labelKey)}</p>
                <p className="text-sm text-slate-500 mt-1">
                  {t('dash_confidence', { pct: Math.round(result.confidence * 100) })} · {t('pred_score', { score: result.score })}
                </p>
              </div>
              <div className="mb-4 h-3 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden" aria-hidden="true">
                <motion.div initial={{ width: 0 }} animate={{ width: `${result.confidence * 100}%` }} transition={{ duration: 0.8 }}
                  className="h-full rounded-full" style={{ backgroundColor: riskCfg.fill }} />
              </div>
              <dl className="grid grid-cols-2 gap-3">
                {INPUTS.map((f) => (
                  <div key={f.key} className="bg-slate-50 dark:bg-slate-700/50 rounded-xl p-2.5">
                    <dt className="text-xs text-slate-500">{t(f.labelKey)}</dt>
                    <dd className="text-sm font-bold text-slate-800 dark:text-white">{formatReading(result.features?.[f.key], f.key)}</dd>
                  </div>
                ))}
              </dl>
              {result.time_to_flood_hours !== null && result.time_to_flood_hours !== undefined && (
                <p className="mt-3 p-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/30 text-xs text-amber-700 dark:text-amber-400 font-medium">
                  {t('pred_time_to_flood', { hours: formatNumber(result.time_to_flood_hours, 1) })}
                </p>
              )}
            </motion.section>
          ) : (
            <div className="glass-card"><EmptyState icon={FlaskConical} title={t('pred_result_empty')} /></div>
          )}

          <section className="glass-card p-4" aria-labelledby="radar-title">
            <h2 id="radar-title" className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide mb-3">{t('pred_radar')}</h2>
            <ResponsiveContainer width="100%" height={200}>
              <RadarChart data={radarData}>
                <PolarGrid stroke="#94a3b8" strokeOpacity={0.35} />
                <PolarAngleAxis dataKey="subject" tick={{ fontSize: 10 }} />
                <PolarRadiusAxis tick={{ fontSize: 8 }} domain={[0, 100]} />
                <Radar dataKey="value" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.3} />
              </RadarChart>
            </ResponsiveContainer>
          </section>
        </div>

        <div className="space-y-4">
          <section className="glass-card p-4" aria-labelledby="live-history-title">
            <h2 id="live-history-title" className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide mb-1">{t('pred_live_history')}</h2>
            <p className="text-xs text-slate-500 mb-3">{t('pred_live_history_hint', { hours: HISTORY_HOURS })}</p>
            {history.length === 0 ? (
              <EmptyState icon={Brain} title={t('pred_no_live_history')} compact />
            ) : (
              <ResponsiveContainer width="100%" height={170}>
                <LineChart data={history} margin={{ right: 12 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#94a3b8" strokeOpacity={0.25} />
                  <XAxis {...timeAxisProps(history, 4)} tick={{ fontSize: 9 }} tickLine={false} />
                  <YAxis tick={{ fontSize: 9 }} tickLine={false} axisLine={false} domain={[0, 110]} width={30} />
                  <Tooltip contentStyle={{ borderRadius: '10px', border: 'none', fontSize: 11 }} labelFormatter={(v) => formatTime(v)}
                    formatter={(v, _n, item) => [`${v} (${t(RISK_STYLES[item.payload.risk_level]?.labelKey || 'risk_unknown')})`, t('pred_risk_score')]} />
                  <Line type="stepAfter" dataKey="score" stroke="#8b5cf6" strokeWidth={2} dot={history.length < 20} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </section>

          <section className="glass-card p-4" aria-labelledby="weights-title">
            <h2 id="weights-title" className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide mb-1">{t('pred_feature_weights')}</h2>
            <p className="text-xs text-slate-500 mb-3">{t('pred_feature_weights_hint')}</p>
            {weightData.length === 0 ? (
              <EmptyState icon={Brain} title={t('error_load_failed')} compact />
            ) : (
              <ResponsiveContainer width="100%" height={170}>
                <BarChart data={weightData} layout="vertical" margin={{ left: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#94a3b8" strokeOpacity={0.25} />
                  <XAxis type="number" tick={{ fontSize: 9 }} unit="%" domain={[0, 'dataMax']} />
                  <YAxis type="category" dataKey="feature" tick={{ fontSize: 9 }} width={90} />
                  <Tooltip contentStyle={{ borderRadius: '10px', border: 'none', fontSize: 11 }} formatter={(v) => [`${v}%`]} />
                  <Bar dataKey="weight" fill="#8b5cf6" radius={[0, 4, 4, 0]} maxBarSize={16} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </section>

          <section className="glass-card p-4" aria-labelledby="daily-title">
            <h2 id="daily-title" className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide mb-1">{t('pred_daily', { days: DAILY_DAYS })}</h2>
            <p className="text-xs text-slate-500 mb-3">{t('pred_daily_hint')}</p>
            {!dailyHasData ? (
              <EmptyState icon={Brain} title={t('pred_no_daily')} compact />
            ) : (
              <ResponsiveContainer width="100%" height={170}>
                <BarChart data={daily}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#94a3b8" strokeOpacity={0.25} />
                  <XAxis dataKey="date" tick={{ fontSize: 9 }} tickLine={false} interval={0} angle={-45} textAnchor="end" height={40}
                    tickFormatter={(d) => formatDayMonth(d)} />
                  <YAxis tick={{ fontSize: 9 }} tickLine={false} axisLine={false} allowDecimals={false} width={30} />
                  <Tooltip contentStyle={{ borderRadius: '10px', border: 'none', fontSize: 11 }} labelFormatter={(d) => formatDayMonth(d)} />
                  {RISK_LEVELS.map((level, i) => (
                    <Bar key={level} dataKey={level} name={t(RISK_STYLES[level].labelKey)} stackId="a" fill={RISK_STYLES[level].fill}
                      maxBarSize={20} radius={i === RISK_LEVELS.length - 1 ? [4, 4, 0, 0] : undefined} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

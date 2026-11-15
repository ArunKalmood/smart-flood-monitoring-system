/**
 * LSTMPrediction.js
 * =================
 * Dam water-level LSTM forecast page.
 *
 * Design constraints
 * ------------------
 * - This page is completely independent of the existing live sensor cards,
 *   rule-based prediction page, and Gemini AI page.
 * - It calls GET /api/lstm/predict and GET /api/lstm/status — both new routes
 *   that never touch the existing predictions table.
 * - It never replaces or overrides the sensor readings shown elsewhere.
 * - Every forecast value is labelled SIMULATED / EXPERIMENTAL.
 * - Polling is a simple 60-second interval — no WebSocket, no shared state.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  TrendingUp, TrendingDown, Minus, RefreshCw,
  Activity, Clock, AlertTriangle, CheckCircle2,
  Info, Cpu, Database,
} from 'lucide-react';
import { lstmAPI } from '../../services/api';
import { useLanguage } from '../../context/LanguageContext';
import { formatRelative } from '../../utils/datetime';

// ── constants ─────────────────────────────────────────────────────────────────
const POLL_INTERVAL_MS = 60_000;   // 60 seconds — matches one training window step

// ── risk colour helpers ────────────────────────────────────────────────────────
const RISK_STYLES = {
  normal:   { bg: 'bg-emerald-50 dark:bg-emerald-900/20', text: 'text-emerald-700 dark:text-emerald-300', border: 'border-emerald-200 dark:border-emerald-800', dot: 'bg-emerald-500' },
  warning:  { bg: 'bg-amber-50  dark:bg-amber-900/20',   text: 'text-amber-700  dark:text-amber-300',   border: 'border-amber-200  dark:border-amber-800',  dot: 'bg-amber-500'  },
  critical: { bg: 'bg-red-50    dark:bg-red-900/20',     text: 'text-red-700    dark:text-red-300',     border: 'border-red-200    dark:border-red-800',    dot: 'bg-red-500'    },
};
function riskStyle(risk) {
  return RISK_STYLES[risk] || RISK_STYLES.normal;
}

// ── progress-bar fill for buffer readiness ────────────────────────────────────
function BufferBar({ minutes, required = 60 }) {
  const pct = Math.min(100, Math.round((minutes / required) * 100));
  return (
    <div className="w-full">
      <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400 mb-1">
        <span>{minutes} / {required} min</span>
        <span>{pct}%</span>
      </div>
      <div className="w-full h-2 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
        <div
          className="h-full rounded-full bg-blue-500 transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// ── metric card ───────────────────────────────────────────────────────────────
function MetricCard({ label, value, unit, risk, Icon }) {
  const s = riskStyle(risk);
  return (
    <div className={`rounded-xl border p-4 ${s.bg} ${s.border}`}>
      <div className="flex items-center gap-2 mb-2">
        {Icon && <Icon className={`w-4 h-4 ${s.text}`} />}
        <span className={`text-xs font-medium uppercase tracking-wide ${s.text}`}>{label}</span>
      </div>
      <div className={`text-2xl font-bold ${s.text}`}>
        {value !== null && value !== undefined ? value : '—'}
        {unit && <span className="text-sm font-normal ml-1">{unit}</span>}
      </div>
      {risk && (
        <div className="flex items-center gap-1 mt-1">
          <span className={`w-2 h-2 rounded-full ${s.dot}`} />
          <span className={`text-xs capitalize ${s.text}`}>{risk}</span>
        </div>
      )}
    </div>
  );
}

// ── trend icon ────────────────────────────────────────────────────────────────
function TrendIcon({ trend }) {
  if (trend === 'rising')  return <TrendingUp  className="w-5 h-5 text-red-500" />;
  if (trend === 'falling') return <TrendingDown className="w-5 h-5 text-blue-500" />;
  return <Minus className="w-5 h-5 text-slate-400" />;
}

// ── disclaimer banner ─────────────────────────────────────────────────────────
function DisclaimerBanner({ t }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-4">
      <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
      <div className="text-sm text-amber-700 dark:text-amber-300 leading-relaxed">
        <span className="font-semibold">{t('lstm_disclaimer_label')}: </span>
        {t('lstm_disclaimer_text')}
      </div>
    </div>
  );
}

// ── waiting state card ────────────────────────────────────────────────────────
function WaitingCard({ status, t }) {
  const minutes = status?.minutes_in_buffer ?? 0;
  const required = status?.window_required ?? 60;
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-6">
      <div className="flex items-center gap-3 mb-4">
        <Database className="w-5 h-5 text-blue-500" />
        <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200">
          {t('lstm_buffer_title')}
        </h3>
      </div>
      <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
        {t('lstm_buffer_desc')}
      </p>
      <BufferBar minutes={minutes} required={required} />
      {status?.calibration_note && (
        <p className="mt-3 text-xs text-slate-500 dark:text-slate-400 italic">
          {status.calibration_note}
        </p>
      )}
    </div>
  );
}

// ── main component ────────────────────────────────────────────────────────────
export default function LSTMPrediction() {
  const { t } = useLanguage();

  const [prediction, setPrediction] = useState(null);
  const [status, setStatus]         = useState(null);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState(null);
  const [lastFetch, setLastFetch]   = useState(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [predRes, statusRes] = await Promise.all([
        lstmAPI.predict(),
        lstmAPI.status(),
      ]);
      setPrediction(predRes.data);
      setStatus(statusRes.data);
      setLastFetch(new Date());
    } catch (err) {
      setError(err?.response?.data?.detail || err.message || t('error_load_failed'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  // Initial fetch + polling every 60 s
  useEffect(() => {
    fetchData();
    const timer = setInterval(fetchData, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [fetchData]);

  // ── render ─────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-4xl mx-auto space-y-6 p-4">
      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Cpu className="w-6 h-6 text-blue-500" />
            {t('lstm_title')}
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {t('lstm_subtitle')}
          </p>
        </div>
        <button
          onClick={fetchData}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium
                     bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200
                     hover:bg-slate-200 dark:hover:bg-slate-600 disabled:opacity-50 transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          {t('action_refresh')}
        </button>
      </div>

      {/* ── Disclaimer ── */}
      <DisclaimerBanner t={t} />

      {/* ── Error state ── */}
      {error && (
        <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-4 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {/* ── Main content ── */}
      {!error && (
        <>
          {prediction?.available ? (
            /* ── Prediction available ── */
            <div className="space-y-5">
              {/* Metric grid */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <MetricCard
                  label={t('lstm_current_level')}
                  value={prediction.current_water_level_cm?.toFixed(2)}
                  unit="cm"
                  risk={prediction.current_risk}
                  Icon={Activity}
                />
                <MetricCard
                  label={t('lstm_pred_15min')}
                  value={prediction.predicted_15min_cm?.toFixed(2)}
                  unit="cm"
                  risk={prediction.forecast_risk}
                  Icon={TrendingUp}
                />
                <MetricCard
                  label={t('lstm_pred_30min')}
                  value={prediction.predicted_30min_cm?.toFixed(2)}
                  unit="cm"
                  risk={prediction.forecast_risk}
                  Icon={TrendingUp}
                />
              </div>

              {/* Trend + risk summary card */}
              <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-5">
                <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-4">
                  {t('lstm_forecast_summary')}
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                  {/* Trend */}
                  <div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">{t('lstm_trend')}</p>
                    <div className="flex items-center gap-1 font-medium text-slate-800 dark:text-slate-200">
                      <TrendIcon trend={prediction.trend} />
                      <span className="capitalize">{prediction.trend}</span>
                    </div>
                  </div>
                  {/* Forecast risk */}
                  <div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">{t('lstm_forecast_risk')}</p>
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium capitalize
                      ${riskStyle(prediction.forecast_risk).bg} ${riskStyle(prediction.forecast_risk).text}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${riskStyle(prediction.forecast_risk).dot}`} />
                      {prediction.forecast_risk}
                    </span>
                  </div>
                  {/* Minutes in buffer */}
                  <div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">{t('lstm_buffer_minutes')}</p>
                    <span className="font-medium text-slate-800 dark:text-slate-200">
                      {prediction.minutes_in_buffer} / 60 min
                    </span>
                  </div>
                  {/* Training source */}
                  <div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">{t('lstm_training_source')}</p>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium
                                     bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300
                                     border border-purple-200 dark:border-purple-800">
                      <Database className="w-3 h-3" />
                      {prediction.training_source}
                    </span>
                  </div>
                </div>

                {/* Thresholds */}
                {prediction.thresholds_cm && (
                  <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-700">
                    <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">{t('lstm_thresholds')}</p>
                    <div className="flex flex-wrap gap-3 text-xs">
                      <span className="text-emerald-600 dark:text-emerald-400">
                        Normal: &lt;{prediction.thresholds_cm.normal_max_cm} cm
                      </span>
                      <span className="text-amber-600 dark:text-amber-400">
                        Warning: {prediction.thresholds_cm.normal_max_cm}–{prediction.thresholds_cm.warning_max_cm} cm
                      </span>
                      <span className="text-red-600 dark:text-red-400">
                        Critical: &gt;{prediction.thresholds_cm.warning_max_cm} cm
                      </span>
                    </div>
                  </div>
                )}

                {/* Timestamp */}
                <div className="mt-3 flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500">
                  <Clock className="w-3.5 h-3.5" />
                  {t('lstm_predicted_at')}: {prediction.prediction_timestamp
                    ? new Date(prediction.prediction_timestamp).toLocaleTimeString()
                    : '—'}
                </div>
              </div>

              {/* Model info */}
              {prediction.model_name && (
                <ModelInfoCard prediction={prediction} status={status} t={t} />
              )}
            </div>
          ) : (
            /* ── Prediction not yet available ── */
            <WaitingCard status={status} t={t} />
          )}

          {/* Status panel (always shown) */}
          {status && <StatusPanel status={status} t={t} />}
        </>
      )}

      {/* Last fetch footer */}
      {lastFetch && (
        <p className="text-xs text-slate-400 dark:text-slate-500 text-right">
          {t('lstm_last_updated')}: {formatRelative(lastFetch)}
          {' · '}{t('lstm_refreshes_every')} 60 s
        </p>
      )}
    </div>
  );
}

// ── Model info sub-card ────────────────────────────────────────────────────────
function ModelInfoCard({ prediction, status, t }) {
  const [expanded, setExpanded] = useState(false);
  const meta = status?.meta || {};
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
      <button
        className="w-full flex items-center justify-between p-4 text-sm font-medium
                   text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50
                   transition-colors rounded-xl"
        onClick={() => setExpanded((v) => !v)}
      >
        <span className="flex items-center gap-2">
          <Info className="w-4 h-4 text-slate-400" />
          {t('lstm_model_info')}
        </span>
        <span className="text-xs text-slate-400">{expanded ? '▲' : '▼'}</span>
      </button>
      {expanded && (
        <div className="px-4 pb-4 text-xs text-slate-600 dark:text-slate-400 space-y-2 border-t border-slate-100 dark:border-slate-700 pt-3">
          <div className="flex justify-between">
            <span className="text-slate-500">{t('lstm_model_file')}</span>
            <span className="font-mono">{prediction.model_name}</span>
          </div>
          {meta.window_len && (
            <div className="flex justify-between">
              <span className="text-slate-500">{t('lstm_window_len')}</span>
              <span>{meta.window_len} min</span>
            </div>
          )}
          {meta.feature_names?.length > 0 && (
            <div className="flex justify-between">
              <span className="text-slate-500">{t('lstm_features')}</span>
              <span>{meta.feature_names.join(', ')}</span>
            </div>
          )}
          {meta.test_metrics_lstm && (
            <div className="mt-2 p-2 rounded bg-slate-50 dark:bg-slate-700/50">
              <p className="font-medium text-slate-700 dark:text-slate-300 mb-1">{t('lstm_test_metrics')}</p>
              {Object.entries(meta.test_metrics_lstm).map(([k, v]) => (
                <div key={k} className="flex justify-between">
                  <span>{k}</span>
                  <span className="font-mono">{typeof v === 'number' ? v.toFixed(4) : String(v)}</span>
                </div>
              ))}
            </div>
          )}
          {meta.disclaimer && (
            <p className="italic text-amber-600 dark:text-amber-400 text-xs mt-2 leading-relaxed">
              {meta.disclaimer}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Status panel ───────────────────────────────────────────────────────────────
function StatusPanel({ status, t }) {
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4">
      <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3 flex items-center gap-2">
        <Activity className="w-4 h-4 text-slate-400" />
        {t('lstm_system_status')}
      </h3>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
        <StatusItem
          label={t('lstm_model_ready')}
          ok={status.model_ready}
          t={t}
        />
        <StatusItem
          label={t('lstm_buffer_ready')}
          ok={status.buffer_ready}
          t={t}
        />
        <div>
          <p className="text-slate-500 dark:text-slate-400 mb-0.5">{t('lstm_buffer_fill')}</p>
          <p className="font-medium text-slate-700 dark:text-slate-300">
            {status.minutes_in_buffer} / {status.window_required} min
          </p>
        </div>
        <div>
          <p className="text-slate-500 dark:text-slate-400 mb-0.5">{t('lstm_training_source')}</p>
          <p className="font-medium text-purple-600 dark:text-purple-400">{status.training_source}</p>
        </div>
      </div>
    </div>
  );
}

function StatusItem({ label, ok }) {
  return (
    <div>
      <p className="text-slate-500 dark:text-slate-400 mb-0.5">{label}</p>
      <span className={`inline-flex items-center gap-1 font-medium ${ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'}`}>
        {ok
          ? <CheckCircle2 className="w-3.5 h-3.5" />
          : <Clock className="w-3.5 h-3.5" />}
        {ok ? 'Ready' : 'Waiting'}
      </span>
    </div>
  );
}

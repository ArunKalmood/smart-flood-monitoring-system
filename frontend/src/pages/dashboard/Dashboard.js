import React, { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Droplets, CloudRain, Thermometer, Wind, AlertTriangle, Radio, Battery, Activity, MapPin,
  CheckCircle, Clock, TrendingUp, RefreshCw, Zap, Brain,
} from 'lucide-react';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, ReferenceLine,
} from 'recharts';
import StatCard from '../../components/common/StatCard';
import EmptyState from '../../components/common/EmptyState';
import { dashboardAPI, predictionAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import usePolling from '../../hooks/usePolling';
import { RISK_LEVELS, RISK_STYLES, SEVERITY_STYLES } from '../../constants/status';
import { ageInMinutes, formatDate, formatRelative, formatTime } from '../../utils/datetime';
import { formatNumber, unitFor } from '../../utils/units';
import { timeAxisProps, valueFormatter, withTime } from '../../utils/charts';
import { toastError } from '../../utils/toast';

const REFRESH_MS = 60000;
const DANGER_WATER_LEVEL = 8; // metres — the rule model's highest water-level threshold
const RISK_WINDOW_DAYS = 7;
const STALE_MINUTES = 60; // readings older than this are flagged as delayed
const TOOLTIP_STYLE = { borderRadius: '12px', border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.1)', fontSize: 12 };

function readingCard(t, readings, field, titleKey, icon, color) {
  const reading = readings?.[field];
  return {
    title: t(titleKey),
    value: reading ? formatNumber(reading.value) : null,
    unit: unitFor(field),
    icon,
    color,
    subtitle: reading ? t('dash_measured', { time: formatRelative(reading.recorded_at) }) : t('dash_no_readings'),
  };
}

export default function Dashboard() {
  const { user, can } = useAuth();
  const { t } = useLanguage();
  const [stats, setStats] = useState(null);
  const [trend, setTrend] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [riskStats, setRiskStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async ({ manual = false } = {}) => {
    if (manual) setRefreshing(true);
    const [s, tr, a, r] = await Promise.allSettled([
      dashboardAPI.getStats(), dashboardAPI.getWaterTrend(24), dashboardAPI.getRecentAlerts(), predictionAPI.getStats(RISK_WINDOW_DAYS),
    ]);
    if (s.status === 'fulfilled') setStats(s.value.data);
    if (tr.status === 'fulfilled') setTrend(withTime(tr.value.data || []));
    if (a.status === 'fulfilled') setAlerts(a.value.data || []);
    if (r.status === 'fulfilled') setRiskStats(r.value.data);
    if (manual && [s, tr, a, r].some((x) => x.status === 'rejected')) {
      toastError([s, tr, a, r].find((x) => x.status === 'rejected').reason);
    }
    setLoading(false);
    setRefreshing(false);
  }, []);

  usePolling(load, REFRESH_MS);

  const hour = new Date().getHours();
  const greetingKey = hour < 12 ? 'dash_good_morning' : hour < 17 ? 'dash_good_afternoon' : 'dash_good_evening';
  const firstName = (user?.full_name || user?.name || '').split(' ')[0];
  const readings = stats?.readings;
  const change = stats?.water_level_change_24h;
  const risk = stats?.risk;
  const sensors = stats?.sensors;

  const waterRows = trend.filter((row) => row.water_level !== null && row.water_level !== undefined);
  const rainRows = trend.filter((row) => row.rainfall !== null && row.rainfall !== undefined);
  const riskData = RISK_LEVELS.map((level) => ({ level, value: riskStats?.[level] || 0 })).filter((d) => d.value > 0);
  const riskTotal = riskStats?.total || 0;

  const water = readingCard(t, readings, 'water_level', 'reading_water_level', Droplets, 'blue');
  if (readings?.water_level && change !== null && change !== undefined) {
    water.subtitle = t('dash_change_24h', { change: `${change > 0 ? '+' : ''}${formatNumber(change)} m` });
  }

  const statusRows = [
    {
      icon: Radio, label: t('dash_sensor_network'),
      detail: sensors ? t('dash_sensors_online_of', { online: sensors.online, total: sensors.total }) : '—',
      ok: sensors ? sensors.total > 0 && sensors.online === sensors.total : null,
    },
    {
      icon: Battery, label: t('dash_lowest_battery'),
      detail: sensors?.lowest_battery ? `${sensors.lowest_battery.sensor}: ${formatNumber(sensors.lowest_battery.value)}%` : t('dash_no_battery_data'),
      ok: sensors?.lowest_battery ? sensors.lowest_battery.value >= 20 : null,
    },
    {
      icon: Clock, label: t('dash_last_reading'),
      detail: readings?.recorded_at ? formatRelative(readings.recorded_at) : t('dash_no_readings'),
      ok: readings?.recorded_at ? ageInMinutes(readings.recorded_at) < STALE_MINUTES : null,
    },
    {
      icon: Brain, label: t('dash_live_prediction'),
      detail: risk ? formatRelative(risk.predicted_at) : t('dash_no_live_prediction'),
      ok: risk ? true : null,
    },
  ];

  return (
    <div className="page-container">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-white">
            {firstName ? t(greetingKey, { name: firstName }) : t('nav_dashboard')}
          </h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-0.5">
            {formatDate(new Date())}
            {readings?.recorded_at && <> · {t('dash_data_as_of', { time: formatRelative(readings.recorded_at) })}</>}
          </p>
        </div>
        <button type="button" onClick={() => load({ manual: true })} disabled={refreshing} className="btn-outline py-2 px-3 text-xs">
          <RefreshCw className={`w-3 h-3 ${refreshing ? 'animate-spin' : ''}`} aria-hidden="true" /> {t('action_refresh')}
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard loading={loading} {...water} />
        <StatCard loading={loading} {...readingCard(t, readings, 'rainfall', 'reading_rainfall', CloudRain, 'teal')} />
        <StatCard loading={loading} {...readingCard(t, readings, 'temperature', 'reading_temperature', Thermometer, 'amber')} />
        <StatCard loading={loading} {...readingCard(t, readings, 'humidity', 'reading_humidity', Wind, 'purple')} />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard loading={loading} title={t('dash_flood_risk')} icon={AlertTriangle}
          value={risk ? t(RISK_STYLES[risk.level]?.labelKey || 'risk_unknown') : null}
          color={risk ? RISK_STYLES[risk.level]?.color : 'slate'}
          subtitle={risk ? t('dash_confidence', { pct: Math.round(risk.confidence * 100) }) : t('dash_no_live_prediction')} />
        <StatCard loading={loading} title={t('dash_sensors_online')} icon={Radio} color="green"
          value={sensors ? `${sensors.online}/${sensors.total}` : null}
          subtitle={sensors ? t('dash_sensors_offline', { count: sensors.offline }) : undefined} />
        <StatCard loading={loading} title={t(can('sos.view_all') ? 'dash_active_sos' : 'dash_my_active_sos')} icon={Activity} color="red"
          value={stats?.active_sos} subtitle={t('dash_active_sos_hint')} />
        <StatCard loading={loading} title={t('dash_open_centers')} icon={MapPin} color="blue"
          value={stats?.open_evacuation_centers} subtitle={t('dash_open_centers_hint')} />
      </div>

      <div className="grid lg:grid-cols-3 gap-6 mb-6">
        <section className="lg:col-span-2 glass-card p-5" aria-labelledby="water-trend-title">
          <h2 id="water-trend-title" className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-4 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-blue-500" aria-hidden="true" /> {t('dash_water_trend')}
          </h2>
          {waterRows.length === 0 ? (
            <EmptyState icon={Droplets} title={t('dash_no_readings_24h')} message={t('dash_no_readings_24h_hint')} />
          ) : (
            <>
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={waterRows} margin={{ right: 16 }}>
                  <defs>
                    <linearGradient id="waterGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#94a3b8" strokeOpacity={0.25} />
                  <XAxis {...timeAxisProps(waterRows)} tick={{ fontSize: 10 }} tickLine={false} />
                  <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} unit=" m" width={48} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} labelFormatter={(v) => formatTime(v)}
                    formatter={valueFormatter('m')} />
                  <Area type="monotone" dataKey="water_level" name={t('reading_water_level')} stroke="#3b82f6" fill="url(#waterGrad)" strokeWidth={2} dot={waterRows.length < 3} />
                  <ReferenceLine y={DANGER_WATER_LEVEL} stroke="#ef4444" strokeDasharray="4 4" />
                </AreaChart>
              </ResponsiveContainer>
              <div className="flex items-center gap-3 mt-2 text-xs text-slate-500">
                <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-blue-500 rounded" /> {t('reading_water_level')}</span>
                <span className="flex items-center gap-1"><span className="w-3 border-t border-dashed border-red-400" /> {t('dash_danger_threshold', { value: DANGER_WATER_LEVEL })}</span>
              </div>
            </>
          )}
        </section>

        <section className="glass-card p-5" aria-labelledby="risk-dist-title">
          <h2 id="risk-dist-title" className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1 flex items-center gap-2">
            <Zap className="w-4 h-4 text-amber-500" aria-hidden="true" /> {t('dash_risk_distribution')}
          </h2>
          <p className="text-xs text-slate-500 mb-3">{t('dash_risk_distribution_hint', { days: RISK_WINDOW_DAYS })}</p>
          {riskTotal === 0 ? (
            <EmptyState icon={Brain} title={t('dash_no_live_predictions_period')} compact />
          ) : (
            <>
              <ResponsiveContainer width="100%" height={160}>
                <PieChart>
                  <Pie data={riskData} cx="50%" cy="50%" innerRadius={45} outerRadius={70} paddingAngle={4} dataKey="value" nameKey="level">
                    {riskData.map((d) => <Cell key={d.level} fill={RISK_STYLES[d.level].fill} />)}
                  </Pie>
                  <Tooltip formatter={(v, name) => [v, t(RISK_STYLES[name].labelKey)]} />
                </PieChart>
              </ResponsiveContainer>
              <ul className="space-y-1 mt-2">
                {RISK_LEVELS.map((level) => (
                  <li key={level} className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: RISK_STYLES[level].fill }} />
                      {t(RISK_STYLES[level].labelKey)}
                    </span>
                    <span className="font-medium text-slate-700 dark:text-slate-300">
                      {Math.round(((riskStats?.[level] || 0) / riskTotal) * 100)}% ({riskStats?.[level] || 0})
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      </div>

      <div className="grid lg:grid-cols-2 gap-6 mb-6">
        <section className="glass-card p-5" aria-labelledby="rain-trend-title">
          <h2 id="rain-trend-title" className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-4 flex items-center gap-2">
            <CloudRain className="w-4 h-4 text-cyan-500" aria-hidden="true" /> {t('dash_rain_trend')}
          </h2>
          {rainRows.length === 0 ? (
            <EmptyState icon={CloudRain} title={t('dash_no_readings_24h')} compact />
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={rainRows} margin={{ right: 16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#94a3b8" strokeOpacity={0.25} />
                <XAxis {...timeAxisProps(rainRows)} tick={{ fontSize: 10 }} tickLine={false} />
                <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} unit=" mm/h" width={60} />
                <Tooltip contentStyle={TOOLTIP_STYLE} labelFormatter={(v) => formatTime(v)} formatter={valueFormatter('mm/h')} />
                <Bar dataKey="rainfall" name={t('reading_rainfall')} fill="#06b6d4" radius={[4, 4, 0, 0]} maxBarSize={30} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </section>

        <section className="glass-card p-5" aria-labelledby="alerts-title">
          <h2 id="alerts-title" className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-4 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-500" aria-hidden="true" /> {t('dash_active_alerts')}
          </h2>
          {loading ? (
            <div className="space-y-3">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-12 w-full" />)}</div>
          ) : alerts.length === 0 ? (
            <EmptyState icon={CheckCircle} title={t('dash_no_alerts')} compact />
          ) : (
            <ul className="space-y-2">
              {alerts.slice(0, 4).map((alert) => (
                <li key={alert.id} className={`flex items-start gap-3 p-3 rounded-xl border text-sm ${SEVERITY_STYLES[alert.severity] || SEVERITY_STYLES.medium}`}>
                  <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" aria-hidden="true" />
                  <div>
                    <p className="font-medium">{alert.title}</p>
                    <p className="text-xs opacity-80 mt-0.5 flex items-center gap-1">
                      <Clock className="w-3 h-3" aria-hidden="true" /> {formatRelative(alert.created_at)}
                      {alert.affected_area && <> · {alert.affected_area}</>}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <Link to="/dashboard/predictions" className="block mt-3 text-xs text-blue-600 dark:text-blue-400 hover:underline text-right">
            {t('dash_view_predictions')}
          </Link>
        </section>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <section className="glass-card p-5" aria-labelledby="status-title">
          <h2 id="status-title" className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-4">{t('dash_system_status')}</h2>
          <ul className="space-y-3">
            {statusRows.map((s) => (
              <li key={s.label} className="flex items-center gap-3 p-2 rounded-lg">
                <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-700 flex items-center justify-center">
                  <s.icon className="w-4 h-4 text-slate-600 dark:text-slate-400" aria-hidden="true" />
                </div>
                <div className="flex-1">
                  <p className="text-xs font-medium text-slate-700 dark:text-slate-300">{s.label}</p>
                  <p className="text-xs text-slate-500">{s.detail}</p>
                </div>
                <span className={`flex items-center gap-1 text-xs font-medium ${s.ok === null ? 'text-slate-400' : s.ok ? 'text-green-600 dark:text-green-400' : 'text-amber-600 dark:text-amber-400'}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${s.ok === null ? 'bg-slate-400' : s.ok ? 'bg-green-500' : 'bg-amber-500'}`} />
                  {t(s.ok === null ? 'status_no_data' : s.ok ? 'status_ok' : 'status_attention')}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="glass-card p-5" aria-labelledby="actions-title">
          <h2 id="actions-title" className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-4">{t('dash_quick_actions')}</h2>
          <div className="grid grid-cols-2 gap-3">
            {[
              { labelKey: 'dash_action_sos', icon: AlertTriangle, to: '/dashboard/sos', color: 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border-red-200 dark:border-red-800/30' },
              { labelKey: 'dash_action_sensors', icon: Radio, to: '/dashboard/sensors', color: 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800/30' },
              { labelKey: 'dash_action_simulate', icon: Brain, to: '/dashboard/predictions', color: 'bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400 border-purple-200 dark:border-purple-800/30' },
              { labelKey: 'nav_routes', icon: MapPin, to: '/dashboard/routes', color: 'bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 border-green-200 dark:border-green-800/30' },
            ].map((a) => (
              <Link key={a.to} to={a.to} className={`flex flex-col items-center gap-2 p-4 rounded-xl border font-medium text-xs transition-transform hover:scale-105 ${a.color}`}>
                <a.icon className="w-6 h-6" aria-hidden="true" /> {t(a.labelKey)}
              </Link>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

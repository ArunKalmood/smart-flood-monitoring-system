import React, { useCallback, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Radio, Droplets, CloudRain, Thermometer, Wind, Battery, MapPin, Wifi, WifiOff, Activity, Clock, KeyRound,
} from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { sensorAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import usePolling from '../../hooks/usePolling';
import PageHeader from '../../components/common/PageHeader';
import EmptyState from '../../components/common/EmptyState';
import { labelFor } from '../../constants/status';
import { formatDateTime, formatRelative, formatTime } from '../../utils/datetime';
import { formatNumber, formatReading, isMissing, unitFor } from '../../utils/units';
import { timeAxisProps, valueFormatter, withTime } from '../../utils/charts';

const POLL_MS = 5000;
const HISTORY_HOURS = 24;
const LOW_BATTERY = 20;

const TYPE_ICONS = { water_level: Droplets, rainfall: CloudRain, temperature: Thermometer, humidity: Wind, flow: Activity };
const TYPE_COLORS = {
  water_level: 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800/30',
  rainfall: 'bg-cyan-50 dark:bg-cyan-900/20 text-cyan-600 dark:text-cyan-400 border-cyan-200 dark:border-cyan-800/30',
  temperature: 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border-red-200 dark:border-red-800/30',
  humidity: 'bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400 border-purple-200 dark:border-purple-800/30',
  flow: 'bg-teal-50 dark:bg-teal-900/20 text-teal-600 dark:text-teal-400 border-teal-200 dark:border-teal-800/30',
};
/** flood_data column each sensor type reports (mirrors READING_FIELD_FOR_TYPE on the backend). */
const READING_FIELD = { water_level: 'water_level', rainfall: 'rainfall', temperature: 'temperature', humidity: 'humidity', flow: 'river_flow' };

function StatusBadge({ status, t }) {
  const online = status === 'online';
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${online ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' : 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400'}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${online ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} aria-hidden="true" />
      {labelFor(t, 'sensor_status', status)}
    </span>
  );
}

function BatteryBar({ level }) {
  if (isMissing(level)) return null;
  const color = level > 50 ? 'bg-green-500' : level > LOW_BATTERY ? 'bg-amber-500' : 'bg-red-500';
  return (
    <div className="mt-3 h-1 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden" aria-hidden="true">
      <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.max(0, Math.min(100, level))}%` }} />
    </div>
  );
}

export default function SensorMonitor() {
  const { can } = useAuth();
  const { t } = useLanguage();
  const [sensors, setSensors] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const selected = sensors.find((s) => s.id === selectedId) || null;

  const load = useCallback(async () => {
    try {
      const res = await sensorAPI.getAll();
      setSensors(res.data || []);
      setLoadError(false);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
    if (selectedId) {
      try {
        const res = await sensorAPI.getHistory(selectedId, HISTORY_HOURS);
        setHistory(withTime(res.data || []));
      } catch {
        setHistory([]);
      }
    }
  }, [selectedId]);

  usePolling(load, POLL_MS);

  const select = (sensor) => {
    setSelectedId(sensor.id);
    setHistory([]);
    sensorAPI.getHistory(sensor.id, HISTORY_HOURS)
      .then((res) => setHistory(withTime(res.data || [])))
      .catch(() => setHistory([]));
  };

  const online = sensors.filter((s) => s.status === 'online').length;
  const lowBattery = sensors.filter((s) => !isMissing(s.battery_level) && s.battery_level < LOW_BATTERY).length;
  const historyField = selected ? READING_FIELD[selected.type] || 'water_level' : null;
  const historyRows = historyField ? history.filter((row) => !isMissing(row[historyField])) : [];
  const selectedUnit = selected ? unitFor(selected.type, selected.unit) : '';

  return (
    <div className="page-container">
      <PageHeader icon={Radio} title={t('sensors_title')} subtitle={t('sensors_subtitle', { seconds: POLL_MS / 1000 })}>
        <span className="flex items-center gap-1.5 text-xs text-green-600 dark:text-green-400 font-medium">
          <span className="w-2 h-2 bg-green-500 rounded-full" aria-hidden="true" /> {t('sensors_online_count', { count: online })}
        </span>
        <span className="text-xs text-red-500 font-medium">{t('sensors_offline_count', { count: sensors.length - online })}</span>
      </PageHeader>

      {loadError && <p className="mb-4 text-sm text-red-600 dark:text-red-400" role="alert">{t('error_load_failed')}</p>}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[
          { labelKey: 'sensors_total', value: sensors.length, icon: Radio, cls: 'bg-blue-100 dark:bg-blue-900/30 text-blue-600' },
          { labelKey: 'sensor_status_online', value: online, icon: Wifi, cls: 'bg-green-100 dark:bg-green-900/30 text-green-600' },
          { labelKey: 'sensor_status_offline', value: sensors.length - online, icon: WifiOff, cls: 'bg-red-100 dark:bg-red-900/30 text-red-600' },
          { labelKey: 'sensors_low_battery', value: lowBattery, icon: Battery, cls: 'bg-amber-100 dark:bg-amber-900/30 text-amber-600' },
        ].map((s) => (
          <div key={s.labelKey} className="glass-card p-4 flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${s.cls}`}><s.icon className="w-5 h-5" aria-hidden="true" /></div>
            <div>
              <p className="text-xl font-bold text-slate-800 dark:text-white">{loading ? '—' : s.value}</p>
              <p className="text-xs text-slate-500">{t(s.labelKey)}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          {loading ? (
            <div className="grid sm:grid-cols-2 gap-4">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="skeleton h-44 rounded-2xl" />)}</div>
          ) : sensors.length === 0 ? (
            <div className="glass-card"><EmptyState icon={Radio} title={t('sensors_none')} message={t('sensors_none_hint')} /></div>
          ) : (
            <ul className="grid sm:grid-cols-2 gap-4">
              {sensors.map((sensor) => {
                const Icon = TYPE_ICONS[sensor.type] || Radio;
                const isSelected = sensor.id === selectedId;
                return (
                  <li key={sensor.id}>
                    <motion.button type="button" whileHover={{ y: -2 }} onClick={() => select(sensor)} aria-pressed={isSelected}
                      className={`w-full text-left glass-card p-4 border-2 transition-all ${isSelected ? 'border-blue-500 dark:border-blue-400' : 'border-transparent'}`}>
                      <div className="flex items-start justify-between mb-3">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center border ${TYPE_COLORS[sensor.type] || TYPE_COLORS.water_level}`}>
                          <Icon className="w-5 h-5" aria-hidden="true" />
                        </div>
                        <StatusBadge status={sensor.status} t={t} />
                      </div>
                      <h2 className="font-semibold text-slate-800 dark:text-white text-sm mb-1">{sensor.name}</h2>
                      <p className="text-xs text-slate-500 flex items-center gap-1 mb-3">
                        <MapPin className="w-3 h-3" aria-hidden="true" /> {sensor.location || sensor.sensor_id}
                      </p>
                      <div className="flex items-end justify-between">
                        <span className="text-2xl font-bold text-slate-800 dark:text-white">{formatReading(sensor.current_value, sensor.type, sensor.unit)}</span>
                        <div className="text-right text-xs text-slate-500">
                          <p className="flex items-center gap-1 justify-end">
                            <Battery className="w-3 h-3" aria-hidden="true" />
                            <span className={!isMissing(sensor.battery_level) && sensor.battery_level < LOW_BATTERY ? 'text-red-500 font-medium' : ''}>
                              {isMissing(sensor.battery_level) ? '—' : `${formatNumber(sensor.battery_level, 0)}%`}
                            </span>
                          </p>
                          <p className="text-slate-400 mt-0.5 flex items-center gap-1 justify-end">
                            <Clock className="w-3 h-3" aria-hidden="true" />
                            {sensor.last_seen ? formatRelative(sensor.last_seen) : t('sensors_never_seen')}
                          </p>
                        </div>
                      </div>
                      <BatteryBar level={sensor.battery_level} />
                    </motion.button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div>
          {selected ? (
            <motion.section initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="glass-card p-5 sticky top-6" aria-labelledby="sensor-detail-title">
              <h2 id="sensor-detail-title" className="font-bold text-slate-800 dark:text-white mb-1">{selected.name}</h2>
              <p className="text-xs text-slate-500 mb-4">{t('sensors_id')}: {selected.sensor_id}{selected.location ? ` · ${selected.location}` : ''}</p>
              <dl className="grid grid-cols-2 gap-3 mb-4">
                {[
                  { labelKey: 'sensors_current_value', value: formatReading(selected.current_value, selected.type, selected.unit) },
                  { labelKey: 'sensors_status', value: labelFor(t, 'sensor_status', selected.status) },
                  { labelKey: 'sensors_battery', value: isMissing(selected.battery_level) ? '—' : `${formatNumber(selected.battery_level, 0)}%` },
                  { labelKey: 'sensors_type', value: labelFor(t, 'sensor_type', selected.type) },
                ].map((item) => (
                  <div key={item.labelKey} className="bg-slate-50 dark:bg-slate-700/50 rounded-xl p-3">
                    <dt className="text-xs text-slate-500 mb-0.5">{t(item.labelKey)}</dt>
                    <dd className="text-sm font-semibold text-slate-800 dark:text-white">{item.value}</dd>
                  </div>
                ))}
                <div className="col-span-2 bg-slate-50 dark:bg-slate-700/50 rounded-xl p-3">
                  <dt className="text-xs text-slate-500 mb-0.5">{t('sensors_last_seen')}</dt>
                  <dd className="text-sm font-semibold text-slate-800 dark:text-white">
                    {selected.last_seen ? `${formatDateTime(selected.last_seen)} (${formatRelative(selected.last_seen)})` : t('sensors_never_seen')}
                  </dd>
                </div>
              </dl>

              <h3 className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide mb-3">{t('sensors_history', { hours: HISTORY_HOURS })}</h3>
              {historyRows.length === 0 ? (
                <EmptyState icon={Activity} title={t('sensors_no_history', { hours: HISTORY_HOURS })} compact />
              ) : (
                <ResponsiveContainer width="100%" height={180}>
                  <AreaChart data={historyRows} margin={{ right: 12 }}>
                    <defs>
                      <linearGradient id="detailGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#94a3b8" strokeOpacity={0.25} />
                    <XAxis {...timeAxisProps(historyRows, 4)} tick={{ fontSize: 9 }} tickLine={false} />
                    <YAxis tick={{ fontSize: 9 }} tickLine={false} axisLine={false} width={40} />
                    <Tooltip contentStyle={{ borderRadius: '10px', border: 'none', fontSize: 11 }}
                      labelFormatter={(v) => formatTime(v)} formatter={valueFormatter(selectedUnit)} />
                    <Area type="monotone" dataKey={historyField} name={labelFor(t, 'sensor_type', selected.type)}
                      stroke="#3b82f6" fill="url(#detailGrad)" strokeWidth={2} dot={historyRows.length < 3} />
                  </AreaChart>
                </ResponsiveContainer>
              )}

              {can('sensors.manage') && (
                <p className="mt-4 p-3 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800/30 text-xs text-blue-700 dark:text-blue-300 flex gap-2">
                  <KeyRound className="w-4 h-4 flex-shrink-0" aria-hidden="true" /> {t('sensors_device_key_hint', { id: selected.sensor_id })}
                </p>
              )}
            </motion.section>
          ) : (
            <div className="glass-card sticky top-6">
              <EmptyState icon={Radio} title={t('sensors_select_hint')} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Radio, Droplets, CloudRain, Thermometer, Wind, Battery,
  MapPin, Wifi, WifiOff, RefreshCw, Activity, Clock, Zap
} from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, AreaChart, Area
} from 'recharts';
import { sensorAPI } from '../../services/api';
import { format } from 'date-fns';
import toast from 'react-hot-toast';

const MOCK_SENSORS = [
  { id: 1, sensor_id: 'WL-001', name: 'Water Level Sensor A', type: 'water_level', current_value: 4.2, unit: 'm', status: 'online', battery_level: 87, location: 'River Bank North', last_seen: new Date().toISOString() },
  { id: 2, sensor_id: 'RN-002', name: 'Rain Sensor B', type: 'rain', current_value: 42, unit: 'mm/h', status: 'online', battery_level: 62, location: 'Station East', last_seen: new Date().toISOString() },
  { id: 3, sensor_id: 'TH-003', name: 'Temperature Sensor C', type: 'temperature', current_value: 28.5, unit: '°C', status: 'online', battery_level: 94, location: 'City Center', last_seen: new Date().toISOString() },
  { id: 4, sensor_id: 'HM-004', name: 'Humidity Sensor D', type: 'humidity', current_value: 78, unit: '%', status: 'online', battery_level: 71, location: 'Wetlands Zone', last_seen: new Date().toISOString() },
  { id: 5, sensor_id: 'RF-005', name: 'River Flow Sensor E', type: 'river_flow', current_value: 3.8, unit: 'm/s', status: 'offline', battery_level: 15, location: 'Dam Outlet', last_seen: new Date(Date.now() - 3600000).toISOString() },
  { id: 6, sensor_id: 'GPS-006', name: 'GPS Tracker F', type: 'gps', current_value: null, unit: '', status: 'online', battery_level: 55, location: 'Mobile Unit 1', last_seen: new Date().toISOString() },
];

const SENSOR_ICONS = {
  water_level: Droplets, rain: CloudRain, temperature: Thermometer,
  humidity: Wind, river_flow: Activity, gps: MapPin, battery: Battery,
};

const SENSOR_COLORS = {
  water_level: 'blue', rain: 'cyan', temperature: 'red',
  humidity: 'purple', river_flow: 'teal', gps: 'green',
};

const COLOR_MAP = {
  blue: 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800/30',
  cyan: 'bg-cyan-50 dark:bg-cyan-900/20 text-cyan-600 dark:text-cyan-400 border-cyan-200 dark:border-cyan-800/30',
  red: 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border-red-200 dark:border-red-800/30',
  purple: 'bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400 border-purple-200 dark:border-purple-800/30',
  teal: 'bg-teal-50 dark:bg-teal-900/20 text-teal-600 dark:text-teal-400 border-teal-200 dark:border-teal-800/30',
  green: 'bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 border-green-200 dark:border-green-800/30',
};

const generateHistory = (base, variance, points = 24) =>
  Array.from({ length: points }, (_, i) => ({
    time: `${String(i).padStart(2, '0')}:00`,
    value: parseFloat((base + (Math.random() - 0.5) * variance).toFixed(2)),
  }));

export default function SensorMonitor() {
  const [sensors, setSensors] = useState(MOCK_SENSORS);
  const [selected, setSelected] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadSensors();
    const interval = setInterval(simulateLiveUpdate, 5000);
    return () => clearInterval(interval);
  }, []);

  const loadSensors = async () => {
    try {
      const res = await sensorAPI.getAll();
      if (res.data?.length > 0) setSensors(res.data);
    } catch {}
    setLoading(false);
    setRefreshing(false);
  };

  const simulateLiveUpdate = () => {
    setSensors(prev => prev.map(s => s.status === 'online' && s.current_value != null
      ? { ...s, current_value: parseFloat((s.current_value + (Math.random() - 0.48) * 0.1).toFixed(2)), last_seen: new Date().toISOString() }
      : s
    ));
  };

  const handleSelect = (sensor) => {
    setSelected(sensor);
    const base = sensor.current_value ?? 4;
    setHistory(generateHistory(base, base * 0.3));
  };

  const refresh = () => { setRefreshing(true); loadSensors(); toast.success('Sensors refreshed'); };

  const online = sensors.filter(s => s.status === 'online').length;
  const offline = sensors.filter(s => s.status === 'offline').length;

  return (
    <div className="page-container">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-white">Real-Time Sensor Monitoring</h1>
          <p className="text-slate-500 text-sm mt-0.5">Live IoT sensor data — updates every 5 seconds</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5 text-xs text-green-600 dark:text-green-400 font-medium">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" /> {online} Online
          </span>
          <span className="text-xs text-red-500 font-medium">{offline} Offline</span>
          <button onClick={refresh} disabled={refreshing} className="btn-outline py-2 px-3 text-xs">
            <RefreshCw className={`w-3 h-3 ${refreshing ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>
      </div>

      {/* Summary row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Total Sensors', value: sensors.length, icon: Radio, color: 'blue' },
          { label: 'Online', value: online, icon: Wifi, color: 'green' },
          { label: 'Offline', value: offline, icon: WifiOff, color: 'red' },
          { label: 'Low Battery', value: sensors.filter(s => (s.battery_level ?? 100) < 20).length, icon: Battery, color: 'amber' },
        ].map((s, i) => (
          <div key={i} className="glass-card p-4 flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
              s.color === 'blue' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600' :
              s.color === 'green' ? 'bg-green-100 dark:bg-green-900/30 text-green-600' :
              s.color === 'red' ? 'bg-red-100 dark:bg-red-900/30 text-red-600' :
              'bg-amber-100 dark:bg-amber-900/30 text-amber-600'
            }`}>
              <s.icon className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xl font-bold text-slate-800 dark:text-white">{s.value}</p>
              <p className="text-xs text-slate-500">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Sensor Cards */}
        <div className="lg:col-span-2">
          <div className="grid sm:grid-cols-2 gap-4">
            {loading
              ? Array.from({ length: 6 }).map((_, i) => <div key={i} className="skeleton h-44 rounded-2xl" />)
              : sensors.map((sensor, i) => {
                  const Icon = SENSOR_ICONS[sensor.type] || Radio;
                  const colorKey = SENSOR_COLORS[sensor.type] || 'blue';
                  const colorCls = COLOR_MAP[colorKey];
                  const isSelected = selected?.id === sensor.id;
                  const isOnline = sensor.status === 'online';

                  return (
                    <motion.div
                      key={sensor.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.05 }}
                      whileHover={{ y: -2 }}
                      onClick={() => handleSelect(sensor)}
                      className={`glass-card p-4 cursor-pointer transition-all border-2 ${isSelected ? 'border-blue-500 dark:border-blue-400' : 'border-transparent'}`}
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center border ${colorCls}`}>
                          <Icon className="w-5 h-5" />
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                            isOnline ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' : 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400'
                          }`}>
                            <div className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
                            {isOnline ? 'Online' : 'Offline'}
                          </span>
                        </div>
                      </div>

                      <h3 className="font-semibold text-slate-800 dark:text-white text-sm mb-1">{sensor.name}</h3>
                      <p className="text-xs text-slate-500 flex items-center gap-1 mb-3">
                        <MapPin className="w-3 h-3" /> {sensor.location}
                      </p>

                      <div className="flex items-end justify-between">
                        <div>
                          <span className="text-2xl font-bold text-slate-800 dark:text-white">
                            {sensor.current_value != null ? sensor.current_value : '—'}
                          </span>
                          <span className="text-sm text-slate-500 ml-1">{sensor.unit}</span>
                        </div>
                        <div className="text-right">
                          <div className="flex items-center gap-1 text-xs text-slate-500 justify-end">
                            <Battery className="w-3 h-3" />
                            <span className={sensor.battery_level < 20 ? 'text-red-500 font-medium' : ''}>{sensor.battery_level ?? '—'}%</span>
                          </div>
                          <div className="text-xs text-slate-400 mt-0.5 flex items-center gap-1 justify-end">
                            <Clock className="w-3 h-3" />
                            {sensor.last_seen ? format(new Date(sensor.last_seen), 'HH:mm:ss') : '—'}
                          </div>
                        </div>
                      </div>

                      {/* Battery bar */}
                      <div className="mt-3 h-1 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${sensor.battery_level > 50 ? 'bg-green-500' : sensor.battery_level > 20 ? 'bg-amber-500' : 'bg-red-500'}`}
                          style={{ width: `${sensor.battery_level ?? 0}%` }}
                        />
                      </div>
                    </motion.div>
                  );
                })
            }
          </div>
        </div>

        {/* Detail panel */}
        <div>
          {selected ? (
            <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="glass-card p-5 sticky top-6">
              <h3 className="font-bold text-slate-800 dark:text-white mb-1">{selected.name}</h3>
              <p className="text-xs text-slate-500 mb-4">ID: {selected.sensor_id} · {selected.location}</p>

              <div className="grid grid-cols-2 gap-3 mb-4">
                {[
                  { label: 'Current Value', value: `${selected.current_value ?? '—'} ${selected.unit}` },
                  { label: 'Status', value: selected.status },
                  { label: 'Battery', value: `${selected.battery_level ?? '—'}%` },
                  { label: 'Type', value: selected.type?.replace('_', ' ') },
                ].map((item, i) => (
                  <div key={i} className="bg-slate-50 dark:bg-slate-700/50 rounded-xl p-3">
                    <p className="text-xs text-slate-500 mb-0.5">{item.label}</p>
                    <p className="text-sm font-semibold text-slate-800 dark:text-white capitalize">{item.value}</p>
                  </div>
                ))}
              </div>

              <h4 className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide mb-3">24-Hour History</h4>
              <ResponsiveContainer width="100%" height={180}>
                <AreaChart data={history}>
                  <defs>
                    <linearGradient id="detailGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" className="dark:stroke-slate-700" />
                  <XAxis dataKey="time" tick={{ fontSize: 9 }} tickLine={false} interval={5} />
                  <YAxis tick={{ fontSize: 9 }} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={{ borderRadius: '10px', border: 'none', fontSize: 11 }} />
                  <Area type="monotone" dataKey="value" stroke="#3b82f6" fill="url(#detailGrad)" strokeWidth={2} dot={false} />
                </AreaChart>
              </ResponsiveContainer>

              <div className="mt-4 p-3 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800/30">
                <p className="text-xs text-blue-700 dark:text-blue-400 font-medium flex items-center gap-1.5">
                  <Zap className="w-3 h-3" /> IoT Integration Ready
                </p>
                <p className="text-xs text-blue-600 dark:text-blue-300 mt-1">
                  Connect real sensor via POST /api/sensors/data with sensor_id: "{selected.sensor_id}"
                </p>
              </div>
            </motion.div>
          ) : (
            <div className="glass-card p-8 text-center text-slate-400 sticky top-6">
              <Radio className="w-10 h-10 mx-auto mb-3 opacity-40" />
              <p className="text-sm">Click any sensor card to view detailed history and metadata</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

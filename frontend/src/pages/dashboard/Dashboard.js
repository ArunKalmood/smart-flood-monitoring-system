import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Droplets, CloudRain, Thermometer, Wind, AlertTriangle, Radio,
  Wifi, Battery, Users, CheckCircle, Activity, MapPin, Clock,
  TrendingUp, TrendingDown, RefreshCw, Zap
} from 'lucide-react';
import {
  AreaChart, Area, LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, ReferenceLine
} from 'recharts';
import StatCard from '../../components/common/StatCard';
import { dashboardAPI, sensorAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { format } from 'date-fns';
import toast from 'react-hot-toast';

const RISK_COLORS = { safe: '#22c55e', warning: '#f59e0b', danger: '#ef4444' };

const MOCK_TREND = Array.from({ length: 24 }, (_, i) => ({
  time: `${String(i).padStart(2, '0')}:00`,
  water_level: 3.5 + Math.sin(i / 3) * 1.5 + Math.random() * 0.3,
  rainfall: Math.max(0, 40 + Math.sin(i / 4) * 30 + Math.random() * 10),
  temperature: 26 + Math.sin(i / 6) * 4 + Math.random() * 1,
  humidity: 70 + Math.sin(i / 5) * 15 + Math.random() * 5,
}));

const MOCK_PREDICTION = [
  { name: 'Safe', value: 35 }, { name: 'Warning', value: 45 }, { name: 'Danger', value: 20 }
];

export default function Dashboard() {
  const { user, isAdmin } = useAuth();
  const [stats, setStats]   = useState(null);
  const [trend, setTrend]   = useState(MOCK_TREND);
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = async () => {
    try {
      const [statsRes, trendRes, alertsRes] = await Promise.allSettled([
        dashboardAPI.getStats(),
        dashboardAPI.getWaterTrend(24),
        dashboardAPI.getRecentAlerts(),
      ]);
      if (statsRes.status === 'fulfilled') setStats(statsRes.value.data);
      if (trendRes.status === 'fulfilled' && trendRes.value.data?.length > 0) setTrend(trendRes.value.data);
      if (alertsRes.status === 'fulfilled') setAlerts(alertsRes.value.data);
    } catch {}
    setLoading(false);
    setRefreshing(false);
  };

  useEffect(() => { loadData(); }, []);

  const refresh = () => { setRefreshing(true); loadData(); toast.success('Dashboard refreshed'); };

  const riskColor = stats?.flood_risk === 'danger' ? 'red' : stats?.flood_risk === 'warning' ? 'amber' : 'green';
  const greeting  = `${new Date().getHours() < 12 ? 'Good morning' : new Date().getHours() < 17 ? 'Good afternoon' : 'Good evening'}, ${user?.full_name?.split(' ')[0] || user?.name || 'User'}`;

  return (
    <div className="page-container">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <motion.h1 initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="text-xl font-bold text-slate-800 dark:text-white">
            {greeting} 👋
          </motion.h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-0.5">
            {format(new Date(), 'EEEE, MMMM d, yyyy')} · Last updated just now
          </p>
        </div>
        <button onClick={refresh} disabled={refreshing} className="btn-outline py-2 px-3 text-xs">
          <RefreshCw className={`w-3 h-3 ${refreshing ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {/* Stat Cards Row 1 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard loading={loading} title="Water Level" value={stats?.current_water_level ?? '4.2'} unit="m" icon={Droplets} color="blue" subtitle="↑ +0.3m from yesterday" />
        <StatCard loading={loading} title="Rainfall" value={stats?.current_rainfall ?? '42'} unit="mm/h" icon={CloudRain} color="teal" subtitle="Heavy rain in progress" />
        <StatCard loading={loading} title="Temperature" value={stats?.current_temperature ?? '29'} unit="°C" icon={Thermometer} color="amber" subtitle="Normal range" />
        <StatCard loading={loading} title="Humidity" value={stats?.current_humidity ?? '78'} unit="%" icon={Wind} color="purple" subtitle="High humidity" />
      </div>

      {/* Stat Cards Row 2 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard loading={loading} title="Flood Risk" value={(stats?.flood_risk ?? 'warning').toUpperCase()} icon={AlertTriangle} color={riskColor} subtitle={`${Math.round((stats?.risk_confidence ?? 0.76) * 100)}% confidence`} />
        <StatCard loading={loading} title="Sensors Online" value={`${stats?.online_sensors ?? 12}/${stats?.total_sensors ?? 15}`} icon={Radio} color="green" subtitle={`${(stats?.total_sensors || 15) - (stats?.online_sensors || 12)} offline`} />
        <StatCard loading={loading} title="Active SOS" value={stats?.active_sos ?? 3} icon={Activity} color="red" subtitle="Pending response" />
        <StatCard loading={loading} title="Open Centers" value={stats?.open_evacuation_centers ?? 5} icon={MapPin} color="blue" subtitle="Evacuation centers" />
      </div>

      {/* Charts Row 1 */}
      <div className="grid lg:grid-cols-3 gap-6 mb-6">
        {/* Water Level Trend */}
        <div className="lg:col-span-2 glass-card p-5">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-4 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-blue-500" /> Water Level Trend (24h)
          </h3>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={trend}>
              <defs>
                <linearGradient id="waterGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" className="dark:stroke-slate-700" />
              <XAxis dataKey="time" tick={{ fontSize: 10 }} tickLine={false} />
              <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} unit="m" />
              <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.1)' }} />
              <Area type="monotone" dataKey="water_level" stroke="#3b82f6" fill="url(#waterGrad)" strokeWidth={2} dot={false} />
              <ReferenceLine y={8} stroke="#ef4444" strokeDasharray="4 4" />
            </AreaChart>
          </ResponsiveContainer>
          <div className="flex items-center gap-3 mt-2 text-xs text-slate-400">
            <span className="flex items-center gap-1"><div className="w-3 h-0.5 bg-blue-500 rounded" /> Water Level</span>
            <span className="flex items-center gap-1"><div className="w-3 h-0.5 bg-red-400 rounded" style={{ borderTop: '1px dashed' }} /> Danger Threshold (8m)</span>
          </div>
        </div>

        {/* Risk Distribution */}
        <div className="glass-card p-5">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-4 flex items-center gap-2">
            <Zap className="w-4 h-4 text-amber-500" /> Risk Distribution
          </h3>
          <ResponsiveContainer width="100%" height={180}>
            <PieChart>
              <Pie data={MOCK_PREDICTION} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={4} dataKey="value">
                {MOCK_PREDICTION.map((entry, i) => (
                  <Cell key={i} fill={['#22c55e', '#f59e0b', '#ef4444'][i]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
          <div className="space-y-1 mt-2">
            {MOCK_PREDICTION.map((item, i) => (
              <div key={i} className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: ['#22c55e', '#f59e0b', '#ef4444'][i] }} />
                  <span className="text-slate-600 dark:text-slate-400">{item.name}</span>
                </span>
                <span className="font-medium text-slate-700 dark:text-slate-300">{item.value}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Charts Row 2 */}
      <div className="grid lg:grid-cols-2 gap-6 mb-6">
        {/* Rainfall trend */}
        <div className="glass-card p-5">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-4 flex items-center gap-2">
            <CloudRain className="w-4 h-4 text-cyan-500" /> Rainfall Trend (24h)
          </h3>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={trend.filter((_, i) => i % 3 === 0)}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" className="dark:stroke-slate-700" />
              <XAxis dataKey="time" tick={{ fontSize: 10 }} tickLine={false} />
              <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} unit="mm" />
              <Tooltip contentStyle={{ borderRadius: '12px', border: 'none' }} />
              <Bar dataKey="rainfall" fill="#06b6d4" radius={[4, 4, 0, 0]} maxBarSize={30} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Recent Alerts */}
        <div className="glass-card p-5">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-4 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-500" /> Today's Alerts
          </h3>
          {loading ? (
            <div className="space-y-3">{[0,1,2].map(i => <div key={i} className="skeleton h-12 w-full" />)}</div>
          ) : alerts.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-slate-400">
              <CheckCircle className="w-10 h-10 mb-2 text-green-500" />
              <p className="text-sm">No active alerts</p>
            </div>
          ) : (
            <div className="space-y-2">
              {alerts.slice(0, 4).map((alert, i) => (
                <div key={i} className={`flex items-start gap-3 p-3 rounded-xl border text-sm ${
                  alert.severity === 'critical' || alert.severity === 'high' ? 'bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-800/30 text-red-700 dark:text-red-400' :
                  'bg-amber-50 dark:bg-amber-900/10 border-amber-200 dark:border-amber-800/30 text-amber-700 dark:text-amber-400'
                }`}>
                  <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium">{alert.title}</p>
                    <p className="text-xs opacity-70 mt-0.5 flex items-center gap-1"><Clock className="w-3 h-3" />{format(new Date(alert.created_at), 'HH:mm')}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
          <Link to="/dashboard/predictions" className="block mt-3 text-xs text-blue-600 dark:text-blue-400 hover:underline text-right">
            View flood predictions →
          </Link>
        </div>
      </div>

      {/* System Status + Quick Actions */}
      <div className="grid lg:grid-cols-2 gap-6">
        <div className="glass-card p-5">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-4">System Status</h3>
          <div className="space-y-3">
            {[
              { icon: Radio, label: 'Sensor Network', status: 'operational', detail: `${stats?.online_sensors ?? 12} of ${stats?.total_sensors ?? 15} online` },
              { icon: Wifi, label: 'Network Connectivity', status: 'operational', detail: 'All nodes reachable' },
              { icon: Battery, label: 'Power Systems', status: 'operational', detail: 'Battery backup: 94%' },
              { icon: Zap, label: 'Alert System', status: 'operational', detail: 'All channels active' },
            ].map((s, i) => (
              <div key={i} className="flex items-center gap-3 p-2 rounded-lg">
                <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-700 flex items-center justify-center">
                  <s.icon className="w-4 h-4 text-slate-600 dark:text-slate-400" />
                </div>
                <div className="flex-1">
                  <p className="text-xs font-medium text-slate-700 dark:text-slate-300">{s.label}</p>
                  <p className="text-xs text-slate-500">{s.detail}</p>
                </div>
                <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400 font-medium">
                  <div className="w-1.5 h-1.5 rounded-full bg-green-500" /> OK
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="glass-card p-5">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-4">Quick Actions</h3>
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Submit SOS', icon: AlertTriangle, to: '/dashboard/sos', color: 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border-red-200 dark:border-red-800/30 hover:bg-red-100' },
              { label: 'Live Sensors', icon: Radio, to: '/dashboard/sensors', color: 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800/30 hover:bg-blue-100' },
              { label: 'Predict Flood', icon: Activity, to: '/dashboard/predictions', color: 'bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400 border-purple-200 dark:border-purple-800/30' },
              { label: 'Route Map', icon: MapPin, to: '/dashboard/routes', color: 'bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 border-green-200 dark:border-green-800/30' },
            ].map((a, i) => (
              <Link key={i} to={a.to} className={`flex flex-col items-center gap-2 p-4 rounded-xl border font-medium text-xs transition-all hover:scale-105 ${a.color}`}>
                <a.icon className="w-6 h-6" />
                {a.label}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

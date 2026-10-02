import React, { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Brain, AlertTriangle, CheckCircle, TrendingUp, BarChart2,
  Droplets, CloudRain, Thermometer, Wind, Activity, Zap, RefreshCw
} from 'lucide-react';
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, Cell
} from 'recharts';
import { predictionAPI } from '../../services/api';
import toast from 'react-hot-toast';

const RISK_CONFIG = {
  safe:    { color: 'text-green-600 dark:text-green-400', bg: 'bg-green-50 dark:bg-green-900/20', border: 'border-green-200 dark:border-green-800/30', fill: '#22c55e', label: '✅ SAFE' },
  warning: { color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-900/20', border: 'border-amber-200 dark:border-amber-800/30', fill: '#f59e0b', label: '⚠️ WARNING' },
  danger:  { color: 'text-red-600 dark:text-red-400',    bg: 'bg-red-50 dark:bg-red-900/20',    border: 'border-red-200 dark:border-red-800/30',    fill: '#ef4444', label: '🚨 DANGER' },
};

const HISTORY_DATA = Array.from({ length: 14 }, (_, i) => ({
  day: `Day ${i + 1}`,
  safe: Math.floor(Math.random() * 40) + 30,
  warning: Math.floor(Math.random() * 30) + 20,
  danger: Math.floor(Math.random() * 20) + 5,
}));

const FEATURE_IMPORTANCE = [
  { feature: 'Water Level', importance: 40 },
  { feature: 'Rainfall', importance: 30 },
  { feature: 'Humidity', importance: 20 },
  { feature: 'Temperature', importance: 10 },
];

const TIMELINE_DATA = Array.from({ length: 12 }, (_, i) => ({
  hour: `+${(i + 1) * 2}h`,
  probability: Math.min(95, 20 + i * 5 + Math.random() * 10),
}));

export default function FloodPrediction() {
  const [inputs, setInputs] = useState({ water_level: 4.2, rainfall: 42, temperature: 28, humidity: 78, river_flow: 3.8 });
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleChange = (key, val) => setInputs(prev => ({ ...prev, [key]: parseFloat(val) || 0 }));

  const predict = async () => {
    setLoading(true);
    try {
      const res = await predictionAPI.predict(inputs);
      setResult(res.data);
      toast.success('Prediction complete');
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Prediction failed');
    } finally {
      setLoading(false);
    }
  };

  const riskCfg = result ? (RISK_CONFIG[result.risk_level] || RISK_CONFIG.safe) : null;

  const radarData = [
    { subject: 'Water Level', A: (inputs.water_level / 10) * 100 },
    { subject: 'Rainfall', A: (inputs.rainfall / 150) * 100 },
    { subject: 'Temperature', A: (inputs.temperature / 40) * 100 },
    { subject: 'Humidity', A: inputs.humidity },
    { subject: 'River Flow', A: (inputs.river_flow / 10) * 100 },
  ];

  const inputFields = [
    { key: 'water_level', label: 'Water Level', unit: 'm', icon: Droplets, min: 0, max: 15, step: 0.1, color: 'blue' },
    { key: 'rainfall', label: 'Rainfall', unit: 'mm/h', icon: CloudRain, min: 0, max: 200, step: 1, color: 'cyan' },
    { key: 'temperature', label: 'Temperature', unit: '°C', icon: Thermometer, min: 0, max: 50, step: 0.5, color: 'red' },
    { key: 'humidity', label: 'Humidity', unit: '%', icon: Wind, min: 0, max: 100, step: 1, color: 'purple' },
    { key: 'river_flow', label: 'River Flow', unit: 'm/s', icon: Activity, min: 0, max: 20, step: 0.1, color: 'teal' },
  ];

  return (
    <div className="page-container">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
          <Brain className="w-5 h-5 text-purple-600 dark:text-purple-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-white">Flood Prediction Engine</h1>
          <p className="text-slate-500 text-sm">AI/ML-ready prediction with real-time sensor inputs</p>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Input Panel */}
        <div className="glass-card p-5">
          <h2 className="font-semibold text-slate-700 dark:text-slate-200 mb-4 flex items-center gap-2">
            <Zap className="w-4 h-4 text-amber-500" /> Sensor Inputs
          </h2>
          <div className="space-y-4">
            {inputFields.map(f => (
              <div key={f.key}>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-medium text-slate-600 dark:text-slate-400 flex items-center gap-1.5">
                    <f.icon className="w-3.5 h-3.5" /> {f.label}
                  </label>
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-200">{inputs[f.key]} {f.unit}</span>
                </div>
                <input
                  type="range" min={f.min} max={f.max} step={f.step}
                  value={inputs[f.key]}
                  onChange={e => handleChange(f.key, e.target.value)}
                  className="w-full h-2 rounded-full appearance-none cursor-pointer accent-blue-500 bg-slate-200 dark:bg-slate-700"
                />
                <div className="flex justify-between text-xs text-slate-400 mt-0.5">
                  <span>{f.min}</span><span>{f.max} {f.unit}</span>
                </div>
              </div>
            ))}
          </div>

          <button
            onClick={predict} disabled={loading}
            className="w-full mt-6 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-medium text-sm transition-all disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {loading
              ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Analyzing...</>
              : <><Brain className="w-4 h-4" /> Run Prediction</>
            }
          </button>

          <div className="mt-3 p-3 rounded-xl bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800/30">
            <p className="text-xs text-purple-700 dark:text-purple-400 font-medium">🤖 ML Ready</p>
            <p className="text-xs text-purple-600 dark:text-purple-300 mt-1">
              Drop your trained model at <code className="font-mono">ml/models/flood_predictor.pkl</code> to enable ML predictions.
            </p>
          </div>
        </div>

        {/* Prediction Result */}
        <div className="space-y-4">
          {result ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className={`glass-card p-6 border-2 ${riskCfg?.border}`}
            >
              <div className="text-center mb-4">
                <p className="text-sm text-slate-500 dark:text-slate-400 mb-1">Prediction Result</p>
                <p className={`text-4xl font-black ${riskCfg?.color}`}>{riskCfg?.label}</p>
                <p className="text-sm text-slate-500 mt-1">
                  Confidence: <strong className="text-slate-700 dark:text-slate-200">{Math.round(result.confidence * 100)}%</strong>
                </p>
              </div>

              {/* Confidence bar */}
              <div className="mb-4">
                <div className="h-3 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${result.confidence * 100}%` }}
                    transition={{ duration: 0.8 }}
                    className={`h-full rounded-full ${result.risk_level === 'safe' ? 'bg-green-500' : result.risk_level === 'warning' ? 'bg-amber-500' : 'bg-red-500'}`}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {Object.entries(result.features || {}).map(([k, v]) => (
                  <div key={k} className="bg-slate-50 dark:bg-slate-700/50 rounded-xl p-2.5">
                    <p className="text-xs text-slate-500 capitalize">{k.replace('_', ' ')}</p>
                    <p className="text-sm font-bold text-slate-800 dark:text-white">{v}</p>
                  </div>
                ))}
              </div>

              {result.time_to_flood_hours && (
                <div className="mt-3 p-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/30">
                  <p className="text-xs text-amber-700 dark:text-amber-400 font-medium">
                    ⏱ Estimated time to flood: ~{result.time_to_flood_hours?.toFixed(1)} hours
                  </p>
                </div>
              )}
            </motion.div>
          ) : (
            <div className="glass-card p-8 text-center text-slate-400">
              <Brain className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="text-sm">Adjust sensor values and click "Run Prediction" to see flood risk analysis</p>
            </div>
          )}

          {/* Radar Chart */}
          <div className="glass-card p-4">
            <h3 className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide mb-3">Risk Factor Radar</h3>
            <ResponsiveContainer width="100%" height={200}>
              <RadarChart data={radarData}>
                <PolarGrid stroke="#e2e8f0" className="dark:stroke-slate-700" />
                <PolarAngleAxis dataKey="subject" tick={{ fontSize: 10 }} />
                <PolarRadiusAxis tick={{ fontSize: 8 }} domain={[0, 100]} />
                <Radar dataKey="A" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.3} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Charts Column */}
        <div className="space-y-4">
          {/* Prediction Timeline */}
          <div className="glass-card p-4">
            <h3 className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide mb-3">
              Flood Probability Timeline
            </h3>
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={TIMELINE_DATA}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" className="dark:stroke-slate-700" />
                <XAxis dataKey="hour" tick={{ fontSize: 9 }} tickLine={false} />
                <YAxis tick={{ fontSize: 9 }} tickLine={false} axisLine={false} unit="%" domain={[0, 100]} />
                <Tooltip contentStyle={{ borderRadius: '10px', border: 'none', fontSize: 11 }} />
                <Line type="monotone" dataKey="probability" stroke="#8b5cf6" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Feature Importance */}
          <div className="glass-card p-4">
            <h3 className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide mb-3">Feature Importance</h3>
            <ResponsiveContainer width="100%" height={150}>
              <BarChart data={FEATURE_IMPORTANCE} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" className="dark:stroke-slate-700" />
                <XAxis type="number" tick={{ fontSize: 9 }} unit="%" />
                <YAxis type="category" dataKey="feature" tick={{ fontSize: 9 }} width={80} />
                <Tooltip contentStyle={{ borderRadius: '10px', border: 'none', fontSize: 11 }} />
                <Bar dataKey="importance" fill="#8b5cf6" radius={[0, 4, 4, 0]} maxBarSize={16} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Historical Comparison */}
          <div className="glass-card p-4">
            <h3 className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide mb-3">14-Day History</h3>
            <ResponsiveContainer width="100%" height={150}>
              <BarChart data={HISTORY_DATA.slice(-7)}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" className="dark:stroke-slate-700" />
                <XAxis dataKey="day" tick={{ fontSize: 9 }} tickLine={false} />
                <YAxis tick={{ fontSize: 9 }} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ borderRadius: '10px', border: 'none', fontSize: 11 }} />
                <Bar dataKey="safe" stackId="a" fill="#22c55e" maxBarSize={20} />
                <Bar dataKey="warning" stackId="a" fill="#f59e0b" maxBarSize={20} />
                <Bar dataKey="danger" stackId="a" fill="#ef4444" radius={[4, 4, 0, 0]} maxBarSize={20} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}

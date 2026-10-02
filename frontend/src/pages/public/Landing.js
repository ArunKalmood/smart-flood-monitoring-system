import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Waves, AlertTriangle, Shield, Users, Activity, Phone, BookOpen,
  ChevronRight, ArrowRight, Droplets, Thermometer, Wind, Eye,
  Radio, MapPin, Clock, CheckCircle, Bell, Heart, Star, Download
} from 'lucide-react';

const FLOOD_STATS = [
  { label: 'Sensors Active', value: '247', unit: '', icon: Radio, color: 'text-blue-400' },
  { label: 'People Evacuated', value: '12,450', unit: '', icon: Users, color: 'text-green-400' },
  { label: 'Alerts Issued', value: '89', unit: 'today', icon: Bell, color: 'text-amber-400' },
  { label: 'SOS Resolved', value: '156', unit: 'this week', icon: CheckCircle, color: 'text-emerald-400' },
];

const SAFETY_TIPS = [
  'Move immediately to higher ground when warnings are issued',
  'Never walk or drive through floodwaters — 6 inches can knock you down',
  'Turn off electricity at the main breaker before evacuating',
  'Keep emergency kit ready: water, food, documents, medicines',
  'Follow official evacuation routes and never take shortcuts',
  'Do not enter flooded buildings without professional clearance',
];

const EMERGENCY_NUMBERS = [
  { name: 'NDRF Helpline', number: '011-23438091', color: 'text-red-400' },
  { name: 'National Disaster', number: '1078', color: 'text-orange-400' },
  { name: 'Ambulance', number: '108', color: 'text-green-400' },
  { name: 'Police', number: '100', color: 'text-blue-400' },
  { name: 'Fire Department', number: '101', color: 'text-red-400' },
  { name: 'State Helpline', number: '1070', color: 'text-purple-400' },
];

const RECENT_ACTIVITIES = [
  { icon: Heart, text: 'Team Alpha rescued 12 people from Sector 4', time: '2h ago', type: 'rescue' },
  { icon: CheckCircle, text: 'Evacuation Center #3 opened with 500 capacity', time: '4h ago', type: 'shelter' },
  { icon: AlertTriangle, text: 'Flood Warning issued for District 7', time: '5h ago', type: 'alert' },
  { icon: Users, text: '45 volunteers deployed to eastern flood zone', time: '6h ago', type: 'volunteer' },
];

const GOV_NOTICES = [
  { title: 'Mandatory Evacuation Order — Riverside Zone', date: 'June 15, 2025', severity: 'critical' },
  { title: 'Heavy Rainfall Alert — Next 72 Hours', date: 'June 14, 2025', severity: 'warning' },
  { title: 'Relief Camp Setup — District Ground', date: 'June 13, 2025', severity: 'info' },
];

const NEWS = [
  { title: 'AI System Predicts Flood 48 Hours Ahead', desc: 'New ML model achieves 94% accuracy in flood prediction for coastal districts...', time: '1h ago' },
  { title: 'Emergency Teams on High Alert', desc: 'NDRF teams positioned at strategic locations across 5 districts following heavy rainfall...', time: '3h ago' },
  { title: 'Drone Surveillance Deployed', desc: 'UAV fleet monitoring flood-prone areas in real-time for faster rescue coordination...', time: '5h ago' },
];

export default function Landing() {
  const [waterLevel, setWaterLevel] = useState(4.2);
  const [risk, setRisk] = useState('warning');

  // Simulate live data
  useEffect(() => {
    const t = setInterval(() => {
      setWaterLevel(v => parseFloat((v + (Math.random() - 0.48) * 0.1).toFixed(2)));
    }, 3000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="text-white">
      {/* ─── HERO ─── */}
      <section className="relative min-h-screen flex items-center overflow-hidden bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900">
        {/* Animated background */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          {[...Array(20)].map((_, i) => (
            <motion.div key={i}
              className="absolute w-1 h-1 bg-blue-400 rounded-full opacity-30"
              style={{ left: `${Math.random() * 100}%`, top: `${Math.random() * 100}%` }}
              animate={{ y: [-20, 20], opacity: [0.2, 0.5, 0.2] }}
              transition={{ duration: 3 + Math.random() * 3, repeat: Infinity, delay: Math.random() * 3, ease: 'easeInOut' }}
            />
          ))}
          <div className="absolute -top-40 -right-40 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl" />
          <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-blue-800/10 rounded-full blur-3xl" />
        </div>

        <div className="max-w-7xl mx-auto px-4 py-20 relative z-10 grid lg:grid-cols-2 gap-12 items-center w-full">
          <motion.div initial={{ opacity: 0, x: -30 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.8 }}>
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-500/20 border border-blue-500/30 text-blue-300 text-xs font-medium mb-6">
              <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse" />
              AI-Powered Early Warning System
            </div>
            <h1 className="text-4xl lg:text-6xl font-bold leading-tight mb-4">
              Smart Flood<br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-cyan-400">
                Monitoring &amp;
              </span><br />
              Early Warning
            </h1>
            <p className="text-slate-300 text-lg mb-8 leading-relaxed">
              Real-time flood detection using IoT sensors and AI prediction models. 
              Protecting lives with intelligent disaster response coordination.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link to="/dashboard" className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-medium transition-all shadow-lg shadow-blue-500/20 hover:shadow-blue-500/30">
                <Activity className="w-4 h-4" /> Live Dashboard <ArrowRight className="w-4 h-4" />
              </Link>
              <Link to="/register" className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-white font-medium transition-all">
                <Users className="w-4 h-4" /> Join Network
              </Link>
            </div>
          </motion.div>

          {/* Live Stats Card */}
          <motion.div initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.8, delay: 0.2 }}>
            <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-3xl p-6 shadow-2xl">
              <div className="flex items-center justify-between mb-4">
                <span className="text-sm font-medium text-slate-300">Live Sensor Data</span>
                <span className="flex items-center gap-1.5 text-xs text-green-400">
                  <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" /> LIVE
                </span>
              </div>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div className="bg-white/5 rounded-2xl p-4">
                  <Droplets className="w-5 h-5 text-blue-400 mb-2" />
                  <p className="text-2xl font-bold">{waterLevel}m</p>
                  <p className="text-xs text-slate-400 mt-1">Water Level</p>
                </div>
                <div className="bg-white/5 rounded-2xl p-4">
                  <Thermometer className="w-5 h-5 text-red-400 mb-2" />
                  <p className="text-2xl font-bold">28°C</p>
                  <p className="text-xs text-slate-400 mt-1">Temperature</p>
                </div>
                <div className="bg-white/5 rounded-2xl p-4">
                  <Wind className="w-5 h-5 text-cyan-400 mb-2" />
                  <p className="text-2xl font-bold">82%</p>
                  <p className="text-xs text-slate-400 mt-1">Humidity</p>
                </div>
                <div className="bg-white/5 rounded-2xl p-4">
                  <AlertTriangle className="w-5 h-5 text-amber-400 mb-2" />
                  <p className={`text-2xl font-bold capitalize ${risk === 'safe' ? 'text-green-400' : risk === 'warning' ? 'text-amber-400' : 'text-red-400'}`}>
                    {risk}
                  </p>
                  <p className="text-xs text-slate-400 mt-1">Flood Risk</p>
                </div>
              </div>
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0" />
                <span className="text-xs text-amber-300">⚠ Yellow Alert: Water levels rising in District 3</span>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ─── LIVE STATS ─── */}
      <section className="bg-slate-800/50 backdrop-blur border-y border-white/5 py-10">
        <div className="max-w-7xl mx-auto px-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
            {FLOOD_STATS.map((stat, i) => (
              <motion.div key={stat.label} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }} viewport={{ once: true }}
                className="text-center">
                <stat.icon className={`w-8 h-8 ${stat.color} mx-auto mb-2`} />
                <p className="text-3xl font-bold text-white">{stat.value}</p>
                <p className="text-sm text-slate-400">{stat.label} <span className="text-slate-500 text-xs">{stat.unit}</span></p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── CURRENT ALERTS ─── */}
      <section className="py-16 bg-gradient-to-br from-slate-900 to-slate-800">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h2 className="text-2xl font-bold text-white">Active Alerts</h2>
              <p className="text-slate-400 text-sm mt-1">Real-time flood warnings and notifications</p>
            </div>
            <Link to="/dashboard" className="text-blue-400 hover:text-blue-300 text-sm flex items-center gap-1">View All <ChevronRight className="w-4 h-4" /></Link>
          </div>
          <div className="grid md:grid-cols-3 gap-4">
            {GOV_NOTICES.map((n, i) => (
              <motion.div key={i} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }} viewport={{ once: true }}
                className={`p-4 rounded-2xl border backdrop-blur-sm ${
                  n.severity === 'critical' ? 'bg-red-500/10 border-red-500/30' :
                  n.severity === 'warning' ? 'bg-amber-500/10 border-amber-500/30' :
                  'bg-blue-500/10 border-blue-500/30'
                }`}>
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium mb-2 ${
                  n.severity === 'critical' ? 'bg-red-500/20 text-red-400' :
                  n.severity === 'warning' ? 'bg-amber-500/20 text-amber-400' :
                  'bg-blue-500/20 text-blue-400'
                }`}>
                  {n.severity.toUpperCase()}
                </span>
                <p className="text-white text-sm font-medium">{n.title}</p>
                <p className="text-slate-400 text-xs mt-1 flex items-center gap-1"><Clock className="w-3 h-3" />{n.date}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── LATEST NEWS ─── */}
      <section className="py-16 bg-slate-900">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-2xl font-bold text-white">Latest News</h2>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {NEWS.map((item, i) => (
              <motion.div key={i} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }} viewport={{ once: true }}
                className="bg-white/5 border border-white/10 rounded-2xl p-5 hover:bg-white/10 transition-all cursor-pointer">
                <span className="text-xs text-slate-500 flex items-center gap-1 mb-3"><Clock className="w-3 h-3" />{item.time}</span>
                <h3 className="text-white font-semibold mb-2">{item.title}</h3>
                <p className="text-slate-400 text-sm">{item.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── EMERGENCY NUMBERS ─── */}
      <section className="py-16 bg-slate-800">
        <div className="max-w-7xl mx-auto px-4">
          <div className="text-center mb-10">
            <h2 className="text-2xl font-bold text-white mb-2">Emergency Contacts</h2>
            <p className="text-slate-400 text-sm">Save these numbers. They can save lives.</p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {EMERGENCY_NUMBERS.map((c, i) => (
              <motion.a key={i} href={`tel:${c.number}`}
                initial={{ opacity: 0, scale: 0.9 }} whileInView={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.05 }} viewport={{ once: true }}
                whileHover={{ scale: 1.05 }}
                className="bg-white/5 border border-white/10 rounded-2xl p-4 text-center hover:bg-white/10 transition-all">
                <Phone className={`w-6 h-6 ${c.color} mx-auto mb-2`} />
                <p className="text-white font-bold text-lg">{c.number}</p>
                <p className="text-slate-400 text-xs mt-1">{c.name}</p>
              </motion.a>
            ))}
          </div>
        </div>
      </section>

      {/* ─── FLOOD SAFETY GUIDELINES ─── */}
      <section className="py-16 bg-slate-900">
        <div className="max-w-7xl mx-auto px-4">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <motion.div initial={{ opacity: 0, x: -20 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }}>
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-green-500/20 border border-green-500/30 text-green-300 text-xs font-medium mb-4">
                <Shield className="w-3 h-3" /> Safety Guidelines
              </div>
              <h2 className="text-3xl font-bold text-white mb-4">Stay Safe During Floods</h2>
              <p className="text-slate-400 text-sm mb-6">Follow these essential safety guidelines to protect yourself and your family during flood events.</p>
              <div className="space-y-3">
                {SAFETY_TIPS.map((tip, i) => (
                  <motion.div key={i} initial={{ opacity: 0, x: -10 }} whileInView={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.1 }} viewport={{ once: true }}
                    className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full bg-green-500/20 border border-green-500/30 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <span className="text-green-400 text-xs font-bold">{i + 1}</span>
                    </div>
                    <p className="text-slate-300 text-sm">{tip}</p>
                  </motion.div>
                ))}
              </div>
            </motion.div>

            {/* Recent activities */}
            <motion.div initial={{ opacity: 0, x: 20 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }}>
              <h3 className="text-lg font-bold text-white mb-4">Recent Rescue Activities</h3>
              <div className="space-y-3">
                {RECENT_ACTIVITIES.map((a, i) => (
                  <div key={i} className="bg-white/5 border border-white/10 rounded-xl p-4 flex items-start gap-3">
                    <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center flex-shrink-0">
                      <a.icon className="w-4 h-4 text-blue-400" />
                    </div>
                    <div>
                      <p className="text-slate-200 text-sm">{a.text}</p>
                      <p className="text-slate-500 text-xs mt-1 flex items-center gap-1"><Clock className="w-3 h-3" />{a.time}</p>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ─── VOLUNTEER HIGHLIGHTS ─── */}
      <section className="py-16 bg-gradient-to-r from-blue-900 to-indigo-900">
        <div className="max-w-7xl mx-auto px-4 text-center">
          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}>
            <Star className="w-8 h-8 text-yellow-400 mx-auto mb-3" />
            <h2 className="text-3xl font-bold text-white mb-2">Our Volunteers Are Heroes</h2>
            <p className="text-blue-200 mb-8 max-w-xl mx-auto">Over 2,500 trained volunteers across the region, ready to respond 24/7 to any flood emergency.</p>
            <div className="flex flex-wrap justify-center gap-4">
              <Link to="/volunteer-register" className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-white text-blue-800 font-semibold text-sm hover:bg-blue-50 transition-all">
                <Heart className="w-4 h-4" /> Join as Volunteer
              </Link>
              <Link to="/public-info" className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-white/10 border border-white/20 text-white font-medium text-sm hover:bg-white/20 transition-all">
                <BookOpen className="w-4 h-4" /> Learn More
              </Link>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ─── FAQ ─── */}
      <section className="py-16 bg-slate-900">
        <div className="max-w-3xl mx-auto px-4">
          <h2 className="text-2xl font-bold text-white text-center mb-10">Frequently Asked Questions</h2>
          {[
            { q: 'How does the flood prediction system work?', a: 'Our AI model analyzes real-time sensor data including water levels, rainfall intensity, humidity, and river flow rates to predict flood probability up to 48 hours in advance.' },
            { q: 'How do I submit an SOS request?', a: 'Click on the SOS Emergency section in your dashboard or use our public SOS form. Provide your location, emergency type, and description. Our team will respond immediately.' },
            { q: 'What should I keep in my emergency kit?', a: 'Include 3-day water supply (1 gallon/person/day), non-perishable food, flashlight, batteries, first aid kit, whistle, dust masks, plastic sheeting, moist towelettes, garbage bags, wrench, manual can opener, local maps, and cell phone with chargers.' },
            { q: 'How accurate are the flood predictions?', a: 'Our rule-based system provides baseline predictions. When ML models are integrated, accuracy reaches 90%+ based on historical flood data and meteorological parameters.' },
          ].map((faq, i) => (
            <motion.div key={i} initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }} viewport={{ once: true }}
              className="mb-4 bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
              <details className="group">
                <summary className="flex items-center justify-between p-5 cursor-pointer list-none text-white font-medium text-sm hover:bg-white/5 transition-all">
                  {faq.q}
                  <ChevronRight className="w-4 h-4 text-slate-400 group-open:rotate-90 transition-transform" />
                </summary>
                <p className="px-5 pb-5 text-slate-400 text-sm">{faq.a}</p>
              </details>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ─── ABOUT + CTA ─── */}
      <section className="py-16 bg-gradient-to-br from-blue-950 to-slate-900">
        <div className="max-w-7xl mx-auto px-4 text-center">
          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}>
            <h2 className="text-3xl font-bold text-white mb-4">About This Project</h2>
            <p className="text-slate-300 max-w-2xl mx-auto mb-4 text-sm leading-relaxed">
              Smart Flood Monitoring and Early Warning System using AI-Enabled Embedded Systems is a final-year engineering project 
              designed to leverage IoT sensors, machine learning, and modern web technologies for comprehensive disaster response management. 
              The platform is built for real-world deployment with future integration capabilities for satellite imagery, drone feeds, 
              LLM-based analysis, and multi-agency coordination.
            </p>
            <p className="text-blue-300 text-xs mb-8">Built with FastAPI · React.js · PostgreSQL · TensorFlow · Leaflet Maps · JWT Auth</p>
            <div className="flex flex-wrap justify-center gap-4">
              <Link to="/login" className="btn-primary">
                <Activity className="w-4 h-4" /> Get Started
              </Link>
              <a href="#" className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-white/10 border border-white/20 text-white text-sm hover:bg-white/20 transition-all">
                <Download className="w-4 h-4" /> Download Guide
              </a>
            </div>
          </motion.div>
        </div>
      </section>
    </div>
  );
}

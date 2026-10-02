import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Info, AlertTriangle, Shield, Phone, BookOpen, Download,
  ChevronRight, CloudRain, Package, HelpCircle, Video,
  Bell, CheckCircle, X
} from 'lucide-react';

const SAFETY_TIPS = [
  { title: 'Before a Flood', tips: ['Monitor weather forecasts regularly', 'Know your evacuation routes', 'Prepare emergency kit', 'Store important documents in waterproof containers', 'Turn off electricity at main breaker before flooding'] },
  { title: 'During a Flood', tips: ['Move to higher ground immediately', 'Avoid walking in floodwaters — 6 inches can knock you down', 'Do not drive through flooded roads', 'Stay away from power lines and electrical wires', 'Drink only bottled/boiled water'] },
  { title: 'After a Flood', tips: ['Do not return home until authorities say it is safe', 'Document all damages for insurance', 'Clean and disinfect everything that got wet', 'Watch for hazards like weakened floors, walls, or ceilings', 'Be alert for gas leaks'] },
];

const EMERGENCY_CONTACTS = [
  { name: 'NDRF Helpline', number: '011-23438091', type: 'National Disaster' },
  { name: 'National Disaster Mgmt', number: '1078', type: 'Toll Free' },
  { name: 'Ambulance', number: '108', type: 'Medical Emergency' },
  { name: 'Police Control', number: '100', type: 'Law & Order' },
  { name: 'Fire Department', number: '101', type: 'Fire Emergency' },
  { name: 'State Disaster Auth', number: '1070', type: 'State Helpline' },
];

const ALERTS = [
  { type: 'warning', title: 'Yellow Alert: Heavy Rainfall Expected', desc: 'Districts 3, 5, 7 — Next 48 hours', active: true },
  { type: 'info', title: 'Relief Camps Open', desc: 'City Sports Complex, School No. 5 — 24/7', active: true },
  { type: 'info', title: 'Drinking Water Distribution', desc: 'Ward 12-18 — 8 AM to 6 PM daily', active: true },
];

const FAQS = [
  { q: 'What should I do if I see flooding?', a: 'Immediately move to higher ground, call the emergency helpline 1078, and submit an SOS request through our portal if you need rescue assistance.' },
  { q: 'How do I receive flood alerts?', a: 'Register on FloodMonitor to receive real-time SMS, email, and push notifications for your area. Public alerts are displayed on this page without registration.' },
  { q: 'Where is the nearest evacuation center?', a: 'View live evacuation center locations and capacity on our Route Map page. Centers are updated in real-time by our admin team.' },
  { q: 'Can I volunteer during a flood?', a: 'Yes! Register as a volunteer through our Volunteer Registration page. Approved volunteers receive deployment instructions via SMS/email.' },
];

const GOV_NOTICES = [
  { title: 'Mandatory Evacuation — Riverside Zone A', date: '15 Jun 2025', urgent: true },
  { title: 'Emergency Food Distribution — All Relief Camps', date: '14 Jun 2025', urgent: false },
  { title: 'Road Closure — NH-44 Bridge (Flood Damage)', date: '13 Jun 2025', urgent: true },
  { title: 'School Holidays — Flood Precaution', date: '12 Jun 2025', urgent: false },
];

const RESOURCES = [
  { name: 'Flood Emergency Checklist', format: 'PDF', size: '245 KB' },
  { name: 'Evacuation Route Map', format: 'PDF', size: '1.2 MB' },
  { name: 'First Aid Guide', format: 'PDF', size: '890 KB' },
  { name: 'Emergency Contact Directory', format: 'PDF', size: '156 KB' },
];

export default function PublicInfo() {
  const [activeTip, setActiveTip] = useState(0);
  const [dismissedAlerts, setDismissedAlerts] = useState([]);

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
          <BookOpen className="w-6 h-6 text-blue-500" /> Public Information Portal
        </h1>
        <p className="text-slate-500 text-sm mt-1">Safety guidelines, emergency contacts, government notices, and flood preparedness resources</p>
      </div>

      {/* Active Alerts */}
      <div className="mb-8">
        <h2 className="text-lg font-bold text-slate-800 dark:text-white mb-3 flex items-center gap-2">
          <Bell className="w-5 h-5 text-amber-500" /> Latest Alerts
        </h2>
        <div className="space-y-2">
          {ALERTS.filter((_, i) => !dismissedAlerts.includes(i)).map((alert, i) => (
            <motion.div key={i} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
              className={`flex items-center gap-3 p-4 rounded-xl border ${alert.type === 'warning' ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800/30 text-amber-800 dark:text-amber-300' : 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800/30 text-blue-800 dark:text-blue-300'}`}>
              {alert.type === 'warning' ? <AlertTriangle className="w-5 h-5 flex-shrink-0" /> : <Info className="w-5 h-5 flex-shrink-0" />}
              <div className="flex-1">
                <p className="font-medium text-sm">{alert.title}</p>
                <p className="text-xs opacity-70">{alert.desc}</p>
              </div>
              <button onClick={() => setDismissedAlerts([...dismissedAlerts, i])} className="p-1 opacity-50 hover:opacity-100">
                <X className="w-4 h-4" />
              </button>
            </motion.div>
          ))}
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          {/* Safety Tips */}
          <section>
            <h2 className="text-lg font-bold text-slate-800 dark:text-white mb-4 flex items-center gap-2">
              <Shield className="w-5 h-5 text-green-500" /> Flood Safety Guidelines
            </h2>
            <div className="flex gap-2 mb-4">
              {SAFETY_TIPS.map((t, i) => (
                <button key={i} onClick={() => setActiveTip(i)}
                  className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${activeTip === i ? 'bg-blue-600 text-white' : 'glass-card text-slate-600 dark:text-slate-400 hover:text-slate-800'}`}>
                  {t.title}
                </button>
              ))}
            </div>
            <div className="glass-card p-5">
              <h3 className="font-bold text-slate-800 dark:text-white mb-4">{SAFETY_TIPS[activeTip].title}</h3>
              <ul className="space-y-2">
                {SAFETY_TIPS[activeTip].tips.map((tip, i) => (
                  <motion.li key={i} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}
                    className="flex items-start gap-3 text-sm text-slate-700 dark:text-slate-300">
                    <div className="w-5 h-5 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <CheckCircle className="w-3 h-3 text-green-600 dark:text-green-400" />
                    </div>
                    {tip}
                  </motion.li>
                ))}
              </ul>
            </div>
          </section>

          {/* Government Notices */}
          <section>
            <h2 className="text-lg font-bold text-slate-800 dark:text-white mb-4 flex items-center gap-2">
              <Shield className="w-5 h-5 text-blue-500" /> Government Notices
            </h2>
            <div className="space-y-2">
              {GOV_NOTICES.map((n, i) => (
                <div key={i} className={`flex items-center gap-3 p-4 rounded-xl glass-card border-l-4 ${n.urgent ? 'border-red-500' : 'border-blue-400'}`}>
                  {n.urgent ? <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" /> : <Info className="w-4 h-4 text-blue-500 flex-shrink-0" />}
                  <div className="flex-1">
                    <p className="text-sm font-medium text-slate-800 dark:text-white">{n.title}</p>
                    <p className="text-xs text-slate-400 mt-0.5">{n.date}</p>
                  </div>
                  {n.urgent && <span className="badge-danger text-xs">Urgent</span>}
                </div>
              ))}
            </div>
          </section>

          {/* FAQ */}
          <section>
            <h2 className="text-lg font-bold text-slate-800 dark:text-white mb-4 flex items-center gap-2">
              <HelpCircle className="w-5 h-5 text-purple-500" /> Frequently Asked Questions
            </h2>
            <div className="space-y-3">
              {FAQS.map((faq, i) => (
                <div key={i} className="glass-card overflow-hidden rounded-2xl">
                  <details className="group">
                    <summary className="flex items-center justify-between p-4 cursor-pointer list-none hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-all">
                      <span className="text-sm font-medium text-slate-800 dark:text-white">{faq.q}</span>
                      <ChevronRight className="w-4 h-4 text-slate-400 group-open:rotate-90 transition-transform flex-shrink-0" />
                    </summary>
                    <p className="px-4 pb-4 text-sm text-slate-600 dark:text-slate-400">{faq.a}</p>
                  </details>
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Emergency Numbers */}
          <section>
            <h3 className="font-bold text-slate-800 dark:text-white mb-3 flex items-center gap-2">
              <Phone className="w-4 h-4 text-red-500" /> Emergency Contacts
            </h3>
            <div className="space-y-2">
              {EMERGENCY_CONTACTS.map((c, i) => (
                <a key={i} href={`tel:${c.number}`}
                  className="flex items-center justify-between p-3 rounded-xl glass-card hover:shadow-md transition-all">
                  <div>
                    <p className="text-xs font-medium text-slate-700 dark:text-slate-300">{c.name}</p>
                    <p className="text-xs text-slate-400">{c.type}</p>
                  </div>
                  <span className="font-bold text-sm text-red-600 dark:text-red-400">{c.number}</span>
                </a>
              ))}
            </div>
          </section>

          {/* Download Resources */}
          <section>
            <h3 className="font-bold text-slate-800 dark:text-white mb-3 flex items-center gap-2">
              <Download className="w-4 h-4 text-green-500" /> Resources
            </h3>
            <div className="space-y-2">
              {RESOURCES.map((r, i) => (
                <button key={i} className="w-full flex items-center justify-between p-3 rounded-xl glass-card hover:shadow-md transition-all text-left">
                  <div>
                    <p className="text-xs font-medium text-slate-700 dark:text-slate-300">{r.name}</p>
                    <p className="text-xs text-slate-400">{r.format} · {r.size}</p>
                  </div>
                  <Download className="w-4 h-4 text-blue-500" />
                </button>
              ))}
            </div>
          </section>

          {/* Weather Updates */}
          <section>
            <h3 className="font-bold text-slate-800 dark:text-white mb-3 flex items-center gap-2">
              <CloudRain className="w-4 h-4 text-cyan-500" /> Weather Overview
            </h3>
            <div className="glass-card p-4 space-y-3 text-sm">
              {[
                { area: 'District 1-3', forecast: 'Heavy Rain', alert: 'Yellow' },
                { area: 'District 4-6', forecast: 'Moderate Rain', alert: 'Green' },
                { area: 'District 7-9', forecast: 'Thunderstorms', alert: 'Orange' },
              ].map((w, i) => (
                <div key={i} className="flex items-center justify-between">
                  <span className="text-slate-600 dark:text-slate-400">{w.area}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500">{w.forecast}</span>
                    <span className={`text-xs font-bold ${w.alert === 'Orange' ? 'text-orange-500' : w.alert === 'Yellow' ? 'text-yellow-500' : 'text-green-500'}`}>{w.alert}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <Link to="/dashboard/sos" className="block w-full py-3 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-sm text-center transition-all">
            🆘 Submit Emergency SOS
          </Link>
          <Link to="/volunteer-register" className="block w-full py-3 rounded-xl bg-green-600 hover:bg-green-500 text-white font-bold text-sm text-center transition-all">
            ❤️ Join as Volunteer
          </Link>
        </div>
      </div>
    </div>
  );
}

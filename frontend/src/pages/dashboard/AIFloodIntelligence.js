import React, { useCallback, useEffect, useState, useRef } from 'react';
import {
  Sparkles, AlertTriangle, ShieldAlert, CheckCircle2, Navigation,
  Locate, RefreshCw, Send, Bot, User as UserIcon, MapPin,
  Droplets, CloudRain, Activity, PhoneCall, TrendingUp,
  ShieldCheck, ChevronDown, ChevronUp, Globe, Compass
} from 'lucide-react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, Circle, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import toast from 'react-hot-toast';

import { aiAPI, evacuationHelperAPI, alertAPI } from '../../services/api';
import { formatRelative } from '../../utils/datetime';
import { formatNumber } from '../../utils/units';
import {
  INDIA_CENTER, TILE_ATTRIBUTION, TILE_URL, isValidLatLng
} from '../../components/maps/mapUtils';
import { useLanguage } from '../../context/LanguageContext';

// Leaflet custom marker icons
const userMarkerIcon = L.divIcon({
  html: '<span style="display:block;width:18px;height:18px;border-radius:50%;background:#2563eb;border:3px solid white;box-shadow:0 0 0 6px rgba(37,99,235,0.3)"></span>',
  iconSize: [18, 18],
  iconAnchor: [9, 9],
  className: '',
});

const shelterMarkerIcon = L.divIcon({
  html: '<span style="display:flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:8px;background:#7c3aed;color:white;font-weight:bold;font-size:13px;border:2px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.3)">🏛️</span>',
  iconSize: [26, 26],
  iconAnchor: [13, 13],
  className: '',
});

const sensorMarkerIcon = L.divIcon({
  html: '<span style="display:flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:50%;background:#0284c7;color:white;border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.25)">📡</span>',
  iconSize: [24, 24],
  iconAnchor: [12, 12],
  className: '',
});

function MapFlyTo({ target }) {
  const map = useMap();
  useEffect(() => {
    if (target && isValidLatLng(target[0], target[1])) {
      map.flyTo(target, 14, { duration: 1.2 });
    }
  }, [target, map]);
  return null;
}

const QUICK_QUESTION_KEYS = [
  'ai_q_location',
  'ai_q_risk',
  'ai_q_affected',
  'ai_q_where_go',
  'ai_q_safe_route',
  'ai_q_precautions',
];

// Helper to strip any markdown asterisks, hashes, backticks from response strings
function stripMarkdown(text) {
  if (!text) return '';
  return text
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^\s*#{1,6}\s*/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/^\s*[-*+•◦]\s+/gm, '')
    .replace(/^\s*\d+\.\s+/gm, '')
    .replace(/^\s*>\s*/gm, '')
    .trim();
}

export default function AIFloodIntelligence() {
  const { language, setLanguage, t, languages } = useLanguage();

  // AI & Telemetry State
  const [analysis, setAnalysis] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [geminiStatus, setGeminiStatus] = useState(null);

  // User Location State
  const [userCoords, setUserCoords] = useState(null);
  const [locating, setLocating] = useState(false);
  const [manualLat, setManualLat] = useState('');
  const [manualLng, setManualLng] = useState('');

  // Evacuation & Routing State
  const [sheltersData, setSheltersData] = useState(null);
  const [loadingShelters, setLoadingShelters] = useState(false);
  const [selectedRoute, setSelectedRoute] = useState(null);
  const [routingLoading, setRoutingLoading] = useState(false);
  const [activeAlerts, setActiveAlerts] = useState([]);
  const [mapTarget, setMapTarget] = useState(null);
  const mapContainerRef = useRef(null);

  // Expandable Sensor Details
  const [showSensorDetails, setShowSensorDetails] = useState(false);

  // Chatbot State
  const [chatMessages, setChatMessages] = useState([
    {
      role: 'assistant',
      text: t('ai_welcome_msg'),
      time: new Date(),
    }
  ]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef(null);

  // 1. Initial Analysis Fetch with Language Support
  const loadAnalysis = useCallback(async (force = false, coords = userCoords, lang = language) => {
    if (force) setAnalyzing(true);
    try {
      const payload = {
        force_refresh: force,
        latitude: coords?.lat,
        longitude: coords?.lng,
        language: lang,
      };
      const res = await aiAPI.analyzeFlood(payload);
      setAnalysis(res.data);
      if (force) toast.success("Flood situation analysis updated.");
    } catch {
      toast.error("Could not load latest flood situation report.");
    } finally {
      setAnalyzing(false);
    }
  }, [userCoords, language]);

  // Load active alerts & check Gemini status
  const loadAlertsAndStatus = useCallback(async () => {
    try {
      const [alertsRes, statusRes] = await Promise.allSettled([
        alertAPI.getAll(),
        aiAPI.getGeminiStatus(),
      ]);
      if (alertsRes.status === 'fulfilled') {
        setActiveAlerts(alertsRes.value.data || []);
      }
      if (statusRes.status === 'fulfilled') {
        setGeminiStatus(statusRes.value.data);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    loadAnalysis(false);
    loadAlertsAndStatus();
  }, [loadAnalysis, loadAlertsAndStatus]);

  // 2. Geolocation Handler
  const handleDetectLocation = useCallback(() => {
    if (!navigator.geolocation) {
      toast.error("Geolocation is not supported by your browser.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setUserCoords(coords);
        setLocating(false);
        setMapTarget([coords.lat, coords.lng]);
        toast.success("GPS location detected successfully.");
        loadAnalysis(false, coords, language);
        findNearbyShelters(coords.lat, coords.lng);
      },
      (err) => {
        setLocating(false);
        toast.error(err.code === 1 ? "Location permission denied. You can enter coordinates manually or allow location access in your browser settings." : "Unable to acquire GPS location.");
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }, [loadAnalysis, language]);

  const handleApplyManualCoords = (e) => {
    e.preventDefault();
    const lat = parseFloat(manualLat);
    const lng = parseFloat(manualLng);
    if (!isValidLatLng(lat, lng)) {
      toast.error("Please enter valid latitude (-90 to 90) and longitude (-180 to 180).");
      return;
    }
    const coords = { lat, lng };
    setUserCoords(coords);
    setMapTarget([lat, lng]);
    toast.success("GPS coordinates applied.");
    loadAnalysis(false, coords, language);
    findNearbyShelters(lat, lng);
  };

  // 3. Find Nearby Shelters
  const findNearbyShelters = async (lat, lng) => {
    setLoadingShelters(true);
    try {
      const res = await evacuationHelperAPI.getNearby({ latitude: lat, longitude: lng, radius_km: 50.0 });
      setSheltersData(res.data);
    } catch {
      toast.error("Could not retrieve nearby verified evacuation shelters.");
    } finally {
      setLoadingShelters(false);
    }
  };

  // 4. Recommend Route
  const handleRecommendRoute = async (centerId, centerCoords) => {
    if (!userCoords) {
      toast.error("Please detect your GPS location first to compute a safe evacuation route.");
      return;
    }
    setRoutingLoading(true);
    try {
      const res = await evacuationHelperAPI.recommendRoute({
        latitude: userCoords.lat,
        longitude: userCoords.lng,
        center_id: centerId,
        avoid_hazards: true,
      });
      setSelectedRoute(res.data);
      if (centerCoords && isValidLatLng(centerCoords[0], centerCoords[1])) {
        setMapTarget(centerCoords);
      }
      toast.success("Safe evacuation route calculated.");
      mapContainerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to calculate evacuation route.");
    } finally {
      setRoutingLoading(false);
    }
  };

  // 5. Language Change Handler (Global State)
  const handleLanguageChange = async (newLang) => {
    setLanguage(newLang);
    loadAnalysis(false, userCoords, newLang);

    // Also translate recent chat messages if present
    if (chatMessages.length > 0) {
      try {
        const lastMsg = chatMessages[chatMessages.length - 1];
        if (lastMsg.role === 'assistant') {
          const transRes = await aiAPI.translate({
            text: lastMsg.text,
            target_language: newLang,
          });
          if (transRes.data?.translated_text) {
            setChatMessages((prev) => {
              const updated = [...prev];
              updated[updated.length - 1] = {
                ...updated[updated.length - 1],
                text: transRes.data.translated_text,
              };
              return updated;
            });
          }
        }
      } catch {
        // preserve original
      }
    }
    const currentLangObj = languages.find(l => l.code === newLang);
    toast.success(`Language set to ${currentLangObj?.nativeLabel || newLang}`);
  };

  // 6. Chatbot Send with Intent & Multi-Turn History
  const handleSendMessage = async (textToSend) => {
    const message = textToSend || chatInput;
    if (!message.trim() || chatLoading) return;

    const userMsg = { role: 'user', text: message, time: new Date() };
    const nextMessages = [...chatMessages, userMsg];
    setChatMessages(nextMessages);
    setChatInput('');
    setChatLoading(true);

    // Build multi-turn history payload for context-aware answering
    const historyPayload = nextMessages
      .slice(-10)
      .map((m) => ({
        role: m.role,
        content: m.text,
      }));

    try {
      const res = await aiAPI.chat({
        message,
        latitude: userCoords?.lat,
        longitude: userCoords?.lng,
        language,
        history: historyPayload,
      });
      const assistantMsg = {
        role: 'assistant',
        text: stripMarkdown(res.data.response),
        time: new Date(),
        nearest_shelter: res.data.nearest_shelter,
        alternative_shelters: res.data.alternative_shelters,
        recommended_route: res.data.recommended_route,
        grounding: res.data.grounding,
      };
      setChatMessages((prev) => [...prev, assistantMsg]);
    } catch {
      setChatMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          text: "The emergency assistant is currently responding via deterministic emergency guidance. If water levels are rising rapidly around you, move to higher ground immediately and call emergency services at 112 or 1078.",
          time: new Date(),
        }
      ]);
    } finally {
      setChatLoading(false);
    }
  };

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, chatLoading]);

  // Risk display mapping
  const risk = analysis?.risk_level || 'LOW';
  const isCritical = risk === 'CRITICAL';
  const isHigh = risk === 'HIGH';

  const riskLabel = risk === 'CRITICAL' ? t('ai_critical_risk')
    : risk === 'HIGH' ? t('ai_high_risk')
    : risk === 'MODERATE' ? t('ai_moderate_risk')
    : t('ai_low_risk');

  const riskColors = {
    LOW: {
      badge: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300 border-emerald-300',
      pill: 'bg-emerald-500',
      border: 'border-emerald-200 dark:border-emerald-800/60',
      accent: 'text-emerald-700 dark:text-emerald-400',
    },
    MODERATE: {
      badge: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-950/70 dark:text-yellow-300 border-yellow-300',
      pill: 'bg-yellow-500',
      border: 'border-yellow-200 dark:border-yellow-800/60',
      accent: 'text-yellow-700 dark:text-yellow-400',
    },
    HIGH: {
      badge: 'bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300 border-amber-400',
      pill: 'bg-amber-500',
      border: 'border-amber-300 dark:border-amber-700 shadow-sm',
      accent: 'text-amber-700 dark:text-amber-400',
    },
    CRITICAL: {
      badge: 'bg-red-100 text-red-800 dark:bg-red-950/80 dark:text-red-300 border-red-500 animate-pulse',
      pill: 'bg-red-600',
      border: 'border-red-500 dark:border-red-600 shadow-md ring-2 ring-red-400/20',
      accent: 'text-red-700 dark:text-red-400',
    },
  };

  const currentRisk = riskColors[risk] || riskColors.LOW;

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-16 px-2 sm:px-4">
      {/* Header with Title and Language Selection */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2.5">
            <Sparkles className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
            {t('ai_title')}
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            {t('ai_subtitle')}
          </p>
        </div>

        {/* Section F: Language Selection & Controls */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-700/60 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-600">
            <Globe className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            <select
              value={language}
              onChange={(e) => handleLanguageChange(e.target.value)}
              className="bg-transparent text-xs sm:text-sm font-semibold text-slate-800 dark:text-slate-100 focus:outline-none cursor-pointer"
            >
              {languages.map((lang) => (
                <option key={lang.code} value={lang.code} className="dark:bg-slate-800 dark:text-white">
                  {lang.nativeLabel} ({lang.label})
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={() => loadAnalysis(true, userCoords, language)}
            disabled={analyzing}
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-medium transition"
            title="Refresh flood situation"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${analyzing ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">{t('action_refresh')}</span>
          </button>
        </div>
      </div>

      {/* Critical or High Warning Banner */}
      {(isCritical || isHigh) && (
        <div className="rounded-2xl p-5 bg-gradient-to-r from-red-600 to-rose-700 text-white shadow-lg flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="p-3 bg-white/20 rounded-xl shrink-0">
              <ShieldAlert className="w-7 h-7 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 text-xs font-black uppercase bg-white text-red-700 rounded-full">
                  {riskLabel}
                </span>
                <span className="text-xs text-red-100">
                  {analysis?.last_analyzed ? formatRelative(analysis.last_analyzed) : 'Updated just now'}
                </span>
              </div>
              <h2 className="text-lg font-bold mt-1 text-white">{t('ai_critical_banner_title')}</h2>
              <p className="text-red-100 text-xs sm:text-sm mt-1 max-w-2xl leading-relaxed">
                {stripMarkdown(analysis?.user_message) || t('ai_critical_banner_desc')}
              </p>
            </div>
          </div>
          {sheltersData?.nearest_shelter ? (
            <button
              type="button"
              onClick={() => handleRecommendRoute(sheltersData.nearest_shelter.id, [sheltersData.nearest_shelter.latitude, sheltersData.nearest_shelter.longitude])}
              className="px-4 py-2 bg-white text-red-700 font-bold rounded-xl shadow hover:bg-red-50 text-xs sm:text-sm flex items-center gap-1.5 transition self-end md:self-center shrink-0"
            >
              <Navigation className="w-4 h-4" />
              {t('ai_nearest_shelter')} ({sheltersData.nearest_shelter.name.slice(0, 20)}…)
            </button>
          ) : (
            <button
              type="button"
              onClick={handleDetectLocation}
              className="px-4 py-2 bg-white text-red-700 font-bold rounded-xl shadow hover:bg-red-50 text-xs sm:text-sm flex items-center gap-1.5 transition self-end md:self-center shrink-0"
            >
              <Locate className="w-4 h-4" />
              {t('ai_nearby_safe_places')}
            </button>
          )}
        </div>
      )}

      {/* Grid: Sections A & B */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* SECTION A: Current Flood Situation */}
        <div className={`bg-white dark:bg-slate-800 rounded-2xl p-6 border ${currentRisk.border} shadow-sm space-y-4`}>
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-700 pb-3">
            <div className="flex items-center gap-2">
              <span className={`w-3.5 h-3.5 rounded-full ${currentRisk.pill}`}></span>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                {t('ai_current_situation')}
              </h2>
            </div>
            <span className={`px-3 py-1 rounded-full text-xs font-bold border uppercase tracking-wider ${currentRisk.badge}`}>
              {riskLabel}
            </span>
          </div>

          {/* Short conversational AI-generated explanation */}
          <div className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed whitespace-pre-line">
            {stripMarkdown(analysis?.summary) || "Analyzing real-time hydrological conditions from monitored river gauges and LSTM predictions..."}
          </div>

          {/* Action indicator */}
          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-750/70 border border-slate-200 dark:border-slate-700/80 flex items-center justify-between">
            <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">{t('ai_recommended_action')}</span>
            <span className={`text-xs font-bold uppercase ${currentRisk.accent}`}>
              {analysis?.recommended_action?.replace(/_/g, ' ') || 'MONITOR CONDITIONS'}
            </span>
          </div>
        </div>

        {/* SECTION B: What Should I Do? */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 border border-slate-200 dark:border-slate-700 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-700 pb-3">
            <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
              {t('ai_what_should_i_do')}
            </h2>
            <span className="text-xs text-slate-400">{t('ai_essential_safety_guidance')}</span>
          </div>

          <div className="space-y-2.5">
            {analysis?.safety_precautions && analysis.safety_precautions.length > 0 ? (
              analysis.safety_precautions.slice(0, 4).map((instruction, idx) => (
                <div
                  key={idx}
                  className="flex items-start gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-750/50 border border-slate-100 dark:border-slate-700/60 text-xs sm:text-sm text-slate-800 dark:text-slate-200"
                >
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                  <span className="leading-relaxed">{stripMarkdown(instruction)}</span>
                </div>
              ))
            ) : (
              <div className="space-y-2 text-xs text-slate-500">
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-750">1. Monitor official weather announcements and stay alert.</div>
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-750">2. Keep drainage paths and gutters clean around your premises.</div>
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-750">3. Avoid parking or moving near riverbanks and low-lying storm drains.</div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Grid: Sections C & D (Nearby Safe Places & Find Safe Route) */}
      <div ref={mapContainerRef} className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* SECTION C: Nearby Safe Places */}
        <div className="col-span-1 bg-white dark:bg-slate-800 rounded-2xl p-6 border border-slate-200 dark:border-slate-700 shadow-sm space-y-4 flex flex-col justify-between">
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-700 pb-3">
              <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <MapPin className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                {t('ai_nearby_safe_places')}
              </h2>
              <button
                type="button"
                onClick={handleDetectLocation}
                disabled={locating}
                className="text-xs text-indigo-600 dark:text-indigo-400 font-semibold hover:underline flex items-center gap-1"
              >
                <Locate className={`w-3.5 h-3.5 ${locating ? 'animate-spin' : ''}`} />
                {locating ? '...' : t('ai_use_my_gps')}
              </button>
            </div>

            {/* GPS coordinates status */}
            {userCoords ? (
              <div className="text-[11px] text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 p-2 rounded-lg border border-blue-100 dark:border-blue-800">
                GPS: <strong>{userCoords.lat.toFixed(4)}, {userCoords.lng.toFixed(4)}</strong>
              </div>
            ) : (
              <form onSubmit={handleApplyManualCoords} className="flex items-center gap-1.5 text-xs">
                <input
                  type="number"
                  step="any"
                  placeholder="Latitude"
                  value={manualLat}
                  onChange={(e) => setManualLat(e.target.value)}
                  className="w-1/2 px-2.5 py-1.5 border border-slate-200 dark:border-slate-600 rounded-lg dark:bg-slate-700 dark:text-white text-xs"
                />
                <input
                  type="number"
                  step="any"
                  placeholder="Longitude"
                  value={manualLng}
                  onChange={(e) => setManualLng(e.target.value)}
                  className="w-1/2 px-2.5 py-1.5 border border-slate-200 dark:border-slate-600 rounded-lg dark:bg-slate-700 dark:text-white text-xs"
                />
                <button
                  type="submit"
                  className="px-2.5 py-1.5 bg-indigo-600 text-white rounded-lg font-medium text-xs shrink-0"
                >
                  Set
                </button>
              </form>
            )}

            {/* Shelters List */}
            {loadingShelters ? (
              <div className="py-8 text-center text-xs text-slate-400">{t('ai_searching_shelters')}</div>
            ) : sheltersData?.nearest_shelter ? (
              <div className="space-y-3 max-h-[380px] overflow-y-auto pr-1">
                {/* Nearest Verified Shelter */}
                <div className="p-4 rounded-xl border-2 border-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/30 space-y-2">
                  <div className="flex items-start justify-between">
                    <div>
                      <span className="text-[10px] font-black uppercase bg-indigo-600 text-white px-2 py-0.5 rounded-full inline-block">
                        {t('ai_nearest_shelter')}
                      </span>
                      <h3 className="font-bold text-slate-900 dark:text-white text-sm mt-1">
                        {sheltersData.nearest_shelter.name}
                      </h3>
                    </div>
                    <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400 shrink-0">
                      {sheltersData.nearest_shelter.distance_km} km
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-300">
                    {sheltersData.nearest_shelter.address}
                  </p>
                  <div className="flex items-center justify-between text-xs pt-1">
                    <span className="text-emerald-700 dark:text-emerald-400 font-semibold">
                      {sheltersData.nearest_shelter.available_spots} {t('ai_spots_available')}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleRecommendRoute(sheltersData.nearest_shelter.id, [sheltersData.nearest_shelter.latitude, sheltersData.nearest_shelter.longitude])}
                      disabled={routingLoading}
                      className="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-medium flex items-center gap-1 transition"
                    >
                      <Navigation className="w-3 h-3" />
                      {t('ai_view_route')}
                    </button>
                  </div>
                </div>

                {/* Alternative Shelters */}
                {sheltersData.alternative_shelters?.map((sh) => (
                  <div key={sh.id} className="p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-750 space-y-1.5">
                    <div className="flex items-start justify-between">
                      <h4 className="font-semibold text-slate-800 dark:text-slate-200 text-xs">
                        {sh.name}
                      </h4>
                      <span className="text-xs text-slate-500">{sh.distance_km} km</span>
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      {sh.address}
                    </p>
                    <div className="flex items-center justify-between text-xs pt-1">
                      <span className="text-slate-600 dark:text-slate-400 text-[11px]">
                        {sh.available_spots} {t('ai_spots_open')}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleRecommendRoute(sh.id, [sh.latitude, sh.longitude])}
                        className="px-2 py-1 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded text-xs font-medium"
                      >
                        {t('ai_view_route')}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-6 text-center border border-dashed border-slate-200 dark:border-slate-700 rounded-xl space-y-2">
                <Compass className="w-8 h-8 text-slate-400 mx-auto" />
                <p className="text-xs text-slate-500 leading-relaxed">
                  {userCoords
                    ? t('ai_no_shelters_found')
                    : t('ai_detect_gps_prompt')}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* SECTION D: Find Safe Route & Map */}
        <div className="col-span-1 lg:col-span-2 bg-white dark:bg-slate-800 rounded-2xl p-6 border border-slate-200 dark:border-slate-700 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-700 pb-3">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Navigation className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                {t('ai_find_safe_route')}
              </h2>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                {t('ai_route_desc')}
              </span>
            </div>

            {selectedRoute && (
              <div className="flex items-center gap-3 text-xs">
                <span className="font-semibold text-slate-700 dark:text-slate-300">
                  {selectedRoute.distance_km} km ({selectedRoute.duration_minutes} min)
                </span>
                <span className={`px-2.5 py-0.5 rounded-full font-bold ${
                  selectedRoute.safety_status === 'UNSAFE'
                    ? 'bg-red-100 text-red-800 dark:bg-red-900/60 dark:text-red-300'
                    : selectedRoute.safety_status === 'CAUTION'
                    ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-300'
                    : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300'
                }`}>
                  {selectedRoute.safety_status === 'UNSAFE' ? t('ai_route_hazard') :
                   selectedRoute.safety_status === 'CAUTION' ? t('ai_route_caution') : t('ai_route_safe')}
                </span>
              </div>
            )}
          </div>

          {selectedRoute?.safety_notes && (
            <div className="text-xs text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-750 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 leading-relaxed">
              <strong>{t('ai_road_advisory')}</strong> {selectedRoute.safety_notes}
            </div>
          )}

          {/* Interactive Leaflet Map */}
          <div className="h-[360px] sm:h-[400px] rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 relative">
            <MapContainer
              center={INDIA_CENTER}
              zoom={5}
              style={{ height: '100%', width: '100%' }}
            >
              <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} />
              {mapTarget && <MapFlyTo target={mapTarget} />}

              {/* User Location Marker */}
              {userCoords && (
                <Marker position={[userCoords.lat, userCoords.lng]} icon={userMarkerIcon}>
                  <Popup>
                    <div className="text-xs p-1">
                      <strong>GPS Location</strong>
                      <div>{userCoords.lat.toFixed(4)}, {userCoords.lng.toFixed(4)}</div>
                    </div>
                  </Popup>
                </Marker>
              )}

              {/* Monitored Sensor & Danger Radius */}
              {analysis?.affected_area?.latitude && analysis?.affected_area?.longitude && (
                <>
                  <Marker
                    position={[analysis.affected_area.latitude, analysis.affected_area.longitude]}
                    icon={sensorMarkerIcon}
                  >
                    <Popup>
                      <div className="text-xs p-1">
                        <strong>{analysis.affected_area.name || "Monitored River Sensor"}</strong>
                        <div>Risk: {riskLabel}</div>
                        <div>Water Level: {analysis.sensor_analysis?.water_level} m</div>
                      </div>
                    </Popup>
                  </Marker>
                  <Circle
                    center={[analysis.affected_area.latitude, analysis.affected_area.longitude]}
                    radius={(analysis.affected_area.radius_km || 5.0) * 1000}
                    pathOptions={{
                      color: isCritical ? '#dc2626' : isHigh ? '#f59e0b' : '#3b82f6',
                      fillColor: isCritical ? '#dc2626' : isHigh ? '#f59e0b' : '#3b82f6',
                      fillOpacity: 0.15,
                      weight: 1.5,
                      dashArray: '4, 4',
                    }}
                  />
                </>
              )}

              {/* Hazard Alerts Circles */}
              {activeAlerts.map((alert) => (
                alert.latitude && alert.longitude && (
                  <Circle
                    key={alert.id}
                    center={[alert.latitude, alert.longitude]}
                    radius={(alert.radius_km || 2.0) * 1000}
                    pathOptions={{
                      color: alert.severity === 'critical' ? '#b91c1c' : '#d97706',
                      fillColor: '#ef4444',
                      fillOpacity: 0.2,
                      weight: 1,
                    }}
                  >
                    <Popup>
                      <div className="text-xs p-1">
                        <strong>⚠️ {alert.title}</strong>
                        <div>{alert.message}</div>
                      </div>
                    </Popup>
                  </Circle>
                )
              ))}

              {/* Nearest Shelter Marker */}
              {sheltersData?.nearest_shelter && (
                <Marker
                  position={[sheltersData.nearest_shelter.latitude, sheltersData.nearest_shelter.longitude]}
                  icon={shelterMarkerIcon}
                >
                  <Popup>
                    <div className="text-xs p-1">
                      <strong>🏛️ {sheltersData.nearest_shelter.name}</strong>
                      <div>{sheltersData.nearest_shelter.address}</div>
                      <div>{sheltersData.nearest_shelter.available_spots} {t('ai_spots_available')}</div>
                    </div>
                  </Popup>
                </Marker>
              )}

              {/* Alternative Shelters Markers */}
              {sheltersData?.alternative_shelters?.map((sh) => (
                <Marker key={sh.id} position={[sh.latitude, sh.longitude]} icon={shelterMarkerIcon}>
                  <Popup>
                    <div className="text-xs p-1">
                      <strong>🏛️ {sh.name}</strong>
                      <div>{sh.address}</div>
                      <div>{sh.available_spots} {t('ai_spots_open')}</div>
                    </div>
                  </Popup>
                </Marker>
              ))}

              {/* Recommended Route Polyline */}
              {selectedRoute?.route_coordinates && selectedRoute.route_coordinates.length > 0 && (
                <Polyline
                  positions={selectedRoute.route_coordinates}
                  pathOptions={{
                    color: selectedRoute.safety_status === 'UNSAFE' ? '#dc2626' : selectedRoute.safety_status === 'CAUTION' ? '#d97706' : '#10b981',
                    weight: 5,
                    opacity: 0.9,
                    dashArray: selectedRoute.safety_status === 'UNSAFE' ? '8, 8' : undefined,
                  }}
                />
              )}
            </MapContainer>
          </div>
        </div>
      </div>

      {/* SECTION E: Ask AI Assistant (Minimal Chat Experience) */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 border border-slate-200 dark:border-slate-700 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-700 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-indigo-600 text-white shadow-sm">
              <Bot className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-bold text-slate-900 dark:text-white text-base">
                {t('ai_ask_assistant')}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {t('ai_ask_subtitle')}
              </p>
            </div>
          </div>
          <span className={`text-xs px-2.5 py-1 rounded-full font-semibold flex items-center gap-1.5 ${
            geminiStatus?.connected
              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
              : 'bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300'
          }`}>
            <span className={`w-2 h-2 rounded-full ${geminiStatus?.connected ? 'bg-emerald-500 animate-pulse' : 'bg-blue-500'}`}></span>
            {geminiStatus?.connected ? t('ai_online') : t('ai_offline_rules')}
          </span>
        </div>

        {/* Suggested Quick Questions */}
        <div className="flex flex-wrap gap-2 pt-1">
          {QUICK_QUESTION_KEYS.map((key) => {
            const questionText = t(key);
            return (
              <button
                key={key}
                type="button"
                onClick={() => handleSendMessage(questionText)}
                className="px-3 py-1.5 rounded-full text-xs bg-slate-100 dark:bg-slate-750 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition"
              >
                {questionText}
              </button>
            );
          })}
        </div>

        {/* Chat History Box */}
        <div className="h-80 overflow-y-auto space-y-3.5 p-4 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800">
          {chatMessages.map((msg, index) => (
            <div
              key={index}
              className={`flex items-start gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {msg.role === 'assistant' && (
                <div className="w-7 h-7 rounded-lg bg-indigo-600 text-white flex items-center justify-center shrink-0 mt-0.5 shadow-sm">
                  <Bot className="w-4 h-4" />
                </div>
              )}
              <div
                className={`max-w-[90%] md:max-w-[80%] rounded-2xl p-4 text-xs sm:text-sm leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-blue-600 text-white rounded-br-none shadow-sm'
                    : 'bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 rounded-bl-none shadow-sm border border-slate-200 dark:border-slate-700'
                }`}
              >
                {/* Natural text message */}
                <div className="whitespace-pre-line leading-relaxed">
                  {stripMarkdown(msg.text)}
                </div>

                {/* Shelter recommendation snippet inside chat */}
                {msg.nearest_shelter && (
                  <div className="mt-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-750 border border-slate-200 dark:border-slate-600 text-xs space-y-1.5">
                    <div className="flex items-center justify-between">
                      <strong className="text-slate-900 dark:text-white">
                        🏛️ {msg.nearest_shelter.name}
                      </strong>
                      <span className="font-bold text-indigo-600 dark:text-indigo-400">
                        {msg.nearest_shelter.distance_km} km
                      </span>
                    </div>
                    <div className="text-slate-500 dark:text-slate-400">{msg.nearest_shelter.address}</div>
                    <div className="flex items-center justify-between pt-1">
                      <span className="text-emerald-700 dark:text-emerald-400">
                        {msg.nearest_shelter.available_spots} {t('ai_spots_available')}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleRecommendRoute(msg.nearest_shelter.id, [msg.nearest_shelter.latitude, msg.nearest_shelter.longitude])}
                        className="px-2.5 py-1 bg-indigo-600 text-white rounded-lg text-xs font-semibold"
                      >
                        {t('ai_view_route')}
                      </button>
                    </div>
                  </div>
                )}

                <div className={`text-[10px] mt-1.5 ${msg.role === 'user' ? 'text-blue-100' : 'text-slate-400'}`}>
                  {formatRelative(msg.time)}
                </div>
              </div>
              {msg.role === 'user' && (
                <div className="w-7 h-7 rounded-lg bg-blue-700 text-white flex items-center justify-center shrink-0 mt-0.5 shadow-sm">
                  <UserIcon className="w-4 h-4" />
                </div>
              )}
            </div>
          ))}
          {chatLoading && (
            <div className="flex items-center gap-2 text-xs text-slate-500 italic p-2">
              <Bot className="w-4 h-4 animate-bounce text-indigo-500" />
              {t('ai_thinking')}
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        {/* Input Bar */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSendMessage();
          }}
          className="flex items-center gap-2 pt-1"
        >
          <input
            type="text"
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            placeholder={t('ai_ask_placeholder')}
            className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-750 dark:text-white text-xs sm:text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
          />
          <button
            type="submit"
            disabled={!chatInput.trim() || chatLoading}
            className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs sm:text-sm font-semibold flex items-center gap-1.5 transition disabled:opacity-50 shrink-0"
          >
            <Send className="w-4 h-4" />
            <span>{t('ai_send')}</span>
          </button>
        </form>
      </div>

      {/* OPTIONAL EXPANDABLE SECTION: View Sensor Details */}
      <div className="border border-slate-200 dark:border-slate-700 rounded-2xl bg-white dark:bg-slate-800 overflow-hidden shadow-sm">
        <button
          type="button"
          onClick={() => setShowSensorDetails(!showSensorDetails)}
          className="w-full px-6 py-4 flex items-center justify-between text-left hover:bg-slate-50 dark:hover:bg-slate-750 transition"
        >
          <div className="flex items-center gap-2.5">
            <Activity className="w-5 h-5 text-blue-500" />
            <span className="font-bold text-slate-900 dark:text-white text-sm sm:text-base">
              {t('ai_view_sensor_details')}
            </span>
            <span className="text-xs text-slate-400">
              {t('ai_sensor_details_desc')}
            </span>
          </div>
          {showSensorDetails ? (
            <ChevronUp className="w-5 h-5 text-slate-400" />
          ) : (
            <ChevronDown className="w-5 h-5 text-slate-400" />
          )}
        </button>

        {showSensorDetails && (
          <div className="p-6 border-t border-slate-100 dark:border-slate-700 space-y-6 bg-slate-50/50 dark:bg-slate-900/30">
            {/* Sensor Telemetry Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="p-4 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 space-y-1">
                <div className="text-xs text-slate-400 flex items-center gap-1">
                  <Droplets className="w-3.5 h-3.5 text-blue-500" />
                  {t('ai_water_level')}
                </div>
                <div className="text-lg font-bold text-slate-900 dark:text-white">
                  {formatNumber(analysis?.sensor_analysis?.water_level)} m
                </div>
                <div className="text-[11px] text-slate-500">
                  {t('ai_trend')}: {analysis?.sensor_analysis?.trend || 'STABLE'}
                </div>
              </div>

              <div className="p-4 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 space-y-1">
                <div className="text-xs text-slate-400 flex items-center gap-1">
                  <CloudRain className="w-3.5 h-3.5 text-indigo-500" />
                  {t('ai_rainfall_rate')}
                </div>
                <div className="text-lg font-bold text-slate-900 dark:text-white">
                  {formatNumber(analysis?.sensor_analysis?.rainfall)} mm/h
                </div>
                <div className="text-[11px] text-slate-500">
                  River Flow: {formatNumber(analysis?.sensor_analysis?.river_flow)} m/s
                </div>
              </div>

              <div className="p-4 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 space-y-1">
                <div className="text-xs text-slate-400 flex items-center gap-1">
                  <TrendingUp className="w-3.5 h-3.5 text-amber-500" />
                  {t('ai_rate_of_rise')}
                </div>
                <div className="text-lg font-bold text-slate-900 dark:text-white">
                  {formatNumber(analysis?.sensor_analysis?.rate_of_increase_per_hour)} m/h
                </div>
                <div className="text-[11px] text-slate-500 flex items-center gap-1">
                  <span>{t('ai_freshness')}:</span>
                  <span className={`px-1.5 py-0.2 rounded font-semibold ${
                    analysis?.sensor_analysis?.data_status === 'STALE'
                      ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-300'
                      : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300'
                  }`}>
                    {analysis?.sensor_analysis?.data_status === 'STALE' ? t('ai_stale_warning_badge') : t('ai_fresh_badge')}
                  </span>
                  <span>({t('ai_telemetry_age', { minutes: analysis?.sensor_analysis?.reading_age_minutes || 0 })})</span>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 space-y-1">
                <div className="text-xs text-slate-400 flex items-center gap-1">
                  <Sparkles className="w-3.5 h-3.5 text-purple-500" />
                  {t('ai_confidence')}
                </div>
                <div className="text-base font-bold text-slate-900 dark:text-white">
                  Deep LSTM v2.1
                </div>
                <div className="text-[11px] text-slate-500">
                  {analysis?.confidence || 'MEDIUM'}
                </div>
              </div>
            </div>

            {/* Stale data notice if telemetry is delayed */}
            {analysis?.sensor_analysis?.data_status === 'STALE' && (
              <div className="p-3.5 bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-700 rounded-xl flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <div className="text-xs text-amber-900 dark:text-amber-200">
                  {t('ai_data_stale_notice')}
                </div>
              </div>
            )}

            {/* Anomaly warning if applicable */}
            {analysis?.sensor_analysis?.sensor_malfunction_suspected && (
              <div className="p-3.5 bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-700 rounded-xl flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <div className="text-xs text-amber-900 dark:text-amber-200">
                  <strong>{t('ai_sensor_anomaly')}:</strong> {analysis?.sensor_analysis?.malfunction_reason}
                </div>
              </div>
            )}

            {/* Emergency Helplines & System Verification */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 rounded-xl bg-slate-900 text-white space-y-2 text-xs">
                <div className="font-bold flex items-center justify-between text-slate-200">
                  <span>{t('ai_emergency_contacts')}</span>
                  <PhoneCall className="w-4 h-4 text-emerald-400" />
                </div>
                <div className="grid grid-cols-2 gap-2 text-slate-300 text-[11px]">
                  <div>National Emergency: <strong className="text-white">112</strong></div>
                  <div>NDRF Disaster: <strong className="text-white">1078</strong></div>
                  <div>Disaster Helpline: <strong className="text-white">1070</strong></div>
                  <div>Ambulance: <strong className="text-white">108</strong></div>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs space-y-1.5">
                <div className="font-bold text-slate-900 dark:text-white flex items-center justify-between">
                  <span>Google Gemini Integration Status</span>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                    geminiStatus?.connected
                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                      : 'bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300'
                  }`}>
                    {geminiStatus?.connected ? 'Live Gemini Model' : 'Deterministic Safety Engine'}
                  </span>
                </div>
                <p className="text-slate-500 dark:text-slate-400 text-[11px]">
                  Model: <strong>{geminiStatus?.model || 'gemini-2.5-flash'}</strong> · Configured: <strong>{geminiStatus?.configured ? 'Yes' : 'Awaiting GEMINI_API_KEY'}</strong>
                </p>
                <p className="text-slate-400 text-[10px]">
                  {geminiStatus?.message || "Deterministic flood safety rules active."}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

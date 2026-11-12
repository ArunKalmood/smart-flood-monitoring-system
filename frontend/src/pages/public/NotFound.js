import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Waves, Home, ArrowLeft } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';

export default function NotFound() {
  const { t } = useLanguage();
  return (
    <div className="public-hero min-h-screen flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center max-w-md">
        <motion.div animate={{ y: [-10, 10, -10] }} transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
          className="w-24 h-24 rounded-3xl bg-blue-500/15 flex items-center justify-center mx-auto mb-6" aria-hidden="true">
          <Waves className="w-12 h-12 text-blue-500" />
        </motion.div>
        <h1 className="text-8xl font-black public-heading mb-2">404</h1>
        <h2 className="text-2xl font-bold public-muted mb-3">{t('notfound_title')}</h2>
        <p className="public-muted text-sm mb-8">{t('notfound_text')}</p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link to="/" className="btn-primary px-6 py-3"><Home className="w-4 h-4" aria-hidden="true" /> {t('action_back_home')}</Link>
          <Link to="/dashboard" className="btn-outline px-6 py-3"><ArrowLeft className="w-4 h-4" aria-hidden="true" /> {t('nav_dashboard')}</Link>
        </div>
      </motion.div>
    </div>
  );
}

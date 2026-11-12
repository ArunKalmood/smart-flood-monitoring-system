import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Users, CheckCircle, Waves, Info } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import VolunteerForm from '../../components/volunteers/VolunteerForm';

export default function VolunteerRegister() {
  const { t } = useLanguage();
  const [submitted, setSubmitted] = useState(false);

  if (submitted) {
    return (
      <div className="public-hero min-h-screen flex items-center justify-center p-4">
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="auth-card max-w-md w-full text-center" role="status">
          <div className="w-20 h-20 rounded-full bg-green-500/15 flex items-center justify-center mx-auto mb-5">
            <CheckCircle className="w-10 h-10 text-green-600 dark:text-green-400" aria-hidden="true" />
          </div>
          <h1 className="auth-title mb-2">{t('vol_submitted_title')}</h1>
          <p className="auth-muted text-sm mb-6">{t('vol_submitted_text')}</p>
          <Link to="/" className="btn-primary"><Waves className="w-4 h-4" aria-hidden="true" /> {t('action_back_home')}</Link>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="public-hero min-h-screen py-12">
      <div className="max-w-2xl mx-auto px-4">
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-green-500/15 flex items-center justify-center mx-auto mb-4">
            <Users className="w-9 h-9 text-green-600 dark:text-green-400" aria-hidden="true" />
          </div>
          <h1 className="text-3xl font-bold public-heading mb-2">{t('vol_join_title')}</h1>
          <p className="public-muted text-sm max-w-md mx-auto">{t('vol_join_text')}</p>
        </div>

        <div className="auth-card">
          <VolunteerForm submitLabel={t('vol_join_submit')} onSubmitted={() => setSubmitted(true)} />
          <p className="mt-4 flex items-start gap-2 p-3 rounded-xl bg-blue-50 border border-blue-200 text-blue-800 dark:bg-blue-500/10 dark:border-blue-500/30 dark:text-blue-300 text-xs">
            <Info className="w-4 h-4 flex-shrink-0" aria-hidden="true" /> {t('vol_review_note')}
          </p>
        </div>

        <p className="text-center public-muted text-xs mt-6">
          {t('vol_have_account')} <Link to="/login" className="auth-link">{t('auth_sign_in')}</Link>
        </p>
      </div>
    </div>
  );
}

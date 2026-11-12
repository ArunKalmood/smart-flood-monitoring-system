import React from 'react';
import { motion } from 'framer-motion';

export default function AuthCard({ icon: Icon, iconClass = 'bg-blue-500/15 text-blue-600 dark:text-blue-400', title, subtitle, width = 'max-w-md', children }) {
  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className={`w-full ${width}`}>
      <div className="auth-card">
        <div className="text-center mb-6">
          {Icon && (
            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-3 ${iconClass}`}>
              <Icon className="w-8 h-8" aria-hidden="true" />
            </div>
          )}
          <h1 className="auth-title">{title}</h1>
          {subtitle && <p className="auth-muted text-sm mt-1">{subtitle}</p>}
        </div>
        {children}
      </div>
    </motion.div>
  );
}

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { LANGUAGES, getLanguage, setCurrentLanguage, translate } from '../i18n';

const LanguageContext = createContext(null);

export const useLanguage = () => {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage must be used within LanguageProvider');
  return ctx;
};

export function LanguageProvider({ children }) {
  const [language, setLanguageState] = useState(getLanguage);

  const setLanguage = useCallback((code) => {
    setCurrentLanguage(code);
    setLanguageState(getLanguage());
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('lang', language);
  }, [language]);

  // `language` in the deps makes every consumer re-render (and re-translate) on change.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const t = useCallback((key, vars) => translate(key, vars), [language]);

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t, languages: LANGUAGES }}>
      {children}
    </LanguageContext.Provider>
  );
}

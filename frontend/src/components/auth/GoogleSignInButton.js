import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useLanguage } from '../../context/LanguageContext';

const SCRIPT_ID = 'google-gsi-client';
let scriptRefCount = 0;

function getScriptUrl(lang) {
  return `https://accounts.google.com/gsi/client?hl=${lang || 'en'}`;
}

export default function GoogleSignInButton({
  onCredential,
  disabled = false,
  mode = 'login',
  text,
}) {
  const { t, language } = useLanguage();
  const btnContainerRef = useRef(null);
  const clientId = process.env.REACT_APP_GOOGLE_CLIENT_ID;
  const isConfigured = Boolean(clientId && clientId.trim());

  const [scriptState, setScriptState] = useState(() => {
    return typeof window !== 'undefined' && window.google?.accounts?.id ? 'loaded' : 'loading';
  });

  const buttonText = text || (mode === 'register' ? 'signup_with' : 'continue_with');
  const isMountedRef = useRef(true);
  const isSubmittingRef = useRef(false);
  const debounceTimerRef = useRef(null);
  const resizeObserverRef = useRef(null);
  const mutationObserverRef = useRef(null);
  const lastWidthRef = useRef(384);
  const scriptElementRef = useRef(null);
  const scriptLoadHandlerRef = useRef(null);
  const scriptErrorHandlerRef = useRef(null);

  // Reset submission guard when re-enabled
  useEffect(() => {
    if (!disabled) {
      isSubmittingRef.current = false;
    }
  }, [disabled]);

  const renderGoogleButton = useCallback(() => {
    if (!isMountedRef.current || !window.google?.accounts?.id || !btnContainerRef.current) return;

    const isDark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark');
    const measured = btnContainerRef.current.offsetWidth;
    const width = measured && measured > 0
      ? Math.max(200, Math.min(Math.floor(measured), 400))
      : 384;

    lastWidthRef.current = width;

    window.google.accounts.id.initialize({
      client_id: clientId,
      auto_select: false,
      callback: (response) => {
        if (disabled || isSubmittingRef.current) return;
        if (response?.credential && onCredential) {
          isSubmittingRef.current = true;
          onCredential(response.credential);
        }
      },
    });

    btnContainerRef.current.innerHTML = '';
    window.google.accounts.id.renderButton(btnContainerRef.current, {
      type: 'standard',
      theme: isDark ? 'filled_black' : 'outline',
      size: 'large',
      text: buttonText,
      shape: 'rectangular',
      logo_alignment: 'left',
      width: width,
      locale: language,
    });
  }, [clientId, disabled, onCredential, buttonText, language]);

  const debouncedRender = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(() => {
      if (isMountedRef.current && window.google?.accounts?.id && btnContainerRef.current) {
        renderGoogleButton();
      }
    }, 100);
  }, [renderGoogleButton]);

  // Handle GIS script loading & language switches
  useEffect(() => {
    if (!isConfigured) return;

    isMountedRef.current = true;
    scriptRefCount += 1;

    const targetSrc = getScriptUrl(language);

    if (window.google?.accounts?.id) {
      setScriptState('loaded');
      renderGoogleButton();
    } else {
      setScriptState('loading');
      let script = document.getElementById(SCRIPT_ID);

      if (script && script.getAttribute('src') !== targetSrc) {
        script.remove();
        script = null;
      }

      if (!script) {
        script = document.createElement('script');
        script.id = SCRIPT_ID;
        script.src = targetSrc;
        script.async = true;
        script.defer = true;
        document.head.appendChild(script);
      }

      const handleLoad = () => {
        if (!isMountedRef.current) return;
        if (window.google?.accounts?.id) {
          setScriptState('loaded');
          renderGoogleButton();
        } else {
          setScriptState('error');
        }
      };

      const handleError = () => {
        if (!isMountedRef.current) return;
        setScriptState('error');
      };

      script.addEventListener('load', handleLoad);
      script.addEventListener('error', handleError);

      scriptElementRef.current = script;
      scriptLoadHandlerRef.current = handleLoad;
      scriptErrorHandlerRef.current = handleError;
    }

    return () => {
      isMountedRef.current = false;
      scriptRefCount = Math.max(0, scriptRefCount - 1);

      if (scriptElementRef.current) {
        if (scriptLoadHandlerRef.current) {
          scriptElementRef.current.removeEventListener('load', scriptLoadHandlerRef.current);
        }
        if (scriptErrorHandlerRef.current) {
          scriptElementRef.current.removeEventListener('error', scriptErrorHandlerRef.current);
        }
      }

      if (scriptRefCount === 0) {
        const s = document.getElementById(SCRIPT_ID);
        if (s) s.remove();
      }
    };
  }, [isConfigured, language, renderGoogleButton]);

  // Observe width resize and root theme class changes
  useEffect(() => {
    if (!isConfigured) return;

    if (typeof ResizeObserver !== 'undefined' && btnContainerRef.current) {
      const resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const w = Math.max(
            200,
            Math.min(
              Math.floor(entry.contentRect.width || entry.target.offsetWidth || 0),
              400
            )
          );
          if (w > 0 && Math.abs(w - lastWidthRef.current) >= 4) {
            debouncedRender();
          }
        }
      });
      resizeObserver.observe(btnContainerRef.current);
      resizeObserverRef.current = resizeObserver;
    }

    let lastDark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark');
    if (typeof MutationObserver !== 'undefined') {
      const mutationObserver = new MutationObserver(() => {
        const currentDark = document.documentElement.classList.contains('dark');
        if (currentDark !== lastDark) {
          lastDark = currentDark;
          debouncedRender();
        }
      });
      mutationObserver.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['class'],
      });
      mutationObserverRef.current = mutationObserver;
    }

    return () => {
      if (resizeObserverRef.current) {
        resizeObserverRef.current.disconnect();
        resizeObserverRef.current = null;
      }
      if (mutationObserverRef.current) {
        mutationObserverRef.current.disconnect();
        mutationObserverRef.current = null;
      }
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
    };
  }, [isConfigured, debouncedRender]);

  if (!isConfigured) {
    if (process.env.NODE_ENV === 'development') {
      return (
        <div
          data-testid="google-signin-dev-notice"
          className="w-full my-4 p-3 rounded-xl border border-dashed border-amber-300 dark:border-amber-500/40 bg-amber-50/60 dark:bg-amber-500/10 text-amber-800 dark:text-amber-300 text-xs text-center leading-relaxed"
          role="note"
        >
          Google sign-in is off. Set REACT_APP_GOOGLE_CLIENT_ID in frontend/.env and restart npm start.
        </div>
      );
    }
    return null;
  }

  return (
    <div
      role="group"
      aria-label={t('auth_google_signin')}
      className={`w-full ${disabled ? 'pointer-events-none opacity-60' : ''}`}
    >
      <div className="flex justify-center w-full min-h-[44px]">
        {scriptState === 'loading' && (
          <div
            data-testid="google-signin-placeholder"
            aria-hidden="true"
            className="w-full max-w-[400px] h-[44px] rounded-lg bg-slate-100 dark:bg-white/5 border border-slate-200/60 dark:border-white/10 flex items-center justify-center animate-pulse"
          />
        )}
        {scriptState === 'error' && (
          <p
            data-testid="google-signin-error"
            className="text-center text-xs text-slate-500 dark:text-slate-400 py-2"
            role="status"
          >
            {t('google_signin_unavailable')}
          </p>
        )}
        <div
          ref={btnContainerRef}
          data-testid="google-signin-btn-container"
          className={`w-full max-w-[400px] flex justify-center ${scriptState !== 'loaded' ? 'hidden' : ''}`}
        />
      </div>

      {scriptState !== 'error' && (
        <p className="text-center text-[11px] leading-relaxed text-slate-500 dark:text-slate-400 mt-2 px-1 max-w-[400px] mx-auto line-clamp-2">
          {t('google_signin_consent')}
        </p>
      )}

      <div className="relative my-5" aria-hidden="true">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-slate-200 dark:border-white/10" />
        </div>
        <div className="relative flex justify-center text-xs">
          <span className="bg-white/90 dark:bg-slate-900/90 px-3 text-slate-500 dark:text-slate-400 font-medium">
            {t('google_or_email')}
          </span>
        </div>
      </div>
    </div>
  );
}

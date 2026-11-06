'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { translations, TranslationKey, Language } from '@/lib/translations';

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  toggleLanguage: () => void;
  isRtl: boolean;
  t: (key: TranslationKey) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  // Default is English; the visitor can switch to Arabic and the choice is remembered
  const [preferredLanguage, setPreferredLanguage] = useState<Language>('en');
  const [isAdminRoute, setIsAdminRoute] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- hydration sync from location
      setIsAdminRoute(window.location.pathname.startsWith('/admin'));
    }

    try {
      const saved = localStorage.getItem('triplea_user_language') as Language | null;
      if (saved === 'ar' || saved === 'en') {
        setPreferredLanguage(saved);
      }
    } catch {
      // Ignore
    }
  }, []);

  useEffect(() => {
    const handleLocationChange = () => {
      if (typeof window !== 'undefined') {
        setIsAdminRoute(window.location.pathname.startsWith('/admin'));
      }
    };

    window.addEventListener('popstate', handleLocationChange);
    return () => window.removeEventListener('popstate', handleLocationChange);
  }, []);

  // If on admin dashboard, always keep it in English as requested
  const effectiveLanguage: Language = isAdminRoute ? 'en' : preferredLanguage;
  const isRtl = effectiveLanguage === 'ar';

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.lang = effectiveLanguage;
      document.documentElement.dir = isRtl ? 'rtl' : 'ltr';
    }
  }, [effectiveLanguage, isRtl]);

  const handleSetLanguage = (lang: Language) => {
    setPreferredLanguage(lang);
    try {
      localStorage.setItem('triplea_user_language', lang);
    } catch {
      // Ignore
    }
  };

  const toggleLanguage = () => {
    const nextLang: Language = preferredLanguage === 'ar' ? 'en' : 'ar';
    handleSetLanguage(nextLang);
  };

  const t = (key: TranslationKey): string => {
    const dict = translations[effectiveLanguage] || translations.en;
    return (dict as Record<string, string>)[key] ?? (translations.en as Record<string, string>)[key] ?? key;
  };

  return (
    <LanguageContext.Provider
      value={{
        language: effectiveLanguage,
        setLanguage: handleSetLanguage,
        toggleLanguage,
        isRtl,
        t,
      }}
    >
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
}

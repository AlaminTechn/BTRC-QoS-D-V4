/**
 * i18n — lightweight translation context
 *
 * Usage:
 *   const { t, lang, toggleLang } = useTranslation();
 *   t('div.Dhaka')   // → 'Dhaka' (en) | 'ঢাকা' (bn)
 *
 * Fallback chain: bn[key] → en[key] → key (raw)
 *
 * Wrap the app root with <I18nProvider>.
 */

import React, { createContext, useContext, useState, useCallback } from 'react';
import en from './locales/en.json';
import bn from './locales/bn.json';

const LOCALES = { en, bn };

const I18nContext = createContext({ lang: 'en', t: (k) => k, toggleLang: () => {} });

export const I18nProvider = ({ children }) => {
  const [lang, setLang] = useState('en');

  const t = useCallback(
    (key) => LOCALES[lang]?.[key] ?? LOCALES.en?.[key] ?? key,
    [lang]
  );

  const toggleLang = useCallback(
    () => setLang((l) => (l === 'en' ? 'bn' : 'en')),
    []
  );

  return React.createElement(
    I18nContext.Provider,
    { value: { lang, t, toggleLang } },
    children
  );
};

export const useTranslation = () => useContext(I18nContext);

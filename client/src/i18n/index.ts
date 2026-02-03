import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

// Import translation files from shared resources
import { enResources, ptBRResources } from '@shared/i18n';

const resources = {
  en: {
    translation: enResources,
  },
  'pt-BR': {
    translation: ptBRResources,
  },
};

// Get initial language from boot script or fall back to English
const initialLanguage = (typeof window !== 'undefined' && (window as any).__INITIAL_LANG) || 'en';

// Guard against multiple initializations
if (!i18n.isInitialized) {
  i18n
    .use(initReactI18next)
    .init({
    resources,
    lng: initialLanguage, // Set based on domain detection
    fallbackLng: 'en',
    initImmediate: false, // Synchronous initialization to prevent race conditions
    
    // Disable automatic language detection - we handle this via market detection
    detection: {
      order: [], // Empty array disables automatic detection
      caches: [], // Don't cache automatic detection
    },

    interpolation: {
      escapeValue: false, // React already escapes values
    },

    // Enable debugging in development
    debug: process.env.NODE_ENV === 'development',
  });
}

// Function to set language based on market
export function setLanguageFromMarket(marketId: string) {
  const languageMap: { [key: string]: string } = {
    'us': 'en',
    'br': 'pt-BR',
  };
  
  const language = languageMap[marketId] || 'en';
  
  if (i18n.language !== language) {
    i18n.changeLanguage(language);
  }
}


export default i18n;
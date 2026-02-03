import { useTranslation as useI18nTranslation } from 'react-i18next';

// Custom hook to provide type safety and easier access to translations
export function useTranslation() {
  const { t, i18n } = useI18nTranslation();
  
  return {
    t,
    language: i18n.language,
    changeLanguage: i18n.changeLanguage,
    isReady: i18n.isInitialized,
  };
}

export default useTranslation;
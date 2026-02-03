import { createContext, useContext, ReactNode, useEffect } from 'react';
import { resolveMarket, type MarketConfig } from "@shared/config/markets";
import { setLanguageFromMarket } from "@/i18n";
import { useAuth } from "@/hooks/useAuth";
import i18n from "@/i18n";

interface MarketContextType {
  market: MarketConfig;
  formatCurrency: (amount: number) => string;
  formatDate: (date: Date) => string;
  formatNumber: (num: number) => string;
}

const MarketContext = createContext<MarketContextType | undefined>(undefined);

export function MarketProvider({ children }: { children: ReactNode }) {
  const market = resolveMarket();
  const { user } = useAuth();
  
  // Set language based on market priority for locked markets, then user preference
  useEffect(() => {
    // Priority 1: Market-based language for Brazil (fotopeso) - always force Portuguese
    if (market.id === 'br') {
      setLanguageFromMarket(market.id);
      return;
    }
    
    // Priority 2: User's language preference (for other markets)
    const userLocale = (user as any)?.locale;
    if (user && userLocale) {
      const languageCode = userLocale === 'pt-BR' ? 'pt-BR' : 'en';
      if (i18n.language !== languageCode) {
        i18n.changeLanguage(languageCode);
      }
    } else {
      // Priority 3: Market-based default for other markets
      setLanguageFromMarket(market.id);
    }
  }, [market.id, user]);
  
  // Create formatters for this market
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat(market.locale, {
      style: 'currency',
      currency: market.currency,
      minimumFractionDigits: 2,
    }).format(amount);
  };
  
  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat(market.locale, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }).format(date);
  };
  
  const formatNumber = (num: number) => {
    return new Intl.NumberFormat(market.locale, {
      minimumFractionDigits: 1,
      maximumFractionDigits: 2,
    }).format(num);
  };
  
  const value: MarketContextType = {
    market,
    formatCurrency,
    formatDate,
    formatNumber,
  };

  return (
    <MarketContext.Provider value={value}>
      {children}
    </MarketContext.Provider>
  );
}

export function useMarketContext(): MarketContextType {
  const context = useContext(MarketContext);
  if (context === undefined) {
    throw new Error('useMarketContext must be used within a MarketProvider');
  }
  return context;
}
import type { PaymentProvider, PaymentCurrency } from "../payment/types";

export interface MarketConfig {
  // Market Identity
  id: string;
  name: string;
  domain: string;
  
  // Localization
  locale: string;
  language: string;
  country: string;
  currency: PaymentCurrency;
  
  // Payment Configuration
  paymentProvider: PaymentProvider;
  
  // Regional Settings
  weightUnit: "lbs" | "kg";
  heightUnit: "inches" | "cm";
  timezone: string;
  
  // Branding & UI
  branding: {
    primaryColor: string;
    logoUrl?: string;
    faviconUrl?: string;
    brandName: string;
  };
  
  // SEO & Analytics
  seo: {
    titleSuffix: string;
    description: string;
    keywords: string[];
    language: string;
  };
  
  analytics: {
    googleAnalyticsId?: string;
    facebookPixelId?: string;
    hotjarId?: string;
  };
  
  // Legal & Compliance
  legal: {
    privacyPolicyUrl: string;
    termsOfServiceUrl: string;
    cookiePolicyUrl?: string;
    dataRetentionMonths: number;
  };
  
  // Pricing Display
  pricing: {
    currencySymbol: string;
    displayFormat: "before" | "after"; // $9.99 vs 9,99€
    decimalSeparator: "." | ",";
    thousandsSeparator: "," | "." | " ";
  };
  
  // Features & Limits
  features: {
    socialSharing: boolean;
    emailNotifications: boolean;
    smsNotifications: boolean;
    appleHealthIntegration: boolean;
    googleFitIntegration: boolean;
  };
  
  // Contact & Support
  support: {
    email: string;
    phone?: string;
    chatEnabled: boolean;
    language: string;
  };
  
  // Environment
  environment: "production" | "staging" | "development";
  isActive: boolean;
}

// US Market Configuration
export const US_MARKET: MarketConfig = {
  id: "us",
  name: "United States",
  domain: "scanmyscale.com",
  
  locale: "en-US",
  language: "en",
  country: "US",
  currency: "USD",
  
  paymentProvider: "stripe",
  
  weightUnit: "lbs",
  heightUnit: "inches",
  timezone: "America/New_York",
  
  branding: {
    primaryColor: "#3b82f6",
    brandName: "ScanMyScale",
  },
  
  seo: {
    titleSuffix: "ScanMyScale - Weight Tracking Made Effortless",
    description: "Take a picture. We read your scale. You see your progress. The simplest way to track your weight journey with beautiful charts and insights. No typing, no hassle, just results.",
    keywords: ["weight tracking", "scale reader", "fitness", "health", "AI", "progress tracking"],
    language: "en",
  },
  
  analytics: {
    // Will be configured per deployment
  },
  
  legal: {
    privacyPolicyUrl: "/privacy",
    termsOfServiceUrl: "/terms",
    cookiePolicyUrl: "/cookies",
    dataRetentionMonths: 36,
  },
  
  pricing: {
    currencySymbol: "$",
    displayFormat: "before",
    decimalSeparator: ".",
    thousandsSeparator: ",",
  },
  
  features: {
    socialSharing: true,
    emailNotifications: true,
    smsNotifications: true,
    appleHealthIntegration: true,
    googleFitIntegration: true,
  },
  
  support: {
    email: "support@scanmyscale.com",
    phone: "011-55-86-99927-5072",
    chatEnabled: false,
    language: "en",
  },
  
  environment: "production",
  isActive: true,
};

// Brazil Market Configuration
export const BRAZIL_MARKET: MarketConfig = {
  id: "br",
  name: "Brasil",
  domain: "fotopeso.com.br", // "PhotoWeight" in Portuguese
  
  locale: "pt-BR",
  language: "pt",
  country: "BR",
  currency: "BRL", // Brazilian Real
  
  paymentProvider: "stripe", // Use USD pricing for now
  
  weightUnit: "kg",
  heightUnit: "cm",
  timezone: "America/Sao_Paulo",
  
  branding: {
    primaryColor: "#16a34a", // Green for Brazil
    brandName: "FotoPeso",
  },
  
  seo: {
    titleSuffix: "FotoPeso - Acompanhamento Inteligente de Peso",
    description: "Tire uma foto da sua balança e acompanhe seu peso automaticamente. Análises inteligentes, metas personalizadas e progresso visual.",
    keywords: ["foto peso", "balança inteligente", "emagrecimento", "saúde", "IA", "dieta"],
    language: "pt-BR",
  },
  
  analytics: {
    // Will be configured per deployment
  },
  
  legal: {
    privacyPolicyUrl: "/privacidade",
    termsOfServiceUrl: "/termos",
    cookiePolicyUrl: "/cookies",
    dataRetentionMonths: 24, // Brazil LGPD compliance
  },
  
  pricing: {
    currencySymbol: "R$",
    displayFormat: "before",
    decimalSeparator: ",",
    thousandsSeparator: ".",
  },
  
  features: {
    socialSharing: true,
    emailNotifications: true,
    smsNotifications: false, // SMS costs are higher in Brazil
    appleHealthIntegration: true,
    googleFitIntegration: true,
  },
  
  support: {
    email: "suporte@fotopeso.com.br",
    chatEnabled: true, // Live chat popular in Brazil
    language: "pt-BR",
  },
  
  environment: "production",
  isActive: true,
};

// All markets registry
export const MARKETS: Record<string, MarketConfig> = {
  us: US_MARKET,
  br: BRAZIL_MARKET,
};

// Domain to market mapping
export const DOMAIN_TO_MARKET: Record<string, string> = {
  "scanmyscale.com": "us",
  "www.scanmyscale.com": "us",
  "fotopeso.com.br": "br",
  "www.fotopeso.com.br": "br",
  // Development domains
  "localhost:5000": "us",
  "127.0.0.1:5000": "us",
};

/**
 * Get market configuration by market ID
 */
export function getMarket(marketId: string): MarketConfig | null {
  return MARKETS[marketId] || null;
}

/**
 * Get market configuration by domain
 */
export function getMarketByDomain(domain: string): MarketConfig | null {
  const marketId = DOMAIN_TO_MARKET[domain.toLowerCase()];
  return marketId ? MARKETS[marketId] : null;
}

/**
 * Helper function to read cookie value in the browser
 */
function getCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) {
    return parts.pop()?.split(';').shift() || null;
  }
  return null;
}

/**
 * Get market configuration with fallback logic (for client-side use)
 * This is the centralized market resolution logic that should be used consistently
 */
export function resolveMarket(hostname?: string, browserLanguage?: string): MarketConfig {
  // Use provided hostname or get from window if available
  const currentHostname = hostname || (typeof window !== 'undefined' ? window.location.hostname : '');
  
  // Check if we can detect the original domain from the URL or referrer
  let actualDomain = currentHostname;
  if (typeof window !== 'undefined') {
    // For Replit hosted apps, the original domain might be in the href
    const fullUrl = window.location.href;
    const currentDomain = window.location.hostname;
    
    
    // Check URL for domain indicators
    if (fullUrl.includes('fotopeso.com.br') || currentDomain.includes('fotopeso')) {
      actualDomain = 'fotopeso.com.br';
    } else if (fullUrl.includes('scanmyscale.com') || currentDomain.includes('scanmyscale')) {
      actualDomain = 'scanmyscale.com';
    }
    
    // Also check if the hostname itself contains the domain
    if (currentDomain.includes('fotopeso')) {
      actualDomain = 'fotopeso.com.br';
    } else if (currentDomain.includes('scanmyscale')) {
      actualDomain = 'scanmyscale.com';
    }
  }
  

  // Priority 1: Check URL parameters for override (highest priority for testing)
  if (typeof window !== 'undefined') {
    const urlParams = new URLSearchParams(window.location.search);
    const marketParam = urlParams.get('m'); // Short parameter for easy testing
    
    if (marketParam && MARKETS[marketParam]) {
      return MARKETS[marketParam];
    }
  }

  // Priority 2: Check server-set market cookie (from X-Forwarded-Host detection)
  const cookieMarketId = getCookie('market_id');
  if (cookieMarketId && MARKETS[cookieMarketId]) {
    return MARKETS[cookieMarketId];
  }

  // Priority 3: Direct domain mapping lookup (using actual detected domain)
  const marketId = DOMAIN_TO_MARKET[actualDomain.toLowerCase()];
  if (marketId && MARKETS[marketId]) {
    return MARKETS[marketId];
  }
  
  // Priority 3.5: Special handling for fotopeso.com.br (in case domain detection misses it)
  if (typeof window !== 'undefined') {
    const url = window.location.href;
    const hostname = window.location.hostname;
    if (url.includes('fotopeso.com.br') || hostname.includes('fotopeso')) {
      return BRAZIL_MARKET;
    }
  }
  
  // Priority 4: For Replit deployments, check legacy domain parameter support
  if (typeof window !== 'undefined') {
    const urlParams = new URLSearchParams(window.location.search);
    const domainParam = urlParams.get('domain') || urlParams.get('market');
    
    // Check domain parameter
    if (domainParam) {
      const paramMarketId = DOMAIN_TO_MARKET[domainParam.toLowerCase()];
      if (paramMarketId && MARKETS[paramMarketId]) {
        return MARKETS[paramMarketId];
      }
    }
  }
  
  // Priority 2: Try to find market by domain match (for production deployment)
  for (const market of Object.values(MARKETS)) {
    if (actualDomain === market.domain || actualDomain.endsWith(`.${market.domain}`)) {
      return market;
    }
  }
  
  // Priority 3: For development/localhost only - default to US market
  // Disable browser language detection to ensure consistent behavior
  if (currentHostname.includes('localhost') || currentHostname.includes('127.0.0.1')) {
    // Only use browser language detection for true localhost development
    const currentBrowserLanguage = browserLanguage || (typeof navigator !== 'undefined' ? navigator.language : 'en-US') || 'en-US';
    if (currentBrowserLanguage.startsWith('pt') || currentBrowserLanguage.includes('BR')) {
      return MARKETS.br;
    }
  }
  
  // Default to US market for all other cases (including replit.dev domains)
  return MARKETS.us;
}

/**
 * Get all active markets
 */
export function getActiveMarkets(): MarketConfig[] {
  return Object.values(MARKETS).filter(market => market.isActive);
}

/**
 * Format price according to market preferences
 */
export function formatPrice(amount: number, market: MarketConfig): string {
  const { currencySymbol, displayFormat, decimalSeparator, thousandsSeparator } = market.pricing;
  
  // Convert cents to major currency unit
  const majorUnit = amount / 100;
  
  // Format number with proper separators
  const parts = majorUnit.toFixed(2).split('.');
  const integerPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, thousandsSeparator);
  const decimalPart = parts[1];
  
  const formattedAmount = `${integerPart}${decimalSeparator}${decimalPart}`;
  
  return displayFormat === "before" 
    ? `${currencySymbol}${formattedAmount}`
    : `${formattedAmount} ${currencySymbol}`;
}

/**
 * Get default user preferences for a market
 */
export function getMarketDefaults(market: MarketConfig) {
  return {
    locale: market.locale,
    currency: market.currency,
    weightUnit: market.weightUnit,
    heightUnit: market.heightUnit,
    timezone: market.timezone,
  };
}
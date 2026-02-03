import { resolveMarket, type MarketConfig } from "@shared/config/markets";

/**
 * Client-side market configuration utilities
 */

/**
 * Get market configuration from current domain
 * @deprecated Use resolveMarket() from @shared/config/markets instead
 */
export function getMarketFromDomain(): MarketConfig {
  return resolveMarket();
}

/**
 * Get market-specific API endpoints
 */
export function getMarketApiConfig(market: MarketConfig) {
  return {
    baseUrl: '', // Same API for all markets in this implementation
    paymentProvider: market.paymentProvider,
    currency: market.currency,
    locale: market.locale,
  };
}

/**
 * Get market-specific payment configuration
 */
export function getPaymentConfig(market: MarketConfig) {
  return {
    provider: market.paymentProvider,
    currency: market.currency,
    // Add provider-specific configuration here
    ...(market.paymentProvider === 'revenuecat' && {
      // RevenueCat specific config for US market
      publicKey: import.meta.env.VITE_REVENUECAT_PUBLIC_KEY,
    }),
    ...(market.paymentProvider === 'mercadopago' && {
      // MercadoPago specific config for Brazil market
      publicKey: import.meta.env.VITE_MERCADOPAGO_PUBLIC_KEY,
    }),
  };
}

/**
 * Get market-specific localization settings
 */
export function getLocalizationConfig(market: MarketConfig) {
  return {
    locale: market.locale,
    currency: market.currency,
    dateFormat: market.locale === 'pt-BR' ? 'dd/MM/yyyy' : 'MM/dd/yyyy',
    timeFormat: market.locale === 'pt-BR' ? '24h' : '12h',
    weightUnit: market.locale === 'pt-BR' ? 'kg' : 'lbs',
    heightUnit: market.locale === 'pt-BR' ? 'cm' : 'inches',
  };
}

/**
 * Check if current market supports a specific feature
 */
export function isFeatureSupported(market: MarketConfig, feature: string): boolean {
  // Define market-specific feature availability
  const featureMap: Record<string, string[]> = {
    'social-sharing': ['us', 'br'], // Both markets support social sharing
    'sms-reminders': ['us'], // Only US supports SMS (Twilio)
    'whatsapp-reminders': ['br'], // Brazil could use WhatsApp Business API
    'local-analytics': ['us', 'br'], // Both support analytics
  };
  
  return featureMap[feature]?.includes(market.id) ?? false;
}

/**
 * Get market-specific error messages
 */
export function getErrorMessages(market: MarketConfig) {
  const messages: Record<string, Record<string, string>> = {
    'us': {
      paymentFailed: 'Payment failed. Please try again or contact support.',
      subscriptionCanceled: 'Your subscription has been canceled.',
      networkError: 'Network error. Please check your connection.',
    },
    'br': {
      paymentFailed: 'Pagamento falhou. Tente novamente ou entre em contato com o suporte.',
      subscriptionCanceled: 'Sua assinatura foi cancelada.',
      networkError: 'Erro de rede. Verifique sua conexão.',
    },
  };
  
  return messages[market.id] || messages['us'];
}
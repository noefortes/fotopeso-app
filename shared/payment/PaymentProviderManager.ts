import type { IPaymentProvider, PaymentProviderConfig } from "./IPaymentProvider";
import type { PaymentProvider, PaymentResult } from "./types";
import type { MarketConfig } from "../config/markets";

/**
 * Configuration for determining which payment provider to use
 */
export interface ProviderRouting {
  locale: string;
  country: string;
  currency: string;
  provider: PaymentProvider;
}

/**
 * Manages multiple payment providers and routes operations to the correct provider
 */
export class PaymentProviderManager {
  private providers: Map<PaymentProvider, IPaymentProvider> = new Map();
  private routingRules: ProviderRouting[] = [];
  private defaultProvider?: PaymentProvider;

  /**
   * Register a payment provider
   */
  registerProvider(provider: IPaymentProvider, config: PaymentProviderConfig): Promise<void> {
    return provider.initialize(config).then(() => {
      this.providers.set(provider.name, provider);
    });
  }

  /**
   * Set routing rules for determining which provider to use
   */
  setRoutingRules(rules: ProviderRouting[]): void {
    this.routingRules = rules;
  }

  /**
   * Set the default provider (fallback)
   */
  setDefaultProvider(provider: PaymentProvider): void {
    this.defaultProvider = provider;
  }

  /**
   * Get the appropriate provider for a market
   */
  getProviderForMarket(market: MarketConfig): PaymentResult<IPaymentProvider> {
    const provider = this.providers.get(market.paymentProvider);
    if (provider) {
      return { success: true, data: provider };
    }

    return {
      success: false,
      error: `Payment provider '${market.paymentProvider}' not found for market '${market.id}'`
    };
  }

  /**
   * Get the appropriate provider for a locale/country (legacy method)
   */
  getProviderForLocale(locale: string, country?: string): PaymentResult<IPaymentProvider> {
    // Try to find exact match
    const rule = this.routingRules.find(rule => 
      rule.locale === locale && (!country || rule.country === country)
    );

    if (rule) {
      const provider = this.providers.get(rule.provider);
      if (provider) {
        return { success: true, data: provider };
      }
    }

    // Try to find partial match by locale only
    const localeRule = this.routingRules.find(rule => rule.locale === locale);
    if (localeRule) {
      const provider = this.providers.get(localeRule.provider);
      if (provider) {
        return { success: true, data: provider };
      }
    }

    // Fall back to default provider
    if (this.defaultProvider) {
      const provider = this.providers.get(this.defaultProvider);
      if (provider) {
        return { success: true, data: provider };
      }
    }

    return {
      success: false,
      error: `No payment provider found for locale: ${locale}, country: ${country || 'unknown'}`
    };
  }

  /**
   * Get provider by name
   */
  getProvider(providerName: PaymentProvider): PaymentResult<IPaymentProvider> {
    const provider = this.providers.get(providerName);
    if (provider) {
      return { success: true, data: provider };
    }

    return {
      success: false,
      error: `Payment provider '${providerName}' not found or not initialized`
    };
  }

  /**
   * Get currency for a market
   */
  getCurrencyForMarket(market: MarketConfig): string {
    return market.currency;
  }

  /**
   * Get currency for a locale (legacy method)
   */
  getCurrencyForLocale(locale: string, country?: string): string {
    const rule = this.routingRules.find(rule => 
      rule.locale === locale && (!country || rule.country === country)
    );
    
    return rule?.currency || "USD";
  }

  /**
   * Get all registered providers
   */
  getRegisteredProviders(): PaymentProvider[] {
    return Array.from(this.providers.keys());
  }

  /**
   * Check if a provider is registered
   */
  isProviderRegistered(provider: PaymentProvider): boolean {
    return this.providers.has(provider);
  }
}

/**
 * Default routing configuration
 */
export const DEFAULT_ROUTING_RULES: ProviderRouting[] = [
  {
    locale: "en-US",
    country: "US",
    currency: "USD",
    provider: "stripe"
  },
  {
    locale: "en",
    country: "US",
    currency: "USD",
    provider: "stripe"
  },
  {
    locale: "pt-BR",
    country: "BR",
    currency: "USD", 
    provider: "stripe" // Use USD pricing for now
  },
  {
    locale: "pt",
    country: "BR",
    currency: "USD",
    provider: "stripe" // Use USD pricing for now
  }
];

// Singleton instance
export const paymentProviderManager = new PaymentProviderManager();
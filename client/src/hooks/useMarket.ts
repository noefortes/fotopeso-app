import { useMemo } from "react";
import { resolveMarket, type MarketConfig } from "@shared/config/markets";

/**
 * Hook to detect and provide market-specific configuration based on domain and user locale
 */
export function useMarket(): MarketConfig {
  const market = useMemo(() => {
    return resolveMarket();
  }, []);

  return market;
}

/**
 * Hook to get currency formatter for the current market
 */
export function useCurrencyFormatter() {
  const market = useMarket();
  
  return useMemo(() => {
    return new Intl.NumberFormat(market.locale, {
      style: 'currency',
      currency: market.currency,
      minimumFractionDigits: 2,
    });
  }, [market.locale, market.currency]);
}

/**
 * Hook to get date formatter for the current market
 */
export function useDateFormatter() {
  const market = useMarket();
  
  return useMemo(() => {
    return new Intl.DateTimeFormat(market.locale, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }, [market.locale]);
}

/**
 * Hook to get number formatter for the current market (for weights, etc.)
 */
export function useNumberFormatter() {
  const market = useMarket();
  
  return useMemo(() => {
    return new Intl.NumberFormat(market.locale, {
      minimumFractionDigits: 1,
      maximumFractionDigits: 2,
    });
  }, [market.locale]);
}
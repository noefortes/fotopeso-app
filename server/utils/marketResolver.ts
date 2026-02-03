import type { Request } from "express";
import { getMarketByDomain, getMarket, DOMAIN_TO_MARKET, US_MARKET, BRAZIL_MARKET, type MarketConfig } from "../../shared/config/markets";

/**
 * Extract domain from Express request
 */
function extractDomain(req: Request): string {
  // Try x-forwarded-host first (for proxies/load balancers)
  const forwardedHost = req.headers['x-forwarded-host'] as string;
  if (forwardedHost) {
    return forwardedHost.split(',')[0].trim();
  }

  // Fall back to host header
  const host = req.headers.host;
  if (host) {
    return host;
  }

  // Fallback for development
  return 'localhost:5000';
}

/**
 * Resolve market configuration from Express request
 */
export function resolveMarket(req: Request): MarketConfig {
  const domain = extractDomain(req);
  
  
  // Priority 1: Check URL parameter for market override
  const urlObj = new URL(req.url || '/', `http://${req.headers.host}`);
  const marketParam = urlObj.searchParams.get('m');
  if (marketParam && (marketParam === 'br' || marketParam === 'us')) {
    const overrideMarket = marketParam === 'br' ? BRAZIL_MARKET : US_MARKET;
    return overrideMarket;
  }
  
  let market = getMarketByDomain(domain);
  
  // If we found a market by domain, use it (domain takes priority over language)
  if (market) {
    return market;
  }
  
  // If exact domain not found, check if this might be a fotopeso request
  if (!market) {
    // Check for fotopeso in X-Forwarded-Host or Host headers
    const xForwardedHost = req.headers['x-forwarded-host'] as string;
    const host = req.headers.host as string;
    
    if ((xForwardedHost && xForwardedHost.includes('fotopeso.com.br')) || 
        (host && host.includes('fotopeso.com.br'))) {
      return BRAZIL_MARKET;
    }
    
    // Check referer for fotopeso.com.br
    const referer = req.headers.referer as string;
    if (referer && referer.includes('fotopeso.com.br')) {
      return BRAZIL_MARKET;
    }
    
    // Check User-Agent or any other indicators
    const userAgent = req.headers['user-agent'] as string;
    if (userAgent && req.url && (
      req.url.includes('pt-') || 
      req.url.includes('br') ||
      req.headers.host?.includes('fotopeso')
    )) {
      return BRAZIL_MARKET;
    }
    
    // Check Accept-Language header
    const acceptLanguage = req.headers['accept-language'] as string;
    if (acceptLanguage) {
      // Check if the user's browser is set to Portuguese or has Brazil locale
      if (acceptLanguage.includes('pt') || acceptLanguage.includes('BR')) {
        return BRAZIL_MARKET;
      }
    }
    
    // Check if user has locale set (if user is authenticated)
    const user = (req as any).user;
    if (user?.locale) {
      if (user.locale.includes('pt') || user.locale.includes('BR')) {
        return BRAZIL_MARKET;
      }
    }
  }
  
  
  // Fall back to US market if domain not found
  return market || US_MARKET;
}

/**
 * Resolve market ID from Express request
 */
export function resolveMarketId(req: Request): string {
  // Use the same enhanced logic as resolveMarket
  const market = resolveMarket(req);
  return market.id;
}

/**
 * Express middleware to attach market to request
 */
export interface RequestWithMarket extends Request {
  market: MarketConfig;
  marketId: string;
}

export function attachMarketMiddleware(req: Request, res: any, next: any) {
  const market = resolveMarket(req);
  const marketId = resolveMarketId(req);
  
  (req as RequestWithMarket).market = market;
  (req as RequestWithMarket).marketId = marketId;
  
  // Set market cookie so client can detect the market correctly
  // This is especially important for custom domains that redirect through Replit
  const domain = extractDomain(req);
  const isProduction = !domain.includes('localhost') && !domain.includes('127.0.0.1');
  
  res.cookie('market_id', marketId, {
    path: '/',
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    sameSite: 'lax',
    secure: isProduction, // Only use secure in production
    httpOnly: false // Client needs to read this cookie
  });
  
  // Also set the original host for diagnostics
  res.cookie('original_host', domain, {
    path: '/',
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    sameSite: 'lax',
    secure: isProduction,
    httpOnly: false
  });
  
  next();
}

/**
 * Validate if a request is from a supported domain
 */
export function isValidDomain(req: Request): boolean {
  const domain = extractDomain(req);
  return DOMAIN_TO_MARKET.hasOwnProperty(domain.toLowerCase());
}

/**
 * Get CORS origins for all markets
 */
export function getCorsOrigins(): string[] {
  const origins = Object.keys(DOMAIN_TO_MARKET).map(domain => {
    // Add both http and https for each domain
    return [
      `https://${domain}`,
      `http://${domain}`, // For development
    ];
  }).flat();

  // Add development origins
  origins.push(
    'http://localhost:5000',
    'http://127.0.0.1:5000',
    'https://localhost:5000',
    'https://127.0.0.1:5000'
  );

  return origins;
}

/**
 * Get appropriate payment provider for a market
 */
export function getPaymentProviderForMarket(market: MarketConfig): string {
  return market.paymentProvider;
}

/**
 * Get user defaults for market (for new user registration)
 */
export function getUserDefaultsForMarket(market: MarketConfig) {
  return {
    locale: market.locale,
    currency: market.currency,
    weightUnit: market.weightUnit,
    heightUnit: market.heightUnit,
  };
}
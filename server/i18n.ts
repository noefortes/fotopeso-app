import { resources, defaultLocale, isValidLocale, getFallbackChain, type TranslationKey } from '@shared/i18n';
import { resolveMarket, type MarketConfig } from '@shared/config/markets';

// HTML escaping function for security
function escapeHtml(text: string): string {
  const htmlEscapes: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#x27;',
    '/': '&#x2F;'
  };
  return text.replace(/[&<>"'/]/g, (char) => htmlEscapes[char] || char);
}

// Simple template interpolation function
function interpolate(template: string, variables: Record<string, string | number> = {}): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    return variables[key]?.toString() || match;
  });
}

// HTML-safe template interpolation function for email templates
function interpolateHtml(template: string, variables: Record<string, string | number> = {}): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    const value = variables[key]?.toString();
    return value ? escapeHtml(value) : match;
  });
}

// Get nested value from object using dot notation
function getNestedValue(obj: any, path: string): string | undefined {
  return path.split('.').reduce((current, key) => current?.[key], obj);
}

// Main translation function
export function t(
  locale: string, 
  key: TranslationKey | string, 
  variables: Record<string, string | number> = {}
): string {
  // Validate and get fallback chain
  const localeChain = getFallbackChain(locale);
  
  // Try to find the translation in each locale in the fallback chain
  for (const currentLocale of localeChain) {
    if (isValidLocale(currentLocale)) {
      const resource = resources[currentLocale];
      const translation = getNestedValue(resource, key);
      
      if (translation && typeof translation === 'string') {
        return interpolate(translation, variables);
      }
    }
  }
  
  // If no translation found, return the key itself as fallback
  console.warn(`Translation missing for key "${key}" in locale "${locale}"`);
  return key;
}

// Helper to get market configuration from domain
export function getMarketFromDomain(hostname: string): MarketConfig {
  // Handle subdomain-based markets (future expansion)
  if (hostname.includes('fotopeso.com.br')) {
    return resolveMarket('br');
  }
  
  if (hostname.includes('scanmyscale.com')) {
    return resolveMarket('us');
  }
  
  // Default to US market
  return resolveMarket('us');
}

// Helper to get market from request
export function getMarketFromRequest(req: any): MarketConfig {
  // Check multiple sources for the original domain (important for reverse proxy/custom domains)
  const xForwardedHost = req.get('x-forwarded-host') || '';
  const host = req.get('host') || req.hostname || '';
  const origin = req.get('origin') || '';
  const referer = req.get('referer') || '';
  
  // Priority: X-Forwarded-Host > Origin > Referer > Host
  // This ensures we get the actual client domain, not the proxy host
  let hostname = host;
  
  // Check X-Forwarded-Host first (most reliable for custom domains behind proxy)
  if (xForwardedHost.includes('fotopeso.com.br')) {
    hostname = 'fotopeso.com.br';
  } else if (xForwardedHost.includes('scanmyscale.com')) {
    hostname = 'scanmyscale.com';
  }
  // Check Origin header
  else if (origin.includes('fotopeso.com.br')) {
    hostname = 'fotopeso.com.br';
  } else if (origin.includes('scanmyscale.com')) {
    hostname = 'scanmyscale.com';
  }
  // Check Referer header
  else if (referer.includes('fotopeso.com.br')) {
    hostname = 'fotopeso.com.br';
  } else if (referer.includes('scanmyscale.com')) {
    hostname = 'scanmyscale.com';
  }
  // Fallback to Host header (which might contain fotopeso or scanmyscale)
  else if (host.includes('fotopeso')) {
    hostname = 'fotopeso.com.br';
  } else if (host.includes('scanmyscale')) {
    hostname = 'scanmyscale.com';
  }
  
  const market = getMarketFromDomain(hostname);
  return market;
}

// Helper to get user's preferred locale with fallbacks
export function getUserLocale(user: any, market: MarketConfig): string {
  // Priority order:
  // 1. User's preferred language (if they have one set)
  // 2. Market's default language
  // 3. Default locale
  
  if (user?.locale && isValidLocale(user.locale)) {
    return user.locale;
  }
  
  if (market.language && isValidLocale(market.language)) {
    return market.language;
  }
  
  return defaultLocale;
}

// Email template helper with market-aware branding
export function getEmailTemplate(
  locale: string,
  templateKey: string,
  market: MarketConfig,
  customVariables: Record<string, string | number> = {}
): { subject: string; html: string } {
  // Base variables that include market branding
  // Always use noefortes@scanmyscale.com for support (verified email)
  const baseVariables = {
    brandName: market.branding.brandName,
    domain: market.domain,
    supportEmail: 'noefortes@scanmyscale.com',
    ...customVariables
  };
  
  const subject = t(locale, `email.${templateKey}.subject` as TranslationKey, baseVariables);
  
  // Build the HTML email template with escaped variables
  const title = escapeHtml(t(locale, `email.${templateKey}.title` as TranslationKey, baseVariables));
  const greeting = escapeHtml(t(locale, `email.${templateKey}.greeting` as TranslationKey, baseVariables));
  const message = escapeHtml(t(locale, `email.${templateKey}.message` as TranslationKey, baseVariables));
  const footer = escapeHtml(t(locale, `email.${templateKey}.footer` as TranslationKey, baseVariables));
  const brandFooter = escapeHtml(t(locale, `email.${templateKey}.brandFooter` as TranslationKey, baseVariables));
  
  // Simple but clean HTML template
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>${subject}</title>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { text-align: center; border-bottom: 2px solid #e74c3c; padding-bottom: 20px; margin-bottom: 30px; }
        .content { margin-bottom: 30px; }
        .code { font-size: 24px; font-weight: bold; text-align: center; padding: 15px; background-color: #f8f9fa; border-radius: 5px; margin: 20px 0; letter-spacing: 2px; }
        .footer { border-top: 1px solid #eee; padding-top: 20px; font-size: 14px; color: #666; }
        .cta { text-align: center; margin: 25px 0; }
        .button { display: inline-block; padding: 12px 24px; background-color: #e74c3c; color: white; text-decoration: none; border-radius: 5px; font-weight: bold; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1 style="color: #e74c3c; margin: 0;">${escapeHtml(market.branding.brandName)}</h1>
          <h2 style="margin: 10px 0 0 0; font-weight: normal;">${title}</h2>
        </div>
        
        <div class="content">
          <p>${greeting}</p>
          <p>${message}</p>
          ${customVariables.code ? `<div class="code">${escapeHtml(customVariables.code.toString())}</div>` : ''}
          ${customVariables.cta ? `<div class="cta"><a href="${escapeHtml(customVariables.ctaUrl?.toString() || `https://${market.domain}`)}" class="button">${escapeHtml(customVariables.cta.toString())}</a></div>` : ''}
          ${customVariables.instructions ? `<p><em>${escapeHtml(customVariables.instructions.toString())}</em></p>` : ''}
          ${customVariables.expiry ? `<p><small><strong>${escapeHtml(customVariables.expiry.toString())}</strong></small></p>` : ''}
        </div>
        
        <div class="footer">
          <p>${footer}</p>
          <p><strong>${brandFooter}</strong></p>
          <p><small>${escapeHtml(t(locale, 'email.verification.supportText' as TranslationKey, baseVariables))} <a href="mailto:${escapeHtml(baseVariables.supportEmail.toString())}">${escapeHtml(baseVariables.supportEmail.toString())}</a></small></p>
        </div>
      </div>
    </body>
    </html>
  `;
  
  return { subject, html };
}

// SMS template helper
export function getSmsTemplate(
  locale: string,
  templateKey: string,
  market: MarketConfig,
  variables: Record<string, string | number> = {}
): string {
  const baseVariables = {
    brandName: market.branding.brandName,
    ...variables
  };
  
  return t(locale, `sms.${templateKey}` as TranslationKey, baseVariables);
}
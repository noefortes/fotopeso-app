import { enResources } from './resources/en';
import { ptBRResources } from './resources/pt-BR';

// Type definitions for better TypeScript support
export type TranslationKeys = typeof enResources;
export type NestedKeyOf<ObjectType extends Record<string, any>> = {
  [Key in keyof ObjectType & (string | number)]: ObjectType[Key] extends Record<string, any>
    ? `${Key}` | `${Key}.${NestedKeyOf<ObjectType[Key]>}`
    : `${Key}`
}[keyof ObjectType & (string | number)];

export type TranslationKey = NestedKeyOf<TranslationKeys>;

// All available resources
export const resources = {
  en: enResources,
  'pt-BR': ptBRResources,
} as const;

// Available locales
export const availableLocales = Object.keys(resources) as Array<keyof typeof resources>;

// Default locale
export const defaultLocale = 'en';

// Helper function to validate if a locale exists
export function isValidLocale(locale: string): locale is keyof typeof resources {
  return locale in resources;
}

// Helper function to get fallback locale chain
export function getFallbackChain(locale: string): string[] {
  const chain = [locale];
  
  // If it's a regional variant (e.g., pt-BR), add the base language (pt)
  if (locale.includes('-')) {
    const baseLang = locale.split('-')[0];
    if (baseLang !== locale) {
      chain.push(baseLang);
    }
  }
  
  // Always add default locale as final fallback
  if (!chain.includes(defaultLocale)) {
    chain.push(defaultLocale);
  }
  
  return chain;
}

// Export individual resources for direct access
export { enResources, ptBRResources };
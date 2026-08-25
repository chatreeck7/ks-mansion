import th from './translations/th.json';
import en from './translations/en.json';

const translations: Record<string, Record<string, unknown>> = { th, en };

export const defaultLocale = 'th';
export const locales = ['th', 'en'] as const;
export type Locale = (typeof locales)[number];

/**
 * The site's configured base path, without a trailing slash — '' when the
 * site is served from the domain root, as it is on Cloudflare. Read from
 * Astro rather than hardcoded so a host change stays a config edit.
 */
const base = import.meta.env.BASE_URL.replace(/\/$/, '');

/** Strip the configured base path from a pathname, if it carries one. */
function stripBase(pathname: string): string {
  if (base && pathname.startsWith(base)) {
    return pathname.slice(base.length) || '/';
  }
  return pathname;
}

/**
 * Get locale from URL path
 */
export function getLocaleFromUrl(url: URL): Locale {
  const segments = stripBase(url.pathname).split('/').filter(Boolean);

  // Check if first segment is a locale
  const firstSegment = segments[0];
  if (firstSegment && locales.includes(firstSegment as Locale)) {
    return firstSegment as Locale;
  }

  return defaultLocale;
}

/**
 * Get the current path without locale prefix
 */
export function getPathWithoutLocale(url: URL): string {
  let path = stripBase(url.pathname);
  // Remove locale prefix if present
  for (const locale of locales) {
    if (path.startsWith(`/${locale}/`) || path === `/${locale}`) {
      path = path.slice(locale.length + 1) || '/';
      break;
    }
  }
  return path || '/';
}

/**
 * Get nested value from object using dot notation
 */
function getNestedValue(obj: Record<string, unknown>, key: string): string {
  const keys = key.split('.');
  let value: unknown = obj;

  for (const k of keys) {
    if (value && typeof value === 'object' && k in value) {
      value = (value as Record<string, unknown>)[k];
    } else {
      return key; // Return key if not found
    }
  }

  return typeof value === 'string' ? value : key;
}

/**
 * Create a translation function for a specific locale
 */
export function useTranslations(locale: Locale) {
  const t = translations[locale] || translations[defaultLocale];

  return function (key: string): string {
    return getNestedValue(t as Record<string, unknown>, key);
  };
}

/**
 * Get all translations for a locale (useful for React components)
 */
export function getTranslations(locale: Locale): Record<string, unknown> {
  return translations[locale] || translations[defaultLocale];
}

/**
 * Generate URL for a different locale
 */
export function getLocaleUrl(currentUrl: URL, targetLocale: Locale): string {
  const path = getPathWithoutLocale(currentUrl);

  if (targetLocale === defaultLocale) {
    return `${base}${path}`;
  }
  return `${base}/${targetLocale}${path}`;
}

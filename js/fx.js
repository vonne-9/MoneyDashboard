// fx.js — currency conversion for the base-currency total.
//
// Strategy: try live rates (open.er-api.com, free, no key), cache them ~12h in the
// data blob, and degrade gracefully — cached rates, then manual overrides, then 1:1.
// Only currency CODES are ever sent over the network; no balances, no personal data.

const API = 'https://open.er-api.com/v6/latest/';
const CACHE_MAX_AGE_MS = 12 * 60 * 60 * 1000; // 12 hours

function isFresh(cache, base) {
  if (!cache || cache.base !== base || !cache.rates) return false;
  return Date.now() - new Date(cache.fetchedAt).getTime() < CACHE_MAX_AGE_MS;
}

// Fetch fresh rates for `base`. Returns { base, rates, fetchedAt } or null on failure.
export async function fetchRates(base) {
  try {
    const res = await fetch(API + encodeURIComponent(base));
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    if (json.result !== 'success' || !json.rates) throw new Error('Bad response shape');
    return { base, rates: json.rates, fetchedAt: new Date().toISOString() };
  } catch (e) {
    console.warn('Live FX fetch failed; will use cached/manual rates.', e);
    return null;
  }
}

// Ensure `data.fxCache` holds usable rates for the current base currency.
// Mutates and returns a status string describing what happened (for the UI).
export async function ensureRates(data) {
  const base = data.settings.baseCurrency;
  if (isFresh(data.fxCache, base)) return 'fresh';
  const fresh = await fetchRates(base);
  if (fresh) {
    data.fxCache = fresh;
    return 'updated';
  }
  // Fetch failed. Keep whatever cache we have (even if stale / wrong base is handled below).
  return data.fxCache ? 'stale' : 'offline';
}

// Convert an amount from `currency` into the base currency.
// Precedence: manual override > cached live rate > (if same currency) 1:1 > null (unknown).
export function toBase(amount, currency, data) {
  const base = data.settings.baseCurrency;
  if (currency === base) return amount;

  const manual = data.settings.manualRates?.[currency];
  if (typeof manual === 'number' && manual > 0) return amount * manual;

  const cache = data.fxCache;
  if (cache && cache.base === base && typeof cache.rates?.[currency] === 'number') {
    // rates are "1 base = X currency", so divide to go currency -> base.
    return amount / cache.rates[currency];
  }
  return null; // unknown rate — caller shows a hint to set a manual rate
}

// List of currencies we can't convert right now (no manual override, not in cache).
export function unconvertible(data) {
  const base = data.settings.baseCurrency;
  const codes = new Set(data.accounts.map((a) => a.currency).filter((c) => c !== base));
  return [...codes].filter((c) => toBase(1, c, data) === null);
}

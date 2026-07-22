// store.js — localStorage persistence, schema versioning, and JSON export/import.
// Everything the dashboard knows lives in one JSON blob under a single key.

const STORAGE_KEY = 'money-dashboard-v1';
const SCHEMA_VERSION = 6;

// Cute default spending categories (Phase 2). Users can add their own later.
export const DEFAULT_CATEGORIES = [
  { name: 'Food', emoji: '🍜' },
  { name: 'Groceries', emoji: '🛒' },
  { name: 'Home/Rent', emoji: '🏠' },
  { name: 'Transport', emoji: '🚕' },
  { name: 'Fun', emoji: '🎬' },
  { name: 'Shopping', emoji: '🛍️' },
  { name: 'Bills', emoji: '💡' },
  { name: 'Health', emoji: '🏥' },
  { name: 'Travel', emoji: '✈️' },
  { name: 'Gifts', emoji: '🎁' },
  { name: 'Income', emoji: '💸' },
  { name: 'Adjustment', emoji: '🔧' },
  { name: 'Other', emoji: '➕' },
];

function defaultData() {
  return {
    schemaVersion: SCHEMA_VERSION,
    settings: {
      baseCurrency: 'USD',
      manualRates: {},
      // Used only for retirement-account unlock countdowns; never leaves this device.
      birthDate: '',
      // AI insights: any OpenAI-compatible endpoint. The key lives ONLY in this
      // browser's localStorage (and inside your JSON backups).
      ai: {
        preset: 'gemini',
        baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
        apiKey: '',
        model: 'gemini-3.6-flash',
      },
    },
    fxCache: null, // { base, rates: {CODE: rate}, fetchedAt }
    // accounts: { id, name, type: bank|cash|savings|cd|investment|retirement|credit|other,
    //             emoji, currency, balance, creditLimit?, reconciledAt?,
    //             interestRate? (savings/cd, APY %), maturityDate? (cd),
    //             unlockAge? (retirement), costBasis? (investment) }
    //   credit: balance = amount owed
    accounts: [],
    snapshots: [], // { date, totalInBase, perAccount: {id: balanceInBase} }
    // transactions: { id, accountId, toAccountId?, date, createdAt, amount,
    //                 kind: expense|income|transfer, category?, note, source, externalId? }
    transactions: [],
    budgets: {}, // { [categoryName]: monthlyLimitInBase }
    categories: DEFAULT_CATEGORIES.map((c) => ({ ...c })),
    // goals: { id, name, emoji, accountId, currency, targetAmount, saved }  (Phase 3)
    //   `saved` reserves that much of the linked account's balance
    goals: [],
    // recurring: { id, name, emoji, kind, accountId, toAccountId?, category?, amount,
    //              currency, cadence: weekly|monthly|yearly, nextDate }  (Phase 3)
    recurring: [],
  };
}

// Merge loaded data onto defaults so missing keys (from older versions) fill in safely.
function migrate(raw) {
  const base = defaultData();
  if (!raw || typeof raw !== 'object') return base;
  const merged = { ...base, ...raw };
  merged.settings = { ...base.settings, ...(raw.settings || {}) };
  merged.settings.manualRates = { ...(raw.settings?.manualRates || {}) };
  // v5 → v6: AI-insights endpoint config
  merged.settings.ai = { ...base.settings.ai, ...(raw.settings?.ai || {}) };

  // v1 → v2: budgets was a (never-used) array; categories didn't exist.
  if (Array.isArray(raw.budgets) || raw.budgets == null) merged.budgets = {};
  if (!Array.isArray(raw.categories) || raw.categories.length === 0) {
    merged.categories = DEFAULT_CATEGORIES.map((c) => ({ ...c }));
  }
  merged.transactions = Array.isArray(raw.transactions) ? raw.transactions : [];

  // v2 → v3: goals / recurring gain real shapes (arrays already default to []).
  merged.goals = Array.isArray(raw.goals) ? raw.goals : [];
  merged.recurring = Array.isArray(raw.recurring) ? raw.recurring : [];

  merged.schemaVersion = SCHEMA_VERSION;
  return merged;
}

export function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return migrate(raw);
  } catch (e) {
    console.warn('Could not read saved data, starting fresh.', e);
    return defaultData();
  }
}

export function save(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    return true;
  } catch (e) {
    console.error('Save failed (storage full or blocked?)', e);
    return false;
  }
}

// A small, dependency-free id generator (crypto when available, timestamp+counter fallback).
let _counter = 0;
export function newId() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  _counter += 1;
  return `id-${Date.now().toString(36)}-${_counter}`;
}

// --- Backup: export current data as a downloadable JSON file ---
export function exportJSON(data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const stamp = new Date().toISOString().slice(0, 10);
  const a = document.createElement('a');
  a.href = url;
  a.download = `money-dashboard-backup-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// --- Export rows (array of arrays; first row = header) as a CSV that opens in Excel ---
export function exportCSV(filename, rows) {
  const esc = (v) => {
    const s = v == null ? '' : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  // Lead with a UTF-8 BOM so Excel renders accents/emoji correctly; CRLF line endings.
  const csv = '﻿' + rows.map((r) => r.map(esc).join(',')).join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// --- Restore: read a user-picked JSON file, validate loosely, return migrated data ---
export function importJSON(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read the file.'));
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        if (!parsed || !Array.isArray(parsed.accounts)) {
          throw new Error("This doesn't look like a dashboard backup.");
        }
        resolve(migrate(parsed));
      } catch (e) {
        reject(e);
      }
    };
    reader.readAsText(file);
  });
}

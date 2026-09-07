// finance.js — pure money math for Phase 2.
//
// Balance convention (per account):
//   asset accounts (bank/cash/other): `balance` = money you HAVE
//   credit accounts:                  `balance` = money you OWE
// A transaction mutates the stored balance directly (checkbook-register style);
// "reconcile" later compares that running balance to reality and corrects drift.
import { toBase, convert } from './fx.js';

export function isCredit(account) {
  return account?.type === 'credit';
}

export function accountById(data, id) {
  return data.accounts.find((a) => a.id === id) || null;
}

// Move `amount` OUT of an account (expense, or the "from" leg of a transfer).
// For assets you have less; for credit you owe more.
function balanceOut(account, amount) {
  account.balance += isCredit(account) ? amount : -amount;
}
// Move `amount` INTO an account (income, or the "to" leg of a transfer / bill payment).
// For assets you have more; for credit you owe less.
function balanceIn(account, amount) {
  account.balance += isCredit(account) ? -amount : amount;
}

// Apply (dir = +1) or reverse (dir = -1) a transaction's effect on account balances.
export function applyTx(data, tx, dir = 1) {
  const amt = tx.amount * dir;
  if (tx.kind === 'expense') {
    const a = accountById(data, tx.accountId);
    if (a) balanceOut(a, amt);
  } else if (tx.kind === 'income') {
    const a = accountById(data, tx.accountId);
    if (a) balanceIn(a, amt);
  } else if (tx.kind === 'transfer') {
    const from = accountById(data, tx.accountId);
    const to = accountById(data, tx.toAccountId);
    if (from) balanceOut(from, amt);
    if (to) balanceIn(to, amt);
  }
}

// How much ONE account's stored balance moves because of this transaction.
// Mirrors applyTx exactly, so replaying these deltas reproduces the balance.
export function txEffectOn(account, tx) {
  if (!account) return 0;
  const amt = Number(tx.amount) || 0;
  const out = isCredit(account) ? amt : -amt; // money leaving: assets drop, cards owe more
  const into = isCredit(account) ? -amt : amt; // money arriving
  if (tx.kind === 'expense') return tx.accountId === account.id ? out : 0;
  if (tx.kind === 'income') return tx.accountId === account.id ? into : 0;
  if (tx.kind === 'transfer') {
    if (tx.accountId === account.id) return out;
    if (tx.toAccountId === account.id) return into;
  }
  return 0;
}

// --- Net worth: assets you HAVE minus credit you OWE, all in base currency ---
export function totals(data) {
  let have = 0;
  let owe = 0;
  for (const a of data.accounts) {
    const inBase = toBase(Number(a.balance) || 0, a.currency, data);
    if (inBase === null) continue; // unconvertible — surfaced separately as a warning
    if (isCredit(a)) owe += inBase;
    else have += inBase;
  }
  return { have, owe, net: have - owe };
}

// --- Credit-card utilization ---
export function utilization(account) {
  if (!isCredit(account) || !(Number(account.creditLimit) > 0)) return null;
  const owed = Math.max(0, Number(account.balance) || 0);
  const limit = Number(account.creditLimit);
  const pct = Math.min(100, Math.round((owed / limit) * 100));
  return { owed, limit, available: limit - owed, pct, over: owed > limit };
}

// --- Monthly spending by category (expenses only), converted to base currency ---
export function monthKey(dateStr) {
  return (dateStr || '').slice(0, 7); // "YYYY-MM"
}

// --- Savings goals: money reserved (earmarked) inside an account ---
// Goals don't move money or change net worth; they carve part of an account's
// balance into "reserved", leaving the rest as spendable "available".
export function reservedForAccount(data, accountId) {
  return (data.goals || [])
    .filter((g) => g.accountId === accountId)
    .reduce((sum, g) => sum + (Number(g.saved) || 0), 0);
}

export function availableOf(account, data) {
  return (Number(account.balance) || 0) - reservedForAccount(data, account.id);
}

// --- Recurring item date helpers ---

// Format a Date as YYYY-MM-DD in the user's LOCAL timezone. (toISOString() uses
// UTC, which flips the calendar day for part of the day in most timezones.)
export function toLocalYMD(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function addCadence(dateStr, cadence) {
  const d = new Date(dateStr + 'T00:00:00');
  if (cadence === 'weekly') d.setDate(d.getDate() + 7);
  else if (cadence === 'yearly') d.setFullYear(d.getFullYear() + 1);
  else d.setMonth(d.getMonth() + 1); // monthly (default)
  return toLocalYMD(d);
}

export function daysUntil(dateStr, todayStr) {
  const a = new Date(dateStr + 'T00:00:00');
  const b = new Date(todayStr + 'T00:00:00');
  return Math.round((a - b) / 86400000);
}

// --- Savings / CD / investment / retirement helpers (asset subtypes) ---

// Days until a CD matures (null when not a CD / no date set).
export function cdDaysToMaturity(account, todayStr) {
  if (account?.type !== 'cd' || !account.maturityDate) return null;
  return daysUntil(account.maturityDate, todayStr);
}

// Retirement unlock info: when does this account become available?
// Needs settings.birthDate; daysLeft === null means "birth date not set yet".
export function retirementInfo(account, settings, todayStr) {
  if (account?.type !== 'retirement') return null;
  const unlockAge = Number(account.unlockAge) > 0 ? Number(account.unlockAge) : 59.5;
  if (!settings?.birthDate) return { unlockAge, unlockDate: null, daysLeft: null };
  const b = new Date(settings.birthDate + 'T00:00:00');
  const whole = Math.floor(unlockAge);
  const months = Math.round((unlockAge - whole) * 12);
  const d = new Date(b);
  d.setFullYear(b.getFullYear() + whole);
  d.setMonth(d.getMonth() + months);
  const unlockDate = toLocalYMD(d);
  return { unlockAge, unlockDate, daysLeft: daysUntil(unlockDate, todayStr) };
}

// Locked = you can't spend it yet (CD before maturity; retirement before unlock age).
// A retirement account with no birth date set counts as locked (safe default).
export function isLocked(account, settings, todayStr) {
  if (account?.type === 'cd') {
    const d = cdDaysToMaturity(account, todayStr);
    return d !== null && d > 0;
  }
  if (account?.type === 'retirement') {
    const info = retirementInfo(account, settings, todayStr);
    return info.daysLeft === null || info.daysLeft > 0;
  }
  return false;
}

// Total locked money, in base currency (still part of net worth — just not spendable).
export function lockedTotal(data, todayStr) {
  return data.accounts.reduce((sum, a) => {
    if (!isLocked(a, data.settings, todayStr)) return sum;
    const v = toBase(Number(a.balance) || 0, a.currency, data);
    return sum + (v ?? 0);
  }, 0);
}

// Projected interest per year for savings/CD accounts with an APY set.
export function annualInterest(account) {
  const r = Number(account?.interestRate);
  if (!(r > 0) || (account.type !== 'savings' && account.type !== 'cd')) return null;
  return ((Number(account.balance) || 0) * r) / 100;
}

// Everything you're earning per year across accounts, in base currency.
export function totalAnnualInterest(data) {
  return data.accounts.reduce((sum, a) => {
    const i = annualInterest(a);
    if (i == null) return sum;
    const v = toBase(i, a.currency, data);
    return sum + (v ?? 0);
  }, 0);
}

// Rough CD payout at maturity (simple interest on the remaining term — labeled ≈ in the UI).
export function cdValueAtMaturity(account, todayStr) {
  const days = cdDaysToMaturity(account, todayStr);
  const r = Number(account.interestRate);
  if (days === null || days <= 0 || !(r > 0)) return null;
  return (Number(account.balance) || 0) * (1 + (r / 100) * (days / 365));
}

// Investment gain/loss vs what you put in (cost basis).
export function gainLoss(account) {
  if (account?.type !== 'investment') return null;
  const basis = Number(account.costBasis);
  if (!(basis > 0)) return null;
  const diff = (Number(account.balance) || 0) - basis;
  return { diff, pct: (diff / basis) * 100 };
}

// --- Split expenses: what a bill cost YOU vs what left the account ---

// `amount` is what actually left the account; `myShare` is your real cost when
// you covered part of a bill for someone else. Works for recurring items too —
// they carry the same fields. Absent myShare means the whole thing was yours.
export function realCost(item) {
  const share = Number(item?.myShare);
  return item?.myShare != null && Number.isFinite(share) ? share : Number(item?.amount) || 0;
}

export function isSplit(item) {
  return item?.myShare != null && Number(item.myShare) < (Number(item.amount) || 0) - 0.005;
}

// Still owed to you on a split expense: what you fronted for others, minus the
// repayments linked back to it. Derived (never stored) so it self-heals when
// entries are edited or deleted. Repayments may land in a different-currency
// account, so convert them into the expense's currency.
export function owedOn(data, tx) {
  if (!tx || tx.kind !== 'expense' || !isSplit(tx)) return 0;
  const cur = accountById(data, tx.accountId)?.currency || data.settings.baseCurrency;
  const fronted = (Number(tx.amount) || 0) - realCost(tx);
  let repaid = 0;
  for (const r of data.transactions) {
    if (r.settlesTxId !== tx.id) continue;
    const rCur = accountById(data, r.accountId)?.currency || data.settings.baseCurrency;
    repaid += (rCur === cur ? Number(r.amount) || 0 : convert(Number(r.amount) || 0, rCur, cur, data)) || 0;
  }
  return Math.max(0, fronted - repaid);
}

// Everything friends/roommates still owe you, in base currency.
export function owedTotal(data) {
  let total = 0;
  for (const t of data.transactions) {
    const owed = owedOn(data, t);
    if (!owed) continue;
    const cur = accountById(data, t.accountId)?.currency || data.settings.baseCurrency;
    total += toBase(owed, cur, data) ?? 0;
  }
  return total;
}

export function spendByCategory(data, ym) {
  const totalsByCat = {};
  for (const tx of data.transactions) {
    if (tx.kind !== 'expense') continue;
    if (monthKey(tx.date) !== ym) continue;
    const acct = accountById(data, tx.accountId);
    if (!acct) continue;
    const inBase = toBase(realCost(tx), acct.currency, data); // only YOUR share counts
    if (inBase === null) continue;
    const cat = tx.category || 'Other';
    totalsByCat[cat] = (totalsByCat[cat] || 0) + inBase;
  }
  return totalsByCat;
}

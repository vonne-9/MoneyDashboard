// finance.js — pure money math for Phase 2.
//
// Balance convention (per account):
//   asset accounts (bank/cash/other): `balance` = money you HAVE
//   credit accounts:                  `balance` = money you OWE
// A transaction mutates the stored balance directly (checkbook-register style);
// "reconcile" later compares that running balance to reality and corrects drift.
import { toBase } from './fx.js';

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
export function addCadence(dateStr, cadence) {
  const d = new Date(dateStr + 'T00:00:00');
  if (cadence === 'weekly') d.setDate(d.getDate() + 7);
  else if (cadence === 'yearly') d.setFullYear(d.getFullYear() + 1);
  else d.setMonth(d.getMonth() + 1); // monthly (default)
  return d.toISOString().slice(0, 10);
}

export function daysUntil(dateStr, todayStr) {
  const a = new Date(dateStr + 'T00:00:00');
  const b = new Date(todayStr + 'T00:00:00');
  return Math.round((a - b) / 86400000);
}

export function spendByCategory(data, ym) {
  const totalsByCat = {};
  for (const tx of data.transactions) {
    if (tx.kind !== 'expense') continue;
    if (monthKey(tx.date) !== ym) continue;
    const acct = accountById(data, tx.accountId);
    if (!acct) continue;
    const inBase = toBase(Number(tx.amount) || 0, acct.currency, data);
    if (inBase === null) continue;
    const cat = tx.category || 'Other';
    totalsByCat[cat] = (totalsByCat[cat] || 0) + inBase;
  }
  return totalsByCat;
}

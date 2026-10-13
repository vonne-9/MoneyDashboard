// app.js — the dashboard's brain (Alpine component).
// Phase 1: accounts + net worth.  Phase 2: transactions, transfers/bill payment,
// reconcile, categories & monthly budgets, credit cards.
import * as store from './store.js';
import * as fx from './fx.js';
import * as fin from './finance.js';
import * as insightsEngine from './insights.js';
import * as categorize from './categorize.js';
import * as ai from './ai.js';
import { renderTrend } from './charts.js';

const CURRENCIES = ['USD', 'EUR', 'GBP', 'JPY', 'CNY', 'CAD', 'AUD', 'CHF', 'INR', 'SGD', 'HKD', 'THB', 'MMK'];
const EMOJIS = ['🏦', '💰', '💵', '🐷', '💳', '🪙', '💎', '🏠', '✈️', '🎁', '📈', '🧧', '⏳', '🧓', '🌱', '📊'];
const TYPES = [
  { value: 'bank', label: 'Bank' },
  { value: 'cash', label: 'Cash' },
  { value: 'savings', label: 'Savings' },
  { value: 'cd', label: 'CD' },
  { value: 'investment', label: 'Investment' },
  { value: 'retirement', label: 'Retirement' },
  { value: 'credit', label: 'Credit card' },
  { value: 'other', label: 'Other' },
];
// A fitting default emoji per type (applied when the user hasn't picked one).
const TYPE_EMOJI = { bank: '🏦', cash: '💰', savings: '🐷', cd: '⏳', investment: '📈', retirement: '🧓', credit: '💳', other: '🪙' };

// Local-timezone "today" — toISOString() would give the UTC date, which already
// says *tomorrow* during US evenings (days would roll over at ~5–8 PM).
const today = () => fin.toLocalYMD(new Date());

function blankAccount() {
  return {
    id: null, name: '', type: 'bank', emoji: '🏦', currency: 'USD', balance: '',
    creditLimit: '', interestRate: '', maturityDate: '', unlockAge: '', costBasis: '',
  };
}
function blankTx(kind = 'expense') {
  // catAuto/catVia are draft-only (never stored): they track whether the category
  // is still ours to guess, and how we guessed it.
  return {
    id: null, kind, accountId: '', toAccountId: '', amount: '', category: 'Food', date: today(),
    note: '', split: false, myShare: '', catAuto: true, catVia: null,
  };
}
function blankGoal() {
  return { id: null, name: '', emoji: '🎯', accountId: '', currency: 'USD', targetAmount: '', saved: 0 };
}
function blankRecurring() {
  return { id: null, name: '', emoji: '🔁', kind: 'expense', accountId: '', toAccountId: '', category: 'Bills', amount: '', cadence: 'monthly', nextDate: today(), split: false, myShare: '' };
}
const GOAL_EMOJIS = ['🎯', '🏖️', '🏠', '🚗', '💍', '🎓', '🎁', '💻', '🐣', '🛟', '🎄', '💎'];

// ----- Excel styling (for xlsx-js-style) -----
const INK = '111111';
const THIN = { style: 'thin', color: { rgb: INK } };
const THIN_LT = { style: 'thin', color: { rgb: 'D9D9D9' } };
const BOX = { top: THIN, bottom: THIN, left: THIN, right: THIN };
const BOX_LT = { top: THIN_LT, bottom: THIN_LT, left: THIN_LT, right: THIN_LT };
const NUMFMT = '#,##0.00';
const XS = {
  title: { font: { bold: true, sz: 13, color: { rgb: INK } }, fill: { patternType: 'solid', fgColor: { rgb: 'FFE14D' } }, alignment: { horizontal: 'left', vertical: 'center' }, border: BOX },
  header: { font: { bold: true, sz: 11, color: { rgb: INK } }, fill: { patternType: 'solid', fgColor: { rgb: 'A0C4FF' } }, alignment: { horizontal: 'center', vertical: 'center', wrapText: true }, border: BOX },
  cell: { alignment: { vertical: 'center' }, border: BOX_LT },
  center: { alignment: { horizontal: 'center', vertical: 'center' }, border: BOX_LT },
  num: { alignment: { horizontal: 'right', vertical: 'center' }, border: BOX_LT, numFmt: NUMFMT },
  // zebra-striped (alternate) variants
  cellA: { alignment: { vertical: 'center' }, border: BOX_LT, fill: { patternType: 'solid', fgColor: { rgb: 'F3F6FC' } } },
  centerA: { alignment: { horizontal: 'center', vertical: 'center' }, border: BOX_LT, fill: { patternType: 'solid', fgColor: { rgb: 'F3F6FC' } } },
  numA: { alignment: { horizontal: 'right', vertical: 'center' }, border: BOX_LT, numFmt: NUMFMT, fill: { patternType: 'solid', fgColor: { rgb: 'F3F6FC' } } },
  // difference coloured by sign
  diffPos: { font: { bold: true, color: { rgb: '1E6B45' } }, alignment: { horizontal: 'right', vertical: 'center' }, border: BOX_LT, numFmt: NUMFMT },
  diffNeg: { font: { bold: true, color: { rgb: 'C0392B' } }, alignment: { horizontal: 'right', vertical: 'center' }, border: BOX_LT, numFmt: NUMFMT },
  totLbl: { font: { bold: true }, fill: { patternType: 'solid', fgColor: { rgb: 'FFF3C4' } }, alignment: { horizontal: 'right', vertical: 'center' }, border: BOX },
  totNum: { font: { bold: true }, fill: { patternType: 'solid', fgColor: { rgb: 'FFF3C4' } }, alignment: { horizontal: 'right', vertical: 'center' }, numFmt: NUMFMT, border: BOX },
  ok: { font: { bold: true, color: { rgb: '1E6B45' } }, fill: { patternType: 'solid', fgColor: { rgb: '7EE7C7' } }, alignment: { horizontal: 'center', vertical: 'center' }, border: BOX_LT },
  over: { font: { bold: true, color: { rgb: '7A2E12' } }, fill: { patternType: 'solid', fgColor: { rgb: 'FF8A5C' } }, alignment: { horizontal: 'center', vertical: 'center' }, border: BOX_LT },
};

document.addEventListener('alpine:init', () => {
  window.Alpine.data('dashboard', () => ({
    // --- state ---
    data: store.load(),
    currencies: CURRENCIES,
    emojis: EMOJIS,
    types: TYPES,
    fxStatus: 'loading',
    view: 'overview', // overview | spending | goals | insights
    sidebarOpen: false,
    backupDismissed: false,
    aiBusy: false,
    aiHtml: '', // rendered AI result (memory only — never persisted)
    aiError: '',
    accountModal: false,
    txModal: false,
    reconcileModal: false,
    budgetsModal: false,
    categoriesModal: false,
    catDraft: { originalName: null, name: '', emoji: '🏷️' },
    catDeletePending: null, // category name armed for delete (in-modal confirm)
    txFilter: { accountId: '', category: '', q: '' },
    settleModal: false,
    settle: { txId: '', accountId: '', amount: '', date: today() },
    txLimit: 40,
    settingsOpen: false,
    goalModal: false,
    contributeModal: false,
    recurringModal: false,
    acct: blankAccount(),
    tx: blankTx(),
    goal: blankGoal(),
    rec: blankRecurring(),
    contrib: { goalId: '', amount: '', mode: 'add' },
    recon: { accountId: '', actual: '' },
    goalEmojis: GOAL_EMOJIS,
    toast: '',

    // --- lifecycle ---
    async init() {
      if (!this.currencies.includes(this.data.settings.baseCurrency)) {
        this.currencies = [this.data.settings.baseCurrency, ...this.currencies];
      }
      await this.refreshRates();
      this.$nextTick(() => this.drawChart());
    },

    persist() {
      store.save(this.data);
    },

    // --- navigation ---
    setView(v) {
      this.view = v;
      this.sidebarOpen = false;
      if (v === 'overview') this.drawChart(); // canvas needs to be visible to size correctly
    },
    navItems() {
      return [
        { id: 'overview', label: 'Overview', emoji: '🏠' },
        { id: 'spending', label: 'Spending', emoji: '💸' },
        { id: 'goals', label: 'Goals', emoji: '🎯' },
        { id: 'insights', label: 'Insights', emoji: '💡' },
      ];
    },

    // ================= currency / totals =================
    async refreshRates() {
      this.fxStatus = 'loading';
      this.fxStatus = await fx.ensureRates(this.data);
      this.persist();
    },
    get baseCurrency() {
      return this.data.settings.baseCurrency;
    },
    baseOf(account) {
      return fx.toBase(Number(account.balance) || 0, account.currency, this.data);
    },
    get totals() {
      return fin.totals(this.data);
    },
    get unconvertible() {
      return fx.unconvertible(this.data);
    },
    get hasAccounts() {
      return this.data.accounts.length > 0;
    },
    get assetAccounts() {
      return this.data.accounts.filter((a) => !fin.isCredit(a));
    },
    get creditAccounts() {
      return this.data.accounts.filter((a) => fin.isCredit(a));
    },

    // ================= formatting =================
    fmt(amount, currency) {
      try {
        return new Intl.NumberFormat(undefined, {
          style: 'currency',
          currency,
          maximumFractionDigits: currency === 'JPY' || currency === 'MMK' ? 0 : 2,
        }).format(amount || 0);
      } catch {
        return `${(amount || 0).toLocaleString()} ${currency}`;
      }
    },
    fmtBase(amount) {
      return this.fmt(amount, this.baseCurrency);
    },

    // ================= account CRUD =================
    isCredit(a) {
      return fin.isCredit(a);
    },
    utilization(a) {
      return fin.utilization(a);
    },
    typeLabel(a) {
      return TYPES.find((t) => t.value === a.type)?.label || a.type;
    },
    // Reorder tiles on the Overview (array order IS the stored order everywhere).
    moveAccount(account, dir) {
      const arr = this.data.accounts;
      const i = arr.findIndex((a) => a.id === account.id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= arr.length) return;
      [arr[i], arr[j]] = [arr[j], arr[i]];
      this.persist();
    },
    // Reset tile order: group by account type (same order as the summary strip),
    // keeping the existing relative order within each type (stable sort).
    resetAccountOrder() {
      const idx = (t) => TYPES.findIndex((x) => x.value === t);
      this.data.accounts.sort((a, b) => idx(a.type) - idx(b.type));
      this.persist();
      this.flash('Accounts grouped by type ↩️');
    },
    // Totals per account type (in base currency), for the Overview summary strip.
    get typeSummary() {
      const groups = [];
      for (const t of TYPES) {
        const accs = this.data.accounts.filter((a) => a.type === t.value);
        if (!accs.length) continue;
        let total = 0;
        for (const a of accs) {
          const v = fx.toBase(Number(a.balance) || 0, a.currency, this.data);
          if (v != null) total += v;
        }
        groups.push({ type: t.value, label: t.label, emoji: TYPE_EMOJI[t.value], count: accs.length, total, isCredit: t.value === 'credit' });
      }
      return groups;
    },

    // ----- savings / CD / investment / retirement -----
    isLockedAcct(a) {
      return fin.isLocked(a, this.data.settings, today());
    },
    get lockedTotal() {
      return fin.lockedTotal(this.data, today());
    },
    get interestPerYear() {
      return fin.totalAnnualInterest(this.data);
    },
    annualInterest(a) {
      return fin.annualInterest(a);
    },
    gainLoss(a) {
      return fin.gainLoss(a);
    },
    cdInfo(a) {
      const days = fin.cdDaysToMaturity(a, today());
      if (days === null) return null;
      return { days, projected: fin.cdValueAtMaturity(a, today()), matured: days <= 0 };
    },
    retInfo(a) {
      return fin.retirementInfo(a, this.data.settings, today());
    },
    // "in 45d" / "in 3.2y" — compact time-until label
    untilLabel(days) {
      if (days == null) return '';
      if (days <= 0) return 'now';
      return days > 365 ? `in ${(days / 365).toFixed(1)}y` : `in ${days}d`;
    },
    lockReason(a) {
      if (a.type === 'cd') return a.maturityDate ? `until it matures on ${a.maturityDate}` : 'until maturity';
      if (a.type === 'retirement') {
        const info = this.retInfo(a);
        return info?.unlockDate ? `until age ${info.unlockAge} (${info.unlockDate})` : `until age ${a.unlockAge || 59.5}`;
      }
      return '';
    },
    // Liquid assets only — what savings goals may reserve from (no CDs / retirement).
    get spendableAssets() {
      return this.assetAccounts.filter((a) => !this.isLockedAcct(a));
    },
    accountName(id) {
      return fin.accountById(this.data, id)?.name || '—';
    },
    openAddAccount() {
      this.acct = blankAccount();
      this.acct.currency = this.baseCurrency;
      this.accountModal = true;
    },
    openEditAccount(account) {
      this.acct = {
        ...account,
        balance: String(account.balance),
        creditLimit: account.creditLimit != null ? String(account.creditLimit) : '',
        interestRate: account.interestRate != null ? String(account.interestRate) : '',
        maturityDate: account.maturityDate || '',
        unlockAge: account.unlockAge != null ? String(account.unlockAge) : '',
        costBasis: account.costBasis != null ? String(account.costBasis) : '',
      };
      this.accountModal = true;
    },
    saveAccount() {
      const name = this.acct.name.trim();
      if (!name) return this.flash('Give the account a name 🙂');
      const balance = Number(this.acct.balance);
      if (!Number.isFinite(balance)) return this.flash('Balance should be a number');
      const original = fin.accountById(this.data, this.acct.id);
      // Converting to/from a credit card flips what the balance MEANS (have ↔ owe) — say so.
      if (original && original.type !== this.acct.type && Math.abs(balance) > 0.005) {
        const wasCredit = original.type === 'credit';
        const nowCredit = this.acct.type === 'credit';
        if (wasCredit !== nowCredit) {
          const msg = nowCredit
            ? `Heads-up: “${name}” becomes a credit card, so its balance of ${balance} now means money you OWE. Continue?`
            : `Heads-up: “${name}” is no longer a credit card, so its balance of ${balance} now means money you HAVE. Continue?`;
          if (!confirm(msg)) return;
        }
      }
      // Auto-pick a fitting emoji when the user left the (old) type's default one.
      let emoji = this.acct.emoji;
      if (original && original.type !== this.acct.type && emoji === TYPE_EMOJI[original.type]) {
        emoji = TYPE_EMOJI[this.acct.type] || emoji; // type changed, emoji was old default → follow
      } else if (!original && emoji === '🏦' && this.acct.type !== 'bank') {
        emoji = TYPE_EMOJI[this.acct.type] || emoji; // new account, untouched default
      }
      const clean = {
        id: this.acct.id || store.newId(),
        name,
        type: this.acct.type,
        emoji,
        currency: this.acct.currency,
        balance,
        reconciledAt: fin.accountById(this.data, this.acct.id)?.reconciledAt || null,
      };
      if (this.acct.type === 'credit') {
        const lim = Number(this.acct.creditLimit);
        clean.creditLimit = Number.isFinite(lim) && lim > 0 ? lim : null;
      }
      // type-specific extras (savings/CD/investment/retirement)
      if (this.acct.type === 'savings' || this.acct.type === 'cd') {
        const r = Number(this.acct.interestRate);
        clean.interestRate = Number.isFinite(r) && r > 0 ? r : null;
      }
      if (this.acct.type === 'cd') clean.maturityDate = this.acct.maturityDate || null;
      if (this.acct.type === 'investment') {
        const b = Number(this.acct.costBasis);
        clean.costBasis = Number.isFinite(b) && b > 0 ? b : null;
      }
      if (this.acct.type === 'retirement') {
        const a = Number(this.acct.unlockAge);
        clean.unlockAge = Number.isFinite(a) && a > 0 ? a : 59.5;
      }
      const idx = this.data.accounts.findIndex((a) => a.id === clean.id);
      if (idx >= 0) this.data.accounts[idx] = clean;
      else this.data.accounts.push(clean);
      this.persist();
      this.accountModal = false;
      if (this.unconvertible.length) this.refreshRates();
    },
    deleteAccount(account) {
      if (!confirm(`Delete "${account.name}"? Its logged activity will be removed too. This can't be undone.`)) return;
      // Reverse then drop any transactions touching this account so other balances stay correct.
      const affected = this.data.transactions.filter((t) => t.accountId === account.id || t.toAccountId === account.id);
      affected.forEach((t) => fin.applyTx(this.data, t, -1));
      this.data.transactions = this.data.transactions.filter((t) => t.accountId !== account.id && t.toAccountId !== account.id);
      this.data.accounts = this.data.accounts.filter((a) => a.id !== account.id);
      this.persist();
    },

    // ================= transactions =================
    get categories() {
      return this.data.categories;
    },
    categoryEmoji(name) {
      return this.data.categories.find((c) => c.name === name)?.emoji || '➕';
    },

    // ================= category management =================
    // Income & Adjustment are wired into app logic (income defaults, reconcile
    // drift, insights math) — they can't be renamed or deleted.
    PROTECTED_CATEGORIES: ['Income', 'Adjustment', 'Reimbursement'],
    isProtectedCategory(name) {
      return this.PROTECTED_CATEGORIES.includes(name);
    },
    // First everyday category — used as the default for new expenses.
    get defaultExpenseCategory() {
      return this.data.categories.find((c) => !this.isProtectedCategory(c.name))?.name || 'Other';
    },
    categoryUseCount(name) {
      return (
        this.data.transactions.filter((t) => t.category === name).length +
        this.data.recurring.filter((r) => r.category === name).length
      );
    },
    openAddCategory() {
      this.catDraft = { originalName: null, name: '', emoji: '🏷️' };
      this.catDeletePending = null;
    },
    openEditCategory(cat) {
      if (this.isProtectedCategory(cat.name)) return;
      this.catDraft = { originalName: cat.name, name: cat.name, emoji: cat.emoji };
    },
    saveCategory() {
      const name = this.catDraft.name.trim();
      const emoji = (this.catDraft.emoji || '🏷️').trim() || '🏷️';
      if (!name) return this.flash('Give the category a name 🙂');
      if (this.isProtectedCategory(name) && name !== this.catDraft.originalName) {
        return this.flash(`“${name}” is a built-in category`);
      }
      const clash = this.data.categories.find(
        (c) => c.name.toLowerCase() === name.toLowerCase() && c.name !== this.catDraft.originalName
      );
      if (clash) return this.flash(`“${clash.name}” already exists`);

      if (this.catDraft.originalName === null) {
        // new category — keep the special ones (Income/Adjustment/Other) at the end
        const at = this.data.categories.findIndex((c) => c.name === 'Income');
        const entry = { name, emoji };
        if (at >= 0) this.data.categories.splice(at, 0, entry);
        else this.data.categories.push(entry);
        this.flash(`Added ${emoji} ${name}`);
      } else {
        const cat = this.data.categories.find((c) => c.name === this.catDraft.originalName);
        if (!cat) return;
        const oldName = cat.name;
        cat.name = name;
        cat.emoji = emoji;
        if (oldName !== name) {
          // the name IS the reference everywhere — carry history along
          this.data.transactions.forEach((t) => { if (t.category === oldName) t.category = name; });
          this.data.recurring.forEach((r) => { if (r.category === oldName) r.category = name; });
          if (this.data.budgets[oldName] != null) {
            this.data.budgets[name] = this.data.budgets[oldName];
            delete this.data.budgets[oldName];
          }
        }
        this.flash(`Updated ${emoji} ${name}`);
      }
      this.persist();
      this.openAddCategory(); // reset the form
    },
    // First tap on 🗑️ arms the row; the confirmation happens IN the modal
    // (native confirm() dialogs get silently suppressed in some browsers).
    deleteCategory(cat) {
      if (this.isProtectedCategory(cat.name)) return;
      this.catDeletePending = cat.name;
    },
    confirmDeleteCategory(cat) {
      if (this.isProtectedCategory(cat.name)) return;
      this.catDeletePending = null;
      const used = this.categoryUseCount(cat.name);
      if (used) {
        // make sure a landing spot exists
        if (!this.data.categories.some((c) => c.name === 'Other')) {
          this.data.categories.push({ name: 'Other', emoji: '➕' });
        }
        this.data.transactions.forEach((t) => { if (t.category === cat.name) t.category = 'Other'; });
        this.data.recurring.forEach((r) => { if (r.category === cat.name) r.category = 'Other'; });
      }
      delete this.data.budgets[cat.name];
      this.data.categories = this.data.categories.filter((c) => c.name !== cat.name);
      if (this.catDraft.originalName === cat.name) this.openAddCategory();
      this.persist();
    },
    // ---- activity filters (account / category / keyword) ----
    get filteredTx() {
      const q = this.txFilter.q.trim().toLowerCase();
      const { accountId, category } = this.txFilter;
      return this.data.transactions.filter((t) => {
        // an account matches either leg of a transfer
        if (accountId && t.accountId !== accountId && t.toAccountId !== accountId) return false;
        if (category && t.category !== category) return false;
        if (q) {
          const hay = [t.note, t.category, this.accountName(t.accountId), t.toAccountId ? this.accountName(t.toAccountId) : '', String(t.amount), t.date]
            .join(' ')
            .toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      });
    },
    // Balance of each account right AFTER each of its transactions, keyed
    // "accountId:txId". The current stored balance is the anchor: it already
    // includes every transaction, so we replay effects backwards from newest.
    buildRunningBalances(accountIds) {
      const map = {};
      const stamp = (t) => t.date + (t.createdAt || '');
      for (const id of accountIds) {
        const account = fin.accountById(this.data, id);
        if (!account) continue;
        const rows = this.data.transactions
          .filter((t) => t.accountId === id || t.toAccountId === id)
          .sort((a, b) => stamp(a).localeCompare(stamp(b)));
        let running = Number(account.balance) || 0;
        for (let i = rows.length - 1; i >= 0; i--) {
          map[`${id}:${rows[i].id}`] = running;
          running -= fin.txEffectOn(account, rows[i]); // step back one transaction
        }
      }
      return map;
    },
    get recentTx() {
      const rows = [...this.filteredTx]
        .sort((a, b) => (b.date + (b.createdAt || '')).localeCompare(a.date + (a.createdAt || '')))
        .slice(0, this.txLimit);
      // When filtering to one account, show that account's balance; otherwise the
      // account the entry came from (the "from" side of a transfer).
      const focus = this.txFilter.accountId;
      const ids = [...new Set(rows.map((t) => focus || t.accountId))];
      const balances = this.buildRunningBalances(ids);
      return rows.map((t) => {
        const balAccountId = focus || t.accountId;
        return { ...t, balAccountId, balanceAfter: balances[`${balAccountId}:${t.id}`] };
      });
    },
    // "🏦 $2,955.00" — the account's balance after that entry, bank-statement style.
    balanceAfterLabel(row) {
      if (row.balanceAfter === undefined || row.balanceAfter === null) return '';
      const acct = fin.accountById(this.data, row.balAccountId);
      if (!acct) return '';
      const owed = fin.isCredit(acct) && row.balanceAfter > 0.005;
      return `${acct.emoji} ${owed ? 'owed ' : ''}${this.fmt(Math.abs(row.balanceAfter), acct.currency)}`;
    },
    get txFilterActive() {
      return !!(this.txFilter.accountId || this.txFilter.category || this.txFilter.q.trim());
    },
    // Sum of what's showing, in base currency — handy when filtering to one category.
    get filteredTotals() {
      let expense = 0;
      let income = 0;
      let reimbursed = 0;
      for (const t of this.filteredTx) {
        if (t.kind === 'transfer') continue;
        const cur = fin.accountById(this.data, t.accountId)?.currency || this.baseCurrency;
        const v = fx.toBase(t.kind === 'expense' ? fin.realCost(t) : Number(t.amount) || 0, cur, this.data);
        if (v === null) continue;
        if (t.kind === 'expense') expense += v;
        else if (t.category === 'Reimbursement') reimbursed += v;
        else income += v;
      }
      return { expense, income, reimbursed, count: this.filteredTx.length };
    },
    clearTxFilter() {
      this.txFilter = { accountId: '', category: '', q: '' };
      this.txLimit = 40;
    },
    showMoreTx() {
      this.txLimit += 40;
    },
    openAddTx(kind = 'expense') {
      if (!this.hasAccounts) return this.flash('Add an account first 🙂');
      this.tx = blankTx(kind);
      // The guided flow asks for the account first, so start it empty rather than
      // silently assuming the first one.
      if (kind === 'expense') this.tx.category = this.defaultExpenseCategory;
      if (kind === 'income') {
        this.tx.category = 'Income';
        this.tx.catAuto = false; // income's category is fixed, not guessed
      }
      this.txModal = true;
    },
    openPayBill(card) {
      this.tx = blankTx('transfer');
      this.tx.toAccountId = card.id;
      this.tx.accountId = (this.assetAccounts[0] || {}).id || '';
      this.tx.note = `${card.name} payment`;
      this.tx.catAuto = false;
      this.txModal = true;
    },
    openEditTx(t) {
      this.tx = {
        ...t,
        amount: String(t.amount),
        split: fin.isSplit(t),
        myShare: t.myShare != null ? String(t.myShare) : '',
        catAuto: false, // you already chose this entry's category — don't re-guess it
        catVia: null,
      };
      this.txModal = true;
    },
    setTxKind(kind) {
      const was = this.tx.kind;
      this.tx.kind = kind;
      if (kind === 'income' && (!this.tx.category || this.tx.category === this.defaultExpenseCategory)) this.tx.category = 'Income';
      if (kind === 'expense' && this.tx.category === 'Income') this.tx.category = this.defaultExpenseCategory;
      if (kind === 'income') this.tx.catAuto = false; // always the Income category
      if (kind === 'expense' && was !== 'expense' && !this.tx.id) {
        this.tx.catAuto = true; // back to an expense: resume guessing from the title
        this.guessTxCategory();
      }
      // Never assume where the money goes — that's step 2's whole job.
      if (kind === 'transfer' && this.tx.toAccountId === this.tx.accountId) this.tx.toAccountId = '';
    },
    // ---- Guided logging: fields unlock as the one before them gets a value ----
    // Unlocking is derived from the DATA, not a step counter, so an entry you're
    // editing (every value already present) opens fully unlocked.
    get txSteps() {
      return this.tx.kind === 'transfer'
        ? ['accountId', 'toAccountId', 'amount']
        : ['accountId', 'amount'];
    },
    txFilled(key) {
      if (key === 'amount') return Number(this.tx.amount) > 0;
      if (key === 'note') return !!String(this.tx.note || '').trim();
      return !!this.tx[key];
    },
    txStepOpen(key) {
      const steps = this.txSteps;
      const i = steps.indexOf(key);
      if (i <= 0) return true;
      return steps.slice(0, i).every((k) => this.txFilled(k));
    },
    // The title + category + date tail opens once the amount is in. The title
    // itself stays optional, so a $3 cash coffee never needs a name.
    get txDetailsOpen() {
      return this.txSteps.every((k) => this.txFilled(k));
    },
    get txReady() {
      return this.txDetailsOpen;
    },
    txStepNum(key) {
      return this.txSteps.indexOf(key) + 1;
    },
    get txStepTotal() {
      return this.txSteps.length + 1; // the steps, plus the details tail
    },
    // Move the cursor along as each answer lands, so it really is one at a time.
    focusTxField(ref) {
      this.$nextTick(() => this.$refs[ref]?.focus());
    },
    onTxAccountPicked() {
      if (this.tx.kind === 'transfer' && this.tx.toAccountId === this.tx.accountId) this.tx.toAccountId = '';
      if (this.txStepOpen('amount')) this.focusTxField('txAmount');
    },
    // Re-guess the category from the title. Never overrides a category you picked.
    guessTxCategory() {
      if (this.tx.kind !== 'expense' || !this.tx.catAuto) return;
      const hit = categorize.guessCategory(this.tx.note, this.data);
      this.tx.category = hit ? hit.category : this.defaultExpenseCategory;
      this.tx.catVia = hit ? hit.via : null;
    },
    onTxCategoryPicked() {
      this.tx.catAuto = false; // you chose — stop second-guessing you
      this.tx.catVia = null;
    },
    get txCatAutoLabel() {
      if (this.tx.kind === 'transfer' || !this.tx.catAuto || !this.tx.catVia) return '';
      return this.tx.catVia === 'history' ? 'auto · from your history' : 'auto';
    },
    // Overview → tap an account to read its whole story on the Spending page.
    showAccountTx(acc) {
      this.txFilter = { accountId: acc.id, category: '', q: '' };
      this.txLimit = 40;
      this.setView('spending');
      this.$nextTick(() => {
        document.getElementById('activity')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    },
    saveTx() {
      const amount = Number(this.tx.amount);
      if (!(amount > 0)) return this.flash('Enter an amount greater than 0');
      if (!this.tx.accountId) return this.flash('Pick an account');
      if (this.tx.kind === 'transfer') {
        if (!this.tx.toAccountId) return this.flash('Pick a destination account');
        if (this.tx.toAccountId === this.tx.accountId) return this.flash('Choose two different accounts');
      }
      // Taking money OUT of a locked CD/retirement account deserves a warning, not silence.
      const fromAcct = fin.accountById(this.data, this.tx.accountId);
      if ((this.tx.kind === 'expense' || this.tx.kind === 'transfer') && fromAcct && this.isLockedAcct(fromAcct)) {
        if (!confirm(`🔒 ${fromAcct.name} is locked ${this.lockReason(fromAcct)}. Early withdrawals usually cost penalties — log it anyway?`)) return;
      }
      const myShare = this.splitShareFor(this.tx, amount);
      if (myShare === false) return; // validation already flashed
      const prior = this.data.transactions.find((t) => t.id === this.tx.id);
      const clean = {
        id: this.tx.id || store.newId(),
        kind: this.tx.kind,
        accountId: this.tx.accountId,
        toAccountId: this.tx.kind === 'transfer' ? this.tx.toAccountId : null,
        amount,
        myShare,
        settlesTxId: prior?.settlesTxId ?? null, // keep repayment links through edits
        category: this.tx.kind === 'transfer' ? null : this.tx.category,
        date: this.tx.date || today(),
        note: this.tx.note.trim(),
        source: 'manual',
        createdAt: new Date().toISOString(),
      };
      const idx = this.data.transactions.findIndex((t) => t.id === clean.id);
      if (idx >= 0) {
        fin.applyTx(this.data, this.data.transactions[idx], -1); // reverse old effect
        clean.createdAt = this.data.transactions[idx].createdAt; // keep original timestamp
        this.data.transactions[idx] = clean;
      } else {
        this.data.transactions.push(clean);
      }
      fin.applyTx(this.data, clean, 1); // apply new effect
      this.persist();
      this.txModal = false;
      this.drawChart();
    },
    deleteTx(t) {
      const linked = this.data.transactions.filter((x) => x.settlesTxId === t.id);
      const msg = linked.length
        ? `Delete this entry? Its ${linked.length} linked repayment${linked.length === 1 ? '' : 's'} will be kept (that money really did arrive) but no longer linked.`
        : 'Delete this entry?';
      if (!confirm(msg)) return;
      linked.forEach((x) => { x.settlesTxId = null; });
      fin.applyTx(this.data, t, -1);
      this.data.transactions = this.data.transactions.filter((x) => x.id !== t.id);
      this.persist();
    },
    txSign(t) {
      if (t.kind === 'income') return '+';
      if (t.kind === 'expense') return '−';
      return '';
    },
    txAccountLabel(t) {
      if (t.kind === 'transfer') return `${this.accountName(t.accountId)} → ${this.accountName(t.toAccountId)}`;
      return this.accountName(t.accountId);
    },
    txCurrency(t) {
      return fin.accountById(this.data, t.accountId)?.currency || this.baseCurrency;
    },

    // ================= split expenses & reimbursements =================
    // `amount` = what left the account (drives balances); `myShare` = what it
    // really cost you (drives budgets). The gap is what others owe you.
    realCost(item) {
      return fin.realCost(item);
    },
    isSplit(item) {
      return fin.isSplit(item);
    },
    owedOn(tx) {
      return fin.owedOn(this.data, tx);
    },
    get owedTotal() {
      return fin.owedTotal(this.data);
    },
    // Validates a modal draft and returns the myShare to store: a number when it's
    // a real split, null when it isn't, or `false` when the input is invalid.
    splitShareFor(draft, amount) {
      if (draft.kind !== 'expense' || !draft.split) return null;
      const share = Number(draft.myShare);
      if (draft.myShare === '' || !Number.isFinite(share) || share < 0) {
        this.flash('Enter your share (0 or more) 🙂');
        return false;
      }
      if (share > amount + 0.005) {
        this.flash("Your share can't be more than the total");
        return false;
      }
      return share < amount - 0.005 ? share : null; // paying it all = not a split
    },
    // ÷N button: my share becomes an even slice of the bill
    quickSplit(draft, n) {
      const amount = Number(draft.amount);
      if (!(amount > 0)) return this.flash('Enter the full amount first');
      draft.split = true;
      draft.myShare = (amount / n).toFixed(2);
    },
    // live hint under the split fields
    splitOwedHint(draft) {
      const amount = Number(draft.amount);
      const mine = Number(draft.myShare);
      if (!(amount > 0) || draft.myShare === '' || !Number.isFinite(mine)) return '';
      const owed = amount - mine;
      if (owed <= 0.005) return '';
      const cur = fin.accountById(this.data, draft.accountId)?.currency || this.baseCurrency;
      return `🤝 Others owe you ${this.fmt(owed, cur)}`;
    },
    // "🤝 $40.00 mine · $60.00 owed"  /  "· settled"
    splitLabel(t) {
      if (!fin.isSplit(t)) return '';
      const cur = fin.accountById(this.data, t.accountId)?.currency || this.baseCurrency;
      const owed = fin.owedOn(this.data, t);
      const tail = owed > 0.005 ? `${this.fmt(owed, cur)} owed` : 'settled ✓';
      return `🤝 ${this.fmt(fin.realCost(t), cur)} mine · ${tail}`;
    },
    openSettle(tx) {
      if (fin.owedOn(this.data, tx) <= 0.005) return;
      const target = this.assetAccounts[0] || this.data.accounts[0];
      this.settle = { txId: tx.id, accountId: target?.id || '', amount: '', date: today() };
      this.prefillSettleAmount();
      this.settleModal = true;
    },
    get settleTx() {
      return this.data.transactions.find((t) => t.id === this.settle.txId) || null;
    },
    // Outstanding, expressed in the currency of the account receiving the money.
    settleOutstanding() {
      const tx = this.settleTx;
      if (!tx) return 0;
      const owed = fin.owedOn(this.data, tx);
      const from = fin.accountById(this.data, tx.accountId)?.currency || this.baseCurrency;
      const to = fin.accountById(this.data, this.settle.accountId)?.currency || this.baseCurrency;
      if (from === to) return owed;
      return fx.convert(owed, from, to, this.data) ?? owed;
    },
    prefillSettleAmount() {
      this.settle.amount = this.settleOutstanding().toFixed(2);
    },
    saveSettle() {
      const tx = this.settleTx;
      if (!tx) return;
      if (!this.settle.accountId) return this.flash('Pick the account that received it');
      let amount = Number(this.settle.amount);
      if (!(amount > 0)) return this.flash('Enter an amount greater than 0');
      const cur = fin.accountById(this.data, this.settle.accountId)?.currency || this.baseCurrency;
      const outstanding = this.settleOutstanding();
      if (amount > outstanding + 0.005) {
        amount = Number(outstanding.toFixed(2));
        this.flash(`That's more than outstanding — using ${this.fmt(amount, cur)}`);
      }
      const repayment = {
        id: store.newId(),
        kind: 'income',
        accountId: this.settle.accountId,
        toAccountId: null,
        amount,
        myShare: null,
        settlesTxId: tx.id, // links it back so the outstanding figure updates
        category: 'Reimbursement',
        date: this.settle.date || today(),
        note: `Repayment: ${tx.note || tx.category || 'split expense'}`,
        source: 'manual',
        createdAt: new Date().toISOString(),
      };
      this.data.transactions.push(repayment);
      fin.applyTx(this.data, repayment, 1);
      this.persist();
      this.settleModal = false;
      this.drawChart();
      this.flash('Repayment recorded 🤝');
    },

    // ================= reconcile =================
    reconcileState(account) {
      const hasTx = this.data.transactions.some((t) => t.accountId === account.id || t.toAccountId === account.id);
      if (!account.reconciledAt) return hasTx ? 'check' : 'new';
      const activitySince = this.data.transactions.some(
        (t) => (t.accountId === account.id || t.toAccountId === account.id) && t.createdAt > account.reconciledAt
      );
      return activitySince ? 'check' : 'ok';
    },
    openReconcile(account) {
      this.recon = { accountId: account.id, actual: String(account.balance) };
      this.reconcileModal = true;
    },
    get reconAccount() {
      return fin.accountById(this.data, this.recon.accountId);
    },
    saveReconcile() {
      const acc = this.reconAccount;
      if (!acc) return;
      const actual = Number(this.recon.actual);
      if (!Number.isFinite(actual)) return this.flash('Enter the real balance as a number');
      const diff = actual - Number(acc.balance);
      if (Math.abs(diff) > 0.005) {
        // On an asset account a bigger real figure means money arrived (income).
        // A credit card's balance is what you OWE, so a bigger real figure means
        // a charge we never logged (expense) — the direction flips.
        const higher = diff > 0;
        const kind = fin.isCredit(acc) ? (higher ? 'expense' : 'income') : (higher ? 'income' : 'expense');
        // Record the drift as an Adjustment so history & the trend chart stay honest.
        const adj = {
          id: store.newId(),
          kind,
          accountId: acc.id,
          toAccountId: null,
          amount: Math.abs(diff),
          category: 'Adjustment',
          date: today(),
          note: 'Reconcile adjustment',
          source: 'manual',
          createdAt: new Date().toISOString(),
        };
        this.data.transactions.push(adj);
        fin.applyTx(this.data, adj, 1); // brings balance exactly to `actual`
      }
      acc.reconciledAt = new Date().toISOString();
      this.persist();
      this.reconcileModal = false;
      this.drawChart();
      this.flash(Math.abs(diff) > 0.005 ? 'Reconciled — logged the difference 🔧' : 'All matched — nice! ✓');
    },

    // ================= budgets =================
    get currentMonth() {
      return today().slice(0, 7);
    },
    get monthSpend() {
      return fin.spendByCategory(this.data, this.currentMonth);
    },
    get budgetRows() {
      const spend = this.monthSpend;
      // Show categories that either have a budget or have spending this month.
      return this.data.categories
        .filter((c) => this.data.budgets[c.name] > 0 || spend[c.name] > 0)
        .map((c) => {
          const limit = Number(this.data.budgets[c.name]) || 0;
          const spent = spend[c.name] || 0;
          const pct = limit > 0 ? Math.round((spent / limit) * 100) : null;
          return { name: c.name, emoji: c.emoji, limit, spent, pct, over: limit > 0 && spent > limit };
        });
    },
    barWidth(pct) {
      return Math.min(100, pct || 0) + '%';
    },
    barColor(row) {
      if (row.over) return '#ff8a5c';
      if (row.pct != null && row.pct >= 80) return '#ffd166';
      return '#7ee7c7';
    },
    budgetFor(cat) {
      return this.data.budgets[cat] ?? '';
    },
    setBudget(cat, value) {
      const n = Number(value);
      if (value === '' || !Number.isFinite(n) || n <= 0) delete this.data.budgets[cat];
      else this.data.budgets[cat] = n;
      this.persist();
    },

    // ================= savings goals (envelope: reserve within an account) =================
    availableOf(account) {
      return fin.availableOf(account, this.data);
    },
    reservedFor(account) {
      return fin.reservedForAccount(this.data, account.id);
    },
    get hasGoals() {
      return this.data.goals.length > 0;
    },
    goalPct(goal) {
      const t = Number(goal.targetAmount) || 0;
      return t > 0 ? Math.min(100, Math.round((Number(goal.saved) || 0) / t * 100)) : 0;
    },
    goalCurrency(goal) {
      return fin.accountById(this.data, goal.accountId)?.currency || this.baseCurrency;
    },
    openAddGoal() {
      if (!this.spendableAssets.length) return this.flash('Add a bank or cash account first 🙂');
      this.goal = blankGoal();
      this.goal.accountId = this.spendableAssets[0].id;
      this.goalModal = true;
    },
    openEditGoal(g) {
      this.goal = { ...g, targetAmount: String(g.targetAmount) };
      this.goalModal = true;
    },
    saveGoal() {
      const name = this.goal.name.trim();
      if (!name) return this.flash('Name your goal 🙂');
      const target = Number(this.goal.targetAmount);
      if (!(target > 0)) return this.flash('Set a target greater than 0');
      if (!this.goal.accountId) return this.flash('Pick which account funds this goal');
      const acct = fin.accountById(this.data, this.goal.accountId);
      const clean = {
        id: this.goal.id || store.newId(),
        name,
        emoji: this.goal.emoji,
        accountId: this.goal.accountId,
        currency: acct?.currency || this.baseCurrency,
        targetAmount: target,
        saved: Number(this.goal.saved) || 0,
      };
      const idx = this.data.goals.findIndex((g) => g.id === clean.id);
      if (idx >= 0) this.data.goals[idx] = clean;
      else this.data.goals.push(clean);
      this.persist();
      this.goalModal = false;
    },
    deleteGoal(g) {
      if (!confirm(`Delete the goal "${g.name}"? (Your account money isn't affected.)`)) return;
      this.data.goals = this.data.goals.filter((x) => x.id !== g.id);
      this.persist();
    },
    openContribute(g, mode = 'add') {
      this.contrib = { goalId: g.id, amount: '', mode };
      this.contributeModal = true;
    },
    get contribGoal() {
      return this.data.goals.find((g) => g.id === this.contrib.goalId);
    },
    saveContribute() {
      const g = this.contribGoal;
      if (!g) return;
      const amt = Number(this.contrib.amount);
      if (!(amt > 0)) return this.flash('Enter an amount greater than 0');
      if (this.contrib.mode === 'add') {
        g.saved = (Number(g.saved) || 0) + amt;
        const acct = fin.accountById(this.data, g.accountId);
        if (acct && fin.availableOf(acct, this.data) < 0) {
          this.flash("Reserved more than that account holds — that's okay, just a heads-up ⚠️");
        }
      } else {
        g.saved = Math.max(0, (Number(g.saved) || 0) - amt);
      }
      this.persist();
      this.contributeModal = false;
    },

    // ================= recurring items (remind + one-tap log) =================
    get upcoming() {
      return [...this.data.recurring].sort((a, b) => a.nextDate.localeCompare(b.nextDate));
    },
    get hasRecurring() {
      return this.data.recurring.length > 0;
    },
    dueLabel(item) {
      const n = fin.daysUntil(item.nextDate, today());
      if (n < 0) return `overdue ${-n}d`;
      if (n === 0) return 'due today';
      if (n === 1) return 'due tomorrow';
      return `in ${n} days`;
    },
    dueClass(item) {
      const n = fin.daysUntil(item.nextDate, today());
      if (n < 0) return 'due-over';
      if (n <= 3) return 'due-soon';
      return '';
    },
    recCurrency(item) {
      return fin.accountById(this.data, item.accountId)?.currency || this.baseCurrency;
    },
    // recurring items default to Bills when it exists, else the first everyday category
    get defaultRecurringCategory() {
      return this.data.categories.some((c) => c.name === 'Bills') ? 'Bills' : this.defaultExpenseCategory;
    },
    openAddRecurring() {
      if (!this.hasAccounts) return this.flash('Add an account first 🙂');
      this.rec = blankRecurring();
      this.rec.accountId = this.data.accounts[0].id;
      this.rec.category = this.defaultRecurringCategory;
      this.recurringModal = true;
    },
    openEditRecurring(item) {
      this.rec = {
        ...item,
        amount: String(item.amount),
        split: fin.isSplit(item),
        myShare: item.myShare != null ? String(item.myShare) : '',
      };
      this.recurringModal = true;
    },
    setRecKind(kind) {
      this.rec.kind = kind;
      if (kind === 'income' && (!this.rec.category || this.rec.category === this.defaultRecurringCategory)) this.rec.category = 'Income';
      if (kind === 'expense' && this.rec.category === 'Income') this.rec.category = this.defaultRecurringCategory;
      if (kind === 'transfer' && (!this.rec.toAccountId || this.rec.toAccountId === this.rec.accountId)) {
        this.rec.toAccountId = this.data.accounts.find((a) => a.id !== this.rec.accountId)?.id || '';
      }
    },
    saveRecurring() {
      const name = this.rec.name.trim();
      if (!name) return this.flash('Name the recurring item 🙂');
      const amount = Number(this.rec.amount);
      if (!(amount > 0)) return this.flash('Enter an amount greater than 0');
      if (!this.rec.accountId) return this.flash('Pick an account');
      if (this.rec.kind === 'transfer' && (!this.rec.toAccountId || this.rec.toAccountId === this.rec.accountId)) {
        return this.flash('Pick two different accounts for the transfer');
      }
      const recShare = this.splitShareFor(this.rec, amount);
      if (recShare === false) return;
      const clean = {
        id: this.rec.id || store.newId(),
        name,
        emoji: this.rec.emoji,
        myShare: recShare,
        kind: this.rec.kind,
        accountId: this.rec.accountId,
        toAccountId: this.rec.kind === 'transfer' ? this.rec.toAccountId : null,
        category: this.rec.kind === 'transfer' ? null : this.rec.category,
        amount,
        cadence: this.rec.cadence,
        nextDate: this.rec.nextDate || today(),
      };
      const idx = this.data.recurring.findIndex((r) => r.id === clean.id);
      if (idx >= 0) this.data.recurring[idx] = clean;
      else this.data.recurring.push(clean);
      this.persist();
      this.recurringModal = false;
    },
    deleteRecurring(item) {
      if (!confirm(`Remove the recurring item "${item.name}"?`)) return;
      this.data.recurring = this.data.recurring.filter((r) => r.id !== item.id);
      this.persist();
    },
    // One-tap: log the real transaction for this due item, then roll to the next date.
    logRecurringNow(item) {
      const tx = {
        id: store.newId(),
        kind: item.kind,
        accountId: item.accountId,
        toAccountId: item.kind === 'transfer' ? item.toAccountId : null,
        amount: Number(item.amount),
        myShare: item.myShare ?? null, // rent split repeats every month
        category: item.kind === 'transfer' ? null : item.category,
        date: item.nextDate,
        note: item.name,
        source: 'manual',
        createdAt: new Date().toISOString(),
      };
      this.data.transactions.push(tx);
      fin.applyTx(this.data, tx, 1);
      item.nextDate = fin.addCadence(item.nextDate, item.cadence);
      this.persist();
      this.drawChart();
      this.flash(`Logged “${item.name}” ✅`);
    },
    skipRecurring(item) {
      item.nextDate = fin.addCadence(item.nextDate, item.cadence);
      this.persist();
      this.flash(`Skipped to ${item.nextDate}`);
    },

    // ================= insights (rules engine) + AI deep-dive =================
    get insights() {
      return insightsEngine.buildInsights(this.data, today(), (n) => this.fmtBase(n));
    },
    get insightCounts() {
      const c = { warn: 0, info: 0, win: 0 };
      for (const i of this.insights) c[i.severity] += 1;
      return c;
    },
    sevMeta(sev) {
      return { warn: { emoji: '⚠️', label: 'heads-up' }, info: { emoji: '💡', label: 'good to know' }, win: { emoji: '✅', label: 'win' } }[sev];
    },
    get aiSettings() {
      return this.data.settings.ai;
    },
    get aiPresets() {
      return ai.AI_PRESETS;
    },
    get aiKeyHint() {
      return ai.AI_PRESETS.find((p) => p.id === this.aiSettings.preset)?.keyHint || '';
    },
    get aiConfigured() {
      const s = this.aiSettings;
      return !!(s.baseUrl && s.model && (s.apiKey || s.baseUrl.includes('localhost')));
    },
    get aiHost() {
      try { return new URL(this.aiSettings.baseUrl).host; } catch { return 'the AI provider'; }
    },
    applyAiPreset(id) {
      const p = ai.AI_PRESETS.find((x) => x.id === id);
      if (!p) return;
      this.aiSettings.preset = id;
      if (p.baseUrl) this.aiSettings.baseUrl = p.baseUrl;
      if (p.model) this.aiSettings.model = p.model;
      this.persist(); // key is deliberately kept
    },
    async runAI() {
      if (this.aiBusy || !this.aiConfigured) return;
      this.aiError = '';
      this.aiBusy = true;
      try {
        const res = await ai.analyze(this.aiSettings, ai.buildMessages(this.data, today()));
        if (res.ok) {
          this.aiHtml = ai.renderMarkdownLite(res.text);
          this.flash('Fresh AI insights ✨');
        } else {
          this.aiError = res.error;
        }
      } finally {
        this.aiBusy = false;
      }
    },

    // ================= snapshots + chart =================
    saveSnapshot() {
      const date = today();
      const perAccount = {};
      this.data.accounts.forEach((a) => (perAccount[a.id] = this.baseOf(a) || 0));
      const entry = { date, totalInBase: this.totals.net, perAccount };
      const existing = this.data.snapshots.findIndex((s) => s.date === date);
      if (existing >= 0) this.data.snapshots[existing] = entry;
      else this.data.snapshots.push(entry);
      this.persist();
      this.drawChart();
      this.flash('Snapshot saved 📸');
    },
    get hasSnapshots() {
      return this.data.snapshots.length > 0;
    },
    drawChart() {
      this.$nextTick(() => renderTrend(this.$refs.trend, this.data.snapshots, this.baseCurrency));
    },

    // ================= settings + backup =================
    async changeBase(code) {
      this.data.settings.baseCurrency = code;
      this.persist();
      await this.refreshRates();
    },
    manualRateFor(code) {
      return this.data.settings.manualRates[code] ?? '';
    },
    setManualRate(code, value) {
      const n = Number(value);
      if (value === '' || !Number.isFinite(n) || n <= 0) delete this.data.settings.manualRates[code];
      else this.data.settings.manualRates[code] = n;
      this.persist();
    },
    doExport() {
      this.data.settings.lastBackupAt = new Date().toISOString();
      this.backupDismissed = true; // hide the reminder right away
      store.exportJSON(this.data);
      this.persist();
      this.flash('Backup downloaded 💾');
    },

    // --- backup reminder ---
    get hasData() {
      return this.data.accounts.length > 0 || this.data.transactions.length > 0;
    },
    get daysSinceBackup() {
      const t = this.data.settings.lastBackupAt;
      if (!t) return null; // never backed up
      return Math.floor((Date.now() - new Date(t).getTime()) / 86400000);
    },
    get showBackupReminder() {
      if (!this.hasData || this.backupDismissed) return false;
      const snooze = this.data.settings.backupSnoozeUntil;
      if (snooze && Date.now() < new Date(snooze).getTime()) return false;
      const d = this.daysSinceBackup;
      return d === null || d >= 7; // never, or 7+ days ago
    },
    backupReminderText() {
      const d = this.daysSinceBackup;
      if (d === null) return "You haven't backed up yet.";
      if (d === 0) return 'You last backed up today.';
      return `Your last backup was ${d} day${d === 1 ? '' : 's'} ago.`;
    },
    snoozeBackup() {
      this.data.settings.backupSnoozeUntil = new Date(Date.now() + 3 * 86400000).toISOString();
      this.backupDismissed = true;
      this.persist();
    },
    // Build one styled worksheet for a set of expenses: pretty header, running rows,
    // a TOTAL row, and a budget-vs-actual comparison table below.
    buildExpenseSheet(label, expenses) {
      const base = this.baseCurrency;
      const ws = {};
      const merges = [];
      let R = 0;
      const put = (r, c, v, s) => {
        ws[XLSX.utils.encode_cell({ r, c })] = { v, t: typeof v === 'number' ? 'n' : 's', s };
      };
      const bandStyle = (r, cStart, cEnd, s) => { for (let c = cStart; c <= cEnd; c++) put(r, c, '', s); };
      const EC = 8; // expense columns A..H

      // --- Expenses title (merged) ---
      put(R, 0, `Expenses — ${label}`, XS.title);
      bandStyle(R, 1, EC - 1, XS.title);
      merges.push({ s: { r: R, c: 0 }, e: { r: R, c: EC - 1 } });
      R += 1;

      // --- Expenses header ---
      ['Date', 'Account', 'Category', 'Note', 'Amount', 'Currency', `Charged (${base})`, `My share (${base})`]
        .forEach((h, c) => put(R, c, h, XS.header));
      R += 1;

      // --- Expense rows (zebra striped) ---
      let total = 0;
      let mineTotal = 0;
      const spentByCat = {};
      expenses.forEach((t, i) => {
        const alt = i % 2 === 1;
        const cS = alt ? XS.cellA : XS.cell;
        const nS = alt ? XS.numA : XS.num;
        const ctrS = alt ? XS.centerA : XS.center;
        const acct = fin.accountById(this.data, t.accountId);
        const cur = acct?.currency || base;
        const inBase = fx.toBase(Number(t.amount) || 0, cur, this.data);
        put(R, 0, t.date, cS);
        put(R, 1, acct?.name || '—', cS);
        put(R, 2, t.category || '', cS);
        put(R, 3, t.note || '', cS);
        put(R, 4, Number((Number(t.amount) || 0).toFixed(2)), nS);
        put(R, 5, cur, ctrS);
        const mineBase = fx.toBase(fin.realCost(t), cur, this.data);
        if (inBase == null) {
          put(R, 6, '', cS);
          put(R, 7, '', cS);
        } else {
          put(R, 6, Number(inBase.toFixed(2)), nS);
          put(R, 7, Number((mineBase ?? inBase).toFixed(2)), nS);
          total += inBase;
          mineTotal += mineBase ?? inBase;
          // budgets compare against YOUR share, so category totals use it too
          spentByCat[t.category || 'Other'] = (spentByCat[t.category || 'Other'] || 0) + (mineBase ?? inBase);
        }
        R += 1;
      });

      // --- TOTAL row ---
      put(R, 0, `TOTAL (${base})`, XS.totLbl);
      bandStyle(R, 1, 5, XS.totLbl);
      merges.push({ s: { r: R, c: 0 }, e: { r: R, c: 5 } });
      put(R, 6, Number(total.toFixed(2)), XS.totNum);
      put(R, 7, Number(mineTotal.toFixed(2)), XS.totNum);
      R += 2; // blank spacer row

      // --- Budget vs actual ---
      const months = new Set(expenses.map((t) => fin.monthKey(t.date))).size || 1;
      const cats = this.data.categories.filter(
        (c) => !this.isProtectedCategory(c.name) && ((Number(this.data.budgets[c.name]) || 0) > 0 || (spentByCat[c.name] || 0) > 0)
      );
      const BC = 5; // budget columns A..E
      put(R, 0, `Budget vs actual — ${label}${months > 1 ? ` (${months} months)` : ''}`, XS.title);
      bandStyle(R, 1, BC - 1, XS.title);
      merges.push({ s: { r: R, c: 0 }, e: { r: R, c: BC - 1 } });
      R += 1;
      ['Category', `Budget (${base})`, `Spent (${base})`, 'Difference', 'Status'].forEach((h, c) => put(R, c, h, XS.header));
      R += 1;

      let tBud = 0;
      let tSpent = 0;
      cats.forEach((c, i) => {
        const alt = i % 2 === 1;
        const cS = alt ? XS.cellA : XS.cell;
        const nS = alt ? XS.numA : XS.num;
        const ctrS = alt ? XS.centerA : XS.center;
        const monthly = Number(this.data.budgets[c.name]) || 0;
        const budgeted = monthly * months;
        const spent = spentByCat[c.name] || 0;
        const diff = budgeted - spent;
        tBud += budgeted;
        tSpent += spent;
        put(R, 0, `${c.emoji} ${c.name}`, cS);
        if (monthly > 0) put(R, 1, Number(budgeted.toFixed(2)), nS);
        else put(R, 1, '—', ctrS);
        put(R, 2, Number(spent.toFixed(2)), nS);
        if (monthly > 0) put(R, 3, Number(diff.toFixed(2)), diff < 0 ? XS.diffNeg : XS.diffPos);
        else put(R, 3, '', cS);
        if (monthly <= 0) put(R, 4, 'no budget', ctrS);
        else if (spent > budgeted) put(R, 4, 'OVER', XS.over);
        else put(R, 4, 'OK', XS.ok);
        R += 1;
      });
      // budget total row
      put(R, 0, 'TOTAL', XS.totLbl);
      put(R, 1, Number(tBud.toFixed(2)), XS.totNum);
      put(R, 2, Number(tSpent.toFixed(2)), XS.totNum);
      put(R, 3, Number((tBud - tSpent).toFixed(2)), XS.totNum);
      put(R, 4, '', XS.totLbl);
      R += 1;

      ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: R, c: EC - 1 } });
      ws['!merges'] = merges;
      ws['!cols'] = [{ wch: 12 }, { wch: 20 }, { wch: 16 }, { wch: 26 }, { wch: 11 }, { wch: 9 }, { wch: 15 }, { wch: 15 }];
      return ws;
    },
    get sortedExpenses() {
      return this.data.transactions
        .filter((t) => t.kind === 'expense')
        .sort((a, b) => (a.date + a.createdAt).localeCompare(b.date + b.createdAt));
    },
    // Excel sheet names can't exceed 31 chars or contain : \ / ? * [ ]
    safeSheetName(name) {
      return name.replace(/[:\\/?*[\]]/g, '-').slice(0, 31);
    },

    // Export EXPENSES as a real .xlsx workbook: an "All expenses" sheet + one tab per month.
    exportExpensesXLSX() {
      const expenses = this.sortedExpenses;
      if (!expenses.length) return this.flash('No expenses to export yet 🙂');
      if (typeof XLSX === 'undefined') return this.flash('Spreadsheet library not loaded');

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, this.buildExpenseSheet('All expenses', expenses), 'All expenses');

      // group into months (most-recent month first)
      const byMonth = {};
      for (const t of expenses) (byMonth[fin.monthKey(t.date)] ||= []).push(t);
      for (const ym of Object.keys(byMonth).sort().reverse()) {
        XLSX.utils.book_append_sheet(wb, this.buildExpenseSheet(ym, byMonth[ym]), this.safeSheetName(ym));
      }
      XLSX.writeFile(wb, `expenses-${today()}.xlsx`);
      this.flash(`Exported ${expenses.length} expense${expenses.length === 1 ? '' : 's'} 📊`);
    },

    async doImport(event) {
      const file = event.target.files?.[0];
      if (!file) return;
      try {
        this.data = await store.importJSON(file);
        this.persist();
        await this.refreshRates();
        this.drawChart();
        this.flash('Backup restored ✅');
      } catch (e) {
        this.flash(`Import failed: ${e.message}`);
      } finally {
        event.target.value = '';
      }
    },

    // ================= toast =================
    flash(msg) {
      this.toast = msg;
      clearTimeout(this._toastTimer);
      this._toastTimer = setTimeout(() => (this.toast = ''), 2600);
    },
    fxLabel() {
      return {
        loading: 'Updating rates…',
        fresh: 'Rates up to date',
        updated: 'Rates updated',
        stale: 'Using saved rates (offline)',
        offline: 'Offline — set manual rates',
      }[this.fxStatus];
    },
  }));
});

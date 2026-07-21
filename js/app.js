// app.js — the dashboard's brain (Alpine component).
// Phase 1: accounts + net worth.  Phase 2: transactions, transfers/bill payment,
// reconcile, categories & monthly budgets, credit cards.
import * as store from './store.js';
import * as fx from './fx.js';
import * as fin from './finance.js';
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

const today = () => new Date().toISOString().slice(0, 10);

function blankAccount() {
  return {
    id: null, name: '', type: 'bank', emoji: '🏦', currency: 'USD', balance: '',
    creditLimit: '', interestRate: '', maturityDate: '', unlockAge: '', costBasis: '',
  };
}
function blankTx(kind = 'expense') {
  return { id: null, kind, accountId: '', toAccountId: '', amount: '', category: 'Food', date: today(), note: '' };
}
function blankGoal() {
  return { id: null, name: '', emoji: '🎯', accountId: '', currency: 'USD', targetAmount: '', saved: 0 };
}
function blankRecurring() {
  return { id: null, name: '', emoji: '🔁', kind: 'expense', accountId: '', toAccountId: '', category: 'Bills', amount: '', cadence: 'monthly', nextDate: today() };
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
    view: 'overview', // overview | spending | goals
    sidebarOpen: false,
    backupDismissed: false,
    accountModal: false,
    txModal: false,
    reconcileModal: false,
    budgetsModal: false,
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
    get recentTx() {
      return [...this.data.transactions]
        .sort((a, b) => (b.date + b.createdAt).localeCompare(a.date + a.createdAt))
        .slice(0, 40);
    },
    openAddTx(kind = 'expense') {
      if (!this.hasAccounts) return this.flash('Add an account first 🙂');
      this.tx = blankTx(kind);
      this.tx.accountId = this.data.accounts[0].id;
      if (kind === 'income') this.tx.category = 'Income';
      if (kind === 'transfer') {
        this.tx.accountId = (this.assetAccounts[0] || this.data.accounts[0]).id;
        this.tx.toAccountId = this.data.accounts.find((a) => a.id !== this.tx.accountId)?.id || '';
      }
      this.txModal = true;
    },
    openPayBill(card) {
      this.tx = blankTx('transfer');
      this.tx.toAccountId = card.id;
      this.tx.accountId = (this.assetAccounts[0] || {}).id || '';
      this.tx.note = `${card.name} payment`;
      this.txModal = true;
    },
    openEditTx(t) {
      this.tx = { ...t, amount: String(t.amount) };
      this.txModal = true;
    },
    setTxKind(kind) {
      this.tx.kind = kind;
      if (kind === 'income' && (!this.tx.category || this.tx.category === 'Food')) this.tx.category = 'Income';
      if (kind === 'expense' && this.tx.category === 'Income') this.tx.category = 'Food';
      if (kind === 'transfer') {
        if (!this.tx.accountId) this.tx.accountId = (this.assetAccounts[0] || this.data.accounts[0])?.id || '';
        if (!this.tx.toAccountId || this.tx.toAccountId === this.tx.accountId) {
          this.tx.toAccountId = this.data.accounts.find((a) => a.id !== this.tx.accountId)?.id || '';
        }
      }
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
      const clean = {
        id: this.tx.id || store.newId(),
        kind: this.tx.kind,
        accountId: this.tx.accountId,
        toAccountId: this.tx.kind === 'transfer' ? this.tx.toAccountId : null,
        amount,
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
      if (!confirm('Delete this entry?')) return;
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
        // Record the drift as an Adjustment so history & the trend chart stay honest.
        const adj = {
          id: store.newId(),
          kind: diff > 0 ? 'income' : 'expense',
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
    openAddRecurring() {
      if (!this.hasAccounts) return this.flash('Add an account first 🙂');
      this.rec = blankRecurring();
      this.rec.accountId = this.data.accounts[0].id;
      this.recurringModal = true;
    },
    openEditRecurring(item) {
      this.rec = { ...item, amount: String(item.amount) };
      this.recurringModal = true;
    },
    setRecKind(kind) {
      this.rec.kind = kind;
      if (kind === 'income' && (!this.rec.category || this.rec.category === 'Bills')) this.rec.category = 'Income';
      if (kind === 'expense' && this.rec.category === 'Income') this.rec.category = 'Bills';
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
      const clean = {
        id: this.rec.id || store.newId(),
        name,
        emoji: this.rec.emoji,
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
      const EC = 7; // expense columns A..G

      // --- Expenses title (merged) ---
      put(R, 0, `Expenses — ${label}`, XS.title);
      bandStyle(R, 1, EC - 1, XS.title);
      merges.push({ s: { r: R, c: 0 }, e: { r: R, c: EC - 1 } });
      R += 1;

      // --- Expenses header ---
      ['Date', 'Account', 'Category', 'Note', 'Amount', 'Currency', `Amount (${base})`].forEach((h, c) => put(R, c, h, XS.header));
      R += 1;

      // --- Expense rows (zebra striped) ---
      let total = 0;
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
        if (inBase == null) {
          put(R, 6, '', cS);
        } else {
          put(R, 6, Number(inBase.toFixed(2)), nS);
          total += inBase;
          spentByCat[t.category || 'Other'] = (spentByCat[t.category || 'Other'] || 0) + inBase;
        }
        R += 1;
      });

      // --- TOTAL row ---
      put(R, 0, `TOTAL (${base})`, XS.totLbl);
      bandStyle(R, 1, 5, XS.totLbl);
      merges.push({ s: { r: R, c: 0 }, e: { r: R, c: 5 } });
      put(R, 6, Number(total.toFixed(2)), XS.totNum);
      R += 2; // blank spacer row

      // --- Budget vs actual ---
      const months = new Set(expenses.map((t) => fin.monthKey(t.date))).size || 1;
      const cats = this.data.categories.filter(
        (c) => c.name !== 'Income' && c.name !== 'Adjustment' && ((Number(this.data.budgets[c.name]) || 0) > 0 || (spentByCat[c.name] || 0) > 0)
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
      ws['!cols'] = [{ wch: 12 }, { wch: 20 }, { wch: 16 }, { wch: 26 }, { wch: 11 }, { wch: 9 }, { wch: 15 }];
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

// insights.js — the financial-literacy rules engine. Pure functions, no DOM.
//
// buildInsights(data, todayStr, fmtBase) → [{ id, severity, emoji, title, message, blurb }]
//   severity: 'warn' | 'info' | 'win'  (sorted warn → info → win)
// Everything is educational observation, not financial advice — the UI says so too.
// All money math is in the base currency; unconvertible balances are skipped
// (same convention as finance.totals), and 'Adjustment' transactions are excluded
// from income/expense flows (they're reconcile drift, not real cash flow).
import { toBase } from './fx.js';
import * as fin from './finance.js';

// ---------- shared derived values ----------

export function prevMonthKeys(todayStr, n = 3) {
  const [y, m] = todayStr.slice(0, 7).split('-').map(Number);
  const keys = [];
  for (let i = 1; i <= n; i++) {
    const d = new Date(y, m - 1 - i, 1);
    keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return keys;
}

// Income & expense totals for one month, in base currency (Adjustments excluded).
export function monthFlows(data, ym) {
  let income = 0;
  let expense = 0;
  for (const t of data.transactions) {
    if (fin.monthKey(t.date) !== ym || t.kind === 'transfer') continue;
    // Adjustments are reconcile drift; Reimbursements are your own money coming
    // back from a split bill — neither is real income or spending.
    if (t.category === 'Adjustment' || t.category === 'Reimbursement') continue;
    const cur = fin.accountById(data, t.accountId)?.currency || data.settings.baseCurrency;
    // expenses count only YOUR share of a split bill
    const v = toBase(t.kind === 'expense' ? fin.realCost(t) : Number(t.amount) || 0, cur, data);
    if (v === null) continue;
    if (t.kind === 'income') income += v;
    else if (t.kind === 'expense') expense += v;
  }
  return { income, expense };
}

// Average monthly spending over the previous 3 months (months with any expense).
// Falls back to the current month so brand-new users still get a number.
export function avgMonthlyExpenses(data, todayStr) {
  const months = prevMonthKeys(todayStr, 3).map((ym) => monthFlows(data, ym).expense).filter((e) => e > 0);
  if (months.length) return { avg: months.reduce((a, b) => a + b, 0) / months.length, monthsWithData: months.length };
  const current = monthFlows(data, todayStr.slice(0, 7)).expense;
  return { avg: current, monthsWithData: current > 0 ? 1 : 0 };
}

// Money you could actually grab quickly: non-credit, non-locked, everyday types.
export function liquidTotal(data, todayStr) {
  return data.accounts.reduce((sum, a) => {
    if (fin.isCredit(a) || fin.isLocked(a, data.settings, todayStr)) return sum;
    if (!['bank', 'cash', 'savings', 'other'].includes(a.type)) return sum;
    const v = toBase(Number(a.balance) || 0, a.currency, data);
    return sum + (v ?? 0);
  }, 0);
}

// Cash sitting in 0%-interest homes (checking + wallet).
export function idleCashTotal(data) {
  return data.accounts.reduce((sum, a) => {
    if (a.type !== 'bank' && a.type !== 'cash') return sum;
    const v = toBase(Number(a.balance) || 0, a.currency, data);
    return sum + (v ?? 0);
  }, 0);
}

// Combined utilization across every card that has a limit, in base currency.
export function overallUtilization(data) {
  let owed = 0;
  let limit = 0;
  for (const a of data.accounts) {
    if (!fin.isCredit(a) || !(Number(a.creditLimit) > 0)) continue;
    owed += toBase(Math.max(0, Number(a.balance) || 0), a.currency, data) ?? 0;
    limit += toBase(Number(a.creditLimit), a.currency, data) ?? 0;
  }
  if (limit <= 0) return null;
  return { owed, limit, pct: Math.round((owed / limit) * 100) };
}

// Recurring EXPENSES normalized to a monthly figure, in base currency.
export function monthlyRecurringExpense(data) {
  const factor = { weekly: 52 / 12, monthly: 1, yearly: 1 / 12 };
  let total = 0;
  let count = 0;
  for (const r of data.recurring) {
    if (r.kind !== 'expense') continue;
    const acct = fin.accountById(data, r.accountId);
    const v = toBase(fin.realCost(r), acct?.currency || data.settings.baseCurrency, data); // your share
    if (v === null) continue;
    total += v * (factor[r.cadence] ?? 1);
    count += 1;
  }
  return { total, count };
}

// Net-worth movement: newest snapshot vs the closest one ≥30 days older
// (or the oldest available). Needs ≥2 snapshots spanning ≥14 days.
export function netWorthTrend(data, todayStr) {
  const snaps = [...data.snapshots].sort((a, b) => a.date.localeCompare(b.date));
  if (snaps.length < 2) return null;
  const latest = snaps[snaps.length - 1];
  const anchor = [...snaps].reverse().find((s) => fin.daysUntil(latest.date, s.date) >= 30) || snaps[0];
  const days = fin.daysUntil(latest.date, anchor.date);
  if (days < 14) return null;
  const delta = latest.totalInBase - anchor.totalInBase;
  const pct = anchor.totalInBase !== 0 ? (delta / Math.abs(anchor.totalInBase)) * 100 : 0;
  return { delta, pct, days };
}

// ---------- the rule catalog ----------

export function buildInsights(data, todayStr, fmtBase) {
  const out = [];
  const push = (id, severity, emoji, title, message, blurb) => out.push({ id, severity, emoji, title, message, blurb });
  const ym = todayStr.slice(0, 7);
  const hasAccounts = data.accounts.length > 0;
  if (!hasAccounts) return out;

  const spend = fin.spendByCategory(data, ym);
  const flows = monthFlows(data, ym);
  const { avg: E } = avgMonthlyExpenses(data, todayStr);
  const L = liquidTotal(data, todayStr);
  const dayOfMonth = Number(todayStr.slice(8, 10));
  const daysInMonth = new Date(Number(todayStr.slice(0, 4)), Number(todayStr.slice(5, 7)), 0).getDate();

  // 1. emergency fund
  if (E > 0) {
    const M = L / E;
    const msg = `Your cushion covers ≈ ${M.toFixed(1)} months of typical spending (${fmtBase(L)} liquid vs ${fmtBase(E)}/month).`;
    const blurb =
      'A common guideline is keeping 3–6 months of expenses in easy-to-reach money for surprises — job hiccups, car trouble, dental drama. Locked CDs and retirement accounts don\'t count here, because you can\'t grab them quickly.';
    if (M < 1) push('emergency-fund', 'warn', '🛟', 'Emergency cushion is thin', msg, blurb);
    else if (M < 3) push('emergency-fund', 'info', '🛟', 'Emergency cushion is growing', msg, blurb);
    else push('emergency-fund', 'win', '🛋️', 'Comfy emergency cushion', `${msg} That clears the 3-month guideline!`, blurb);
  }

  // 2. per-card utilization
  for (const a of data.accounts) {
    const u = fin.utilization(a);
    if (u && u.pct > 30) {
      push(
        `card-utilization-${a.id}`, 'warn', '💳', `${a.name} utilization is high`,
        `${a.name} is at ${u.pct}% of its limit${u.over ? ' — over the limit!' : ''}.`,
        'Using more than ~30% of a card\'s limit can nudge your credit score down, even if you pay on time. Getting below 30% (and ideally under 10%) helps.'
      );
    }
  }

  // 3. overall utilization
  const o = overallUtilization(data);
  if (o) {
    const blurb = 'Credit utilization — how much of your available credit you\'re using — is one of the biggest ingredients in a credit score.';
    if (o.pct > 30) push('overall-utilization', 'warn', '📊', 'Overall credit use is high', `Across all cards you're using ${o.pct}% of your available credit (${fmtBase(o.owed)} of ${fmtBase(o.limit)}).`, blurb);
    else push('overall-utilization', 'win', '📊', 'Credit use is under control', `All cards together sit at ${o.pct}% of your available credit — nicely under the 30% guideline ✨`, blurb);
  }

  // 4. budgets
  const budgetCats = Object.keys(data.budgets).filter((c) => Number(data.budgets[c]) > 0);
  let anyOver = false;
  for (const cat of budgetCats) {
    const limit = Number(data.budgets[cat]);
    const spent = spend[cat] || 0;
    const emoji = data.categories.find((c) => c.name === cat)?.emoji || '💸';
    if (spent > limit) {
      anyOver = true;
      push(`budget-over-${cat}`, 'warn', emoji, `${cat} is over budget`,
        `${cat} is at ${fmtBase(spent)} of its ${fmtBase(limit)} budget (${Math.round((spent / limit) * 100)}%).`,
        'Going over one month isn\'t a disaster — the trick is noticing early and adjusting either the spending or the budget to something realistic.');
    } else if (spent >= 0.8 * limit) {
      push(`budget-near-${cat}`, 'info', emoji, `${cat} is nearing its budget`,
        `${cat} is at ${Math.round((spent / limit) * 100)}% of its budget with ${daysInMonth - dayOfMonth} days of the month to go.`,
        'An 80% heads-up beats a 105% surprise — small course-corrections are painless.');
    }
  }
  if (budgetCats.length && !anyOver && dayOfMonth >= 15) {
    push('budgets-all-good', 'win', '🌱', 'Budgets in the green',
      'Every budget is still in the green this month 🌱',
      'Budgets work best as guardrails, not punishments — boring months are the quiet wins.');
  }
  if (!budgetCats.length && data.transactions.some((t) => t.kind === 'expense')) {
    push('no-budgets', 'info', '🎯', 'No budgets set yet',
      "You're logging spending but haven't set any budgets yet.",
      'A budget is just a plan for your money. One popular starting point is 50/30/20: about 50% of income to needs, 30% to wants, 20% to saving or paying down debt.');
  }

  // 5. savings rate (this month)
  if (flows.income > 0) {
    const r = (flows.income - flows.expense) / flows.income;
    const kept = flows.income - flows.expense;
    const blurb = 'The 50/30/20 rule of thumb suggests steering ~20% of income toward savings or extra debt payments. One red month is data, not doom.';
    if (r < 0) push('savings-rate', 'warn', '📉', 'Spent more than you earned', `This month's spending (${fmtBase(flows.expense)}) is more than your income (${fmtBase(flows.income)}).`, blurb);
    else if (r < 0.2) push('savings-rate', 'info', '💾', 'Savings rate below 20%', `This month you kept ${(r * 100).toFixed(0)}% of your income (${fmtBase(kept)} of ${fmtBase(flows.income)}).`, blurb);
    else push('savings-rate', 'win', '💾', 'Healthy savings rate', `This month you kept ${(r * 100).toFixed(0)}% of your income (${fmtBase(kept)} of ${fmtBase(flows.income)}) — at or above the 20% guideline 🎉`, blurb);
  }

  // 6. idle cash
  const idle = idleCashTotal(data);
  const idleThreshold = E > 0 ? 3 * E : 5000;
  if (idle > idleThreshold) {
    const hysa = data.accounts.find((a) => a.type === 'savings' && Number(a.interestRate) > 0);
    const blurb = 'Money beyond your monthly float can work for you: high-yield savings accounts (HYSAs) pay interest while staying withdrawable. This is a general concept to know about, not a product pitch.';
    if (hysa) {
      push('idle-cash', 'info', '😴', 'Cash snoozing at 0%',
        `≈ ${fmtBase(idle)} sits in checking/cash earning nothing, while ${hysa.name} earns ${hysa.interestRate}%.`, blurb);
    } else {
      push('idle-cash', 'info', '😴', 'Cash snoozing at 0%',
        `You have ≈ ${fmtBase(idle)} in accounts earning no interest.`, blurb);
    }
  }

  // 7. CDs maturing
  for (const a of data.accounts) {
    const d = fin.cdDaysToMaturity(a, todayStr);
    if (d === null) continue;
    if (d > 0 && d <= 30) {
      push(`cd-maturing-${a.id}`, 'info', '⏳', `${a.name} matures soon`,
        `${a.name} matures on ${a.maturityDate} — ${d} day${d === 1 ? '' : 's'} away. Time to plan: reinvest, ladder, or spend?`,
        'CDs often auto-renew at whatever rate the bank feels like if you do nothing. The maturity window is your decision moment.');
    } else if (d <= 0) {
      push(`cd-matured-${a.id}`, 'info', '🔓', `${a.name} has matured`,
        `${a.name} already matured (${a.maturityDate}) — it may be earning little now.`,
        'After maturity, CD money often idles or auto-renews. Deciding on purpose beats the default.');
    }
  }

  // 8. cards carrying a balance
  for (const a of data.accounts) {
    if (!fin.isCredit(a) || !(Number(a.balance) > 0.005)) continue;
    const owedBase = toBase(Number(a.balance), a.currency, data);
    if (owedBase === null) continue;
    push(`card-carrying-${a.id}`, 'info', '🔥', `${a.name} carries a balance`,
      `${a.name} carries ${fmtBase(owedBase)}. At a typical ~24% APR that's ≈ ${fmtBase(owedBase * 0.24)}/year in interest if it sticks around.`,
      'Card interest compounds against you. Paying the full statement balance each month makes a credit card effectively free to use.');
  }

  // 9. subscriptions total
  const rec = monthlyRecurringExpense(data);
  if (rec.count > 0) {
    push('subscriptions-total', 'info', '🔁', 'Recurring spending adds up',
      `Your ${rec.count} recurring expense${rec.count === 1 ? '' : 's'} total ≈ ${fmtBase(rec.total)}/month (${fmtBase(rec.total * 12)}/year).`,
      'Subscriptions are silent nibblers. A yearly "do I still use this?" audit is one of the easiest wins in personal finance.');
  }

  // 9b. money friends still owe you
  const owed = fin.owedTotal(data);
  if (owed > 0.005) {
    const n = data.transactions.filter((t) => fin.owedOn(data, t) > 0.005).length;
    push('reimbursements-owed', 'info', '🤝', 'People owe you money',
      `${fmtBase(owed)} is still owed to you across ${n} split expense${n === 1 ? '' : 's'}.`,
      "Money you front for others is easy to forget — and it isn't counted in your net worth until it actually lands. A gentle nudge beats quietly gifting it away.");
  }

  // 10. net-worth trend / snapshot nudge
  const t = netWorthTrend(data, todayStr);
  if (t) {
    const up = t.delta > 0;
    push('networth-trend', up ? 'win' : 'info', up ? '📈' : '📉', `Net worth ${up ? 'up' : 'down'}`,
      `Net worth is ${up ? 'up' : 'down'} ${fmtBase(Math.abs(t.delta))} (${Math.abs(t.pct).toFixed(1)}%) over the last ${t.days} days.`,
      'Direction over months matters more than any single day. Down stretches happen (markets, planned big purchases) — the tracking habit itself is the win.');
  } else if (data.snapshots.length < 2) {
    push('snapshots-sparse', 'info', '📸', 'Trend needs more snapshots',
      'Take a 📸 Snapshot now and then — with two or more, your net-worth trend insight unlocks.',
      "You can't see a trend with one dot.");
  }

  // 11. goals cheer
  const funded = data.goals.filter((g) => Number(g.targetAmount) > 0 && g.saved / g.targetAmount >= 0.5);
  if (funded.length) {
    const done = funded.filter((g) => g.saved / g.targetAmount >= 1);
    push('goals-cheer', 'win', '🎉', done.length ? 'Goal fully funded!' : 'Goals past halfway',
      done.length
        ? `${done.map((g) => g.name).join(', ')} — fully funded! 🎉`
        : `${funded.length} goal${funded.length === 1 ? '' : 's'} past the halfway mark: ${funded.map((g) => g.name).join(', ')} 🎉`,
      'Named goals beat vague saving — your brain likes finish lines.');
  }

  // 12. retirement presence
  if (data.accounts.some((a) => a.type === 'retirement')) {
    push('retirement-check', 'win', '🧓', 'Retirement money is growing',
      "You've got retirement savings tracked — future-you says thanks ✨",
      'Compound growth rewards early starts: money invested for decades multiplies many times over.');
  } else {
    push('retirement-check', 'info', '🧓', 'No retirement account tracked',
      'No retirement account here yet — if you have one elsewhere, add it to see the full picture.',
      'Compound growth rewards early starts: small regular amounts early beat large amounts late. Employer matches, where offered, are free money.');
  }

  // 13. stale reconciles (one aggregate card)
  const staleNames = data.accounts
    .filter((a) => {
      const hasTx = data.transactions.some((tx) => tx.accountId === a.id || tx.toAccountId === a.id);
      if (!hasTx) return false;
      if (!a.reconciledAt) return true;
      return fin.daysUntil(todayStr, a.reconciledAt.slice(0, 10)) > 30;
    })
    .map((a) => a.name);
  if (staleNames.length) {
    push('reconcile-stale', 'info', '🧾', 'Time for a reality check',
      `${staleNames.length} account${staleNames.length === 1 ? " hasn't" : "s haven't"} been reconciled in a while: ${staleNames.join(', ')}.`,
      'Tracking only helps when it matches reality. A two-minute Reconcile ▸ catches forgotten expenses and typos.');
  }

  const order = { warn: 0, info: 1, win: 2 };
  return out.sort((a, b) => order[a.severity] - order[b.severity]);
}

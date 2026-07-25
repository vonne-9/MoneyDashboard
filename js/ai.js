// ai.js — optional AI deep-dive over any OpenAI-compatible chat-completions API.
// The user brings their own key (stored only in their browser); requests go
// straight from the browser to the provider — no middleman server.
import { toBase } from './fx.js';
import * as fin from './finance.js';
import * as insights from './insights.js';

export const AI_PRESETS = [
  {
    id: 'gemini', label: 'Google Gemini (free tier)',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', model: 'gemini-3.6-flash',
    keyHint: 'Free key at aistudio.google.com/apikey — generous free tier, no card needed.',
  },
  {
    id: 'openrouter', label: 'OpenRouter (many cheap models)',
    baseUrl: 'https://openrouter.ai/api/v1', model: 'google/gemini-3.6-flash',
    keyHint: 'Key at openrouter.ai/keys — one key, lots of models, some free.',
  },
  {
    id: 'groq', label: 'Groq (fast, free tier)',
    baseUrl: 'https://api.groq.com/openai/v1', model: 'llama-3.3-70b-versatile',
    keyHint: 'Key at console.groq.com — speedy open models, free tier.',
  },
  {
    id: 'openai', label: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini',
    keyHint: 'Key at platform.openai.com — mini models are the cheap ones.',
  },
  {
    id: 'ollama', label: 'Ollama (on this computer)',
    baseUrl: 'http://localhost:11434/v1', model: 'llama3.2',
    keyHint: 'No key needed — fully private, but only works when the dashboard runs locally (not on the hosted page).',
  },
  { id: 'custom', label: 'Custom…', baseUrl: '', model: '', keyHint: 'Any OpenAI-compatible /chat/completions endpoint.' },
];

// ---------- payload: full-detail export (user's explicit choice), compact & bounded ----------
export function buildPayload(data, todayStr) {
  const base = data.settings.baseCurrency;
  const inBase = (amount, cur) => {
    const v = toBase(Number(amount) || 0, cur, data);
    return v === null ? null : Number(v.toFixed(2));
  };
  const name = (id) => fin.accountById(data, id)?.name || null;

  const totals = fin.totals(data);
  const ym = todayStr.slice(0, 7);
  const flows = insights.monthFlows(data, ym);
  const rec = insights.monthlyRecurringExpense(data);
  const util = insights.overallUtilization(data);

  // transactions: last 180 days, newest first, hard cap 300 rows
  const cutoffDate = new Date(todayStr + 'T00:00:00');
  cutoffDate.setDate(cutoffDate.getDate() - 180);
  const cutoff = fin.toLocalYMD(cutoffDate);
  const recent = data.transactions
    .filter((t) => t.date >= cutoff)
    .sort((a, b) => b.date.localeCompare(a.date));
  const txs = recent.slice(0, 300).map((t) => ({
    date: t.date, kind: t.kind, amount: t.amount,
    currency: fin.accountById(data, t.accountId)?.currency || base,
    category: t.category || undefined, note: t.note || undefined,
    account: name(t.accountId), to: t.toAccountId ? name(t.toAccountId) : undefined,
  }));

  return {
    meta: {
      exportedAt: todayStr, baseCurrency: base,
      note: 'Full-detail export by user choice. Amounts also given in base currency where convertible.',
      ...(recent.length > 300 ? { transactionsNote: `showing most recent 300 of ${recent.length} (last 6 months)` } : {}),
    },
    summary: {
      netWorth: Number(totals.net.toFixed(2)), totalHave: Number(totals.have.toFixed(2)), totalOwe: Number(totals.owe.toFixed(2)),
      lockedTotal: Number(fin.lockedTotal(data, todayStr).toFixed(2)),
      avgMonthlyExpenses: Number(insights.avgMonthlyExpenses(data, todayStr).avg.toFixed(2)),
      thisMonth: { income: Number(flows.income.toFixed(2)), expense: Number(flows.expense.toFixed(2)) },
      liquidTotal: Number(insights.liquidTotal(data, todayStr).toFixed(2)),
      overallCreditUtilizationPct: util ? util.pct : null,
      recurringMonthlyExpense: Number(rec.total.toFixed(2)),
      interestEarnedPerYear: Number(fin.totalAnnualInterest(data).toFixed(2)),
    },
    accounts: data.accounts.map((a) => ({
      name: a.name, type: a.type, currency: a.currency, balance: a.balance, balanceInBase: inBase(a.balance, a.currency),
      ...(a.creditLimit != null && a.creditLimit > 0 ? { creditLimit: a.creditLimit } : {}),
      ...(a.interestRate ? { interestRatePctAPY: a.interestRate } : {}),
      ...(a.maturityDate ? { maturityDate: a.maturityDate } : {}),
      ...(a.unlockAge ? { unlockAge: a.unlockAge } : {}),
      ...(a.costBasis ? { costBasis: a.costBasis } : {}),
      ...(a.reconciledAt ? { lastReconciled: a.reconciledAt.slice(0, 10) } : {}),
    })),
    budgets: data.budgets,
    goals: data.goals.map((g) => ({ name: g.name, targetAmount: g.targetAmount, saved: g.saved, currency: g.currency, fundedFrom: name(g.accountId) })),
    recurring: data.recurring.map((r) => ({
      name: r.name, kind: r.kind, amount: r.amount,
      currency: fin.accountById(data, r.accountId)?.currency || base,
      cadence: r.cadence, nextDate: r.nextDate, category: r.category || undefined,
    })),
    snapshots: data.snapshots.slice(-12).map((s) => ({ date: s.date, totalInBase: Number((s.totalInBase || 0).toFixed(2)) })),
    transactions: txs,
  };
}

const SYSTEM_PROMPT = `You are a friendly financial-literacy educator inside a cute personal money dashboard. You are NOT a licensed financial advisor and must not give individualized investment advice; offer educational observations and general best practices only. Be specific to the user's actual numbers (quote them, with the base currency). Keep a warm, playful tone with a few emoji — the app's vibe is cheerful, never judgmental. Respond in markdown with exactly these sections: "## 💪 Strengths", "## 👀 Watch-outs", "## 🐾 Suggested next steps" (3–6 concrete, small, educational steps). Use only headings, bold, and bullet or numbered lists — no tables, no links, no code blocks. End with one line: "_This is educational info, not financial advice._" Keep it under ~450 words.`;

export function buildMessages(data, todayStr) {
  return [
    { role: 'system', content: SYSTEM_PROMPT },
    {
      role: 'user',
      content: `Here is my complete money data as JSON (I chose to share full detail). Today is ${todayStr}.\n\n${JSON.stringify(buildPayload(data, todayStr))}`,
    },
  ];
}

// ---------- the call ----------
export async function analyze(aiSettings, messages) {
  const url = (aiSettings.baseUrl || '').replace(/\/+$/, '') + '/chat/completions';
  let host = 'the provider';
  try { host = new URL(url).host; } catch { /* fall through to fetch error */ }

  const headers = { 'Content-Type': 'application/json' };
  if (aiSettings.apiKey) headers.Authorization = `Bearer ${aiSettings.apiKey}`;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 60000);
  try {
    const res = await fetch(url, {
      method: 'POST', headers, signal: ctrl.signal,
      body: JSON.stringify({ model: aiSettings.model, messages, temperature: 0.4 }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) return { ok: false, error: 'The API key was rejected 🔑 — double-check it in ⚙️ Settings.' };
      if (res.status === 404) return { ok: false, error: 'Nothing answered at that address — check the base URL and model name in ⚙️ Settings.' };
      if (res.status === 429) return { ok: false, error: 'The provider says slow down 🐢 — free tiers need a breather; try again in a minute.' };
      if (res.status === 400 || res.status === 422) {
        const detail = (body?.error?.message || '').slice(0, 140);
        return { ok: false, error: `The provider complained: ${detail || 'bad request'} — check the model name in ⚙️ Settings.` };
      }
      return { ok: false, error: `${host} is having a moment (HTTP ${res.status}) — try again shortly.` };
    }
    const text = body?.choices?.[0]?.message?.content;
    if (!text) return { ok: false, error: "Got a reply I couldn't read — try again, or try a different model." };
    return { ok: true, text };
  } catch (e) {
    if (e.name === 'AbortError') return { ok: false, error: 'That took too long ⏳ — gave up after 60s. Try again or pick a snappier model.' };
    return { ok: false, error: `Couldn't reach ${host} 📡 — check your internet, or this provider may not allow browser calls (CORS).` };
  } finally {
    clearTimeout(timer);
  }
}

// ---------- tiny safe markdown renderer (escape-first; for x-html) ----------
export function renderMarkdownLite(md) {
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const inline = (s) =>
    s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|\s)_([^_]+)_(?=\s|[.,!?)]|$)/g, '$1<em>$2</em>')
      .replace(/(^|\s)\*([^*]+)\*(?=\s|[.,!?)]|$)/g, '$1<em>$2</em>');

  const lines = esc(md).split('\n');
  const out = [];
  let list = null; // 'ul' | 'ol' | null
  const closeList = () => { if (list) { out.push(`</${list}>`); list = null; } };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) { closeList(); continue; }
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) { closeList(); out.push(`<${h[1].length <= 2 ? 'h3' : 'h4'}>${inline(h[2])}</${h[1].length <= 2 ? 'h3' : 'h4'}>`); continue; }
    const ul = line.match(/^[-*]\s+(.*)$/);
    if (ul) { if (list !== 'ul') { closeList(); out.push('<ul>'); list = 'ul'; } out.push(`<li>${inline(ul[1])}</li>`); continue; }
    const ol = line.match(/^\d+[.)]\s+(.*)$/);
    if (ol) { if (list !== 'ol') { closeList(); out.push('<ol>'); list = 'ol'; } out.push(`<li>${inline(ol[1])}</li>`); continue; }
    closeList();
    out.push(`<p>${inline(line)}</p>`);
  }
  closeList();
  return out.join('\n');
}

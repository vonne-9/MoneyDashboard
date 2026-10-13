# My Money 💰 — a cute personal money dashboard

A private, local dashboard for tracking how much you have across bank accounts and cash.
No logins, no fees, no cloud — everything is saved right in your own browser on this Mac.

## Run it

**Easiest:** double-click **`start.command`**. It launches a small local server and opens
the dashboard in your browser. Leave that little terminal window open while you use it; close
it (or press Ctrl+C) when you're done.

**Or from a terminal:**

```bash
cd path/to/MoneyDashboard
python3 -m http.server 8777
# then open http://localhost:8777
```

> A local server is used (instead of just opening the file) so live exchange rates load correctly.

**Or use the hosted copy:** https://vonne-9.github.io/MoneyDashboard/ works on any device (phone
included). Note each browser keeps its **own** separate data — move data between devices with
💾 Backup / 📥 Restore.

## Getting around

A **side menu** (left on desktop, a ☰ drawer on mobile) switches between four pages:

- **🏠 Overview** — net worth, a **per-type totals strip** (how much sits in banks, savings, CDs, …),
  your accounts & cards (**tap any account to see all its transactions**; reorder tiles with the
  **◀ ▶** buttons that appear on hover, or **↩️ Reset order** to group them by type), and the
  net-worth trend chart.
- **💸 Spending** — log expenses/income/transfers, monthly budgets, upcoming recurring items, recent
  activity, and Excel export:
  - **📊 Export Excel** — downloads a real `.xlsx` workbook of your expenses, with an **All expenses**
    sheet plus **one tab per month**. Each sheet has a **styled header** (bold, coloured), a **TOTAL**
    row for that tab's spending, and a **Budget vs actual** table per category (Budget, Spent,
    Difference, and an **OK / OVER** status). The tables are styled for readability: **zebra-striped**
    rows, and the **Difference** column is green when under budget / red when over.
- **🎯 Goals** — your savings goals.
- **💡 Insights** — financial-literacy health checks computed from your own numbers, plus an
  optional AI deep-dive.

Settings, Backup, and Restore live at the bottom of the menu.

## What it does

**Accounts & net worth (Phase 1)**
- **Add accounts, cash & credit cards** — name, type, an emoji, currency, and balance.
- **Net worth** — shown as **what you have − what you owe**, converted into your base currency.
- **Multi-currency** — each account can be in a different currency. Live exchange rates are
  fetched automatically and cached; if you're offline, it uses the last saved rates, and you can
  always set your own **manual rates** in Settings. (Only currency codes are ever sent online —
  never your balances.)
- **Net worth over time** — press **📸 Snapshot** now and then to build a trend chart.
- **Backup & restore** — **💾 Backup** downloads all your data as a JSON file; **📥 Restore**
  loads it back. Do this occasionally so you never lose anything.

**Spending, credit cards & reconciling (Phase 2)**
- **Guided logging** — the form asks one thing at a time: **which account → how much → what for**,
  each answer unlocking the next (the cursor jumps along for you). Name it and the **category fills
  itself in** — it recognises common places (ramen, uber, rent, pharmacy…) and, better, **learns from
  your own history**: file "Thai Spoon" under Groceries once and it stays Groceries. The guess is
  marked **AUTO**; pick a category yourself and it stops guessing for that entry. The date defaults to
  today, and nothing is locked — every field stays editable before you save. Works for expenses,
  income and transfers; **editing** an entry opens with everything unlocked at once.
- **Credit cards done right** — a card is a **debt** account. Charging it **raises what you owe
  and does NOT touch your bank**. Your net worth drops right away, but the bank only moves when
  you **Pay bill** (a transfer from a bank account that lowers both the bank and the card). Cards
  can track a **credit limit** with an availability/utilization bar.
- **Categories & monthly budgets** — tag spending, set monthly limits per category (in **🎯 Budgets**),
  and watch the bars fill — they flag when you go **over**.
- **Find anything** — the Recent activity list has a **🔍 search box** (matches notes, categories,
  account names, amounts and dates) plus **account** and **category** dropdowns. Filters combine, and
  a line shows how many entries match and what they total. **Show more** loads older entries.
  Tapping an account on the Overview page lands you here, already filtered to it.
- **Running balance** — like a bank statement, each entry shows the account's balance right after it,
  in small grey text under the amount (cards show what you *owed* at that point). Filter to one
  account to read its history top-to-bottom; transfers show whichever account you're looking at.
- **Split expenses 🤝** — when you cover a bill for others, tick **Split with others** and enter
  **your share** (or tap ÷2 ÷3 ÷4 for an even split). The **full amount** still leaves the account,
  but **only your share counts toward budgets** — so a $100 dinner where $40 is yours charges the card
  $100 and adds $40 to Food. The rest shows as **owed to you**, with a **⭐ Mark received** button that
  logs the money into whichever account it lands in (it never counts as income — it's your money
  returning). Works on **recurring items** too, so split rent repeats every month automatically.
  The Overview shows a **🤝 Owed to you** pill; that money isn't counted in net worth until it arrives.
- **Your own categories** — **🏷️ Categories** (on the Spending page) lets you add new categories
  (name + emoji), rename them (all logged history, recurring items, and budgets follow along), or
  delete them (logged items move to "Other"). Income and Adjustment are built-in and stay put.
- **Reconcile / verify** — each account keeps a running balance from what you log. Now and then hit
  **Reconcile ▸**, type in the *real* balance from your bank/card app, and it flags & logs any
  difference so you catch anything you forgot to record.

**Goals & recurring (Phase 3)**
- **Savings goals** — cute goal cards (e.g. "Vacation $2,000") with fill-up progress bars. A goal is
  **funded from an account**: adding to it *reserves* part of that account's balance, so the tile shows
  how much is **reserved** vs still **free**. It never moves money or changes your net worth — it just
  earmarks what you already have.
- **Recurring items** — mark salary, rent, subscriptions, etc. with a cadence (weekly/monthly/yearly).
  The **Upcoming 🔔** panel shows what's due ("due today", "in 3 days", "overdue"). One tap on **Log ✓**
  records the real transaction and rolls it to the next date — you stay in control, nothing posts silently.

**Savings, CDs, investments & retirement**
- **Savings** 🐷 — set an **APY** and the tile shows ≈ interest earned per year.
- **CD** ⏳ — APY plus a **maturity date**: the tile counts down ("matures in 180d"), shows the
  **≈ projected payout at maturity**, and the money is treated as **🔒 locked** until then.
- **Investment** 📈 — update the value like any balance; optionally record what you **contributed**
  (cost basis) to see your **gain/loss** in green/red ($ and %).
- **Retirement** 🧓 — locked until an **unlock age** (default 59½). Set your **birth date** in
  ⚙️ Settings (stays on your device) and the tile counts down to the exact unlock date.
- **Locked money** still counts in your net worth (it's yours!) but shows in a **🔒 Locked** pill on
  the Overview, can't fund savings goals, and spending/transferring out of a locked account asks
  for confirmation first (early withdrawals usually mean penalties).
- The Overview also totals **✨ ≈ interest you're earning per year** across savings & CDs. Interest
  isn't auto-posted — when the bank actually credits it, **Reconcile ▸** picks it up honestly.

**Insights & AI 💡**
- **Rules engine (always on, offline, private):** cute cards computed locally from your data —
  emergency-fund coverage, credit utilization vs the 30% guideline, budget overruns, savings rate
  (50/30/20), idle cash at 0%, CDs about to mature, cards carrying a balance (interest cost),
  subscription totals, net-worth trend, goal cheers, retirement check, stale reconciles. Each card
  has a "Why this matters 🎓" explainer. **Educational observations, not financial advice.**
- **AI deep-dive (optional):** the **🤖 Analyze with AI** button sends your full data from your
  browser straight to an AI provider *you* configure and returns strengths / watch-outs / suggested
  next steps. Works with any OpenAI-compatible API — presets included:
  - **Google Gemini** (recommended: free tier, ~1,500 requests/day, no card) — get a key at
    **aistudio.google.com/apikey**, then ⚙️ Settings → AI insights → paste it. Done.
  - OpenRouter, Groq, OpenAI, or **Ollama** running on your own computer (fully private; local runs only).
  - Your key is stored only in this browser (and inside your JSON backups). Nothing is sent anywhere
    until you click the button.

## Your data & backups

Your data lives in this browser's `localStorage` for this site. That means:

- Saving is **automatic** — every change is written immediately, no save button.
- It stays on this computer and is not sent anywhere.
- **Clearing your browser data / site data will erase it** — so use **💾 Backup** regularly and
  keep the JSON file somewhere safe.
- The app shows a gentle **"your last backup was N days ago"** reminder at the top once it's been a
  week (or if you've never backed up), with a one-click **Back up now** or **Later** (snoozes 3 days).


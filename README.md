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

## Getting around

A **side menu** (left on desktop, a ☰ drawer on mobile) switches between three pages:

- **🏠 Overview** — net worth, your accounts & cards, and the net-worth trend chart.
- **💸 Spending** — log expenses/income/transfers, monthly budgets, upcoming recurring items, recent
  activity, and Excel export:
  - **📊 Export Excel** — downloads a real `.xlsx` workbook of your expenses, with an **All expenses**
    sheet plus **one tab per month**. Each sheet has a **styled header** (bold, coloured), a **TOTAL**
    row for that tab's spending, and a **Budget vs actual** table per category (Budget, Spent,
    Difference, and an **OK / OVER** status). The tables are styled for readability: **zebra-striped**
    rows, and the **Difference** column is green when under budget / red when over.
- **🎯 Goals** — your savings goals.

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
- **Log spending** — record expenses, income, and transfers, each from a chosen account.
- **Credit cards done right** — a card is a **debt** account. Charging it **raises what you owe
  and does NOT touch your bank**. Your net worth drops right away, but the bank only moves when
  you **Pay bill** (a transfer from a bank account that lowers both the bank and the card). Cards
  can track a **credit limit** with an availability/utilization bar.
- **Categories & monthly budgets** — tag spending, set monthly limits per category (in **🎯 Budgets**),
  and watch the bars fill — they flag when you go **over**.
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

## Your data & backups

Your data lives in this browser's `localStorage` for this site. That means:

- Saving is **automatic** — every change is written immediately, no save button.
- It stays on this computer and is not sent anywhere.
- **Clearing your browser data / site data will erase it** — so use **💾 Backup** regularly and
  keep the JSON file somewhere safe.
- The app shows a gentle **"your last backup was N days ago"** reminder at the top once it's been a
  week (or if you've never backed up), with a one-click **Back up now** or **Later** (snoozes 3 days).


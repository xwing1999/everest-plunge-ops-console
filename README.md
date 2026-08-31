# Everest Plunge Ops Console

The actual web app your team opens — not Retool. Built specifically so
"log a sold deal" and "mark an order sent" exist as a real, usable tool
today without spending Retool AI credits scaffolding it. Retool remains an
option later for something more polished; it would call the same backend
API this app already uses.

## What it is

A small Express app with two pages, both plain HTML/CSS/JS — no build
step, no framework:

- **`/ops`** (Operations login) — log a sold deal, see recent orders, mark
  an order sent (courier + tracking + date), view current stock.
- **`/sales`** (Sales rep login) — read-only: check stock availability
  before quoting a deal, view current stock. Cannot log deals or mark
  orders sent — that route is rejected server-side even if guessed.

This app holds **no Google or Xero credentials itself**. It only talks to
`everest-plunge-stock-sheet-agent`'s API, which is the one thing that
actually touches the spreadsheet. Deploy the stock sheet agent first.

## Auth

Plain HTTP Basic Auth, two credential pairs (`OPS_USERNAME`/`OPS_PASSWORD`
and `SALES_USERNAME`/`SALES_PASSWORD`), no session system. Appropriate for
a small internal team — not built for anything customer-facing or at real
scale. The ops login can do everything the sales login can; the reverse
isn't true.

## Setup checklist

1. Deploy `everest-plunge-stock-sheet-agent` first (see its own README) —
   this app is useless without it.
2. Fill in `STOCK_SHEET_AGENT_URL`/`STOCK_SHEET_AGENT_API_KEY` pointing at
   that deployed service.
3. Pick real values for `OPS_USERNAME`/`OPS_PASSWORD` and
   `SALES_USERNAME`/`SALES_PASSWORD` — don't leave any blank, an unset
   password is treated as "this role is disabled", not "no password
   required" (checked explicitly in the code).
4. Deploy, visit `/ops` and `/sales`, confirm both prompt for login and
   show real stock data once you're in.

## Known limits — this is "good enough to get moving", not a finished product

- No real user management — two shared logins, not per-person accounts. If
  someone leaves, rotate the shared password.
- "Log a Sold Deal" writes into the stock sheet agent's self-owned
  Automation Log tab, NOT the real batch tabs — see that agent's README
  for why. This console will need a small update once the real batch tab
  layout is confirmed and that decision gets made.
- The stock availability check shown when logging a deal is informational
  only — it doesn't block logging an oversold deal, it just flags it.
- HTTPS is provided by Railway automatically (all Railway URLs are HTTPS),
  which matters here since Basic Auth credentials are sent on every
  request — never expose this over plain HTTP.

## Deployment

Same pattern as every other agent: own GitHub repo, Railway service in the
Everest Plunge Railway project, env vars pasted into Railway's Variables
tab. No persistent volume needed — this app has no state of its own.

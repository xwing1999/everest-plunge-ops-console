# Everest Plunge Ops Console

The actual web app your team opens — not Retool. Built specifically so
"log a sold deal" and "mark an order sent" exist as a real, usable tool
today without spending Retool AI credits scaffolding it. Retool remains an
option later for something more polished; it would call the same backend
API this app already uses.

## What it is

A small Express app with two pages, both plain HTML/CSS/JS — no build
step, no framework:

- **`/ops`** (Operations login) — log a sold deal (with allocation:
  On Shore / On Water / Next Custom Order), mark a batch as arrived, set a
  batch's container ETA (drives automatic final invoicing — see below),
  work the products-to-order shopping list, send/track final-payment
  invoices, mark orders sent, view current stock.
- **`/sales`** (Sales rep login) — read-only: check stock availability
  before quoting a deal, view current stock. Cannot log deals or mark
  orders sent — that route is rejected server-side even if guessed.

This app holds **no Google or Xero credentials itself**. It talks to
`everest-plunge-stock-sheet-agent`'s API (the one thing that actually
touches the spreadsheet) and, for the "send final invoice" action only,
to `everest-plunge-pipely-xero-agent`'s API. Deploy both of those first.

## The fulfillment sequence, added 2026-08-31

Each order in "Recent Orders" shows one action at a time, following the
real sequence: **waiting on stock** → (once "Batch Arrived" flips it, or
it was On Shore from the start) **send final invoice** → **mark payment
received** → **mark sent**. The last two steps are a real gate, not just
UI — `everest-plunge-stock-sheet-agent` refuses to let an order be marked
sent until its final payment is confirmed paid (or it was paid in full at
checkout, like Shopify orders), enforced server-side.

"Send final invoice" only works for orders with a linked Pipely deal
(shown as blank if there isn't one) — it calls
`everest-plunge-pipely-xero-agent`, which creates the real Xero invoice.

## Batch ETA / countdown (added 2026-09-01)

The "Batch ETA (Countdown)" section on `/ops` sets one container arrival
date per batch/shipment (e.g. "Batch 12") — every order allocated to that
batch shares the same countdown, shown as a read-only column in Recent
Orders (`e['Ship ETA']`, resolved server-side by `everest-plunge-stock-
sheet-agent`, not editable per-row here). Once a batch is within its
lead-time window (`FINAL_INVOICE_LEAD_DAYS` on `everest-plunge-pipely-
xero-agent`, default 7 days), the final 50% invoice for every linked order
on it fires **automatically** — no button click needed, unlike the manual
"Send final invoice" action above. Both paths exist: manual for an order
you want to release early, automatic for the normal case once its
shipment's ETA is set.

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
   that deployed service, and `PIPELY_XERO_AGENT_URL`/`PIPELY_XERO_AGENT_API_KEY`
   for the final-invoice action.
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

import 'dotenv/config';
import express from 'express';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json());

// ---------------------------------------------------------------------------
// This app holds NO Google/Xero credentials of its own — it's a thin UI
// layer that proxies to everest-plunge-stock-sheet-agent's API, which is
// the only thing that actually touches the spreadsheet. Built as a plain
// Express + vanilla HTML/JS app specifically so Xavier doesn't need to
// spend Retool AI credits scaffolding this — Retool remains an option
// later for a more polished dashboard, layered on the same backend API.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// AUTH — plain HTTP Basic Auth, two role tiers. No session/cookie system;
// appropriate for a small internal team, not for anything customer-facing.
// Once a browser is given valid credentials for this origin, it replays
// them automatically on every request (page loads AND fetch() calls), so
// applying the same middleware to both page routes and API routes below
// just works without any extra client-side auth code.
// ---------------------------------------------------------------------------
function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function parseBasicAuth(req) {
  const header = req.header('authorization');
  if (!header || !header.startsWith('Basic ')) return null;
  const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
  const idx = decoded.indexOf(':');
  if (idx === -1) return null;
  return { username: decoded.slice(0, idx), password: decoded.slice(idx + 1) };
}

function getRole(creds) {
  if (!creds) return null;
  // Both username AND password must be non-empty for a role to be usable
  // at all — otherwise a blank OPS_PASSWORD/SALES_PASSWORD left unset in
  // Railway would let anyone in with that username and an empty password.
  if (process.env.OPS_USERNAME && process.env.OPS_PASSWORD &&
      safeEqual(creds.username, process.env.OPS_USERNAME) && safeEqual(creds.password, process.env.OPS_PASSWORD)) {
    return 'ops';
  }
  if (process.env.SALES_USERNAME && process.env.SALES_PASSWORD &&
      safeEqual(creds.username, process.env.SALES_USERNAME) && safeEqual(creds.password, process.env.SALES_PASSWORD)) {
    return 'sales';
  }
  return null;
}

// 'ops' role satisfies any requirement — it can do everything 'sales' can.
function requireRole(...allowedRoles) {
  return (req, res, next) => {
    const role = getRole(parseBasicAuth(req));
    if (!role || (!allowedRoles.includes(role) && role !== 'ops')) {
      res.set('WWW-Authenticate', 'Basic realm="Everest Plunge Ops Console"');
      return res.status(401).send('Authentication required');
    }
    req.role = role;
    next();
  };
}

// ---------------------------------------------------------------------------
// PROXY to everest-plunge-stock-sheet-agent — this app's own API key for
// that service, not the browser's. The browser only ever authenticates to
// THIS app; it never sees the stock sheet agent's real API key.
// ---------------------------------------------------------------------------
async function callStockSheetAgent(pathSegment, { method = 'GET', body } = {}) {
  if (!process.env.STOCK_SHEET_AGENT_URL) throw new Error('STOCK_SHEET_AGENT_URL is not configured.');
  const res = await fetch(`${process.env.STOCK_SHEET_AGENT_URL}${pathSegment}`, {
    method,
    headers: {
      'x-api-key': process.env.STOCK_SHEET_AGENT_API_KEY,
      ...(body ? { 'Content-Type': 'application/json' } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) throw new Error(data.error || `Stock sheet agent error ${res.status}`);
  return data;
}

// PROXY to everest-plunge-pipely-xero-agent — for the final-invoice
// action. Same reasoning as above: this app's own API key, browser never
// sees it.
async function callPipelyXeroAgent(pathSegment, { method = 'GET', body } = {}) {
  if (!process.env.PIPELY_XERO_AGENT_URL) throw new Error('PIPELY_XERO_AGENT_URL is not configured.');
  const res = await fetch(`${process.env.PIPELY_XERO_AGENT_URL}${pathSegment}`, {
    method,
    headers: {
      'x-api-key': process.env.PIPELY_XERO_AGENT_API_KEY,
      ...(body ? { 'Content-Type': 'application/json' } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) throw new Error(data.error || `Pipely-Xero agent error ${res.status}`);
  return data;
}

// ---------------------------------------------------------------------------
// API — read endpoints available to both roles, write endpoints ops-only.
// ---------------------------------------------------------------------------
app.get('/api/stock-overview', requireRole('sales'), async (_req, res) => {
  try {
    res.json(await callStockSheetAgent('/admin/stock-overview'));
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

app.post('/api/check-availability', requireRole('sales'), async (req, res) => {
  try {
    res.json(await callStockSheetAgent('/admin/check-availability', { method: 'POST', body: req.body }));
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// Read-only mirror of the real spreadsheet's batch tabs (added 2026-09-01)
// — see stock-sheet-agent's README for why these are read-only.
app.get('/api/batches', requireRole('ops'), async (_req, res) => {
  try {
    res.json(await callStockSheetAgent('/admin/batches'));
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

app.get('/api/delivered-orders', requireRole('ops'), async (_req, res) => {
  try {
    res.json(await callStockSheetAgent('/admin/delivered-orders'));
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

app.get('/api/automation-log', requireRole('ops'), async (_req, res) => {
  try {
    res.json(await callStockSheetAgent('/admin/automation-log'));
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

app.post('/api/log-sold-deal', requireRole('ops'), async (req, res) => {
  try {
    res.json(await callStockSheetAgent('/admin/log-sold-deal', { method: 'POST', body: req.body }));
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

app.post('/api/mark-order-sent', requireRole('ops'), async (req, res) => {
  try {
    res.json(await callStockSheetAgent('/admin/mark-order-sent', { method: 'POST', body: req.body }));
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

app.post('/api/mark-batch-arrived', requireRole('ops'), async (req, res) => {
  try {
    res.json(await callStockSheetAgent('/admin/mark-batch-arrived', { method: 'POST', body: req.body }));
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

app.get('/api/products-to-order', requireRole('ops'), async (_req, res) => {
  try {
    res.json(await callStockSheetAgent('/admin/products-to-order'));
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

app.post('/api/mark-order-placed', requireRole('ops'), async (req, res) => {
  try {
    res.json(await callStockSheetAgent('/admin/mark-order-placed', { method: 'POST', body: req.body }));
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

app.post('/api/mark-final-payment-received', requireRole('ops'), async (req, res) => {
  try {
    res.json(await callStockSheetAgent('/admin/mark-final-payment-received', { method: 'POST', body: req.body }));
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// Sets the per-batch/shipment container arrival ETA that drives
// pipely-xero-agent's automatic final-invoice sweep (added 2026-09-01,
// corrected same day from per-order to per-batch — matches how the real
// spreadsheet tracks it) — see that agent's README for the full
// countdown/invoice-window design.
app.post('/api/set-batch-eta', requireRole('ops'), async (req, res) => {
  try {
    res.json(await callStockSheetAgent('/admin/set-batch-eta', { method: 'POST', body: req.body }));
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// 'sales', not 'ops'-only (added 2026-09-01) — reps need to see when
// incoming stock actually arrives, not just ops.
app.get('/api/batch-etas', requireRole('sales'), async (_req, res) => {
  try {
    res.json(await callStockSheetAgent('/admin/batch-etas'));
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// Talks to pipely-xero-agent, not the stock sheet agent — this is the one
// action here that creates a real Xero invoice.
app.post('/api/create-final-invoice', requireRole('ops'), async (req, res) => {
  try {
    res.json(await callPipelyXeroAgent('/admin/create-final-invoice', { method: 'POST', body: req.body }));
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// PAGES
// ---------------------------------------------------------------------------
app.get('/', requireRole('sales'), (req, res) => {
  res.redirect(req.role === 'ops' ? '/ops' : '/sales');
});
app.get('/ops', requireRole('ops'), (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'ops.html'));
});
app.get('/ops/stock', requireRole('ops'), (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'ops-stock.html'));
});
app.get('/ops/batches', requireRole('ops'), (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'ops-batches.html'));
});
app.get('/ops/completed', requireRole('ops'), (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'ops-completed.html'));
});
app.get('/sales', requireRole('sales'), (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'sales.html'));
});

app.get('/health', (_req, res) => res.json({ ok: true }));

const port = process.env.PORT || 3011;
app.listen(port, () => console.log(`Everest Plunge Ops Console listening on :${port}`));

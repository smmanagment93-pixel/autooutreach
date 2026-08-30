// Storage layer — uses Netlify Blobs (built into every Netlify site, zero
// extra setup, no GitHub repo / DB needed). Data survives forever, across
// every function invocation, exactly like a real server-side database.
//
// Netlify normally auto-configures Blobs (siteID/token injected via env),
// but on some deploys that auto-detection silently fails
// (MissingBlobsEnvironmentError). If NETLIFY_SITE_ID and
// NETLIFY_BLOBS_TOKEN are set, we pass them explicitly so it always works
// regardless of that bug.
const { getStore } = require('@netlify/blobs');

const DATA_STORE = 'outreach-data';
const TOKEN_STORE = 'outreach-tokens'; // kept separate from business data

function storeOpts(name) {
  const opts = { name };
  if (process.env.NETLIFY_SITE_ID && process.env.NETLIFY_BLOBS_TOKEN) {
    opts.siteID = process.env.NETLIFY_SITE_ID;
    opts.token = process.env.NETLIFY_BLOBS_TOKEN;
  }
  return opts;
}
function dataStore() {
  return getStore(storeOpts(DATA_STORE));
}
function tokenStore() {
  return getStore(storeOpts(TOKEN_STORE));
}

const DEFAULT_CONFIG = {
  accounts: [], // [{id, email, dailyCap}]
  senderName: 'Sunny',
  nicheContext: 'content creators (any niche)',
  businessAddress: '',
  dailyTarget: 500,
  followUpGapDays: 2,
  automationPaused: false,
  sendWindowStart: null, // "HH:MM" in IST, e.g. "09:00" — null = no restriction (24x7)
  sendWindowEnd: null, // "HH:MM" in IST, e.g. "17:30"
};

async function getConfig() {
  const c = await dataStore().get('config', { type: 'json' });
  return c ? Object.assign({}, DEFAULT_CONFIG, c) : { ...DEFAULT_CONFIG };
}
async function saveConfig(cfg) {
  await dataStore().setJSON('config', cfg);
  return cfg;
}

async function getQueue() {
  const q = await dataStore().get('queue', { type: 'json' });
  return Array.isArray(q) ? q : [];
}
async function saveQueue(queue) {
  await dataStore().setJSON('queue', queue);
  return queue;
}

async function getTokens(accountId) {
  return tokenStore().get(accountId, { type: 'json' });
}
async function saveTokens(accountId, tokens) {
  await tokenStore().setJSON(accountId, tokens);
}

module.exports = { getConfig, saveConfig, getQueue, saveQueue, getTokens, saveTokens };

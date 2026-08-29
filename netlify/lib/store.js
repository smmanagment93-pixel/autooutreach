// Storage layer — uses Netlify Blobs (built into every Netlify site, zero
// extra setup, no GitHub repo / DB needed). Data survives forever, across
// every function invocation, exactly like a real server-side database.
const { getStore } = require('@netlify/blobs');

const DATA_STORE = 'outreach-data';
const TOKEN_STORE = 'outreach-tokens'; // kept separate from business data

function dataStore() {
  return getStore(DATA_STORE);
}
function tokenStore() {
  return getStore(TOKEN_STORE);
}

const DEFAULT_CONFIG = {
  accounts: [], // [{id, email, dailyCap}]
  senderName: 'Sunny',
  nicheContext: 'content creators (any niche)',
  businessAddress: '',
  dailyTarget: 500,
  followUpGapDays: 2,
  automationPaused: false,
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

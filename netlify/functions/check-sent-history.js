// Scans every connected Gmail account's Sent folder and cross-checks
// against the currently PENDING leads in the queue. Any pending lead whose
// email address is found in a Sent folder gets marked "sent" (without
// actually sending anything) — this catches leads that were already
// emailed outside this tool (manually, from a previous system, before this
// tool existed, etc.) so the automation never double-emails them.
//
// Trigger manually: GET/POST this function directly, or the Telegram
// /checksent command (see telegram-webhook.js) calls the same runCheckSent().

const { getConfig, getQueue, saveQueue } = require('../lib/store');
const { listSentRecipients } = require('../lib/gmail');
const { handlePreflight, withCors } = require('../lib/cors');

async function runCheckSent(accountIdFilter) {
  const config = await getConfig();
  const queue = await getQueue();
  const pending = queue.filter((q) => q.status === 'pending');
  if (!pending.length) return { checked: 0, marked: 0, accountsScanned: 0, accountErrors: [] };

  const accountsToScan = accountIdFilter
    ? (config.accounts || []).filter((a) => a.id === accountIdFilter)
    : config.accounts || [];

  let marked = 0;
  let accountsScanned = 0;
  const accountErrors = [];

  for (const acc of accountsToScan) {
    let sentSet;
    try {
      // Capped lower (1500) when scanning multiple accounts in one run, to
      // stay well within Netlify's function time limit. Scanning a single
      // account (via /checksent acc1) can afford to look further back.
      sentSet = await listSentRecipients(acc.id, accountIdFilter ? 3000 : 1500);
      accountsScanned++;
    } catch (e) {
      accountErrors.push(`${acc.id}: ${e.message}`);
      continue; // account not connected / IMAP error — skip, don't fail the whole run
    }
    for (const item of pending) {
      if (item.status !== 'pending') continue; // already matched by an earlier account this run
      if (sentSet.has((item.email || '').toLowerCase())) {
        item.status = 'sent';
        item.accountId = acc.id;
        item.sentAt = new Date().toISOString();
        item.lastActionAt = item.sentAt;
        item.note = 'Detected already in Sent folder — tool did not re-send';
        marked++;
      }
    }
  }

  await saveQueue(queue);
  return { checked: pending.length, marked, accountsScanned, accountErrors };
}

exports.handler = async (event) => {
  const preflight = handlePreflight(event);
  if (preflight) return preflight;

  const accountIdFilter = (event.queryStringParameters || {}).accountId || null;

  try {
    const result = await runCheckSent(accountIdFilter);
    return withCors({
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(result),
    });
  } catch (e) {
    return withCors({
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: e.message }),
    });
  }
};

exports.runCheckSent = runCheckSent;

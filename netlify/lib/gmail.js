const { google } = require('googleapis');
const { getTokens, saveTokens } = require('./store');

function oauthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.OAUTH_REDIRECT_URI // set to https://YOUR-SITE.netlify.app/.netlify/functions/oauth-callback
  );
}

// Returns an authorized OAuth2 client for a given account id (acc1, acc2, ...)
// Refreshes the access token using the stored refresh_token every time —
// this is what lets sending work with nobody logged into a browser.
async function clientFor(accountId) {
  const tokens = await getTokens(accountId);
  if (!tokens || !tokens.refresh_token) {
    throw new Error(`Gmail account "${accountId}" connected nahi hai — pehle /connect-start?accountId=${accountId} khol ke connect karo.`);
  }
  const client = oauthClient();
  client.setCredentials({ refresh_token: tokens.refresh_token });
  // Force a refresh so we always have a live access token (cheap call).
  const { credentials } = await client.refreshAccessToken();
  client.setCredentials(credentials);
  // refresh_token isn't always re-issued by Google — keep the original.
  await saveTokens(accountId, { ...tokens, ...credentials, refresh_token: tokens.refresh_token });
  return client;
}

function base64Url(str) {
  return Buffer.from(str)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function buildRawMessage({ from, to, subject, body, inReplyTo, references }) {
  const headers = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'MIME-Version: 1.0',
  ];
  if (inReplyTo) headers.push(`In-Reply-To: ${inReplyTo}`);
  if (references) headers.push(`References: ${references}`);
  const raw = headers.join('\r\n') + '\r\n\r\n' + body;
  return base64Url(raw);
}

// Sends an email from the given account. Pass threadId to send a follow-up
// inside the same Gmail thread (so it reads as a reply-chain, not spam).
async function sendMail(accountId, fromEmail, { to, subject, body, threadId }) {
  const auth = await clientFor(accountId);
  const gmail = google.gmail({ version: 'v1', auth });
  const raw = buildRawMessage({ from: fromEmail, to, subject, body });
  const res = await gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw, threadId: threadId || undefined },
  });
  return res.data; // { id, threadId, ... }
}

// Returns true if the thread has any message NOT sent by us — i.e. the lead
// replied. Used by process-queue to auto-stop follow-up sequences.
async function threadHasReply(accountId, threadId, ourEmail) {
  const details = await getReplyDetails(accountId, threadId, ourEmail);
  return details.replied;
}

// Same check, but also returns the reply's snippet (preview text) and who/when
// it came from — used for Telegram notifications so you can see what was
// actually said without opening Gmail.
async function getReplyDetails(accountId, threadId, ourEmail) {
  const auth = await clientFor(accountId);
  const gmail = google.gmail({ version: 'v1', auth });
  const thread = await gmail.users.threads.get({
    userId: 'me',
    id: threadId,
    format: 'metadata',
    metadataHeaders: ['From', 'Date'],
  });
  const messages = thread.data.messages || [];
  const replyMsgs = messages.filter((m) => {
    const headers = m.payload.headers || [];
    const from = (headers.find((h) => h.name === 'From') || {}).value || '';
    return from && !from.toLowerCase().includes(ourEmail.toLowerCase());
  });
  if (!replyMsgs.length) return { replied: false };
  const last = replyMsgs[replyMsgs.length - 1];
  const headers = last.payload.headers || [];
  const from = (headers.find((h) => h.name === 'From') || {}).value || '';
  const date = (headers.find((h) => h.name === 'Date') || {}).value || '';
  return { replied: true, snippet: last.snippet || '', from, date };
}

module.exports = { oauthClient, clientFor, sendMail, threadHasReply, getReplyDetails };

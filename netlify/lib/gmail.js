// Gmail access via SMTP (sending) + IMAP (reading replies), authenticated
// with a Gmail "App Password" — no OAuth, no Google verification, no
// weekly re-login. App Passwords are permanent until you revoke them.
//
// Requires 2-Step Verification to be ON for the Gmail account, then an
// App Password generated at: https://myaccount.google.com/apppasswords

const nodemailer = require('nodemailer');
const { ImapFlow } = require('imapflow');
const { simpleParser } = require('mailparser');
const crypto = require('crypto');
const { getTokens } = require('./store');

async function credsFor(accountId) {
  const creds = await getTokens(accountId); // { email, appPassword }
  if (!creds || !creds.appPassword) {
    throw new Error(
      `Gmail account "${accountId}" connected nahi hai — pehle /.netlify/functions/connect-account?accountId=${accountId} khol ke App Password add karo.`
    );
  }
  return creds;
}

function smtpTransport(creds) {
  return nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: { user: creds.email, pass: creds.appPassword },
  });
}

async function openImap(creds) {
  const client = new ImapFlow({
    host: 'imap.gmail.com',
    port: 993,
    secure: true,
    auth: { user: creds.email, pass: creds.appPassword },
    logger: false,
  });
  await client.connect();
  return client;
}

function makeMessageId(email) {
  const domain = (email.split('@')[1] || 'gmail.com').trim();
  return `<${crypto.randomBytes(16).toString('hex')}@${domain}>`;
}

// Sends an email from the given account. `threadId` here is actually the
// ROOT message's Message-ID header — passing it back in on follow-ups sets
// In-Reply-To/References so Gmail (and every other mail client) groups the
// messages into one thread, exactly like the old Gmail-API version did.
async function sendMail(accountId, fromEmail, { to, subject, body, threadId }) {
  const creds = await credsFor(accountId);
  const transporter = smtpTransport(creds);
  const messageId = makeMessageId(fromEmail);

  const mailOptions = {
    from: fromEmail,
    to,
    subject: threadId && !/^re:/i.test(subject) ? `Re: ${subject}` : subject,
    text: body,
    messageId,
  };
  if (threadId) {
    mailOptions.inReplyTo = threadId;
    mailOptions.references = threadId;
  }

  await transporter.sendMail(mailOptions);
  return { id: messageId, threadId: threadId || messageId };
}

// Returns { replied, snippet, from, date } — true if anyone other than us
// has replied anywhere in the thread (searched via standard References /
// In-Reply-To headers, so it works on Gmail's IMAP just like any provider).
async function getReplyDetails(accountId, threadId, ourEmail) {
  const creds = await credsFor(accountId);
  const client = await openImap(creds);
  try {
    const lock = await client.getMailboxLock('[Gmail]/All Mail');
    try {
      const byRefs = await client.search({ header: { references: threadId } }, { uid: true });
      const byReply = await client.search({ header: { 'in-reply-to': threadId } }, { uid: true });
      const uids = Array.from(new Set([...(byRefs || []), ...(byReply || [])])).sort((a, b) => a - b);
      if (!uids.length) return { replied: false };

      const lastUid = uids[uids.length - 1];
      let from = '',
        date = '',
        snippet = '';
      for await (const msg of client.fetch(lastUid, { envelope: true, uid: true }, { uid: true })) {
        const addr = (msg.envelope.from && msg.envelope.from[0]) || {};
        from = addr.address || '';
        date = msg.envelope.date ? new Date(msg.envelope.date).toString() : '';
        // skip if this turned out to be our own sent copy
        if (from && ourEmail && from.toLowerCase() === ourEmail.toLowerCase()) return { replied: false };
      }
      try {
        const { content } = await client.download(lastUid, undefined, { uid: true });
        const parsed = await simpleParser(content);
        snippet = (parsed.text || '').replace(/\s+/g, ' ').trim().slice(0, 200);
      } catch (e) {
        snippet = '';
      }
      return { replied: true, snippet, from, date };
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => {});
  }
}

async function threadHasReply(accountId, threadId, ourEmail) {
  const d = await getReplyDetails(accountId, threadId, ourEmail);
  return d.replied;
}

// Scans this account's Sent folder and returns a Set of every recipient
// (To + Cc) email address it has ever emailed (lowercase) — used to detect
// leads that were already contacted OUTSIDE this tool (manually, or before
// this tool existed) so they don't get emailed again.
// Capped to the most recent `limit` sent messages so huge, years-old Sent
// folders don't make this slow or time out.
async function listSentRecipients(accountId, limit = 3000) {
  const creds = await credsFor(accountId);
  const client = await openImap(creds);
  const recipients = new Set();
  try {
    const lock = await client.getMailboxLock('[Gmail]/Sent Mail');
    try {
      const status = await client.status('[Gmail]/Sent Mail', { messages: true });
      const total = status.messages || 0;
      if (total > 0) {
        const from = Math.max(1, total - limit + 1);
        for await (const msg of client.fetch(`${from}:${total}`, { envelope: true })) {
          const addrs = [...(msg.envelope.to || []), ...(msg.envelope.cc || [])];
          for (const a of addrs) if (a.address) recipients.add(a.address.toLowerCase());
        }
      }
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => {});
  }
  return recipients;
}

module.exports = { sendMail, threadHasReply, getReplyDetails, credsFor, listSentRecipients };

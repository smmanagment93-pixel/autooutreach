// Replaces the old OAuth connect-start/oauth-callback flow. Open:
//   https://YOUR-SITE.netlify.app/.netlify/functions/connect-account?accountId=acc1
// Fill in the Gmail address + a Gmail App Password (16 characters, generated
// at https://myaccount.google.com/apppasswords — requires 2-Step
// Verification to be ON for that Gmail account). This is a ONE-TIME step
// per account, and it does NOT expire like OAuth test-mode tokens do.

const { ImapFlow } = require('imapflow');
const { saveTokens } = require('../lib/store');

exports.handler = async (event) => {
  const accountId = (event.queryStringParameters || {}).accountId;
  if (!accountId) {
    return html(400, '<h2>❌ Missing ?accountId=acc1</h2><p>Use the same id you used in Automation Settings.</p>');
  }

  if (event.httpMethod === 'GET') {
    return html(200, form(accountId));
  }

  if (event.httpMethod === 'POST') {
    const params = new URLSearchParams(event.body || '');
    const email = (params.get('email') || '').trim();
    const appPassword = (params.get('appPassword') || '').replace(/\s+/g, '');

    if (!email || !appPassword) {
      return html(400, form(accountId, '❌ Email aur App Password dono zaroori hain.'));
    }
    if (appPassword.length !== 16) {
      return html(400, form(accountId, '❌ App Password 16 characters ka hota hai (spaces hata ke). Google se dobara copy karo.', email));
    }

    // Sanity-check the credentials actually work before saving them.
    try {
      const client = new ImapFlow({
        host: 'imap.gmail.com',
        port: 993,
        secure: true,
        auth: { user: email, pass: appPassword },
        logger: false,
      });
      await client.connect();
      await client.logout();
    } catch (e) {
      return html(
        500,
        form(
          accountId,
          `❌ Login fail hua: ${escapeHtml(e.message)}<br><br>Check karo: 2-Step Verification ON hai, App Password sahi copy hui hai (koi extra space nahi), aur email sahi hai.`,
          email
        )
      );
    }

    await saveTokens(accountId, { email, appPassword });

    return html(
      200,
      `<h2>✅ "${escapeHtml(accountId)}" connect ho gaya</h2>
       <p>Gmail account: <b>${escapeHtml(email)}</b></p>
       <p>Ye permanent hai — jab tak App Password revoke na karo, ye kaam karta rahega. Ab ye tab band kar sakte ho.</p>`
    );
  }

  return html(405, '<h2>Method not allowed</h2>');
};

function form(accountId, error, email) {
  return `
    <h2>🔌 Connect Gmail account "${escapeHtml(accountId)}"</h2>
    ${error ? `<p style="color:#c00">${error}</p>` : ''}
    <ol>
      <li>Us Gmail account mein <a href="https://myaccount.google.com/security" target="_blank">2-Step Verification</a> ON karo (agar pehle se nahi hai).</li>
      <li><a href="https://myaccount.google.com/apppasswords" target="_blank">myaccount.google.com/apppasswords</a> kholo, koi bhi naam do (jaise "Outreach Hub"), aur 16-character App Password copy karo.</li>
      <li>Neeche form mein daal ke submit karo.</li>
    </ol>
    <form method="POST" style="max-width:420px;">
      <label>Gmail address</label><br>
      <input type="email" name="email" value="${escapeHtml(email || '')}" required style="width:100%;padding:8px;margin:6px 0 16px;" placeholder="you@gmail.com"><br>
      <label>App Password (16 characters)</label><br>
      <input type="text" name="appPassword" required style="width:100%;padding:8px;margin:6px 0 16px;" placeholder="xxxx xxxx xxxx xxxx"><br>
      <button type="submit" style="padding:10px 20px;background:#4f46e5;color:#fff;border:none;border-radius:6px;cursor:pointer;">Connect</button>
    </form>
  `;
}

function html(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
    body: `<!doctype html><body style="font-family:sans-serif;max-width:560px;margin:60px auto;">${body}</body>`,
  };
}
function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

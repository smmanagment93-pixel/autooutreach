const { oauthClient } = require('../lib/gmail');
const { saveTokens } = require('../lib/store');

exports.handler = async (event) => {
  const { code, state, error } = event.queryStringParameters || {};
  if (error) return html(400, `<h2>❌ Google ne mana kar diya</h2><p>${escapeHtml(error)}</p>`);
  if (!code || !state) return html(400, '<h2>❌ Missing code/state</h2>');

  const accountId = state;
  try {
    const client = oauthClient();
    const { tokens } = await client.getToken(code);
    if (!tokens.refresh_token) {
      return html(
        200,
        `<h2>⚠️ Refresh token nahi mila</h2>
         <p>Ye tab hota hai jab account pehle se ek baar consent de chuka ho. Google account settings mein jaake
         <a href="https://myaccount.google.com/permissions" target="_blank">is app ki permission revoke karo</a>,
         phir dobara <a href="/.netlify/functions/connect-start?accountId=${encodeURIComponent(accountId)}">connect-start</a> kholo.</p>`
      );
    }
    client.setCredentials(tokens);
    const oauth2 = require('googleapis').google.oauth2({ version: 'v2', auth: client });
    const me = await oauth2.userinfo.get();

    await saveTokens(accountId, { ...tokens, email: me.data.email });

    return html(
      200,
      `<h2>✅ "${escapeHtml(accountId)}" connect ho gaya</h2>
       <p>Gmail account: <b>${escapeHtml(me.data.email || '')}</b></p>
       <p>Ab ye account server-side automation ke liye ready hai. Ye tab band kar sakte ho.</p>`
    );
  } catch (e) {
    return html(500, `<h2>❌ Connect fail hua</h2><pre>${escapeHtml(e.message)}</pre>`);
  }
};

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

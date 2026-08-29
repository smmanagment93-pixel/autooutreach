const { oauthClient } = require('../lib/gmail');

// Open: https://YOUR-SITE.netlify.app/.netlify/functions/connect-start?accountId=acc1
// Log in with THAT Gmail account, accept the consent screen — done, forever
// (until you revoke access). This is a ONE-TIME step per Gmail account.
exports.handler = async (event) => {
  const accountId = (event.queryStringParameters || {}).accountId;
  if (!accountId) {
    return { statusCode: 400, body: 'Missing ?accountId=acc1 (use the same id you used in Automation Settings).' };
  }
  const client = oauthClient();
  const url = client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent', // forces a refresh_token every time, even on reconnect
    scope: [
      'https://www.googleapis.com/auth/gmail.send',
      'https://www.googleapis.com/auth/gmail.readonly',
    ],
    state: accountId,
  });
  return { statusCode: 302, headers: { Location: url }, body: '' };
};

const { getConfig, saveConfig } = require('../lib/store');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, body: '' };
  if (event.httpMethod !== 'POST') return json(405, { error: 'POST only' });

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch (e) {
    return json(400, { error: 'Invalid JSON' });
  }
  const accounts = Array.isArray(body.accounts) ? body.accounts : [];
  if (!accounts.length) return json(400, { error: 'At least one account required' });

  const current = await getConfig();
  const cfg = {
    ...current,
    accounts,
    senderName: body.senderName || current.senderName,
    nicheContext: body.nicheContext || current.nicheContext,
    businessAddress: body.businessAddress || current.businessAddress,
  };
  await saveConfig(cfg);
  return json(200, { ok: true });
};

function json(statusCode, obj) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(obj),
  };
}

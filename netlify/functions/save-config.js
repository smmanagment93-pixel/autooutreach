const { getConfig, saveConfig } = require('../lib/store');
const { handlePreflight, withCors } = require('../lib/cors');

exports.handler = async (event) => {
  const preflight = handlePreflight(event);
  if (preflight) return preflight;
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
  return withCors({
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(obj),
  });
}

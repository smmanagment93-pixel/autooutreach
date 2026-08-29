const { addLeadsToQueue } = require('../lib/leads');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, body: '' };
  if (event.httpMethod !== 'POST') return json(405, { error: 'POST only' });

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch (e) {
    return json(400, { error: 'Invalid JSON' });
  }
  const leads = Array.isArray(body.leads) ? body.leads : [];
  if (!leads.length) return json(400, { error: 'No leads provided' });

  const result = await addLeadsToQueue(leads);
  return json(200, result);
};

function json(statusCode, obj) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(obj),
  };
}

const { runOnce } = require('./process-queue');

// GET /.netlify/functions/run-now — manually fire one automation cycle right
// now. Handy right after setup to confirm sending/follow-ups/reply-detection
// actually work, instead of waiting for the next 20-minute schedule tick.
exports.handler = async () => {
  try {
    const result = await runOnce();
    return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(result) };
  } catch (e) {
    return { statusCode: 500, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: e.message }) };
  }
};

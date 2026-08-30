// Netlify Functions do NOT automatically pick up the [[headers]] rules in
// netlify.toml (those only apply to static asset responses) — so every
// function that's called cross-origin from the frontend (a different
// *.netlify.app domain) must set its own CORS headers, on both the actual
// response AND the OPTIONS preflight response, or the browser's fetch()
// fails with a generic "Failed to fetch" before the request ever reaches
// this code.

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

// Call at the top of a handler: if it returns a response, return it immediately.
function handlePreflight(event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: CORS_HEADERS, body: '' };
  }
  return null;
}

// Wrap any {statusCode, body, headers?} response to include CORS headers.
function withCors(response) {
  return { ...response, headers: { ...CORS_HEADERS, ...(response.headers || {}) } };
}

module.exports = { CORS_HEADERS, handlePreflight, withCors };

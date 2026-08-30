const { getQueue } = require('../lib/store');
const { handlePreflight, withCors } = require('../lib/cors');

exports.handler = async (event) => {
  const preflight = handlePreflight(event);
  if (preflight) return preflight;

  const queue = await getQueue();
  const replied = queue
    .filter((q) => q.status === 'replied')
    .map((q) => ({
      name: q.name,
      email: q.email,
      channelLink: q.channelLink || '',
      niche: q.niche,
      account: q.accountId,
      sentAt: q.sentAt,
      repliedAt: q.repliedAt,
      replySnippet: q.replySnippet || '',
      followUpsSentBeforeReply: q.followUpsSent || 0,
    }));

  return withCors({
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ replied }),
  });
};

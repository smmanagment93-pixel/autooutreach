const { getQueue } = require('../lib/store');

exports.handler = async () => {
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

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ replied }),
  };
};

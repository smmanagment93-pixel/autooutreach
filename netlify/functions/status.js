const { getConfig, getQueue } = require('../lib/store');

function isToday(iso) {
  if (!iso) return false;
  const d = new Date(iso);
  const now = new Date();
  return d.toDateString() === now.toDateString();
}

exports.handler = async () => {
  const config = await getConfig();
  const queue = await getQueue();

  const totalPending = queue.filter((q) => q.status === 'pending').length;
  const totalSentToday = queue.filter((q) => q.sentAt && isToday(q.sentAt) && q.status !== 'pending').length;
  const totalFailed = queue.reduce((sum, q) => sum + (q.failCount || 0), 0);
  const totalFollowUpsSent = queue.reduce((sum, q) => sum + (q.followUpsSent || 0), 0);
  const totalRepliedDetected = queue.filter((q) => q.status === 'replied').length;

  const perAccount = (config.accounts || []).map((a) => {
    const sentToday = queue.filter(
      (q) => q.accountId === a.id && q.sentAt && isToday(q.sentAt)
    ).length;
    const queued = queue.filter((q) => q.status === 'pending').length; // shared pool across accounts
    return { id: a.id, email: a.email, dailyCap: a.dailyCap, sentToday, queued };
  });

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      automationEnabled: process.env.AUTOMATION_ENABLED !== 'false' && !config.automationPaused,
      totalPending,
      totalSentToday,
      totalFailed,
      totalFollowUpsSent,
      totalRepliedDetected,
      perAccount,
    }),
  };
};

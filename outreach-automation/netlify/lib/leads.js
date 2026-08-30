const { getQueue, saveQueue } = require('./store');

async function addLeadsToQueue(leads) {
  const queue = await getQueue();
  const byEmail = new Map(queue.map((q) => [q.email.toLowerCase(), q]));

  let added = 0,
    skipped = 0,
    skippedAlreadyContacted = 0;

  for (const l of leads) {
    const email = (l.Email || l.email || '').trim();
    if (!email || email === '-') continue;
    const key = email.toLowerCase();
    const existing = byEmail.get(key);
    if (existing) {
      if (existing.status === 'pending') skipped++;
      else skippedAlreadyContacted++;
      continue;
    }
    const item = {
      id: key,
      name: l.Name || l.name || '',
      email,
      handle: l.Handle || l.handle || '',
      channelLink: l.URL || l.url || l.Link || l.link || l.ChannelLink || '',
      niche: l.Niche || l.niche || l.Score || '',
      country: l.Country || l.country || l.Location || l.location || '',
      status: 'pending',
      accountId: null,
      threadId: null,
      addedAt: new Date().toISOString(),
      sentAt: null,
      lastActionAt: null,
      followUpsSent: 0,
      failCount: 0,
    };
    queue.push(item);
    byEmail.set(key, item);
    added++;
  }

  await saveQueue(queue);
  const totalPending = queue.filter((q) => q.status === 'pending').length;
  return { added, skipped, skippedAlreadyContacted, totalPending };
}

module.exports = { addLeadsToQueue };

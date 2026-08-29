const { schedule } = require('@netlify/functions');
const { getConfig, getQueue, saveQueue } = require('../lib/store');
const { sendMail, getReplyDetails } = require('../lib/gmail');
const { composeFirstEmail, composeFollowUp } = require('../lib/compose');
const { notifyTelegram } = require('../lib/notify');

const MAX_FOLLOWUPS = 3;
const MAX_SENDS_PER_RUN = 18; // per 20-min cycle — spreads sends out instead of bursting
const MIN_GAP_MS = 4000; // random pause BETWEEN each send within a run
const MAX_GAP_MS = 12000; // so Gmail sees natural-looking spacing, not a blast
const MAX_REPLY_CHECKS_PER_RUN = 60;
const REPLY_RECHECK_HOURS = 3;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
function randomDelay() {
  return MIN_GAP_MS + Math.random() * (MAX_GAP_MS - MIN_GAP_MS);
}

function daysSince(iso) {
  if (!iso) return Infinity;
  return (Date.now() - new Date(iso).getTime()) / 86400000;
}
function hoursSince(iso) {
  if (!iso) return Infinity;
  return (Date.now() - new Date(iso).getTime()) / 3600000;
}
function isToday(iso) {
  if (!iso) return false;
  return new Date(iso).toDateString() === new Date().toDateString();
}
function truncate(s, n) {
  return s.length > n ? s.slice(0, n) + '…' : s;
}
function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

async function runOnce() {
  const config = await getConfig();
  if (process.env.AUTOMATION_ENABLED === 'false' || config.automationPaused) {
    return { skipped: true, reason: config.automationPaused ? 'paused via Telegram' : 'AUTOMATION_ENABLED=false' };
  }
  const queue = await getQueue();
  const accountsById = Object.fromEntries((config.accounts || []).map((a) => [a.id, a]));

  // ---- 1. Check for replies (auto-stop sequence when a lead replies) ----
  let checked = 0;
  const newReplies = [];
  for (const item of queue) {
    if (checked >= MAX_REPLY_CHECKS_PER_RUN) break;
    if (item.status === 'replied' || item.status === 'pending') continue;
    if (!item.threadId || !item.accountId) continue;
    if (hoursSince(item.lastCheckedAt) < REPLY_RECHECK_HOURS) continue;
    const acc = accountsById[item.accountId];
    if (!acc) continue;
    checked++;
    try {
      const details = await getReplyDetails(item.accountId, item.threadId, acc.email);
      item.lastCheckedAt = new Date().toISOString();
      if (details.replied) {
        item.status = 'replied';
        item.repliedAt = item.repliedAt || new Date().toISOString();
        item.replySnippet = details.snippet || '';
        item.replyFrom = details.from || '';
        newReplies.push(item);
      }
    } catch (e) {
      item.lastCheckError = e.message;
    }
  }

  // ---- 2. Figure out how much headroom each account has today ----
  const sentTodayByAccount = {};
  for (const a of config.accounts || []) {
    sentTodayByAccount[a.id] = queue.filter((q) => q.accountId === a.id && q.sentAt && isToday(q.sentAt)).length;
  }
  const totalSentToday = Object.values(sentTodayByAccount).reduce((s, n) => s + n, 0);
  let dailyTargetRemaining = (config.dailyTarget || 500) - totalSentToday;

  function accountWithRoom() {
    const candidates = (config.accounts || [])
      .filter((a) => sentTodayByAccount[a.id] < (a.dailyCap || 0))
      .sort((a, b) => sentTodayByAccount[a.id] - sentTodayByAccount[b.id]);
    return candidates[0] || null;
  }

  // ---- 3. Build the list of leads due for action right now ----
  const followUpGapDays = config.followUpGapDays || 2;
  const dueForFirstSend = queue.filter((q) => q.status === 'pending');
  const dueForFollowUp = queue.filter(
    (q) =>
      ['sent', 'followup1', 'followup2'].includes(q.status) &&
      (q.followUpsSent || 0) < MAX_FOLLOWUPS &&
      daysSince(q.lastActionAt) >= followUpGapDays
  );

  let sentCount = 0,
    firstSendCount = 0,
    followUpCount = 0,
    failCount = 0;

  // Follow-ups first — these have a deadline (2-day cadence), new leads don't.
  for (const item of [...dueForFollowUp, ...dueForFirstSend]) {
    if (sentCount >= MAX_SENDS_PER_RUN) break;
    if (dailyTargetRemaining <= 0) break;

    const isFollowUp = item.status !== 'pending';
    let account;
    if (isFollowUp) {
      // Must reply from the SAME mailbox the thread started in.
      account = accountsById[item.accountId];
      if (!account || sentTodayByAccount[account.id] >= (account.dailyCap || 0)) continue;
    } else {
      account = accountWithRoom();
      if (!account) continue;
    }

    if (sentCount > 0) await sleep(randomDelay()); // human-like gap, not a blast

    try {
      const followUpNumber = (item.followUpsSent || 0) + 1;
      const { subject, body } = isFollowUp
        ? await composeFollowUp(item, config, followUpNumber)
        : await composeFirstEmail(item, config);

      const result = await sendMail(account.id, account.email, {
        to: item.email,
        subject,
        body,
        threadId: isFollowUp ? item.threadId : undefined,
      });

      item.accountId = account.id;
      item.threadId = result.threadId;
      item.lastActionAt = new Date().toISOString();
      if (!isFollowUp) {
        item.status = 'sent';
        item.sentAt = item.lastActionAt;
        firstSendCount++;
      } else {
        item.followUpsSent = followUpNumber;
        item.status = `followup${followUpNumber}`;
        followUpCount++;
      }

      sentTodayByAccount[account.id] = (sentTodayByAccount[account.id] || 0) + 1;
      dailyTargetRemaining--;
      sentCount++;
    } catch (e) {
      item.failCount = (item.failCount || 0) + 1;
      item.lastError = e.message;
      failCount++;
    }
  }

  await saveQueue(queue);

  // ---- 4. Telegram update — only when something actually happened ----
  if (firstSendCount || followUpCount || newReplies.length || failCount) {
    const lines = ['📬 <b>Outreach Hub update</b>'];
    if (firstSendCount) lines.push(`✅ ${firstSendCount} naye email bheje gaye`);
    if (followUpCount) lines.push(`🔁 ${followUpCount} follow-up bheje gaye`);
    if (failCount) lines.push(`⚠️ ${failCount} bhejne mein fail hui`);
    if (newReplies.length) {
      lines.push(`💬 <b>${newReplies.length} naya reply aaya!</b> Sequence auto-stop ho gaya:`);
      for (const r of newReplies.slice(0, 8)) {
        lines.push(`\n• <b>${escapeHtml(r.name || r.email)}</b> (${escapeHtml(r.email)})`);
        if (r.channelLink) lines.push(`  🔗 ${escapeHtml(r.channelLink)}`);
        if (r.replySnippet) lines.push(`  💬 "${escapeHtml(truncate(r.replySnippet, 200))}"`);
      }
      if (newReplies.length > 8) lines.push(`\n...aur ${newReplies.length - 8} aur (dashboard/status check karo)`);
    }
    await notifyTelegram(lines.join('\n'));
  }

  return { sentCount, firstSendCount, followUpCount, failCount, newReplies: newReplies.length, repliesChecked: checked };
}

exports.handler = schedule('*/20 * * * *', async () => {
  const result = await runOnce();
  console.log('process-queue run:', JSON.stringify(result));
  return { statusCode: 200 };
});

// Also exported so it can be hit manually (e.g. a "Run now" button, or
// curl'd right after deploy to sanity-check everything works) without
// waiting up to 20 minutes for the schedule to fire.
exports.runOnce = runOnce;

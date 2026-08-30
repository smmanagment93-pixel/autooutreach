const { getConfig, saveConfig, getQueue } = require('../lib/store');
const { notifyTelegram } = require('../lib/notify');
const { runOnce } = require('./process-queue');
const { addLeadsToQueue } = require('../lib/leads');
const { parseCSV } = require('../lib/csv');
const { runCheckSent } = require('./check-sent-history');

function isToday(iso) {
  if (!iso) return false;
  return new Date(iso).toDateString() === new Date().toDateString();
}

async function sendStatus() {
  const config = await getConfig();
  const queue = await getQueue();
  const totalPending = queue.filter((q) => q.status === 'pending').length;
  const totalSentToday = queue.filter((q) => q.sentAt && isToday(q.sentAt)).length;
  const totalReplied = queue.filter((q) => q.status === 'replied').length;
  const totalFollowUps = queue.reduce((s, q) => s + (q.followUpsSent || 0), 0);
  const enabled = process.env.AUTOMATION_ENABLED !== 'false' && !config.automationPaused;
  const perAcc = (config.accounts || [])
    .map((a) => {
      const sentToday = queue.filter((q) => q.accountId === a.id && q.sentAt && isToday(q.sentAt)).length;
      return `  • ${a.email} (${a.id}): ${sentToday}/${a.dailyCap} aaj`;
    })
    .join('\n');

  const windowLine =
    config.sendWindowStart && config.sendWindowEnd
      ? `Time window: ${config.sendWindowStart}–${config.sendWindowEnd} IST`
      : `Time window: 24x7 (koi restriction nahi)`;

  await notifyTelegram(
    [
      `📊 <b>Outreach Hub status</b>`,
      `Automation: ${enabled ? '🟢 ON' : '🔴 PAUSED'}`,
      windowLine,
      `Pending queue: ${totalPending}`,
      `Aaj bheje: ${totalSentToday}`,
      `Total replies: ${totalReplied}`,
      `Total follow-ups (all time): ${totalFollowUps}`,
      perAcc ? '\n' + perAcc : '',
    ].join('\n')
  );
}

const HELP_TEXT = `<b>Commands</b>
📎 Koi bhi .csv file bhejo — leads seedhe queue mein add ho jaayengi
/status — abhi ke numbers dekho
/run — turant ek cycle chalao (20 min wait nahi)
/pause — automation rok do
/resume — automation wapas chalu karo
/accounts — sab accounts + daily cap dekho
/setcap acc1 60 — acc1 ka daily cap 60 karo
/setgap 3 — follow-up gap din mein set karo (default 2)
/setname Sunny — sender name set karo
/setniche trading YouTubers India — niche context set karo
/setaddress Gorakhpur, UP — business address set karo (US CAN-SPAM footer ke liye)
/setwindow 09:00 17:30 — sirf is IST time window mein hi naye email/follow-up bhejega (replies hamesha check hote rahenge)
/setwindow off — time window hatao, wapas 24x7 bhejo
/checksent — pending leads ko sabhi accounts ke Sent folder se match karke, jo pehle se bheji hui hain unhe "sent" mark kar do (dobara nahi bhejega)
/checksent acc1 — sirf ek account check karo (zyada leads/accounts hone par safer, jaldi hota hai)`;

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 200, body: 'ok' };

  let update;
  try {
    update = JSON.parse(event.body || '{}');
  } catch (e) {
    return { statusCode: 200, body: 'ok' };
  }

  const msg = update.message || update.edited_message;
  if (!msg) return { statusCode: 200, body: 'ok' };

  const chatId = String(msg.chat.id);
  if (chatId !== String(process.env.TELEGRAM_CHAT_ID)) {
    return { statusCode: 200, body: 'ok' };
  }

  // ---- CSV file sent as a Telegram document — push straight into the queue ----
  if (msg.document) {
    const fileName = msg.document.file_name || '';
    const isCsv = /\.csv$/i.test(fileName) || msg.document.mime_type === 'text/csv';
    if (!isCsv) {
      await notifyTelegram(`"${fileName}" .csv nahi lag rahi — sirf .csv file bhejo.`);
      return { statusCode: 200, body: 'ok' };
    }
    try {
      const token = process.env.TELEGRAM_BOT_TOKEN;
      const fileInfoRes = await fetch(`https://api.telegram.org/bot${token}/getFile?file_id=${msg.document.file_id}`);
      const fileInfo = await fileInfoRes.json();
      if (!fileInfo.ok) throw new Error(fileInfo.description || 'getFile failed');
      const fileRes = await fetch(`https://api.telegram.org/file/bot${token}/${fileInfo.result.file_path}`);
      const csvText = await fileRes.text();
      const rows = parseCSV(csvText);
      if (!rows.length) {
        await notifyTelegram(`⚠️ "${fileName}" mein koi rows nahi mili — check karo headers Name/Email/URL/Niche/Country hain.`);
        return { statusCode: 200, body: 'ok' };
      }
      const result = await addLeadsToQueue(rows);
      await notifyTelegram(
        `✅ "${fileName}" se ${result.added} leads queue mein add hui (${result.skipped} skip — already queued, ${result.skippedAlreadyContacted} skip — already contacted). Total pending: ${result.totalPending}.\n\n/run bhejo abhi bhejna shuru karne ke liye, ya automation apne aap 20 min mein pick kar lega.`
      );
    } catch (e) {
      await notifyTelegram(`❌ CSV process nahi hui: ${e.message}`);
    }
    return { statusCode: 200, body: 'ok' };
  }

  const rawText = (msg.text || '').trim();
  if (!rawText) return { statusCode: 200, body: 'ok' };

  const parts = rawText.split(/\s+/);
  const cmd = parts[0].toLowerCase();
  const rest = rawText.slice(cmd.length).trim();

  try {
    if (cmd === '/status') {
      await sendStatus();
    } else if (cmd === '/run') {
      await notifyTelegram('⏳ Ek cycle chala raha hoon...');
      const result = await runOnce();
      if (result.skipped) {
        await notifyTelegram(`Automation abhi paused hai (${result.reason}) — pehle /resume bhejo.`);
      } else {
        await notifyTelegram(
          `✅ Cycle done: ${result.firstSendCount} naye email, ${result.followUpCount} follow-up, ${result.newReplies} reply, ${result.failCount} fail.`
        );
      }
    } else if (cmd === '/pause') {
      const config = await getConfig();
      config.automationPaused = true;
      await saveConfig(config);
      await notifyTelegram('🔴 Automation paused. /resume bhejo jab wapas chalana ho.');
    } else if (cmd === '/resume') {
      const config = await getConfig();
      config.automationPaused = false;
      await saveConfig(config);
      await notifyTelegram('🟢 Automation resume ho gaya.');
    } else if (cmd === '/accounts') {
      const config = await getConfig();
      const lines = (config.accounts || []).map((a) => `• ${a.id} — ${a.email} — cap ${a.dailyCap}/din`);
      await notifyTelegram(lines.length ? lines.join('\n') : 'Koi account configured nahi hai.');
    } else if (cmd === '/setcap') {
      const [accId, capStr] = rest.split(/\s+/);
      const cap = parseInt(capStr, 10);
      if (!accId || !cap) {
        await notifyTelegram('Format: /setcap acc1 60');
      } else {
        const config = await getConfig();
        const acc = (config.accounts || []).find((a) => a.id === accId);
        if (!acc) {
          await notifyTelegram(`Account "${accId}" nahi mila. /accounts se list dekho.`);
        } else {
          acc.dailyCap = cap;
          await saveConfig(config);
          await notifyTelegram(`✓ ${accId} ka daily cap ab ${cap} hai.`);
        }
      }
    } else if (cmd === '/setgap') {
      const gap = parseInt(rest, 10);
      if (!gap || gap < 1) {
        await notifyTelegram('Format: /setgap 3  (din mein, 1 ya usse zyada)');
      } else {
        const config = await getConfig();
        config.followUpGapDays = gap;
        await saveConfig(config);
        await notifyTelegram(`✓ Follow-up gap ab ${gap} din hai.`);
      }
    } else if (cmd === '/setname') {
      const config = await getConfig();
      config.senderName = rest || config.senderName;
      await saveConfig(config);
      await notifyTelegram(`✓ Sender name set: ${config.senderName}`);
    } else if (cmd === '/setniche') {
      const config = await getConfig();
      config.nicheContext = rest || config.nicheContext;
      await saveConfig(config);
      await notifyTelegram(`✓ Niche context set: ${config.nicheContext}`);
    } else if (cmd === '/setaddress') {
      const config = await getConfig();
      config.businessAddress = rest || config.businessAddress;
      await saveConfig(config);
      await notifyTelegram(`✓ Business address set: ${config.businessAddress}`);
    } else if (cmd === '/setwindow') {
      const args = rest.split(/\s+/).filter(Boolean);
      const config = await getConfig();
      if (args[0] === 'off') {
        config.sendWindowStart = null;
        config.sendWindowEnd = null;
        await saveConfig(config);
        await notifyTelegram('✓ Time window hata diya — ab 24x7 bhejega.');
      } else if (args.length === 2 && /^\d{2}:\d{2}$/.test(args[0]) && /^\d{2}:\d{2}$/.test(args[1])) {
        config.sendWindowStart = args[0];
        config.sendWindowEnd = args[1];
        await saveConfig(config);
        await notifyTelegram(`✓ Ab sirf ${args[0]} se ${args[1]} IST ke beech naye email/follow-up bhejega. (Replies check hamesha hote rahenge.)`);
      } else {
        await notifyTelegram('Format: /setwindow 09:00 17:30  (IST, 24-hour). Hatane ke liye: /setwindow off');
      }
    } else if (cmd === '/checksent') {
      const accountIdFilter = rest.trim() || null;
      await notifyTelegram(
        accountIdFilter
          ? `🔍 "${accountIdFilter}" ka Sent folder check kar raha hoon pending leads ke against...`
          : `🔍 Sabhi connected accounts ke Sent folder check kar raha hoon (halka scan, 1500 recent emails/account) — agar timeout ho jaaye to /checksent acc1 jaisa ek-ek account karke try karo...`
      );
      try {
        const result = await runCheckSent(accountIdFilter);
        const errLines = result.accountErrors.length
          ? '\n\n⚠️ Kuch accounts check nahi ho paaye:\n' + result.accountErrors.join('\n')
          : '';
        await notifyTelegram(
          `✓ Check complete.\nPending leads check kiye: ${result.checked}\nAccounts scan kiye: ${result.accountsScanned}\nPehle se sent mile aur mark kar diye: ${result.marked}${errLines}`
        );
      } catch (e) {
        await notifyTelegram(`❌ Check-sent fail hua: ${e.message}${accountIdFilter ? '' : '\n\nTip: /checksent acc1 jaisa ek-ek account karke try karo, kam samay lagega.'}`);
      }
    } else if (cmd === '/help' || cmd === '/start') {
      await notifyTelegram(HELP_TEXT);
    } else {
      await notifyTelegram(`Samjha nahi. /help bhejo commands ke liye.`);
    }
  } catch (e) {
    await notifyTelegram(`❌ Error: ${e.message}`);
  }

  return { statusCode: 200, body: 'ok' };
};

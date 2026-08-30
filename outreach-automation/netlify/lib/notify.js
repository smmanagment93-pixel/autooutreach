// Sends a plain-text message to your Telegram chat via the Bot API.
// Silently no-ops if TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID aren't set, so the
// automation never breaks just because notifications aren't configured yet.

async function notifyTelegram(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return { skipped: true };

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
    });
    const data = await res.json();
    if (!data.ok) console.error('Telegram send failed:', data.description);
    return data;
  } catch (e) {
    console.error('Telegram send error:', e.message);
    return { error: e.message };
  }
}

module.exports = { notifyTelegram };

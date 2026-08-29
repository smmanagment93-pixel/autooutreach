// Builds the outreach email + follow-up bodies. Uses Groq (if GROQ_API_KEY is
// set) for a personalized line, otherwise falls back to a solid static
// template — either way, sending never breaks because AI is unavailable.

async function groqLine(prompt) {
  if (!process.env.GROQ_API_KEY) return null;
  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
        max_tokens: 220,
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.choices?.[0]?.message?.content?.trim() || null;
  } catch (e) {
    return null;
  }
}

function isUSA(lead) {
  const c = (lead.country || lead.Country || lead.Location || '').toLowerCase();
  return c.includes('usa') || c.includes('united states') || c.includes('u.s');
}

function unsubscribeFooter(lead, config) {
  if (!isUSA(lead)) return '';
  const addr = config.businessAddress || '';
  return `\n\n---\nReply "unsubscribe" if you'd rather not hear from me again.${addr ? '\n' + addr : ''}`;
}

// Deterministic pick — same lead always lands on the same variant (so a
// retry or a follow-up doesn't contradict what the first email said), but
// different leads spread naturally across all variants.
function pickIndex(seed, count) {
  const s = String(seed || '');
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    hash = (hash * 31 + s.charCodeAt(i)) >>> 0;
  }
  return hash % count;
}

function field(lead, ...keys) {
  for (const k of keys) {
    if (lead[k]) return lead[k];
  }
  return '';
}

async function composeFirstEmail(lead, config) {
  const name = field(lead, 'name', 'Name') || 'there';
  const handle = field(lead, 'handle', 'Handle');
  const channelLink = field(lead, 'channelLink', 'URL', 'url', 'Link', 'link');
  const country = field(lead, 'country', 'Country', 'Location');
  const senderName = config.senderName || 'Sunny';
  const niche = field(lead, 'niche', 'Niche') || config.nicheContext || 'content creators';

  const aiOpener = await groqLine(
    `Write ONE short, professional opening line (max 25 words, no greeting, no sign-off) for a cold outreach email from a content-research/content-strategy service provider to a YouTube/content creator named "${name}" in the "${niche}" niche. The sender analyzes audience data (comments, watch behavior) to find the gap between what an audience is currently watching and what it actually wants, to help the creator grow organic reach and engagement. Reference the niche specifically if given. No emojis, no hype words, no exclamation marks, no "I'm a fan" framing — this is a service pitch, not fan mail.`
  );
  const fallbackOpener = `I run audience/content research for ${niche} channels — mapping the gap between what viewers are currently watching and what they're actually asking for in the comments.`;
  const opener = aiOpener || fallbackOpener;

  // Each variant leans on a different combination of the fields we actually
  // have (name, handle, channelLink, niche, country), and is worded/structured
  // differently — different subject, different sentence shapes, different
  // length — so a batch of sends doesn't read as one template with find/replace.
  // All variants are written as a service-provider pitch (data-driven content
  // research/strategy → organic reach & engagement), not as fan outreach.
  const variants = [
    // 1 — niche + research/data angle
    {
      subject: `Content research for ${name}`,
      body: `Hi ${name},

${opener}

I put together a quick breakdown for ${niche} channels — based on researching top and trending creators in the space, and scanning thousands of viewer comments to pin down what audiences are actually asking for versus what's currently being posted. It's the kind of gap that, once closed, tends to move organic reach and engagement directly.

If it feels worth exploring, let me know a time that works for you this week.

${senderName}`,
    },
    // 2 — handle-led, shorter and more direct
    {
      subject: `${handle ? handle : name} — a content strategy note`,
      body: `Hey ${name},

${handle ? `I do data-driven content research for channels, and pulled some numbers on ${handle} while mapping out the ${niche} space.` : `I do data-driven content research for channels, and pulled some numbers while mapping out the ${niche} space.`}

Basically: what your audience is currently watching vs. what they're actually asking for in comments — and where closing that gap could grow reach. If it feels worth a look, let me know what time works best for you.

${senderName}`,
    },
    // 3 — channel-link-led, findings framing
    {
      subject: `A few data points on ${name}'s channel`,
      body: `Hi ${name},

${channelLink ? `I run content strategy research for creators, and while going through ${channelLink} alongside other ${niche} channels,` : `I run content strategy research for creators, and while going through ${niche} channels,`} I noticed a few specific gaps between what's being posted and what the audience is actually asking for in the comments.

If that sounds worth a closer look, tell me a time that suits you and I'll work around it.

${senderName}`,
    },
    // 4 — country/localized flavor, consultative tone
    {
      subject: `Audience research — ${name}`,
      body: `Hi ${name},

${opener}

${country ? `I've been running this analysis across ${niche} channels in a few regions including ${country}, and` : `I've been running this analysis across ${niche} channels lately, and`} the pattern holds: there's usually a clear, data-backed gap between current content and what would actually drive more organic reach.

If it feels worth it, just let me know the best time for you — I'll fit around your schedule.

${senderName}`,
    },
  ];

  const idx = pickIndex(lead.id || lead.email || name, variants.length);
  const chosen = variants[idx];
  return { subject: chosen.subject, body: chosen.body + unsubscribeFooter(lead, config) };
}

async function composeFollowUp(lead, config, followUpNumber) {
  const name = field(lead, 'name', 'Name') || 'there';
  const senderName = config.senderName || 'Sunny';

  // 2 wordings per follow-up stage, picked the same deterministic way, so
  // 300 follow-ups don't all say the exact same sentence.
  const stages = [
    [
      `Just floating this back up in case it got buried — if it feels worth exploring, let me know a time that works for you.`,
      `Not sure if this reached you or got lost in the inbox — if it's worth a look, just tell me what time suits you.`,
    ],
    [
      `Last nudge from me on this — the research is still relevant, and if it feels worth it, I'm happy to work around whatever time suits you. Let me know either way.`,
      `One more try from my side — if it's ever worth exploring, just let me know a time and I'll make it work, otherwise totally fine to let it drop.`,
    ],
    [
      `Closing the loop on this one — if timing's ever better down the line, just tell me and I'll work around it. All the best!`,
      `I'll leave it here for now — feel free to reach out anytime with a time that works for you. Wishing you well either way!`,
    ],
  ];
  const stageLines = stages[Math.min(followUpNumber - 1, stages.length - 1)];
  const line = stageLines[pickIndex(lead.id || lead.email || name, stageLines.length)];

  const subjects = [`Re: Content research for ${name}`, `Re: A few data points on ${name}'s channel`];
  const subject = subjects[pickIndex((lead.id || lead.email || name) + 'sub', subjects.length)];

  const body = `Hi ${name},

${line}

${senderName}${unsubscribeFooter(lead, config)}`;
  return { subject, body };
}

module.exports = { composeFirstEmail, composeFollowUp, isUSA };

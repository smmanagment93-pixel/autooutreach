# Outreach Automation (backend) — Finance Outreach Hub ke liye

Ye ek chhota Netlify Functions project hai jo tumhare `Finance Outreach Hub`
HTML dashboard ke "Auto-Sender" / "Automation Settings" se baat karta hai.
Ek baar deploy + connect karne ke baad ye **24x7 khud chalta rahega** —
har 20 minute mein automatically:
1. Naye pending leads ko cold email bhejta hai (per-account daily cap follow karke)
2. Jinhe 2 din se reply nahi aaya unhe follow-up bhejta hai (max 3 follow-up)
3. Gmail check karke dekhta hai kisi ne reply kiya — reply aate hi us lead ka sequence khud ruk jaata hai
4. Dashboard ke "Replied Leads" aur "Automation Status" isi se data leta hai

Tumhe sirf **ek baar** setup karna hai. Uske baad bas dashboard 1-2 baar din
mein khol ke check karna hai — bhejna/follow-up/reply-detect sab background
mein khud hota rahega, chahe koi browser/laptop khula ho ya na ho.

---

## Setup — one-time (~20-25 min)

### Step 1 — Gmail App Passwords (koi Google Cloud/OAuth setup nahi chahiye)
Ye tool Gmail se SMTP (bhejna) aur IMAP (reply check karna) ke through baat
karta hai, ek **App Password** ke through — Google ka hi official feature.
Ye OAuth se kaafi simple hai: koi consent screen, test users, ya 7-din
expiry nahi. Ek baar generate karo, permanent chalta hai jab tak khud revoke
na karo.

Har Gmail account (jisse bhejna hai) ke liye:
1. Us account mein **2-Step Verification ON** karo: https://myaccount.google.com/security
2. https://myaccount.google.com/apppasswords pe jaake koi bhi naam do
   (jaise "Outreach Hub") aur **App Password generate karo** — 16 characters
   ka code milega. Ise turant kahin copy karke rakh lo (dobara nahi dikhega).
3. Ye password baad mein Step 5 mein use hoga — abhi ke liye bas save rakho.

### Step 2 — (Optional) Groq API key
AI-personalized opening lines ke liye — https://console.groq.com se free API key le lo.
Nahi loge toh bhi chalega, ek solid fixed template use hoga.

### Step 3 — Netlify pe deploy karo
Sabse aasaan tareeka: is poore `outreach-automation/` folder ko GitHub repo mein
push karo, phir Netlify pe:
1. https://app.netlify.com → **Add new site → Import an existing project** → apna GitHub repo select karo
2. Build settings default hi rehne do (`npm install`, functions dir `netlify/functions`) — `netlify.toml` mein already set hai
3. Deploy hone do — ek URL milega jaisे `https://something-random-123.netlify.app`

(Netlify CLI se bhi ho sakta hai: `npm i -g netlify-cli`, phir project folder mein
`netlify deploy --prod`.)

### Step 4 — Environment variables set karo
Netlify site → **Site configuration → Environment variables** mein add karo:

| Key | Value |
|---|---|
| `TELEGRAM_BOT_TOKEN` | @BotFather se |
| `TELEGRAM_CHAT_ID` | apna Telegram chat id |
| `GROQ_API_KEY` | (optional, Step 2 se) |
| `AUTOMATION_ENABLED` | `true` |

(Gmail credentials ab yahan env var mein nahi jaate — wo Step 5 mein per-account
save hote hain, taaki alag-alag Gmail accounts easily add/replace ho sakein.)

Env vars add karne ke baad **Deploys → Trigger deploy** karke redeploy kar do
(taaki naye env vars functions mein pahunchein).

### Step 5 — Har Gmail account connect karo (one-time, per account)
Har us Gmail account ke liye jo bhejne mein use hoga, browser mein kholo:

```
https://YOUR-SITE-NAME.netlify.app/.netlify/functions/connect-account?accountId=acc1
```

(`accountId` wahi rakhna jo tum dashboard ke Automation Settings mein us account
ko doge — e.g. `acc1`, `acc2`.) Form mein Gmail address aur Step 1 wala 16-character
App Password daalo, Connect dabao — "✅ connected" dikhega aur ye credentials
turant test bhi ho jaate hain (galat App Password ho to error turant dikhega).
Har account ke liye repeat karo (accountId change karke, apna-apna App Password).

**Ye permanent hai** — koi 7-din expiry nahi, koi weekly re-login nahi.
Account revoke karna ho to seedha https://myaccount.google.com/apppasswords
pe jaake wahan se delete kar do.

### Step 6 — Dashboard mein connect karo
`Finance Outreach Hub` tool mein **Automation Settings** kholo:
- **Netlify Function Base URL**: `https://YOUR-SITE-NAME.netlify.app/.netlify/functions`
- **Accounts**: id (Step 5 wale accountId — `acc1` etc.), Gmail address, daily cap
- Save karo — ye server pe bhi save ho jaayega (`save-config`)

### Step 7 — (Optional, tumne maanga hai) Telegram updates
Isse tool khole bina hi Telegram pe updates milengi — jab bhi naye email jaayein,
follow-up jaaye, ya koi reply kare, message aa jaayega. Aur bot ko `/status`
bhejo toh turant current numbers reply karega.

1. Telegram mein **@BotFather** ko message karo → `/newbot` → naam do → ek
   **token** milega (jaisa `123456:ABC-xyz...`)
2. Apna naya bot dhundo Telegram mein aur usse ek baar `/start` bhejo (isse
   tumhara chat "khul" jaata hai)
3. Browser mein kholo: `https://api.telegram.org/bot<TOKEN>/getUpdates`
   — response mein `"chat":{"id": 123456789 ...}` dikhega, ye number hi
   tumhara **chat ID** hai
4. Netlify env vars mein add karo:

   | Key | Value |
   |---|---|
   | `TELEGRAM_BOT_TOKEN` | Step 1 wala token |
   | `TELEGRAM_CHAT_ID` | Step 3 wala chat id |

5. Redeploy karo (Deploys → Trigger deploy)
6. `/status` command kaam kare iske liye Telegram ko batana padega ki updates
   kahan bhejni hain — browser mein ek baar ye URL kholo (apna token + site URL
   daal ke):
   ```
   https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://YOUR-SITE-NAME.netlify.app/.netlify/functions/telegram-webhook
   ```
   `{"ok":true,...}` dikhega — ho gaya. Ab bot ko kabhi bhi `/status` bhejo,
   turant reply aayega.

Bas — ab tool khole bina hi pata chalta rahega ki kitne mail gaye, follow-up
gaye, aur sabse important, **kisi ne reply kiya ya nahi** (reply ka channel
link aur reply ka actual text bhi message mein aayega).

Bot ab sirf status hi nahi deta — poora control bhi deta hai, Telegram se hi:
- 📎 **Koi bhi `.csv` file bhejo** — leads seedhe server queue mein add ho
  jaayengi (bilkul waisi hi jaisi dashboard ke "Push to Auto-Sender" se hoti
  hain). CSV mein `Name`, `Email`, `Handle`, `URL`, `Niche`, `Country` jaise
  column headers hone chahiye (dashboard jo CSV export/use karta hai wahi
  format).
- `/run` — turant ek cycle chalao (20 min wait nahi)
- `/pause` / `/resume` — automation rok/chalu karo
- `/accounts` — accounts + daily cap dekho
- `/setcap acc1 60` — kisi account ka daily cap badlo/ghatao
- `/setname`, `/setniche`, `/setaddress` — sender name / niche / business address update karo
- Poori list ke liye bot ko `/help` bhejo

### Step 8 — Test karo
Ek baar manually trigger karke dekh lo sab kaam kar raha hai (20 min wait nahi
karna padega):

```
https://YOUR-SITE-NAME.netlify.app/.netlify/functions/run-now
```

JSON response mein `sentCount`, `failCount`, `repliesChecked` dikhega. Dashboard
mein "Push to Auto-Sender" se pehle kuch leads queue mein daal ke ye test karo.

---

## Roz ka use
1. Dashboard mein leads laao (jaisa pehle karte the)
2. **"Push to Auto-Sender"** dabao — leads server queue mein chali jaayengi
3. Bas. Server har 20 min mein khud check karta rahega — bhejna, follow-up, reply-detect sab automatic
4. Din mein 1-2 baar dashboard khol ke **Automation Status** aur **Replied Leads** dekh lo

Pause karna ho toh Netlify env var `AUTOMATION_ENABLED=false` kar do +
redeploy — dashboard turant "PAUSED" dikha dega. `true` karke wapas on.

---

## 200 leads daalo toh kya sab ek saath chale jaayenge?
Nahi. Kaise chalta hai:
- Har cycle (har 20 min) mein max **18 emails** hi jaate hain — chahe queue mein 200 pending ho
- Us 18 ke andar bhi har email ke beech **4-12 second ka random gap** hota hai (na ki ek dam blast)
- Har account apna **daily cap** follow karta hai (Automation Settings mein set kiya tha)
- Accounts ke beech round-robin hota hai — jis account ne sabse kam bheja hai aaj, agla lead usi ko milta hai
- Follow-up gap default **2 din** hai — `/setgap 3` se Telegram se hi badal sakte ho

Toh 200 leads daaloge toh wo dheere-dheere, kai cycles aur (agar daily cap chhota hai to) kai
dinon mein bhejte hain — koi ek saath 200 mail nahi jaate, na hi sab accounts se exactly same
second pe kuch shuru hota hai.

## Important limits (dhyaan rakhna)
- **Gmail daily sending limit**: normal Gmail account ~500/day, Google Workspace
  account ~2000/day. Tumhare `dailyCap` per account isse zyada mat rakhna, warna
  Gmail account temporarily block ho sakta hai.
- Ye backend Netlify Blobs use karta hai storage ke liye (koi alag database ya
  GitHub repo setup nahi chahiye) — data Netlify pe hi persist hota hai, safe
  aur free.
- Reply-detection thread-based hai — follow-up emails automatically usi Gmail
  thread mein jaate hain jisse detect karna reliable rehta hai.
- Endpoints (`upload-leads`, `save-config` etc.) abhi kisi secret key se
  protected nahi hain — sirf URL ke "unguessable" hone pe depend karte hain.
  Agar URL kabhi leak ho, koi bhi tumhare queue mein leads push kar sakta hai.
  Chahiye toh future mein ek shared-secret header add karwa sakte ho.

## Files
```
netlify.toml              — scheduled function config (har 20 min)
netlify/functions/
  upload-leads.js          — dashboard "Push to Auto-Sender" isse baat karta hai
  save-config.js            — Automation Settings save
  status.js                  — dashboard "Automation Status"
  replied-leads.js          — dashboard "Replied Leads" tab
  connect-account.js         — Gmail App Password save (per account, one-time, permanent)
  process-queue.js           — MAIN LOGIC: sends + follow-ups + reply-check (scheduled, har 20 min)
  run-now.js                  — same logic, manually trigger karne ke liye (testing)
netlify/lib/
  store.js   — Netlify Blobs storage helpers
  gmail.js   — Gmail send / reply-check
  compose.js — email text (AI opener via Groq + fallback template)
```

# WhyVerse: setup (100% free, no credit card)

**The free stack:** Firebase **Spark** plan (sign-in, database, security rules) + **Vercel Hobby** (hosts the
website and runs the server code in `api/` and `functions/`) + **GitHub Actions** (the timer) + free API keys
(Gemini, Pexels; Wikipedia needs none). Nothing here asks for a card. When a free quota runs out the
service stops for the day instead of charging you.

**Know the limits before you start**
- Vercel Hobby is for **non-commercial** use only. A free, ad-free learning site is the intended kind, but read Vercel's terms.
- Free quotas change over time. Check each service's pricing page before launch, especially Firestore's daily reads/writes (Spark) and the Gemini free tier.
- Vercel's free plan limits one request to about a minute. Page writing is split into short steps for that reason.
- GitHub Actions timers can be a few minutes late, and GitHub switches off scheduled workflows after 60 days with no activity in the repository (re-enable them on the Actions tab).
- No managed Firestore backup (that needs the paid plan). A weekly job saves pages and categories to a downloadable file instead. It does not include accounts.

## 0. What you need installed
- Node.js 20 or newer, and npm
- Firebase CLI: `npm install -g firebase-tools` then `firebase login` (only used to deploy rules and indexes)
- A free GitHub account and a free Vercel account (sign in with GitHub)

## 1. Create the Firebase project (stay on Spark)
1. Firebase console > **Add project**. Note the **project ID**. **Do not upgrade the plan.**
2. **Build > Firestore Database > Create database**, location **asia-south1 (Mumbai)**, production mode.
3. **Build > Authentication > Get started**: enable **Email/Password** and **Google**. Under Settings > Authorized domains add your Vercel domain later.
4. Put your project ID in `.firebaserc`.
5. **Server key:** Project settings > Service accounts > **Generate new private key** (a JSON file). Turn it into one line of text:
   `base64 -w0 serviceAccountKey.json` (Mac: `base64 -i serviceAccountKey.json`). This is `FIREBASE_SERVICE_ACCOUNT_B64`. Keep the file and the text private and never commit them.

## 2. Get the free API keys
| Variable | Where to get it |
|---|---|
| `GEMINI_API_KEY` | https://aistudio.google.com/apikey. **Create the key in a project that has no billing attached**, so it stays on the free tier and can never be charged. |
| `PEXELS_API_KEY` | https://www.pexels.com/api/ (free account) |
| `ADMIN_CODE_PEPPER` | you invent it: `openssl rand -base64 32` |
| `RATE_LIMIT_SALT` | you invent it: `openssl rand -base64 32` |
| `CRON_SECRET` | you invent it: `openssl rand -base64 32` (the timer shows this to the server) |
| `FIREBASE_SERVICE_ACCOUNT_B64` | step 1.5 above |

Web search needs no key: WhyVerse searches Wikipedia, and checks copying against the wider web with Gemini's Google Search tool (inside Gemini's free allowance; when that runs out the check falls back to Wikipedia and our own pages and tells the reviewing admin).

## 3. Deploy rules and indexes (Firebase, free)
```
npm install
npm run deploy:rules
```
Indexes take a few minutes to build. The file also sets the automatic expiry (TTL) for `rateBuckets` and `history`.

## 4. Deploy the website + server code (Vercel, free)
1. Put this folder in a **private** GitHub repository (private + a 30-minute timer stays inside GitHub's 2,000 free minutes).
2. Vercel > **Add New > Project** > import the repository. Leave the settings as they are (`vercel.json` has them).
3. Project > Settings > **Environment Variables**: add every variable from the table above, plus the public web settings from step 5. Redeploy.
4. Add the Vercel domain (for example `whyverse.vercel.app`) to Firebase > Authentication > Settings > **Authorized domains**.

## 5. Connect the website to Firebase
Firebase console > Project settings > **Your apps** > add a **Web app** > copy the config. In Vercel add these (they are public identifiers, not secrets):
`VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID`, optional `VITE_CONTACT_EMAIL`.
**App Check (recommended before launch):** Firebase console > App Check > register the web app with **reCAPTCHA v3**, put the site key in `VITE_APPCHECK_SITE_KEY`, redeploy, then add `ENFORCE_APP_CHECK=1` on Vercel.

## 6. The free timer (GitHub Actions)
Repository > Settings > Secrets and variables > Actions: add `SITE_URL` (your Vercel address, no trailing slash), `CRON_SECRET` (same value as on Vercel) and `FIREBASE_SERVICE_ACCOUNT_B64` (for the weekly backup). The workflows in `.github/workflows/` then run by themselves: the page-writing queue every 30 minutes, topic planning at 06:00 IST (does nothing until auto mode is on), and a weekly content backup.

## 7. Seed settings and categories, then create the first admin
On your computer (needs the service-account key):
```
export FIREBASE_SERVICE_ACCOUNT_B64=...      # the same text as above
npm run seed
npm run admin:create -- you@example.com      # that account must already exist: sign up on the site first
ADMIN_CODE_PEPPER=... npm run admin:code     # asks for the 6-digit code at a hidden prompt; only a hash is saved
```
Being an admin account is not enough: the portal opens only after the server accepts the 6-digit code, which then unlocks it for 2 hours. 5 wrong codes lock the account for 15 minutes.

## 8. Tests
```
npm run test:unit      # server logic, no network needed
npm run test:rules     # Firestore rules; needs the Firestore emulator (downloads once)
cd web && npm test && npm run test:e2e
```

## Server functions
Each is a route `/api/<name>` (called by the site) or a timer job `/api/cron/<name>` (called by GitHub Actions).
| Function | Who calls it | What it does |
|---|---|---|
| `adminVerifyCode` / `adminEndSession` / `adminRotateCode` | admin account | 6-digit code check, 2-hour session, code change |
| `recordView`, `recordSearch`, `reportPage` | guests | Anonymous counters and reports (no identity stored) |
| `exportMyData`, `deleteMyAccount` | signed-in adults | Download or erase your data |
| `submitPage`, `reopenSubmission`, `requestAuthorAccess` | adult writers | Page submissions and checks |
| `admin*` | unlocked admin | Review, publish, settings, jobs, authors |
| `contentQueueRunner`, `contentAutoPlanner` (timer) | GitHub Actions | Write queued pages; plan new topics |

---

# Stage 3: the public website (`web/`)

Vite + vanilla JavaScript. Pages: Home, Library, page viewer (quiz, glossary, sources, report), How to use, Terms, Privacy, 404 and error pages.

## Preview with no backend (sample pages)
```
cd web && npm install && npm run dev:demo
```
Opens http://localhost:5173 with 5 built-in sample pages. Nothing is sent anywhere.

## Run it on your own computer
```
cd web && npm install && npm run dev         # website on http://localhost:5173
node scripts/dev-api.js                      # server routes on :3001 (needs the keys in your environment); the site proxies /api to it
```

## Notes
- Junior/Teen mode is kept only in the browser (localStorage). Every library query includes the visitor's age bands.
- Library search matches against the 60 newest pages in the visitor's mode (Firestore has no text search). Fine for now; a search index can come later.
- The How-to page also describes adult sign-in, writing pages and the chat helper, which arrive in later stages.
- This is plain-language copy, not legal advice: have an Indian data-protection lawyer review Terms and Privacy before launch.

## Stage 4 – Adult accounts, reading modes and parent lock

**Reading modes:** All ages (pages for everyone), Junior (Junior + All ages), Teen (Teen + All ages), Everything (signed-in adults).
Anyone may move to All ages. Moving between Junior and Teen needs a grown-up: a signed-in adult, or a parent PIN set on the device.

**Parent lock honest limits:** the PIN is scrambled (PBKDF2) and stored only in the browser. WhyVerse cannot verify age (no ID is collected). Clearing site data removes the PIN and resets to Junior. First visit shows a non-blocking hint to set a PIN; until then the site stays in Junior.

**New pages:** /sign-in, /welcome, /for-you, /my-reading, /my-pages, /notifications, /settings, /parent-lock. Signed-out guests never load Firebase Auth.

**Tests:** `cd web && node --test` (scoring) and `npm run test:e2e` (needs Playwright; set `PLAYWRIGHT_PATH` if not locally installed). The e2e test runs against the demo build.

**Not yet done:** email notifications (Stage 6, needs an email sender); the page writer (Stage 6); Firestore rules tests still need to be run locally with `npm run test:rules`.

## Stage 5 – Content engine (AI writes pages)

**What runs (all server-side, region asia-south1):**
- `contentQueueRunner` – every 10 minutes. Takes up to 3 queued jobs: research (Wikipedia) → write (Gemini) → safety check → fact check → reading-level and copy check → image (Pexels) → save.
- `contentAutoPlanner` – daily 06:00 IST. Does nothing until an admin sets `settings/main` → `automation.enabled = true`. Then it queues `pagesPerRun` new topics (default 1), choosing the category with the fewest pages. `schedule: "weekly"` runs on Mondays only.

**Secrets needed:** `GEMINI_API_KEY`, `PEXELS_API_KEY` (already in Stage 2 list). Wikipedia needs no key.

**What happens to a page:**
| Result | Page status | Who sees it |
|---|---|---|
| Every check clean | `published` | Everyone, immediately |
| Anything doubtful (unsupported claim, safety unsure, check could not run, hard reading level, too close to a source's wording, possible personal info) | `ready` | Admins only, in the Review Queue (Stage 7); admins get a bell alert |
| Safety check clearly says unsuitable | `rejected` | Nobody |
The safety check fails closed: if Gemini is down the page waits for a person, it is never published.

**Queue a topic by hand (until the admin portal exists):**
`node scripts/enqueue-topic.js "Why does it rain?" nature all` (categories: space, animals, nature, science, technology, history, india, body, maths, art, sports, food; bands: junior, teen, all).

**Limits:** `maxPagesPerDay` (default 6), search calls and tokens per day. When one is reached the queue pauses (jobs stay queued) and admins are alerted. A job is retried up to 3 times, then marked `failed` with an alert.

**Sources and licence:** Wikipedia text is CC BY-SA. Pages are written in the AI's own words (copy check rejects runs of 8+ identical words above 15%) and always list their sources with links. Photos from Pexels are credited on the page.

**Honest limits:** AI fact checking compares the page to the sources it read; it can miss errors, and Wikipedia itself can be wrong. That is why anything doubtful goes to a person and why auto mode starts OFF. Suggest switching it on only after you have reviewed the first 10–20 pages.

**Tests:** `cd functions && node --test` (33 pass, including the full pipeline with fake services). The live Gemini, Wikipedia and Pexels calls have not been exercised from here (no keys, restricted network); test with one queued topic after deploying.

## Stage 6 – Adult page submissions

**Flow:** an adult (18+, verified email) opens **Write a page** (`/write`), saves drafts (private, only the author can read them), then presses **Send for review**. The `submitPage` function:
1. Re-cleans the text on the server (text only, no HTML) and checks length (150 to 1,500 words), category and audience.
2. **Refuses pages that contain personal details or links** (emails, phone numbers, ID numbers, addresses, web links, "my name is…"). The author is told what kind, never shown the data back.
3. Applies limits: 2 pages a day, 10 waiting at once (editable in `settings/main.submissions`). The daily count is reserved atomically, so parallel clicks cannot bypass it.
4. Runs the safety check for the chosen audience, a copy check (against Wikipedia on the same subject and pages already on WhyVerse), and a fact check against those Wikipedia sources.
5. Saves the result in `userSubmissions`:
   - `rejected` – clearly unsuitable, or more than half copied. The author sees why. Three rejections in a row block the account from submitting; admins get an alert.
   - `submitted` – everything else. **Nothing an adult writes is ever published automatically**; an admin reads every page (Stage 7). The automatic results appear as flags for the admin.

Authors can press **Edit again** while a page is waiting or needs changes; it returns to a draft (`reopenSubmission`).

**Notifications** are in-app only (the bell). **Email notifications are not built:** sending email needs a sender such as the Firebase "Trigger Email" extension or an SMTP/transactional-email account, which you have not chosen. The `notifyEmail` field is saved but unused.

**Honest limits:** the copy check only compares with Wikipedia and WhyVerse pages, not the whole web. The safety and fact checks are AI and can be wrong, which is why a person approves every page.

**Tests:** `cd functions && node --test` (42 pass). Browser test (`npm run test:e2e` in `web/`) now also covers writing, refusal of a short page, sending, and Edit again (demo mode, so it does not exercise the real server checks). The `submitPage` function itself has not run against Firestore from here; try one submission after deploying.


## Stage 7 – Admin portal (`/authority`)

Sign in with your admin account (made in step 7 above), open `/authority`, and type your 6-digit code. The portal stays open for the number of hours in settings, then locks. "Lock now" closes it straight away. Anyone who is not an admin sees only "Not available".

| Screen | What you do there |
|---|---|
| Overview | Counts of what needs you, today's usage against the daily limits, whether automatic pages are on. |
| Review | AI pages that were not 100% clean. Read, change the audience, Publish or Reject. |
| Written by adults | Pages from adult writers with the safety, copying (Wikipedia, our pages, the web) and fact-check results. Approve (and choose the audience), Ask for changes, or Reject. Changes and Reject need a comment. |
| Create AI page | Type a topic, category and audience. Same checks as the automatic pages. It always waits in Review for you. "Write it now" takes about a minute; if it is not done by then the 30-minute timer finishes it. |
| Reports | Dismiss, or take the page down. |
| Jobs | Retry a failed job or cancel a queued one. |
| Pages | Feature, unpublish, publish again. |
| Writers | Approve or turn off writers. Shows rejections in a row. |
| Settings | Automatic pages on/off, how often, daily limits, writer limits, web copy check, blocked words and websites, maintenance mode, and change your code. |
| Activity / Alerts | A log of every admin action, and new-item alerts. |

Reading uses Firestore (allowed only for an unlocked admin). Every change goes through a server function that checks the live session again, so an expired session shows the code screen instead of failing quietly.

**Try it with no backend:** `npm run dev:demo`, sign up as `admin@whyverse.demo`, open `/authority`, code `123456`. Demo data only.

### Reading modes and 18+
There is no 18+ category and no 18+ page. The bands are Junior, Teen and Everyone. "Everything" mode (for verified adults) only shows all three together.


## Stage 8 – Why Bot (chat)

Page: `/ask`. Server function: `chat` (`functions/src/chat/`). No new keys: it uses the same free Gemini key.

- Guests and children can use it with no sign-in. **Nothing is saved**: the chat lives in the browser tab and the last 8 messages are sent with each question.
- Answers follow the device's reading mode: Junior or All ages use the Junior rules, Teen and Everything use the Teen rules. Chat never goes beyond Teen.
- Safety, in order: length limits; personal-information check (email, phone, address, ID numbers, "my name is…"); blocked-topic list; a strict system prompt and Gemini's own safety filter; then the blocked-topic list, personal-info check and the same safety classifier used for pages on the answer. If anything fails, a fixed safe message is shown (it fails closed).
- Limits: 30 questions an hour for a guest, 120 for a signed-in adult (Settings in `settings/main` → `chat`), plus the daily AI-token limit shared with page writing. Admin can switch chat off with `chat.enabled`.
- It suggests up to 3 WhyVerse pages whose titles match the question.

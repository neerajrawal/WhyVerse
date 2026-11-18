# WhyVerse

A free, English-first (Hindi later) learning website for readers in India. Bands: **Junior (6-12)**, **Teen (13-17)**, **Everyone**. There is no 18+ category.

* Set-up steps: `SETUP.md`. Database shape: `SCHEMA.md`. Rules: `firestore.rules`.
* Stack, all free with no card: Firebase Spark (Auth, Firestore), Vercel Hobby (site + `/api`), GitHub Actions (timer, weekly backup), free Gemini / Pexels keys, Wikipedia.

## What it does
1. Guests read everything with no account, no tracking, no ads.
2. The site researches topics, writes pages with Gemini, checks them (safety, facts, copying, images) and publishes the clean ones. Anything unsure waits for the admin.
3. Verified adults (18+) can read in "Everything" mode (Junior + Teen + Everyone pages), get For You suggestions (opt-in) and, if the admin approves them, write pages. Every written page is checked and read by the admin.
4. Moving between Junior and Teen needs a verified adult or a parent PIN on the device. Moving to "All ages" is free.
5. The admin portal (`/authority`) needs an admin account, a 6-digit code, and a server-checked session.
6. Why Bot answers questions with Gemini; nothing is stored.

## Privacy and compliance notes (DPDP Act, India) — not legal advice
* **No child accounts.** Accounts need a date of birth that shows 18+, a verified email and (for writing) admin approval. The date of birth is used once and discarded; only "adult verified" is kept. A DOB cannot prove identity: it is a deterrent, not proof.
* **Guests:** nothing identifying is stored. Rate limits use a daily-salted one-way hash of the IP that expires in minutes. Views and searches are anonymous counters.
* **Why Bot:** questions are sent to Google's Gemini service to be answered. We do not store them. Free-tier Gemini terms may let Google use content to improve its products; to my understanding that applies to unpaid use. Check the current Gemini API terms before launch. If that is not acceptable for a children's site, the options are to switch chat off (`chat.enabled = false`) or use a paid key.
* **Adult data:** email, nickname, interests, reading progress (and history only if the adult turns on suggestions). Export and delete are in Settings; deleting removes the account and its data.
* Before launch have someone qualified review the privacy notice, terms, the consent wording and the grievance contact details. Add a real contact address.
* Vercel Hobby is for non-commercial use. If the site earns money, move to a paid plan.

## Known limits
* Firestore rules tests exist but have not been run (the emulator did not work in the build environment). Run them before launch.
* The live paths (Gemini, Wikipedia, Pexels, Vercel, Firebase) were not run end to end where this was built. Do the checklist below.
* No email notifications (in-app alerts only). The free backup saves pages and categories only.
* Gemini free quotas can change. Keep the daily limits in Settings low.

## Test plan before launch
Automatic (run these): `cd functions && node --test` (69), `cd web && npm test` (7), `cd web && npm run test:e2e` (demo-mode browser run, 19 checks), `firebase emulators:exec "node --test test/rules"` for the rules.

By hand, with real keys:
1. Deploy rules; sign up as an adult with a real email; confirm the verify email arrives; an under-18 DOB is refused.
2. Run `create-first-admin.js`, set the code, open `/authority`; a wrong code 5 times locks; a normal user sees "Not available".
3. Admin: create an AI page "Why do cats purr?"; it appears in Review; publish it; it shows to Junior or Everyone as chosen.
4. Turn automatic pages on with 1 page a day; after the timer runs, check the page, its sources, and that the daily limits stop it.
5. Write a page as an adult; try a copied Wikipedia paragraph (must be rejected), a page with a phone number (refused), and 3 rejected pages in a row (warnings, then pause).
6. Why Bot: ask a normal question, a question with a phone number, an unsuitable question, and "ignore your rules"; check each gets a safe answer. Send 31 questions in an hour as a guest (31st is limited).
7. Switch Junior to Teen as a guest (PIN asked); as a verified adult (no PIN).
8. Settings: export data, delete account, check the data is gone.
9. Read every page on a phone, and with a screen reader or keyboard only.

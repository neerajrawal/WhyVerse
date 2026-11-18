# WhyVerse Firestore schema

Conventions: `ts` = Firestore Timestamp. Client = browser. Fn = Cloud Function (Admin SDK).
No collection stores any identifier of a guest or child. "Day" = IST calendar day (YYYY-MM-DD).

| Collection | Document fields | Client read | Client write | Written by |
|---|---|---|---|---|
| `pages/{pageId}` | slug, title, summary, ageBand (`junior`/`teen`/`all`), category, tags[], status (`queued`,`researching`,`writing`,`reviewing`,`ready`,`published`,`paused`,`failed`,`rejected`,`unpublished`,`scheduled`), body (blocks[]), keyFacts[], didYouKnow[], glossary[{term,meaning}], quiz[{q,options[],answer,why}], images[{url,thumb,alt,credit,creditUrl,licence,provider}], sources[{title,url}], readingMinutes, source (`ai`/`user`), authorUid, authorName, featured, viewCount, publishedAt, scheduledFor, createdAt, updatedAt, version | published only (any signed-in or not) | none | Fn |
| `pages/{id}/private/{doc}` | safety report, raw source excerpts, fact-check flags | admin | none | Fn |
| `categories/{id}` | name, emoji, order | all | none | seed / Fn |
| `settings/main` | limits, submissions, safety, sources, llm, automation, chat, accessCode | admin | none | seed / Fn |
| `settings/public` | siteName, bands, submissionsOpen, maintenance | all | none | seed / Fn |
| `users/{uid}` | displayName, interests[], personalisation, notifyEmail, ageConfirmed, privacyAcceptedAt, privacyVersion, createdAt, updatedAt; **server-only:** adultVerifiedAt, adultMethod (`dob+email`; the date of birth itself is never stored), ageCheckLockedUntil (30 days after an under-18 answer), authorStatus (`none`/`requested`/`approved`/`declined`/`blocked`), authorNote, submitBlockedUntil, banned, rejectionStreak, submissionsToday, lastSubmissionDay | owner | owner (allowed fields only, no delete) | client + Fn |
| `users/{uid}/history/{id}` | type (`search`/`open`/`finish`), term, pageId, category, at, expireAt | owner | owner create/delete, only while `personalisation` is on | client |
| `readingProgress/{uid}/pages/{pageId}` | progress 0-100, state, saved, title, slug, updatedAt | owner | owner | client |
| `userDrafts/{uid}/drafts/{id}` | title, category, ageBand, body (markdown-lite text), updatedAt | owner | owner | client |
| `userSubmissions/{id}` | authorUid, authorName, title, category, ageBand, bodyBlocks, status (`submitted`,`in_review`,`changes_requested`,`published`,`rejected`), safetyReport, plagiarism, factCheck, adminComment, pageId, createdAt, updatedAt | author, admin | none | Fn |
| `notifications/{id}` | recipientUid *or* audience=`admin`, type, title, body, link, read, createdAt | recipient / admin | recipient may set `read` only | Fn |
| `chats/{uid}/threads/{id}` | messages[], updatedAt (adults who opted in only) | owner | owner delete | Fn |
| `jobs/{jobId}` | type, status, step, progress, params{category,keyword,band}, pageId, attempts, error, usage{tokens,searches}, createdAt, updatedAt | admin | none | Fn |
| `jobLogs/{id}` | jobId, step, level, message, data, ts | admin | none | Fn |
| `moderationReports/{id}` | pageId/submissionId, band, verdict, categories, reasons, ts | admin | none | Fn |
| `reports/{id}` | pageId, pageTitle, reason, status, createdAt (no reporter identity, no free text) | admin | none | Fn |
| `pageVersions/{id}` | pageId, version, snapshot, editedBy, note, ts | admin | none | Fn |
| `usage/{day}` | pages, searchCalls, llmTokens, llmCalls, imageCalls | admin | none | Fn |
| `stats/{day}` | views, byCategory{}, byBand{} (anonymous totals) | admin | none | Fn |
| `searchStats/{term}` | term, count, lastDay (aggregate only) | admin | none | Fn |
| `activityLog/{id}` | ts, actorUid, actorLabel, action, target, meta | admin | none | Fn |
| `adminSessions/{uid}` | failures, lockedUntil, lastAttemptAt, lastSuccessAt | none | none | Fn |
| `adminSecrets/accessCode` | salt, hash, algo, rotatedAt | **nobody** | none | script / Fn |
| `rateBuckets/{hash}` | count, expiresAt (TTL) | **nobody** | none | Fn |

Notes
- "Admin" in the table means: permanent `admin` claim AND an unexpired `adminUntil` claim (live 6-digit-code session).
- The Junior/Teen mode is stored only on the visitor's device. Rules guarantee only published pages are
  readable; the site adds `where('ageBand','in', ...)` to every query to apply the visitor's mode.
- `userDrafts` and the other per-user collections use `collection/{uid}/subcollection/{id}` because Firestore
  paths must alternate collection/document.
- Page body is stored as blocks (`{type:'h2'|'h3'|'p', text}` / `{type:'ul'|'ol', items[]}`), never HTML.


## Added in Stages 5-7

| Path | Notes |
|---|---|
| `jobs/{id}/work/state` | Draft parked by the content pipeline when a page cannot be finished inside one request. The 30-minute timer picks the job up with `stage: 'check'`. Deleted when the job ends. |
| `settings/public.authorApprovalRequired` | Copy of `settings/main.submissions.requireAuthorApproval` so the Write page can show the right screen. Set by `adminUpdateSettings`. |
| `settings/public.submissionsOpen`, `.maintenance` | Site flags an admin can switch in the portal. |
| `reports/{id}` | pageId, pageTitle, reason, status `open`/`dismissed`/`actioned`. No reporter identity. |
| `pageVersions/{id}` | The earlier version of a page, kept every time an admin edits one. |

### Warnings for repeated rejections
`rejectionStreak` counts rejected pages in a row (an approval resets it). The ladder lives in `functions/src/submissions/strikes.js`: notice, warning, final warning (writing paused for some hours), suspended, then `authorStatus: 'blocked'`. An admin can reset it with "Allow again".

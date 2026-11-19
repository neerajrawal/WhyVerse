// "For You" ranking. A plain, documented scoring formula (no machine learning, nothing leaves the browser).
//
// For every published page P the score is the sum of:
//
//   +5            P's topic is one of the reader's chosen interests
//   +0..6         topic affinity: the reader's recent pages in that topic (only if personalisation is ON).
//                 An opened page counts 1, a finished page counts 2, each halves every 14 days
//   +0..3         recent searches (last 30 days, personalisation ON): +1 for each search whose words
//                 all appear in P's title, summary or tags (max 3)
//   +0..2         freshness: 2 x 0.5^(age in days / 30)
//   +0..1.5       popularity: log10(1 + views) / 2, capped
//   -100          reader already finished P (it lives in My Reading > Finished)
//   -3            reader is part-way through P (it lives in Currently Reading)
//
// Highest score first. Each result carries plain-language reasons shown to the reader.

const DAY = 86400000;

const words = (s) => String(s || '').toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 1);

export function scorePages({ pages, interests = [], history = [], progress = [], categoryNames = {}, now = Date.now() }) {
  const finished = new Set(progress.filter((p) => p.state === 'finished').map((p) => p.pageId));
  const reading = new Set(progress.filter((p) => p.state === 'reading').map((p) => p.pageId));

  const affinity = {};
  const searches = [];
  for (const ev of history) {
    const at = ev.at instanceof Date ? ev.at.getTime() : new Date(ev.at).getTime();
    if (!Number.isFinite(at)) continue;
    const ageDays = Math.max(0, (now - at) / DAY);
    if ((ev.type === 'open' || ev.type === 'finish') && ev.category) {
      const w = (ev.type === 'finish' ? 2 : 1) * 0.5 ** (ageDays / 14);
      affinity[ev.category] = (affinity[ev.category] || 0) + w;
    } else if (ev.type === 'search' && ev.term && ageDays <= 30) {
      searches.push({ term: ev.term, words: words(ev.term) });
    }
  }

  const out = pages.map((page) => {
    let score = 0;
    const reasons = [];
    const catName = categoryNames[page.category] || page.category;

    if (interests.includes(page.category)) { score += 5; reasons.push(`You like ${catName}`); }

    const aff = Math.min(6, affinity[page.category] || 0);
    if (aff > 0) { score += aff; if (aff >= 1.5) reasons.push(`You read about ${catName}`); }

    const hay = new Set(words(`${page.title} ${page.summary} ${page.tags.join(' ')}`));
    const matched = searches.filter((s) => s.words.length && s.words.every((w) => hay.has(w))).slice(0, 3);
    if (matched.length) { score += matched.length; reasons.push(`You searched for “${matched[0].term}”`); }

    const ageDays = page.publishedAt ? Math.max(0, (now - page.publishedAt.getTime()) / DAY) : 365;
    const fresh = 2 * 0.5 ** (ageDays / 30);
    score += fresh;
    if (fresh >= 1) reasons.push('New');

    const pop = Math.min(1.5, Math.log10(1 + (page.viewCount || 0)) / 2);
    score += pop;
    if (pop >= 1.1) reasons.push('Popular');

    if (finished.has(page.id)) score -= 100;
    else if (reading.has(page.id)) score -= 3;

    return { page, score, reasons: reasons.slice(0, 2) };
  });

  return out.sort((a, b) => b.score - a.score || (b.page.publishedAt || 0) - (a.page.publishedAt || 0));
}

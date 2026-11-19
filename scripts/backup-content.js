'use strict';
/** Writes backup.json with all pages and categories (public content only). Run by .github/workflows/backup.yml. */
const fs = require('fs');
const { db } = require('../functions/src/lib/firebase');

(async () => {
  const out = { exportedAt: new Date().toISOString(), pages: [], categories: [] };
  for (const name of ['pages', 'categories']) {
    const snap = await db.collection(name).get();
    out[name] = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  }
  fs.writeFileSync('backup.json', JSON.stringify(out));
  console.log(`Backed up ${out.pages.length} pages, ${out.categories.length} categories`);
})().catch((e) => { console.error(e.message); process.exit(1); });

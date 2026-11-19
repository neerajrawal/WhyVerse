// Browser smoke test in demo mode. Run: npm run build:demo -- --outDir dist-demo && node test/e2e.mjs
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_PATH || 'playwright');
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';

const PORT = 4179;
const srv = spawn('npx', ['vite', 'preview', '--outDir', 'dist-demo', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 3000));
const base = `http://localhost:${PORT}`;
const browser = await chromium.launch();
const results = [];
const check = async (name, fn) => { try { await fn(); results.push(['ok', name]); } catch (e) { results.push(['FAIL', name, e.message.split('\n').slice(0, 3).join(' | ') + (process.env.E2E_STACK ? ' @ ' + (e.stack.split('\n').find((l) => l.includes('e2e.mjs')) || '') : '')]); } };

try {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(base);

  await check('starts in Junior, first-visit parent hint shown', async () => {
    assert.ok(await page.locator('.cookie-notice a[href="/parent-lock"]').count());
    assert.equal(await page.locator('#site-header .mode-toggle input:checked').getAttribute('value'), 'junior');
  });
  await check('four-way toggle for guests: all, junior, teen', async () => {
    const vals = await page.locator('#site-header .mode-toggle input').evaluateAll((els) => els.map((e) => e.value));
    assert.deepEqual(vals, ['all', 'junior', 'teen']);
  });
  await check('switching to All ages is free', async () => {
    await page.locator('#site-header .mode-toggle label', { hasText: /all/i }).first().click();
    assert.equal(await page.locator('#site-header .mode-toggle input:checked').getAttribute('value'), 'all');
  });
  await check('Junior -> Teen asks a grown-up; cancel keeps the mode', async () => {
    await page.locator('#site-header .mode-toggle label', { hasText: /junior/i }).first().click();
    await page.locator('#site-header .mode-toggle label', { hasText: /teen/i }).first().click();
    await page.locator('dialog[open]').waitFor();
    await page.locator('dialog[open] button', { hasText: /cancel/i }).click();
    assert.equal(await page.locator('#site-header .mode-toggle input:checked').getAttribute('value'), 'junior');
  });
  await check('setting a PIN allows Teen; wrong PIN is refused later', async () => {
    await page.locator('#site-header .mode-toggle label', { hasText: /teen/i }).first().click();
    const d = page.locator('dialog[open]');
    await d.locator('#gu-adult').check();
    await d.locator('#gu-pin').fill('4821');
    await d.locator('#gu-pin2').fill('4821');
    await d.locator('button[type=submit]').click();
    await page.waitForFunction(() => document.querySelector('#site-header .mode-toggle input:checked')?.value === 'teen');
    await page.locator('#site-header .mode-toggle label', { hasText: /junior/i }).first().click();
    const d2 = page.locator('dialog[open]');
    await d2.locator('#gu-pin').fill('0000');
    await d2.locator('button[type=submit]').click();
    await page.waitForTimeout(800);
    assert.equal(await d2.count(), 1); // still asking: wrong PIN refused
    assert.match(await d2.locator('.report-status').textContent(), /\S/);
    await d2.locator('#gu-pin').fill('4821');
    await d2.locator('button[type=submit]').click();
    await page.waitForFunction(() => document.querySelector('#site-header .mode-toggle input:checked')?.value === 'junior');
  });
  await check('Why Bot: page loads, a question gets an answer, new chat clears it', async () => {
    await page.goto(`${base}/ask`);
    await page.locator('h1', { hasText: 'Ask Why Bot' }).waitFor();
    await page.fill('#chat-q', 'Why is the sky blue?');
    await page.getByRole('button', { name: 'Ask', exact: true }).click();
    await page.locator('.chat-bot').waitFor();
    assert.equal(await page.locator('.chat-user').count(), 1);
    await page.getByRole('button', { name: 'Start a new chat' }).click();
    assert.equal(await page.locator('.chat-msg').count(), 0);
  });
  await check('guest cannot open /for-you (goes to sign-in)', async () => {
    await page.goto(`${base}/for-you`);
    await page.waitForURL(/sign-in/);
  });
  await check('under-18 date of birth is turned away; account is removed', async () => {
    await page.getByRole('button', { name: /make a new account/i }).click();
    await page.fill('#si-email', 'kid@example.com');
    await page.fill('#si-pw', 'password123');
    await page.getByRole('button', { name: /create my account/i }).click();
    await page.waitForURL(/welcome/);
    await page.fill('#w-name', 'Kiddo');
    await page.locator('#w-priv').check();
    await page.getByRole('button', { name: /finish setting up/i }).click();
    assert.match(page.url(), /welcome/); // no date of birth: the browser blocks the form
    await page.fill('#w-dob', '2015-03-04');
    await page.getByRole('button', { name: /finish setting up/i }).click();
    await page.waitForURL(`${base}/`);
    assert.ok(await page.getByRole('link', { name: /adults: sign in/i }).count());
  });
  await check('sign up as an adult (date of birth), then For You', async () => {
    await page.goto(`${base}/sign-in`);
    await page.getByRole('button', { name: /make a new account/i }).click();
    await page.fill('#si-email', 'grownup@example.com');
    await page.fill('#si-pw', 'password123');
    await page.getByRole('button', { name: /create my account/i }).click();
    await page.waitForURL(/welcome/);
    await page.fill('#w-name', 'Asha');
    await page.locator('#w-priv').check();
    await page.fill('#w-dob', '1990-05-05');
    await page.getByRole('button', { name: /finish setting up/i }).click();
    await page.waitForURL(/for-you/);
    assert.ok(await page.locator('h1', { hasText: 'For You' }).count());
  });
  await check('signed-in adult switches Junior<->Teen without a PIN', async () => {
    await page.locator('#site-header .mode-toggle label', { hasText: /teen/i }).first().click();
    await page.waitForTimeout(300);
    assert.equal(await page.locator('dialog[open]').count(), 0);
    assert.equal(await page.locator('#site-header .mode-toggle input:checked').getAttribute('value'), 'teen');
  });
  await check('My Reading, My Pages, Notifications, Settings load', async () => {
    for (const [path, h1] of [['/my-reading', 'My Reading'], ['/my-pages', 'My Pages'], ['/notifications', 'Notifications'], ['/settings', 'Settings'], ['/parent-lock', 'Parent lock']]) {
      await page.goto(base + path);
      await page.locator('h1', { hasText: h1 }).waitFor({ timeout: 5000 });
    }
  });
  await check('write a page: save draft, short page is refused, long page is sent, edit again', async () => {
    await page.goto(`${base}/write`);
    await page.locator('h1', { hasText: 'Become a writer' }).waitFor();
    await page.fill('#au-note', 'I want to explain weather to children.');
    await page.getByRole('button', { name: /ask to become a writer/i }).click();
    await page.locator('#wr-title').waitFor();
    await page.fill('#wr-title', 'How monsoon winds work');
    await page.fill('#wr-body', 'Too short.');
    await page.getByRole('button', { name: 'Send for review' }).click();
    await page.locator('.form-status', { hasText: /at least 150/ }).waitFor();
    const long = Array.from({ length: 12 }, () => 'The monsoon is a seasonal wind that brings heavy rain to India every summer and farmers wait for it with hope.').join(' ');
    await page.fill('#wr-body', `${long}\n\n## Why it happens\n\n${long}`);
    await page.getByRole('button', { name: 'Preview' }).click();
    await page.locator('.preview-pane h2', { hasText: 'Why it happens' }).waitFor();
    await page.getByRole('button', { name: 'Save draft' }).click();
    await page.goto(`${base}/my-pages`);
    assert.ok(await page.getByText('How monsoon winds work').count());
    await page.getByRole('link', { name: 'Continue' }).click();
    await page.locator('#wr-title').waitFor();
    assert.equal(await page.inputValue('#wr-title'), 'How monsoon winds work');
    await page.getByRole('button', { name: 'Send for review' }).click();
    await page.waitForURL(/my-pages/);
    await page.getByText('Waiting for review').waitFor();
    await page.getByRole('button', { name: 'Edit again' }).click();
    await page.waitForURL(/write\?draft=/);
    assert.equal(await page.inputValue('#wr-title'), 'How monsoon winds work');
  });
  await check('settings: export downloads JSON', async () => {
    await page.goto(`${base}/settings`);
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /download my data/i }).click()]);
    assert.equal(dl.suggestedFilename(), 'whyverse-my-data.json');
  });
  await check('settings: delete needs DELETE, then account is gone', async () => {
    await page.fill('#s-delpw', 'password123');
    await page.fill('#s-del', 'nope');
    await page.getByRole('button', { name: /delete my account/i }).click();
    assert.ok(await page.locator('.form-status', { hasText: /type DELETE/i }).count());
    await page.fill('#s-del', 'DELETE');
    await page.getByRole('button', { name: /delete my account/i }).click();
    await page.waitForURL(`${base}/`);
    assert.ok(await page.getByRole('link', { name: /adults: sign in/i }).count());
  });
  // ---- admin portal (separate browser profile)
  const actx = await browser.newContext();
  const ap = await actx.newPage();
  const aerrors = [];
  ap.on('pageerror', (e) => aerrors.push(e.message));
  await check('admin: a guest sees a sign-in prompt, not the portal', async () => {
    await ap.goto(`${base}/authority`);
    await ap.locator('.narrow a.btn', { hasText: 'Sign in' }).waitFor();
    assert.equal(await ap.locator('.tab-row').count(), 0);
  });
  await check('admin: a normal adult sees "Not available"', async () => {
    await ap.goto(`${base}/sign-in`);
    await ap.getByRole('button', { name: /make a new account/i }).click();
    await ap.fill('#si-email', 'reader@example.com');
    await ap.fill('#si-pw', 'password123');
    await ap.getByRole('button', { name: /create my account/i }).click();
    await ap.waitForURL(/welcome/);
    await ap.fill('#w-name', 'Reader'); await ap.locator('#w-priv').check(); await ap.fill('#w-dob', '1985-01-01');
    await ap.getByRole('button', { name: /finish setting up/i }).click();
    await ap.waitForURL(/for-you/);
    await ap.goto(`${base}/authority`);
    await ap.locator('h1', { hasText: 'Not available' }).waitFor();
    await ap.getByRole('button', { name: /sign out/i }).click().catch(() => {});
  });
  await check('admin: wrong code is refused, right code opens the portal', async () => {
    const c2 = await browser.newContext(); const p2 = await c2.newPage();
    p2.on('pageerror', (e) => aerrors.push(e.message));
    await p2.goto(`${base}/sign-in`);
    await p2.getByRole('button', { name: /make a new account/i }).click();
    await p2.fill('#si-email', 'admin@whyverse.demo'); await p2.fill('#si-pw', 'password123');
    await p2.getByRole('button', { name: /create my account/i }).click();
    await p2.waitForURL(/welcome/);
    await p2.fill('#w-name', 'Boss'); await p2.locator('#w-priv').check(); await p2.fill('#w-dob', '1980-01-01');
    await p2.getByRole('button', { name: /finish setting up/i }).click();
    await p2.waitForURL(/for-you/);
    await p2.goto(`${base}/authority`);
    await p2.fill('#ac-code', '000000'); await p2.getByRole('button', { name: 'Unlock' }).click();
    await p2.locator('.form-status', { hasText: /not right/ }).waitFor();
    await p2.fill('#ac-code', '123456'); await p2.getByRole('button', { name: 'Unlock' }).click();
    await p2.locator('h1', { hasText: 'Admin portal' }).waitFor();
    assert.ok(await p2.locator('.admin-tile').count() >= 6);

    // AI page from the admin: created, then waits in Review, then published
    await p2.getByRole('link', { name: 'Create AI page' }).click();
    await p2.fill('#ai-topic', 'Why do cats purr?');
    await p2.getByRole('button', { name: 'Create the page' }).click();
    await p2.locator('.form-status', { hasText: /Look in Review/ }).waitFor();
    await p2.getByRole('link', { name: 'Review', exact: true }).click();
    await p2.getByText('Why do cats purr?').waitFor();
    await p2.getByRole('button', { name: 'Publish', exact: true }).first().click();
    await p2.getByText('Published.').waitFor();

    // adult page: approve; writer request: approve
    await p2.getByRole('link', { name: 'Written by adults' }).click();
    await p2.getByText('How rainbows form').waitFor();
    await p2.getByRole('button', { name: 'Reject' }).click();
    await p2.getByText(/short comment/).waitFor();
    await p2.getByRole('button', { name: /Approve and publish/ }).click();
    await p2.getByText('No pages are waiting.').waitFor();
    await p2.getByRole('link', { name: 'Writers' }).click();
    await p2.getByRole('button', { name: 'Approve', exact: true }).click();
    await p2.getByText('Turn writing off').first().waitFor();
    await p2.getByRole('link', { name: 'Settings' }).click();
    await p2.locator('#st-ppr').fill('3');
    await p2.getByRole('button', { name: 'Save settings' }).click();
    await p2.getByText('Settings saved.').waitFor();
    await p2.getByRole('link', { name: 'Activity' }).click();
    await p2.getByText('page.publish').first().waitFor();
    await p2.getByRole('button', { name: 'Lock now' }).click();
    await p2.fill('#ac-code', '123456');
    await c2.close();
  });
  await check('admin: no uncaught errors', async () => assert.deepEqual(aerrors, []));
  await check('no uncaught page errors', async () => assert.deepEqual(errors, []));
} finally {
  await browser.close();
  srv.kill();
}
for (const r of results) console.log(r.join('  '));
process.exit(results.some((r) => r[0] === 'FAIL') ? 1 : 0);

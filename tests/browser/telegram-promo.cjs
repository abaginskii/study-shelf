/* Synthetic local browser checks. Never follows the external Telegram link. */
const assert = require('node:assert/strict');
const { mkdirSync } = require('node:fs');
const { join } = require('node:path');

async function verifyTelegramPromo(browser, base, screenshots) {
  assert(['localhost', '127.0.0.1'].includes(new URL(base).hostname), 'Promo verification only runs against loopback fixtures');
  mkdirSync(screenshots, { recursive: true });
  const key = 'polka.community.telegram.v1';
  const selector = '[data-telegram-promo]';
  const errors = [];
  let passed = 0;
  const check = label => { passed++; console.log(`PASS Telegram: ${label}`); };

  async function context(username, width = 1440) {
    const ctx = await browser.newContext({ viewport: { width, height: width < 500 ? 844 : 1000 }, reducedMotion: 'reduce', serviceWorkers: 'block' });
    if (username) {
      const response = await ctx.request.post(`${base}/api/auth`, { data: { action: 'login', username, password: 'polka-design-test-only-2026' } });
      assert.equal(response.status(), 200, 'Local synthetic account must exist');
      const cookies = await ctx.cookies();
      await ctx.addCookies(cookies.map(cookie => ({ ...cookie, secure: false })));
    }
    const page = await ctx.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.clock.install();
    await page.clock.pauseAt(new Date());
    return { ctx, page };
  }
  async function load(page, path = '/') {
    await page.goto(new URL(path, base).href);
    await page.locator(path === '/' ? '[data-polka-landing], [data-workspace-dashboard]' : 'main').first().waitFor();
  }
  async function show(page) {
    await page.clock.fastForward(12_000);
    await page.locator(selector).waitFor({ state: 'visible' });
  }

  for (const username of [undefined, 'student', 'artem']) {
    const { ctx, page } = await context(username);
    try {
      await load(page);
      const focusBefore = await page.evaluate(() => document.activeElement?.tagName);
      await page.clock.fastForward(11_999);
      assert.equal(await page.locator(selector).count(), 0, 'Do not advertise immediately');
      await page.clock.fastForward(1);
      await page.locator(selector).waitFor({ state: 'visible' });
      assert.equal(await page.evaluate(() => document.activeElement?.tagName), focusBefore, 'Do not steal focus');
      const link = page.locator(`${selector} a`);
      assert.equal(await link.getAttribute('href'), 'https://t.me/polka_it');
      assert.equal(await link.getAttribute('target'), '_blank');
      assert.match(await link.getAttribute('rel'), /noopener/);
      assert.match(await link.getAttribute('rel'), /noreferrer/);
      await link.focus();
      await page.keyboard.press('Escape');
      assert.equal(await page.locator(selector).count(), 0);
      const expiry = await page.evaluate(key => Number(localStorage.getItem(key)), key);
      const now = await page.evaluate(() => Date.now());
      assert(expiry - now >= 29 * 24 * 60 * 60 * 1000 && expiry - now <= 30 * 24 * 60 * 60 * 1000);
      await page.reload();
      await page.locator('[data-polka-landing], [data-workspace-dashboard]').first().waitFor();
      await page.clock.fastForward(60_000);
      assert.equal(await page.locator(selector).count(), 0, 'Dismissal survives refresh');
      check(`${username || 'visitor'}: delay, focus, secure link, Escape and persisted dismissal`);
    } finally { await ctx.close(); }
  }

  const deferred = await context();
  try {
    await load(deferred.page);
    await deferred.page.evaluate(() => {
      const input = document.createElement('input'); input.id = 'promo-test-input'; input.setAttribute('aria-label', 'Synthetic form'); document.body.append(input); input.focus();
    });
    await deferred.page.clock.fastForward(12_000);
    assert.equal(await deferred.page.locator(selector).count(), 0, 'Form focus defers promotion');
    await deferred.page.evaluate(() => document.getElementById('promo-test-input').remove());
    await deferred.page.clock.fastForward(2_000);
    await deferred.page.locator(selector).waitFor({ state: 'visible' });
    await deferred.page.evaluate(() => {
      const input = document.createElement('input'); input.id = 'promo-test-input'; input.setAttribute('aria-label', 'Synthetic form'); document.body.append(input); input.focus();
    });
    // CSS :has invalidation can settle on the next render update. The paused
    // clock cannot reach the component's 2s polling during this short wait.
    await deferred.page.locator(selector).waitFor({ state: 'hidden', timeout: 500 });
    assert.equal(await deferred.page.locator(selector).isVisible(), false, 'Focused field promptly hides an already visible promotion');
    await deferred.page.clock.fastForward(2_000);
    assert.equal(await deferred.page.locator(selector).count(), 0);
    await deferred.page.evaluate(() => document.getElementById('promo-test-input').remove());
    await deferred.page.clock.fastForward(2_000);
    await deferred.page.locator(selector).waitFor({ state: 'visible' });
    await deferred.page.evaluate(() => {
      const dialog = document.createElement('dialog'); dialog.id = 'promo-test-dialog'; dialog.textContent = 'Synthetic native dialog'; document.body.append(dialog); dialog.showModal();
    });
    await deferred.page.locator(selector).waitFor({ state: 'hidden', timeout: 500 });
    assert.equal(await deferred.page.locator(selector).isVisible(), false, 'Native modal immediately hides promotion');
    await deferred.page.clock.fastForward(2_000);
    assert.equal(await deferred.page.locator(selector).count(), 0);
    await deferred.page.evaluate(() => document.getElementById('promo-test-dialog').remove());
    await deferred.page.clock.fastForward(2_000);
    await deferred.page.locator(selector).waitFor({ state: 'visible' });
    check('focused form and native modal defer safely; invitation returns when idle');
  } finally { await deferred.ctx.close(); }

  for (const width of [320, 390]) {
    const { ctx, page } = await context('student', width);
    try {
      await load(page);
      await show(page);
      const box = await page.locator(selector).boundingBox();
      const nav = await page.locator('.mobile-nav').boundingBox();
      assert(box && box.x >= 0 && box.x + box.width <= width, `Card fits ${width}px`);
      assert(nav && box.y + box.height <= nav.y - 8, 'Card clears fixed navigation');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      const closeBox = await page.locator(`${selector} button`).boundingBox();
      const linkBox = await page.locator(`${selector} a`).boundingBox();
      assert(closeBox && closeBox.width >= 44 && closeBox.height >= 44);
      assert(linkBox && linkBox.height >= 44);
      await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' });
      await page.screenshot({ path: join(screenshots, `telegram-${width}.png`) });
      await page.locator(`${selector} button`).click();
      assert.equal(await page.locator(selector).count(), 0);
      check(`${width}px: readable card, touch targets, navigation clearance and close`);
    } finally { await ctx.close(); }
  }

  const routes = await context();
  try {
    for (const path of ['/checkout', '/admin', '/offer', '/privacy', '/payment']) {
      await routes.page.goto(new URL(path, base).href);
      await routes.page.clock.fastForward(30_000);
      assert.equal(await routes.page.locator(selector).count(), 0, `${path} must have no advertisement`);
    }
    await load(routes.page, '/pricing');
    await show(routes.page);
    assert.equal(await routes.page.locator(selector).count(), 1);
    check('checkout, admin and legal excluded; pricing eligible');
  } finally { await routes.ctx.close(); }

  const storage = await context();
  try {
    await storage.page.addInitScript(key => {
      const get = Storage.prototype.getItem, set = Storage.prototype.setItem;
      Storage.prototype.getItem = function (name) { if (name === key) throw new DOMException('Storage denied', 'SecurityError'); return get.call(this, name); };
      Storage.prototype.setItem = function (name, value) { if (name === key) throw new DOMException('Storage denied', 'SecurityError'); return set.call(this, name, value); };
    }, key);
    await load(storage.page);
    await show(storage.page);
    await storage.page.locator(`${selector} button`).click();
    await storage.page.evaluate(() => window.history.replaceState({}, '', '/?page=materials'));
    await storage.page.clock.fastForward(60_000);
    assert.equal(await storage.page.locator(selector).count(), 0, 'Storage denial must not repeat promotion within navigation');
    check('storage denial remains dismissible without navigation spam');
  } finally { await storage.ctx.close(); }

  assert.deepEqual(errors, [], 'Promo scenarios must have no uncaught browser errors');
  return passed;
}

module.exports = { verifyTelegramPromo };

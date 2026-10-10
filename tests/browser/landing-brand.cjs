/* Real loopback auth and static demo interactions; no real Gemini requests. */
const assert = require('node:assert/strict');
const { mkdirSync } = require('node:fs');
const { join } = require('node:path');

async function verifyLandingBrand(browser, base, screenshots) {
  assert(['localhost', '127.0.0.1'].includes(new URL(base).hostname), 'Landing verification only runs against loopback fixtures');
  mkdirSync(screenshots, { recursive: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce', serviceWorkers: 'block' });
  const page = await ctx.newPage();
  const errors = [], postRequests = [];
  let passed = 0;
  const check = label => { passed++; console.log(`PASS Landing: ${label}`); };
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (request.method() === 'POST' && new URL(request.url()).pathname.startsWith('/api/')) postRequests.push(new URL(request.url()).pathname); });
  await page.addInitScript(() => localStorage.setItem('polka.community.telegram.v1', String(Date.now() + 30 * 24 * 60 * 60 * 1000)));
  const site = page.locator('[data-polka-landing]');
  const demo = page.locator('[aria-label="Интерактивный пример полки"]');
  const panel = demo.getByRole('tabpanel');

  function assertWithinViewport(box, width, label) {
    assert(box && box.x >= -1 && box.x + box.width <= width + 1, `${label} fits ${width}px`);
  }
  async function search() {
    const desktop = demo.getByRole('button', { name: 'Найти на полке', exact: true });
    if (await desktop.isVisible()) await desktop.click();
    else await demo.getByRole('button', { name: 'Найти в примере полки', exact: true }).click();
    await demo.getByRole('search', { name: 'Поиск по примеру полки' }).waitFor();
    return demo.getByRole('textbox', { name: 'Поиск по демонстрационной полке' });
  }

  try {
    await page.goto(base);
    await site.waitFor();
    assert.match(await page.title(), /^polka /);
    const asset = await ctx.request.get(`${base}/brand/polka-wordmark.png`);
    assert.equal(asset.status(), 200, 'Supplied brand artwork must load');
    assert((await asset.body()).byteLength > 1000);
    assert.equal(await site.locator('header').getByRole('img', { name: 'polka', exact: true }).count(), 1);
    for (const label of ['Возможности', 'Как устроено', 'Тариф']) {
      const href = await site.getByRole('navigation', { name: 'Разделы сайта' }).getByRole('link', { name: label, exact: true }).getAttribute('href');
      assert(href && href.startsWith('#'));
      assert.equal(await site.locator(`[id="${href.slice(1)}"]`).count(), 1, 'Navigation anchor must have a target');
    }
    assert.equal(await site.getByRole('link', { name: 'Посмотреть тариф', exact: true }).getAttribute('href'), '/pricing');
    const channel = site.getByRole('link', { name: '@polka_it', exact: true });
    assert.equal(await channel.getAttribute('href'), 'https://t.me/polka_it');
    assert.equal(await channel.getAttribute('target'), '_blank');
    assert.match(await channel.getAttribute('rel'), /noopener noreferrer/);
    check('new public brand artwork, valid section anchors, real tariff and Telegram links');

    const manifestPath = await page.locator('head link[rel="manifest"]').getAttribute('href');
    assert.equal(manifestPath, '/manifest.webmanifest', 'Browser receives the install manifest link');
    const manifestResponse = await ctx.request.get(new URL(manifestPath, base).href);
    assert.equal(manifestResponse.status(), 200);
    assert.match(manifestResponse.headers()['content-type'], /application\/(?:manifest\+)?json/);
    const manifest = await manifestResponse.json();
    const browserIcons = await page.locator('head link[rel~="icon"]').evaluateAll(elements => elements.map(element => element.getAttribute('href')));
    const appleIcons = await page.locator('head link[rel="apple-touch-icon"]').evaluateAll(elements => elements.map(element => element.getAttribute('href')));
    assert(browserIcons.includes('/brand/favicon.svg'), 'Browser links the supplied brand favicon');
    assert(browserIcons.includes('/icons/polka-favicon-32.png'), 'Browser links the PNG fallback');
    assert(appleIcons.includes('/icons/polka-apple-180.png'), 'iPhone receives the dedicated install icon');
    assert.deepEqual(new Set(manifest.icons.map(icon => icon.src)), new Set(['/icons/polka-192.png', '/icons/polka-512.png', '/icons/polka-maskable-512.png']));
    const iconPaths = [...new Set([...browserIcons, ...appleIcons, ...manifest.icons.map(icon => icon.src)])];
    for (const iconPath of iconPaths) {
      const response = await ctx.request.get(new URL(iconPath, base).href);
      assert.equal(response.status(), 200, `Linked icon is served: ${iconPath}`);
      if (iconPath.endsWith('.svg')) {
        assert.match(response.headers()['content-type'], /image\/svg\+xml/);
        assert.match(await response.text(), /<svg\b/);
      } else if (iconPath.endsWith('.png')) {
        assert.match(response.headers()['content-type'], /image\/png/);
        const png = await response.body();
        assert(png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), `Actual served icon is a PNG: ${iconPath}`);
        assert.equal(png.subarray(12, 16).toString(), 'IHDR');
        assert(png.readUInt32BE(16) > 0 && png.readUInt32BE(20) > 0, 'Delivered PNG has valid dimensions');
      }
    }
    // Exact manifest dimensions and maskable metadata are covered in pwa.test.ts.
    check('browser and iPhone metadata link working brand assets; manifest icons load as valid images');

    await site.getByRole('button', { name: 'Создать свою полку', exact: true }).click();
    const registration = page.getByRole('dialog', { name: 'Ваша полка начинается здесь', exact: true });
    await registration.waitFor();
    assert.equal(await registration.locator('input[name="username"]').getAttribute('required'), '');
    assert.equal(await registration.locator('input[name="password"]').getAttribute('minlength'), '10');
    assert.equal(await registration.locator('input[name="adult"]').getAttribute('required'), '');
    assert.equal(postRequests.length, 0, 'Opening CTA must not create an account');
    await page.keyboard.press('Escape');
    await registration.waitFor({ state: 'detached' });
    check('create CTA opens real accessible registration; Escape closes without creating account');

    await demo.getByRole('tab', { name: 'Конспект', exact: true }).click();
    assert.match(await panel.textContent(), /Память любит возвращения/);
    await demo.getByRole('tab', { name: 'Понятия', exact: true }).click();
    assert.match(await panel.textContent(), /Пример понятия/);
    assert.match(await panel.textContent(), /Интервальное повторение/);
    await demo.getByRole('tab', { name: 'Практика', exact: true }).click();
    await panel.getByRole('button', { name: /Один раз быстро перечитать/ }).click();
    assert.match(await panel.getByRole('status').textContent(), /Вернитесь к фрагменту/);
    await panel.getByRole('button', { name: /Возвращаться к нему через промежутки времени/ }).click();
    assert.match(await panel.getByRole('status').textContent(), /Верно/);
    await demo.getByRole('tab', { name: 'polka.ai', exact: true }).click();
    await panel.getByRole('button', { name: 'Показать пример ответа polka.ai', exact: true }).click();
    assert.match(await panel.textContent(), /Сначала объясните главную идею своими словами/);
    assert.match(await panel.textContent(), /По примеру лекции/);
    assert.equal(await demo.getByText('Демо', { exact: true }).count(), 1);
    assert.equal(await demo.getByText('Демонстрационный материал', { exact: true }).count(), 1);
    assert.equal(postRequests.length, 0, 'Demo answers are explicitly local and must not call AI or create data');
    check('all demo tabs work, practice gives feedback, chat is explicitly demo with no API writes');

    const input = await search();
    assert.equal(await input.evaluate(element => element === document.activeElement), true, 'Intentional search input receives focus');
    await input.fill('несуществующая заметка');
    assert.match(await demo.getByRole('search').getByRole('status').textContent(), /нет совпадений/);
    await input.fill('повторение');
    const result = demo.getByRole('search').getByRole('button', { name: /Интервальное повторение/ });
    assert.equal(await result.count(), 1);
    await input.press('Tab');
    assert.equal(await demo.getByRole('button', { name: 'Закрыть поиск примера' }).evaluate(element => element === document.activeElement), true);
    await page.keyboard.press('Tab');
    assert.equal(await result.evaluate(element => element === document.activeElement), true);
    await page.keyboard.press('Enter');
    assert.equal(await demo.getByRole('search').count(), 0);
    assert.equal(await demo.getByRole('tab', { name: 'Понятия', exact: true }).getAttribute('aria-selected'), 'true');
    await search();
    await page.keyboard.press('Escape');
    assert.equal(await demo.getByRole('search').count(), 0);
    await search();
    await demo.getByRole('button', { name: 'Закрыть поиск примера', exact: true }).click();
    assert.equal(await demo.getByRole('search').count(), 0);
    check('search filters and handles no matches; keyboard selection, Escape and close work');

    await demo.getByRole('tab', { name: 'Конспект', exact: true }).focus();
    await demo.getByRole('tab', { name: 'Конспект', exact: true }).click();
    await page.keyboard.press('ArrowRight');
    assert.equal(await demo.getByRole('tab', { name: 'Понятия', exact: true }).getAttribute('aria-selected'), 'true');
    await page.keyboard.press('End');
    assert.equal(await demo.getByRole('tab', { name: 'polka.ai', exact: true }).getAttribute('aria-selected'), 'true');
    await page.keyboard.press('Home');
    assert.equal(await demo.getByRole('tab', { name: 'Конспект', exact: true }).getAttribute('aria-selected'), 'true');
    assert.equal(await demo.getByRole('tab', { name: 'Конспект', exact: true }).evaluate(element => element === document.activeElement), true);
    check('tablist supports roving focus, arrows, Home and End');

    for (const width of [1440, 768, 390, 320]) {
      await page.setViewportSize({ width, height: width < 500 ? 844 : 1000 });
      for (const tab of ['Конспект', 'Понятия', 'Практика', 'polka.ai']) {
        await demo.getByRole('tab', { name: tab, exact: true }).click();
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth || document.body.scrollWidth > innerWidth), false, `${tab} causes no ${width}px horizontal overflow`);
        assertWithinViewport(await panel.boundingBox(), width, `Demo panel (${tab})`);
      }
      await demo.getByRole('tab', { name: 'Конспект', exact: true }).click();
      const input = await search();
      await input.fill('повторение');
      assertWithinViewport(await demo.getByRole('search').boundingBox(), width, 'Search overlay');
      assertWithinViewport(await input.boundingBox(), width, 'Search input');
      await demo.getByRole('button', { name: 'Закрыть поиск примера', exact: true }).click();
      await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' });
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
      await page.screenshot({ path: join(screenshots, `landing-brand-${width}.png`) });
      await page.screenshot({ path: join(screenshots, `landing-brand-${width}-full.png`), fullPage: true });
    }
    check('1440/768/390/320px: all tabs and search fit; responsive brand screenshots saved');

    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await site.locator('header').getByRole('button', { name: 'Войти', exact: true }).click();
    const login = page.getByRole('dialog', { name: 'С возвращением', exact: true });
    await login.waitFor();
    assertWithinViewport(await login.boundingBox(), 390, 'Mobile login dialog');
    await login.locator('input[name="username"]').fill('student');
    await login.locator('input[name="password"]').fill('polka-design-test-only-2026');
    const authResponsePromise = page.waitForResponse(response => new URL(response.url()).pathname === '/api/auth' && response.request().method() === 'POST');
    await login.getByRole('button', { name: 'Войти', exact: true }).click();
    const authResponse = await authResponsePromise;
    assert.equal(authResponse.status(), 200, 'Synthetic account login must succeed on the real backend');
    await page.locator('[data-workspace-dashboard]').waitFor();
    assert.equal(await site.count(), 0, 'Real login opens account workspace');
    // Production uses Secure cookies. Normalize only this synthetic loopback
    // context so Playwright's HTTP request client can share the browser session.
    const cookies = await ctx.cookies();
    assert(cookies.some(cookie => cookie.name === 'polka_session'), 'Browser must receive the actual session cookie');
    await ctx.addCookies(cookies.map(cookie => ({ ...cookie, secure: false })));
    await page.reload();
    await page.locator('[data-workspace-dashboard]').waitFor();
    const sessionResponse = await ctx.request.get(`${base}/api/session`);
    const session = await sessionResponse.json();
    assert.equal(session.user.username, 'student');
    assert.deepEqual(postRequests, ['/api/auth'], 'Only login writes to the actual local backend');
    assert.deepEqual(errors, [], 'Landing interactions must have no uncaught browser errors');
    check('mobile login uses real local auth and opens existing student account');
    return passed;
  } finally { await ctx.close(); }
}

module.exports = { verifyLandingBrand };

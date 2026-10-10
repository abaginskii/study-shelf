/* Installed-PWA emulation uses synthetic loopback accounts and no real AI calls. */
const assert = require('node:assert/strict');
const { writeFileSync } = require('node:fs');
const { join } = require('node:path');
const { randomUUID } = require('node:crypto');

async function verifyMobilePilot(browser, base, screenshots, fixture) {
  assert(['localhost', '127.0.0.1'].includes(new URL(base).hostname), 'Pilot tests require isolated loopback data');
  const errors = [];
  const contexts = [];
  let activePage;
  let passed = 0;
  const check = label => { passed++; console.log(`PASS Mobile pilot: ${label}`); };
  const tabs = {
    home: 'Главная',
    materials: 'Библиотека',
    assistant: /^(AI|polka\.ai)$/,
    review: 'Практика',
    account: 'Профиль',
  };

  async function context(username, installed, viewport = { width: 390, height: 844 }) {
    const ctx = await browser.newContext({ viewport, isMobile: true, hasTouch: true, serviceWorkers: 'block', colorScheme: 'light' });
    contexts.push(ctx);
    await ctx.addInitScript(({ standalone }) => {
      // iOS reports installation through navigator.standalone. This override is
      // confined to a synthetic browser context; it does not affect production.
      Object.defineProperty(navigator, 'standalone', { configurable: true, get: () => standalone });
      localStorage.setItem('polka.community.telegram.v1', String(Date.now() + 30 * 24 * 60 * 60 * 1000));
    }, { standalone: installed });
    if (username) {
      const response = await ctx.request.post(`${base}/api/auth`, {
        data: { action: 'login', username, password: 'polka-design-test-only-2026' },
      });
      assert.equal(response.status(), 200);
      // Only normalize transport flags for this HTTP loopback fixture.
      await ctx.addCookies((await ctx.cookies()).map(cookie => ({ ...cookie, secure: false })));
    }
    const sessionResponse = await ctx.request.get(`${base}/api/session`);
    assert.equal(sessionResponse.status(), 200);
    const session = await sessionResponse.json();
    const page = await ctx.newPage();
    activePage = page;
    page.on('pageerror', error => errors.push(error.message));
    return { ctx, page, session };
  }

  async function nav(page, destination) {
    const button = page.locator('[data-mobile-pilot-nav]').getByRole('button', { name: tabs[destination], exact: true });
    await button.click();
    await page.locator(`main[data-page="${destination}"]`).waitFor();
    if (destination === 'home') await dashboard(page, 'home navigation');
  }

  async function dashboard(page, label) {
    try {
      await page.locator('[data-mobile-pilot-dashboard]').waitFor({ timeout: 10000 });
    } catch (error) {
      const state = await page.evaluate(() => ({
        url: location.href, width: innerWidth, height: innerHeight,
        standalone: navigator.standalone,
        displayStandalone: matchMedia('(display-mode: standalone)').matches,
        coarse: matchMedia('(pointer: coarse)').matches,
        pilotMedia: matchMedia('(max-width: 760px) and (pointer: coarse), (max-width: 960px) and (max-height: 600px) and (pointer: coarse)').matches,
        pilot: !!document.querySelector('.mobile-pilot'),
        page: document.querySelector('main[data-page]')?.getAttribute('data-page'),
      }));
      const name = label.replace(/[^a-z0-9-]/gi, '-');
      writeFileSync(join(screenshots, `mobile-pilot-failed-${name}.json`), JSON.stringify(state, null, 2));
      writeFileSync(join(screenshots, `mobile-pilot-failed-${name}.html`), await page.content());
      await page.screenshot({ path: join(screenshots, `mobile-pilot-failed-${name}.png`) });
      throw error;
    }
  }

  async function paint(page) {
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  }

  async function sheet(page, name, destination) {
    await page.getByRole('button', { name: 'Открыть все разделы', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Разделы polka', exact: true });
    await dialog.waitFor();
    await dialog.getByRole('button', { name, exact: true }).click();
    await dialog.waitFor({ state: 'detached' });
    await page.locator(`main[data-page="${destination}"]`).waitFor();
  }

  async function fits(page, label) {
    const size = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth, body: document.body.scrollWidth }));
    assert(size.document <= size.viewport + 1 && size.body <= size.viewport + 1, `${label}: horizontal overflow ${JSON.stringify(size)}`);
    const bottom = await page.locator('[data-mobile-pilot-nav]').boundingBox();
    const viewport = page.viewportSize();
    assert(bottom && bottom.x >= -1 && bottom.x + bottom.width <= viewport.width + 1, `${label}: tab bar fits width`);
    assert(bottom.y >= 0 && bottom.y + bottom.height <= viewport.height + 1, `${label}: tab bar stays inside viewport`);
  }

  async function primaryTargets(page, label) {
    const controls = page.locator('[data-mobile-pilot-header] button:visible, [data-mobile-pilot-nav] button:visible, [data-mobile-pilot-dashboard] button[aria-label="Добавить материал"]:visible');
    for (const button of await controls.all()) {
      const box = await button.boundingBox();
      assert(box && box.width >= 44 && box.height >= 44, `${label}: touch target ${await button.getAttribute('aria-label') || await button.innerText()} is at least 44×44 CSS px`);
    }
  }

  try {
    const anonymous = await context(null, true);
    assert.equal(anonymous.session.mobilePilotEligible, false);
    await anonymous.page.goto(base);
    await anonymous.page.locator('[data-polka-landing]').waitFor();
    assert.equal(await anonymous.page.locator('.mobile-pilot').count(), 0);
    await anonymous.ctx.close();

    const student = await context('student', true);
    assert.equal(student.session.mobilePilotEligible, false, 'Only the pinned owner account is eligible');
    await student.page.addInitScript(() => {
      localStorage.setItem('polka.mobilePilotEligible', 'true');
      localStorage.setItem('polka.mobile-pilot', 'true');
      localStorage.setItem('polka.design.v2:student', 'v2');
    });
    await student.page.goto(`${base}/?mobilePilot=1`);
    await student.page.locator('[data-workspace-dashboard]').waitFor();
    assert.equal(await student.page.locator('.mobile-pilot').count(), 0, 'Client preferences cannot grant pilot access');
    assert.equal((await student.ctx.request.get(`${base}/api/admin/overview`)).status(), 403);
    await student.ctx.close();
    check('anonymous and student installed PWAs keep the released interface; client manipulation cannot grant owner access');

    const browserOnly = await context('artem', false);
    assert.equal(browserOnly.session.mobilePilotEligible, true);
    assert.equal(browserOnly.session.user.id, fixture.artemId);
    await browserOnly.page.goto(base);
    await browserOnly.page.locator('[data-workspace-dashboard]').waitFor();
    assert.equal(await browserOnly.page.locator('.mobile-pilot').count(), 0, 'Regular mobile browser is outside the installed-PWA pilot');
    await browserOnly.page.evaluate(() => window.dispatchEvent(new Event('appinstalled')));
    await paint(browserOnly.page);
    assert.equal(await browserOnly.page.locator('.mobile-pilot').count(), 0, 'Installing from a regular browser does not turn the still-open browser tab into standalone mode');
    await browserOnly.ctx.close();
    check('artem is eligible, but the regular mobile browser retains the released workspace even after appinstalled');

    const { ctx, page, session } = await context('artem', true);
    assert.equal(session.mobilePilotEligible, true);
    await page.goto(base);
    await page.locator('[data-mobile-pilot-dashboard]').waitFor();
    assert.equal(await page.locator('[data-mobile-pilot-header]').count(), 1);
    assert.equal(await page.locator('[data-mobile-pilot-nav]').getByRole('button').count(), 5);
    assert.equal(await page.locator('[data-workspace-header]').count(), 0, 'Pilot must not duplicate the released header');
    assert.equal(await page.locator('.mobile-nav').count(), 0, 'Pilot must not duplicate the released tab bar');
    await primaryTargets(page, '390px home');
    await fits(page, '390px home');
    check('eligible installed touch PWA has one native-style header, one five-tab navigation and usable touch targets');

    for (const viewport of [{ width: 1024, height: 768 }, { width: 1440, height: 1000 }]) {
      await page.setViewportSize(viewport);
      await page.locator('[data-workspace-dashboard]').waitFor();
      assert.equal(await page.locator('.mobile-pilot').count(), 0, 'Tablet and desktop use the released workspace even in a standalone context');
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('[data-mobile-pilot-dashboard]').waitFor();
    await page.reload();
    await page.locator('[data-mobile-pilot-dashboard]').waitFor();
    check('tablet and desktop resizing disable the pilot, returning to mobile restores it and reload preserves the server gate');

    for (const destination of ['materials', 'review', 'assistant', 'account', 'home']) {
      await nav(page, destination);
      await fits(page, `390px ${destination}`);
    }
    await page.getByRole('button', { name: 'Открыть polka.id', exact: true }).click();
    await page.locator('.polka-identity').waitFor();
    assert.match(await page.locator('.polka-identity').innerText(), new RegExp(fixture.artemId));
    await paint(page);
    await page.screenshot({ path: join(screenshots, 'mobile-pilot-account.png') });
    await sheet(page, 'Предметы', 'subjects');
    await sheet(page, 'Знания', 'knowledge');
    await nav(page, 'home');
    check('five tabs, the real polka.id and secondary subject/knowledge sections all open from mobile controls');

    await page.getByRole('button', { name: 'Поиск в polka', exact: true }).click();
    const search = page.getByRole('combobox', { name: 'Поиск материалов и команд' });
    await search.fill('память');
    await search.press('Enter');
    await page.locator('.detail-heading h1').waitFor();
    assert.equal(await page.locator('.detail-heading h1').innerText(), 'Как устроена память');
    await fits(page, 'material detail');
    await nav(page, 'home');
    check('intentional search opens a real source material through the mobile command palette');

    await nav(page, 'materials');
    const librarySearch = page.getByRole('searchbox', { name: 'Найти материал, тему или понятие…', exact: true });
    const subjectFilter = page.getByRole('combobox', { name: 'Фильтр по предмету', exact: true });
    const statusFilter = page.getByRole('combobox', { name: 'Фильтр по статусу', exact: true });
    await librarySearch.fill('память');
    await subjectFilter.selectOption('Психология');
    await statusFilter.selectOption('ready');
    await page.locator('.material-card').filter({ hasText: 'Как устроена память' }).waitFor();
    await nav(page, 'account');
    await nav(page, 'materials');
    assert.equal(await librarySearch.inputValue(), 'память', 'Library query survives a tab switch');
    assert.equal(await subjectFilter.inputValue(), 'Психология', 'Subject filter survives a tab switch');
    assert.equal(await statusFilter.inputValue(), 'ready', 'Status filter survives a tab switch');
    await page.locator('.material-card').filter({ hasText: 'Как устроена память' }).click();
    await page.locator('.detail-heading h1').waitFor();
    await page.locator('[data-mobile-pilot-header]').getByRole('button', { name: 'Назад', exact: true }).click();
    await librarySearch.waitFor();
    assert.equal(await librarySearch.inputValue(), 'память', 'Native header back restores the filtered library');
    await page.locator('.material-card').filter({ hasText: 'Как устроена память' }).click();
    await page.locator('.detail-heading h1').waitFor();
    await page.goBack();
    await librarySearch.waitFor();
    assert.equal(await librarySearch.inputValue(), 'память', 'Browser history back restores the filtered library');
    await librarySearch.fill('');
    await subjectFilter.selectOption('');
    await statusFilter.selectOption('all');
    await nav(page, 'home');
    check('tab changes preserve library filters; header and browser Back restore the original filtered view');

    const materialRoute = `**/api/materials/${fixture.materialId}`;
    await page.route(materialRoute, async route => {
      const response = await route.fetch();
      await new Promise(resolve => setTimeout(resolve, 300));
      await route.fulfill({ response });
    });
    // Navigation restores the view in a scheduled animation frame. Settle that
    // restoration before placing the deliberate nonzero regression-test scroll.
    await paint(page);
    await page.evaluate(() => window.scrollTo({ top: 250, behavior: 'instant' }));
    await paint(page);
    const homeScroll = await page.evaluate(() => scrollY);
    assert(homeScroll >= 200, 'The fixture home must have a real nonzero scroll position');
    const continueButton = page.getByRole('button', { name: 'Продолжить', exact: true });
    const continueBox = await continueButton.boundingBox();
    const tabBox = await page.locator('[data-mobile-pilot-nav]').boundingBox();
    assert(continueBox && tabBox && continueBox.y >= 0 && continueBox.y + continueBox.height < tabBox.y, 'Continue is visible without Playwright changing the saved scroll');
    await continueButton.click();
    await page.locator('main[data-page] .loading-panel').waitFor();
    await page.locator('.detail-heading h1').waitFor();
    await page.locator('[data-mobile-pilot-header]').getByRole('button', { name: 'Назад', exact: true }).click();
    await dashboard(page, 'scroll restoration');
    await page.waitForFunction(expected => Math.abs(scrollY - expected) <= 2, homeScroll);
    await page.unroute(materialRoute);
    check('a delayed material loader cannot overwrite the home scroll captured before navigation; Back restores the original position');

    let releaseResponse;
    const responseGate = new Promise(resolve => { releaseResponse = resolve; });
    let requestStarted;
    const started = new Promise(resolve => { requestStarted = resolve; });
    await page.route(materialRoute, async route => {
      const response = await route.fetch();
      requestStarted();
      await responseGate;
      await route.fulfill({ response });
    });
    try {
      const pendingResponse = page.waitForResponse(response => new URL(response.url()).pathname === `/api/materials/${fixture.materialId}`);
      await continueButton.click();
      await started;
      await page.locator('main[data-page] .loading-panel').waitFor();
      await page.setViewportSize({ width: 1440, height: 1000 });
      await page.locator('[data-workspace-dashboard]').waitFor();
      assert.equal(await page.locator('.mobile-pilot').count(), 0);
      assert.equal(await page.locator('main[data-page] .loading-panel').count(), 0, 'Leaving the pilot removes its pending loader');
      releaseResponse();
      await (await pendingResponse).finished();
      await paint(page);
      assert.equal(await page.locator('.detail-heading').count(), 0, 'The stale material response cannot open a detail after the pilot is disabled');
      assert.equal(await page.locator('main[data-page] .loading-panel').count(), 0);
      assert.equal(await page.locator('[data-workspace-dashboard]').isVisible(), true);
    } finally {
      releaseResponse();
      await page.unroute(materialRoute);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await dashboard(page, 'return after canceled request');
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    check('resizing out of the pilot during a pending material request leaves a usable public dashboard and ignores the stale response');

    await page.getByRole('button', { name: 'Добавить материал', exact: true }).first().click();
    const upload = page.getByRole('dialog', { name: 'Добавить материал', exact: true });
    await upload.waitFor();
    await upload.getByRole('button', { name: 'Добавить текст', exact: true }).click();
    await upload.locator('[name=title]').fill('Мобильный PWA материал');
    await upload.locator('[name=subject]').fill('Проверка пилота');
    await upload.locator('[name=text]').fill('Исходный текст для проверки реального мобильного рабочего процесса.');
    await upload.getByRole('checkbox', { name: /Автоматически подготовить лекцию/ }).uncheck();
    await upload.getByRole('button', { name: 'Добавить', exact: true }).click();
    await page.locator('.detail-heading h1').filter({ hasText: 'Мобильный PWA материал' }).waitFor();
    await page.getByRole('tab', { name: 'Оригинал и текст', exact: true }).click();
    await page.locator('.source-editor input').first().fill('Мобильный PWA материал — обновлён');
    await page.locator('.source-text').fill('Проверено сохранение изменений из мобильного пилота.');
    await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
    await page.locator('.detail-heading h1').filter({ hasText: 'Мобильный PWA материал — обновлён' }).waitFor();
    await page.getByRole('button', { name: 'Удалить материал', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Оставить', exact: true }).click();
    await page.getByRole('button', { name: 'Удалить материал', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Удалить', exact: true }).click();
    await page.locator('.detail-heading').waitFor({ state: 'detached' });
    await nav(page, 'home');
    check('pilot upload, source edit, delete cancellation and confirmed deletion use real isolated APIs');

    // Intercept only synthetic AI output. Source links still use real fixture data.
    await page.route('**/api/session', async route => {
      const response = await route.fetch();
      const data = await response.json();
      await route.fulfill({ response, json: { ...data, aiAvailable: true } });
    });
    const chatId = randomUUID(), userId = randomUUID(), assistantId = randomUUID();
    const createdAt = new Date().toISOString();
    await page.route('**/api/chat', async route => {
      const content = 'Это тестовый ответ интерфейса с источником о рабочей памяти. [1]';
      const chat = {
        id: chatId, title: 'Мобильная проверка', updatedAt: createdAt, materialIds: [fixture.materialId], status: 'idle',
        messages: [
          { id: userId, role: 'user', content: 'Объясни рабочую память', createdAt },
          { id: assistantId, role: 'assistant', content, sources: [{ id: fixture.materialId, title: 'Как устроена память', index: 1 }], createdAt },
        ],
      };
      const events = [
        { type: 'start', chatId, userMessageId: userId, assistantMessageId: assistantId },
        { type: 'delta', text: content }, { type: 'done', chat },
      ];
      await route.fulfill({ contentType: 'text/event-stream', body: events.map(event => `data: ${JSON.stringify(event)}\n\n`).join('') });
    });
    await page.reload();
    await page.locator('[data-mobile-pilot-dashboard]').waitFor();
    await nav(page, 'assistant');
    const input = page.getByRole('textbox', { name: 'Сообщение для polka.ai' });
    await input.fill('Объясни рабочую память');
    await page.getByRole('button', { name: 'Отправить сообщение', exact: true }).click();
    await page.locator('.chat-sources').waitFor();
    assert.equal(await page.locator('.chat-message').count(), 2);
    await fits(page, 'chat with source');
    try {
      // Simulate the iOS keyboard's reduced visual viewport without changing the
      // physical device size. This is a layout check, not an actual Safari test.
      await page.evaluate(() => {
        if (!window.visualViewport) throw new Error('VisualViewport is required for the keyboard layout simulation');
        Object.defineProperty(window.visualViewport, 'height', { configurable: true, get: () => 500 });
      });
      await input.focus();
      await page.evaluate(() => window.visualViewport.dispatchEvent(new Event('resize')));
      await page.locator('[data-mobile-pilot-nav]').waitFor({ state: 'hidden' });
      await paint(page);
      const composerInput = await input.boundingBox();
      assert(composerInput && composerInput.y >= 0 && composerInput.y + composerInput.height <= 501, 'The composer stays above the simulated keyboard');
      await input.evaluate(element => element.blur());
      await page.locator('[data-mobile-pilot-nav]').waitFor({ state: 'visible' });
      assert.equal(await page.evaluate(() => window.visualViewport.height), 500, 'Blur restores tabs before the visual viewport grows; a small viewport alone is not an editing keyboard');
    } finally {
      await input.evaluate(element => element.blur());
      await page.evaluate(() => {
        if (window.visualViewport) {
          delete window.visualViewport.height;
          window.visualViewport.dispatchEvent(new Event('resize'));
        }
      });
      await paint(page);
    }
    await page.locator('[data-mobile-pilot-nav]').waitFor({ state: 'visible' });
    await fits(page, 'chat after simulated keyboard');
    await page.screenshot({ path: join(screenshots, 'mobile-pilot-chat.png') });
    check('visual-viewport keyboard simulation keeps the composer visible, hides tabs while editing and restores them on blur');
    await page.getByRole('button', { name: 'Открыть источник 1: Как устроена память', exact: true }).click();
    await page.locator('.detail-heading h1').waitFor();
    await nav(page, 'home');
    check('mobile chat sends through an explicit SSE stub and opens the real source; no provider credits are consumed');

    for (const viewport of [{ width: 320, height: 740 }, { width: 390, height: 844 }, { width: 430, height: 932 }, { width: 740, height: 390 }, { width: 844, height: 390 }, { width: 932, height: 430 }]) {
      await page.setViewportSize(viewport);
      await page.locator('[data-mobile-pilot-dashboard]').waitFor();
      await primaryTargets(page, `${viewport.width}×${viewport.height}`);
      for (const destination of ['home', 'materials', 'review', 'assistant', 'account']) {
        await nav(page, destination);
        await fits(page, `${viewport.width}×${viewport.height} ${destination}`);
      }
      await nav(page, 'home');
      await page.getByRole('button', { name: 'Открыть все разделы', exact: true }).click();
      const sheetBox = await page.getByRole('dialog', { name: 'Разделы polka', exact: true }).boundingBox();
      assert(sheetBox && sheetBox.x >= -1 && sheetBox.x + sheetBox.width <= viewport.width + 1, 'Section sheet fits narrow and landscape views');
      await page.keyboard.press('Escape');
      await page.getByRole('dialog', { name: 'Разделы polka', exact: true }).waitFor({ state: 'detached' });
    }
    check('320/390/430px and 740/844/932px phone landscape: sections and sheets fit; primary controls remain touch-sized');

    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
    await nav(page, 'home');
    const lightColor = await page.locator('[data-mobile-pilot-dashboard]').evaluate(element => getComputedStyle(element).color);
    // Chromium's full-page capture temporarily changes device metrics. Native
    // app artifacts intentionally capture the actual installed-PWA viewport.
    await page.screenshot({ path: join(screenshots, 'mobile-pilot-light.png') });
    await dashboard(page, 'after light viewport screenshot');
    await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
    await dashboard(page, 'dark appearance');
    await page.waitForFunction(light => {
      const dashboard = document.querySelector('[data-mobile-pilot-dashboard]');
      return matchMedia('(prefers-color-scheme: dark)').matches && dashboard && getComputedStyle(dashboard).color !== light;
    }, lightColor);
    const darkColor = await page.locator('[data-mobile-pilot-dashboard]').evaluate(element => getComputedStyle(element).color);
    assert.notEqual(lightColor, darkColor, 'The pilot responds to iOS light/dark appearance');
    assert.equal(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches), true);
    const animated = await page.locator('[data-mobile-pilot-header], [data-mobile-pilot-dashboard], [data-mobile-pilot-nav]').evaluateAll(roots => roots.flatMap(root => [...root.querySelectorAll('*')]).filter(element => {
      const style = getComputedStyle(element);
      return style.animationName !== 'none' && style.animationDuration.split(',').some(duration => parseFloat(duration) > 0.01);
    }).length);
    assert.equal(animated, 0, 'Reduced motion disables decorative running animations');
    await page.screenshot({ path: join(screenshots, 'mobile-pilot-dark.png') });
    await dashboard(page, 'after dark viewport screenshot');
    const installedState = await page.evaluate(() => ({
      width: innerWidth,
      standalone: navigator.standalone,
      coarse: matchMedia('(pointer: coarse)').matches,
      pilotMedia: matchMedia('(max-width: 760px) and (pointer: coarse), (max-width: 960px) and (max-height: 600px) and (pointer: coarse)').matches,
    }));
    assert.deepEqual(installedState, { width: 390, standalone: true, coarse: true, pilotMedia: true }, 'Viewport screenshots must retain the real emulated installed-PWA mode');
    await fits(page, 'dark reduced-motion home');
    check('automatic light/dark appearance and reduced motion work; both mobile screenshots saved');

    const safeAreaStyle = await page.addStyleTag({ content: '.mobile-pilot { --mp-safe-top: 47px !important; --mp-safe-bottom: 34px !important; }' });
    await fits(page, 'synthetic iPhone safe areas');
    for (const button of await page.locator('[data-mobile-pilot-header] button:visible').all()) {
      const box = await button.boundingBox();
      assert(box && box.y >= 47, 'Header controls avoid the simulated top unsafe area');
    }
    for (const button of await page.locator('[data-mobile-pilot-nav] button:visible').all()) {
      const box = await button.boundingBox();
      assert(box && box.y + box.height <= 844 - 34 + 1, 'Tabs avoid the simulated home-indicator area');
    }
    await safeAreaStyle.evaluate(element => element.remove());
    check('47px top and 34px bottom safe-area simulation keeps header and tab controls clear of system areas');

    assert.deepEqual(errors, [], 'Pilot browser contexts have no uncaught exceptions');
    check('no browser exceptions across pilot, fallback and access-isolation contexts');
    return passed;
  } catch (error) {
    if (activePage && !activePage.isClosed()) {
      try {
        const state = await activePage.evaluate(() => ({
          url: location.href, width: innerWidth, height: innerHeight, scrollY,
          documentHeight: document.documentElement.scrollHeight,
          standalone: navigator.standalone,
          coarse: matchMedia('(pointer: coarse)').matches,
          pilotMedia: matchMedia('(max-width: 760px) and (pointer: coarse), (max-width: 960px) and (max-height: 600px) and (pointer: coarse)').matches,
          pilot: !!document.querySelector('.mobile-pilot'),
          page: document.querySelector('main[data-page]')?.getAttribute('data-page'),
          detail: !!document.querySelector('.detail-heading'),
          loader: !!document.querySelector('main[data-page] .loading-panel'),
        }));
        writeFileSync(join(screenshots, 'mobile-pilot-failure.json'), JSON.stringify({ error: error.message, ...state }, null, 2));
        writeFileSync(join(screenshots, 'mobile-pilot-failure.html'), await activePage.content());
        await activePage.screenshot({ path: join(screenshots, 'mobile-pilot-failure.png') });
      } catch (diagnosticError) {
        console.error('Could not save mobile pilot diagnostics:', diagnosticError.message);
      }
    }
    throw error;
  } finally {
    await Promise.allSettled(contexts.map(ctx => ctx.close()));
  }
}

module.exports = { verifyMobilePilot };

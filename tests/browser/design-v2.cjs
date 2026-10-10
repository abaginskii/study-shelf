/* Only synthetic local accounts. AI responses below are explicit UI stubs. */
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { randomUUID } = require('node:crypto');
const { verifyTelegramPromo } = require('./telegram-promo.cjs');
const { verifyLandingBrand } = require('./landing-brand.cjs');
const base = process.env.POLKA_TEST_URL || 'http://127.0.0.1:3100';
assert(['localhost', '127.0.0.1'].includes(new URL(base).hostname), 'Never run fixture tests against production');
const fixture = JSON.parse(fs.readFileSync(process.env.POLKA_TEST_FIXTURE || '/private/tmp/polka-v2-fixture.json', 'utf8'));
assert(fixture.dir.includes('polka-v2-ui-'));
const screenshots = process.env.POLKA_TEST_SCREENSHOTS || '/private/tmp/polka-v2-screens';
fs.mkdirSync(screenshots, { recursive: true });
let passed = 0;
const check = (label) => { passed++; console.log(`PASS ${label}`); };

async function main() {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const errors = [];
  try {
    async function navigate(target, name) {
      const desktop = target.locator('[data-workspace-nav]:visible').getByRole('button', { name, exact: true });
      if (await desktop.isVisible()) await desktop.click();
      else {
        const mobile = target.locator('[data-workspace-mobile-nav]');
        const button = mobile.getByRole('button', { name, exact: true });
        if (!await button.isVisible()) await target.locator('[data-workspace-header] details summary').click();
        await button.click();
      }
      const destination = { 'Обзор': 'home', 'Материалы': 'materials', 'Предметы': 'subjects', 'Знания': 'knowledge', 'Практика': 'review', 'polka.ai': 'assistant' }[name];
      assert(destination, `Known workspace destination: ${name}`);
      await target.locator(`main[data-page="${destination}"]`).waitFor();
    }
    async function context(username) {
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' });
      await ctx.addInitScript(() => localStorage.setItem('polka.community.telegram.v1', String(Date.now() + 30 * 24 * 60 * 60 * 1000)));
      if (username) {
        const response = await ctx.request.post(`${base}/api/auth`, { data: { action: 'login', username, password: 'polka-design-test-only-2026' } });
        assert.equal(response.status(), 200);
        // Production correctly sets Secure cookies. This synthetic HTTP-only
        // loopback harness changes transport flags in its own browser context.
        const cookies = await ctx.cookies();
        await ctx.addCookies(cookies.map(cookie => ({ ...cookie, secure: false })));
      }
      const page = await ctx.newPage();
      page.on('pageerror', error => errors.push(error.message));
      return { ctx, page };
    }
    const anonymous = await context();
    await anonymous.page.goto(base);
    await anonymous.page.locator('[data-polka-landing]').waitFor();
    assert.equal(await anonymous.page.locator('.design-version-switch').count(), 0);
    assert.equal((await anonymous.ctx.request.get(`${base}/api/admin/overview`)).status(), 401);
    await anonymous.ctx.close();
    check('anonymous sees the public landing and cannot access owner data');

    const student = await context('student');
    const studentSession = await (await student.ctx.request.get(`${base}/api/session`)).json();
    await student.page.addInitScript(id => localStorage.setItem(`polka.design.v2:${id}`, 'v1'), studentSession.user.id);
    await student.page.goto(base);
    await student.page.locator('[data-workspace-dashboard]').waitFor();
    await student.page.reload();
    await student.page.locator('[data-workspace-dashboard]').waitFor();
    assert.equal(await student.page.locator('[data-workspace-header]').count(), 1);
    assert.equal(await student.page.locator('.design-version-switch').count(), 0);
    assert.equal((await student.ctx.request.get(`${base}/api/admin/overview`)).status(), 403, 'General rollout must preserve owner-only administration');
    for (const [name, id] of [['Материалы', 'materials'], ['Предметы', 'subjects'], ['Знания', 'knowledge'], ['Практика', 'review'], ['polka.ai', 'assistant'], ['Обзор', 'home']]) {
      await navigate(student.page, name);
      await student.page.locator(`main[data-page="${id}"]`).waitFor();
    }
    await student.ctx.close();
    check('student receives new workspace despite old classic preference; owner administration stays private');

    const { ctx, page } = await context('artem');
    const ownerSession = await (await ctx.request.get(`${base}/api/session`)).json();
    assert.equal(ownerSession.user.id, fixture.artemId, 'Server must use the isolated fixture');
    await page.goto(base);
    await page.locator('.v2-dashboard .v2-material-row').first().waitFor();
    await page.addStyleTag({ content: 'nextjs-portal {display:none}' });
    assert.equal(await page.locator('.design-version-switch').count(), 0);
    assert.equal((await ctx.request.get(`${base}/api/admin/overview`)).status(), 200);
    await page.reload();
    await page.locator('.v2-dashboard .v2-material-row').first().waitFor();
    check('owner receives the same new workspace; reload and authorized administration work');

    const nav = async name => navigate(page, name);
    const fits = async label => {
      const size = await page.evaluate(() => ({ width: innerWidth, doc: document.documentElement.scrollWidth, body: document.body.scrollWidth }));
      assert(size.doc <= size.width + 1 && size.body <= size.width + 1, `${label}: horizontal overflow ${JSON.stringify(size)}`);
    };
    await page.keyboard.press('Control+k');
    const search = page.getByRole('combobox', { name: 'Поиск материалов и команд' });
    await search.fill('память');
    await page.keyboard.press('Enter');
    await page.locator('.detail-heading h1').waitFor();
    assert.equal(await page.locator('.detail-heading h1').innerText(), 'Как устроена память');
    await page.locator('.concept-title').last().click();
    await page.locator('.concept-body').waitFor();
    const importButton = page.getByRole('button', { name: /Добавить все · 1/ });
    if (await importButton.count()) await importButton.click();
    await page.getByRole('button', { name: 'Все понятия в базе знаний' }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Все понятия в базе знаний' }).isDisabled(), true);
    await nav('Знания');
    await page.locator('.topic-card').nth(1).waitFor();
    assert.equal(await page.locator('.topic-card').count(), 2);
    await page.locator('.topic-card').last().getByRole('button', { name: 'Как устроена память' }).click();
    await page.locator('.detail-heading h1').waitFor();
    check('command search, concept batch import and source navigation use real local API');

    await nav('Практика');
    await page.getByRole('button', { name: 'Повторить', exact: true }).click();
    await page.getByRole('button', { name: 'Показать разбор', exact: true }).click();
    await page.getByRole('button', { name: 'Помню и понимаю' }).click();
    await page.getByRole('button', { name: 'Сохранить результат', exact: true }).click();
    await page.getByRole('button', { name: 'Результат сохранён' }).waitFor();
    check('manual quiz completion and review persistence use real API');

    await page.setViewportSize({ width: 390, height: 844 });
    await nav('Обзор');
    await page.getByRole('button', { name: 'Добавить материал', exact: true }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Добавить материал' });
    await dialog.getByRole('button', { name: 'Добавить текст' }).click();
    await dialog.locator('[name=text]').fill('Тестовая заметка для проверки интерфейса.');
    await dialog.locator('[name=title]').fill('Пробная заметка');
    await dialog.locator('[name=subject]').fill('Тестовый предмет');
    await dialog.getByRole('checkbox', { name: /Автоматически подготовить лекцию/ }).uncheck();
    await dialog.getByRole('button', { name: 'Добавить', exact: true }).click();
    await page.locator('.detail-heading h1').filter({ hasText: 'Пробная заметка' }).waitFor();
    await page.getByRole('tab', { name: 'Оригинал и текст', exact: true }).click();
    await page.locator('.source-editor input').first().fill('Пробная заметка — обновлена');
    await page.locator('.source-text').fill('Обновлённый источник для проверки сохранения.');
    await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
    await page.locator('.detail-heading h1').filter({ hasText: 'Пробная заметка — обновлена' }).waitFor();
    await page.getByRole('button', { name: 'Удалить материал', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Оставить' }).click();
    await page.getByRole('button', { name: 'Удалить материал', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Удалить', exact: true }).click();
    await page.locator('.detail-heading').waitFor({ state: 'detached' });
    check('text upload, source editing, cancel and confirmed deletion');

    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.locator('[data-workspace-header] .v2-profile-trigger').click();
    await page.locator('.polka-identity').waitFor();
    assert((await page.locator('.polka-identity').innerText()).includes(fixture.artemId));
    await page.screenshot({ path: `${screenshots}/account-desktop.png`, fullPage: true });
    check('polka.id displays the real account identifier and usage');

    // UI stream/error/abort checks, no requests to an AI provider.
    await page.route('**/api/session', async route => {
      const response = await route.fetch();
      const data = await response.json();
      await route.fulfill({ response, json: { ...data, aiAvailable: true } });
    });
    await page.reload();
    await page.locator('[data-workspace-header]').waitFor();
    await nav('polka.ai');
    const input = page.getByRole('textbox', { name: 'Сообщение для polka.ai' });
    await input.waitFor();
    await page.getByRole('button', { name: 'polka.ai', exact: true }).last().click();
    await page.getByRole('dialog', { name: 'Как работает polka.ai' }).waitFor();
    await page.keyboard.press('Escape');
    assert.equal(await page.getByRole('dialog', { name: 'Как работает polka.ai' }).count(), 0);
    await page.route('**/api/chat', async route => {
      await new Promise(resolve => setTimeout(resolve, 850));
      await route.fulfill({ status: 503, json: { error: 'Тест: помощник временно недоступен.' } }).catch(() => {});
    });
    await input.fill('Проверка ошибки');
    await page.getByRole('button', { name: 'Отправить сообщение' }).click();
    await page.locator('.chat-lattice-loader').waitFor();
    await page.locator('.chat-error').waitFor();
    assert.equal(await input.inputValue(), 'Проверка ошибки');
    await page.getByRole('button', { name: 'Понятно', exact: true }).click();
    await input.fill('Проверка остановки');
    await page.getByRole('button', { name: 'Отправить сообщение' }).click();
    await page.getByRole('button', { name: 'Остановить генерацию' }).click();
    await page.locator('.chat-error').waitFor();
    await page.waitForFunction(() => document.querySelector('[aria-label="Сообщение для polka.ai"]')?.value === 'Проверка остановки');
    assert.equal(await input.inputValue(), 'Проверка остановки');
    await page.unroute('**/api/chat');
    await page.getByRole('button', { name: 'Понятно', exact: true }).click();
    const chatId = randomUUID(), userId = randomUUID(), assistantId = randomUUID(), now = new Date().toISOString();
    await page.route('**/api/chat', async route => {
      const content = 'Рабочая память удерживает информацию на короткое время. [1]';
      const chat = { id: chatId, title: 'Проверка диалога', updatedAt: now, materialIds: [fixture.materialId], status: 'idle', messages: [{ id: userId, role: 'user', content: 'Что такое рабочая память?', createdAt: now }, { id: assistantId, role: 'assistant', content, sources: [{ id: fixture.materialId, title: 'Как устроена память', index: 1 }], createdAt: now }] };
      const events = [{ type: 'start', chatId, userMessageId: userId, assistantMessageId: assistantId }, { type: 'delta', text: content }, { type: 'done', chat }];
      await route.fulfill({ contentType: 'text/event-stream', body: events.map(event => `data: ${JSON.stringify(event)}\n\n`).join('') });
    });
    await input.fill('Что такое рабочая память?');
    await page.getByRole('button', { name: 'Отправить сообщение' }).click();
    await page.locator('.chat-sources').waitFor();
    assert.equal(await page.locator('.chat-message').count(), 2);
    await page.screenshot({ path: `${screenshots}/chat-desktop.png`, fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await fits('mobile chat');
    await page.getByRole('button', { name: 'Показать диалоги' }).click();
    await page.locator('.history-visible').waitFor();
    await page.getByRole('button', { name: 'Закрыть список диалогов' }).click();
    await page.screenshot({ path: `${screenshots}/chat-mobile.png`, fullPage: true });
    await page.getByRole('button', { name: 'Открыть источник 1: Как устроена память' }).click();
    await page.locator('.detail-heading h1').waitFor();
    check('chat info, loader, failed-send draft, abort, SSE and source citation (AI stubs)');

    await page.setViewportSize({ width: 1280, height: 600 });
    await nav('Обзор');
    const sidebarPanel = page.locator('[data-workspace-header] aside');
    const sidebarAccount = sidebarPanel.getByRole('button', { name: 'Открыть polka.id' });
    await sidebarAccount.scrollIntoViewIfNeeded();
    const shortBox = await sidebarAccount.boundingBox();
    assert(shortBox && shortBox.y >= 0 && shortBox.y + shortBox.height <= 601, 'Account remains reachable on a short desktop screen');
    await sidebarAccount.click();
    await page.locator('.polka-identity').waitFor();
    await fits('short desktop account');
    check('desktop sidebar scrolls and account remains reachable at 1280×600');

    for (const width of [1440, 1280, 1024, 768, 390, 320]) {
      await page.setViewportSize({ width, height: width > 768 ? 1000 : 844 });
      if (width > 1024) {
        const sidebar = await page.locator('[data-workspace-nav]:visible').boundingBox();
        const content = await page.locator('main[data-page]').boundingBox();
        assert(sidebar && content && sidebar.x + sidebar.width <= content.x + 1, 'Desktop navigation sits beside the workspace');
      }
      for (const name of ['Обзор', 'Материалы', 'Предметы', 'Знания', 'Практика', 'polka.ai']) {
        await nav(name);
        await page.locator(`main[data-page]`).waitFor();
        await fits(`${width} ${name}`);
      }
      await page.locator('[data-workspace-header] .v2-profile-trigger').click();
      await page.locator('.polka-identity').waitFor();
      await fits(`${width} account`);
      await nav('Обзор');
      await page.screenshot({ path: `${screenshots}/overview-${width}.png`, fullPage: true });
      await page.locator('[data-workspace-header]').getByRole('button', { name: 'Открыть поиск и команды' }).click();
      await search.fill('несуществующий материал');
      await page.locator('.v2-command-empty').waitFor();
      const box = await page.getByRole('dialog', { name: 'Поиск и команды' }).boundingBox();
      assert(box.x >= 0 && box.x + box.width <= width + 1);
      await page.keyboard.press('Escape');
      await page.locator('[data-workspace-header]').getByRole('button', { name: 'Открыть поиск и команды' }).click();
      await search.fill('О polka');
      await page.keyboard.press('Enter');
      await page.locator('[data-polka-landing]').waitFor();
      await fits(`${width} landing`);
      if (width === 390 || width === 1440) await page.screenshot({ path: `${screenshots}/landing-${width}.png`, fullPage: true });
      await page.getByRole('button', { name: 'К моей полке' }).click();
      await page.getByRole('button', { name: 'Добавить материал', exact: true }).first().click();
      const upload = await page.getByRole('dialog', { name: 'Добавить материал' }).boundingBox();
      assert(upload.x >= 0 && upload.x + upload.width <= width + 1);
      await page.keyboard.press('Escape');
      await page.getByRole('dialog', { name: 'Добавить материал' }).waitFor({ state: 'detached' });
      check(`all sections, landing, command palette and upload fit width ${width}`);
    }
    assert.deepEqual(errors, [], 'No uncaught browser errors');
    check('no browser exceptions');
    await ctx.close();
    passed += await verifyLandingBrand(browser, base, screenshots);
    passed += await verifyTelegramPromo(browser, base, screenshots);
    console.log(`${passed} browser scenarios passed; screenshots: ${screenshots}`);
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });

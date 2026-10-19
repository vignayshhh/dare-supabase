import { test, expect } from '@playwright/test';
import { signIn } from './helpers';
import { qa } from './qa-env';

test('loading older Circle history preserves the visible anchor', async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, 'A');
  await page.route('**/rest/v1/circle_chat_messages?*', async route => {
    const url = new URL(route.request().url());
    const circleId = (url.searchParams.get('circle_id') || '').replace('eq.', '');
    const older = url.searchParams.has('seq');
    const rows = Array.from({ length: 40 }, (_, i) => {
      const seq = (older ? 40 : 80) - i;
      return { id: `history-fixture-${seq}`, seq, circle_id: circleId, author_id: `fixture-${Math.floor(seq / 3) % 2}`, author_name: 'Preview friend', body: `History fixture ${seq}`, created_at: new Date(1_790_000_000_000 + seq * 60_000).toISOString(), source_message_id: null, interaction_kind: null, interaction_id: null, status: null };
    });
    await route.fulfill({ json: rows });
  });
  await page.getByRole('button', { name: 'Messages', exact: true }).click();
  await page.locator('.circle-chat-entry').click();
  const older = page.getByRole('button', { name: 'Earlier lore', exact: true });
  await expect(older).toBeVisible();
  await page.locator('.circle-chat-feed').evaluate(el => { el.scrollTop = 0; });
  await older.click({ trial: true }); // Wait for the app's screen entrance to settle before measuring.
  const anchor = page.getByText('History fixture 41', { exact: true });
  const before = (await anchor.boundingBox())!.y;
  await older.click();
  await expect(page.getByText('History fixture 1', { exact: true })).toHaveCount(1);
  await expect.poll(async () => Math.abs((await anchor.boundingBox())!.y - before)).toBeLessThan(3);
  await page.screenshot({ path: '.tmp/chat-ui-after/older-history-anchor.png' });
});

test('mobile chat visual baseline and layout', async ({ page }) => {
  test.setTimeout(150_000);
  const phase = process.env.CHAT_UI_PHASE || 'after';
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, 'A');
  await page.getByRole('button', { name: 'Messages', exact: true }).click();
  const row = page.locator('.chat-inbox-row').filter({ hasText: 'DARE QA B' }).first();
  await expect(row).toBeVisible({ timeout: 20_000 });
  await row.click();
  await expect(page.locator('textarea[placeholder="Message..."]')).toBeVisible();
  await expect(page.locator('[data-message-id]').first()).toBeVisible({ timeout: 30_000 });
  for (const [width, height] of [[360,800], [390,844], [430,932]]) {
    await page.setViewportSize({ width, height });
    await page.screenshot({ path: `test-results/chat-ui/${phase}-dm-${width}.png` });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  const message = page.locator('[data-message-id]').last();
  if (await message.count()) {
    await message.dispatchEvent('contextmenu');
    await expect(page.getByText('Message options', { exact: true })).toBeVisible();
    await page.screenshot({ path: `test-results/chat-ui/${phase}-dm-menu.png` });
    await page.getByRole('button', { name: 'Reply', exact: true }).click();
    await expect(page.locator('.pop-message-input-bar > .pop-message-reply-card')).toHaveCSS('transform', 'none');
    await page.screenshot({ path: `test-results/chat-ui/${phase}-dm-reply.png` });
    await page.getByRole('button', { name: 'Cancel reply', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Cancel reply', exact: true })).toHaveCount(0);
  }
  if (phase === 'after') {
    await page.setViewportSize({ width: 390, height: 500 });
    const input = page.getByRole('textbox', { name: 'Message', exact: true });
    await input.fill('One\nTwo\nThree\nFour\nFive\nSix');
    await expect(input).toBeInViewport();
    expect((await input.boundingBox())!.height).toBeLessThanOrEqual(112);
    await page.screenshot({ path: `test-results/chat-ui/${phase}-dm-keyboard-height.png` });
    await input.fill('');
  }
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Messages', exact: true }).click();
  await page.locator('.circle-chat-entry').click();
  await expect(page.locator('.circle-chat-feed')).toBeVisible();
  await expect(page.getByText('Finding the group chat…')).toBeHidden({ timeout: 30_000 });
  await expect(page.locator('.circle-chat-message').first()).toBeVisible({ timeout: 20_000 });
  for (const [width, height] of [[360,800], [390,844], [430,932], [390,500]]) {
    await page.setViewportSize({ width, height });
    await page.screenshot({ path: `test-results/chat-ui/${phase}-circle-${width}-${height}.png` });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(page.getByLabel('Message your Circle')).toBeInViewport();
  }
  const options = page.getByRole('button', { name: /Create interaction from/ }).last();
  if (await options.count()) {
    await options.click();
    await expect(page.locator('.chat-picker-options button')).toHaveCount(6);
    await page.screenshot({ path: `test-results/chat-ui/${phase}-circle-menu.png` });
    await page.getByRole('button', { name: 'Close', exact: true }).click();
  }
  if (phase === 'after') {
    const bubble = page.locator('.chat-bubble[role="button"]').last();
    await bubble.scrollIntoViewIfNeeded();
    await bubble.dispatchEvent('pointerdown', { button: 0, clientX: 100, clientY: 200, pointerType: 'touch' });
    await bubble.dispatchEvent('pointermove', { clientX: 100, clientY: 230, pointerType: 'touch' });
    await page.waitForTimeout(460); // Exceed the actual 430ms long-press threshold.
    await bubble.dispatchEvent('pointerup');
    await expect(page.locator('.chat-picker')).toHaveCount(0);
    await bubble.dispatchEvent('pointerdown', { button: 0, clientX: 100, clientY: 200, pointerType: 'touch' });
    await expect(page.locator('.chat-picker')).toBeVisible();
    await bubble.dispatchEvent('pointerup');
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await bubble.press('Enter');
    await expect(page.locator('.chat-picker')).toHaveCSS('animation-name', 'none');
  }
});

test('Circle incoming groups retain hold actions and failed messages retry', async ({ browser }) => {
  test.skip(!qa.writeEnabled, 'Requires authorized QA message writes.');
  test.setTimeout(90_000);
  const contexts = await Promise.all([browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }), browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })]);
  const [a,b] = await Promise.all(contexts.map(c => c.newPage()));
  try {
    for (const p of [a,b]) await p.addInitScript(() => { (window as any).__DARE_QA__ = true; });
    await signIn(a, 'A'); await signIn(b, 'B');
    const circles = await Promise.all([a,b].map(p => p.evaluate(async () => {
      const client = (window as any).__DARE_QA_SUPABASE__;
      const { data, error } = await client.from('circles').select('id');
      if (error) throw Error(error.message);
      return data as {id:string}[];
    })));
    const shared = circles[0].find(c => circles[1].some(other => other.id === c.id));
    expect(shared).toBeTruthy();
    for (const p of [a,b]) {
      await p.evaluate(async id => {
        const client = (window as any).__DARE_QA_SUPABASE__;
        const user = (await client.auth.getUser()).data.user;
        localStorage.setItem(`dare-active-circle:${user.id}`, id);
      }, shared!.id);
      await p.reload({ waitUntil: 'networkidle' });
      await p.getByRole('button', { name: 'Messages', exact: true }).click();
      await p.locator('.circle-chat-entry').click();
      await expect(p.getByLabel('Connected', { exact: true })).toBeVisible();
      await expect(p.getByText('Finding the group chat…')).toBeHidden();
    }
    const marker = `UI-${Date.now()}`;
    let historyReads = 0;
    a.on('request', r => { if (r.method() === 'GET' && r.url().includes('/rest/v1/circle_chat_messages')) historyReads++; });
    for (const text of [`${marker} Are we still on for tonight?`, `${marker} I am bringing snacks. ${'VeryLongUnbrokenMessage'.repeat(8)}`]) {
      await b.getByLabel('Message your Circle').fill(text);
      await b.getByRole('button', { name: 'Send message', exact: true }).click();
      await expect(a.getByText(text, { exact: true })).toBeVisible();
    }
    const incoming = a.locator('.circle-chat-message').filter({ hasText: marker });
    await expect(incoming).toHaveCount(2);
    await expect(incoming.first()).toHaveClass(/is-joined-after/);
    await expect(incoming.last()).toHaveClass(/is-joined-before/);
    await expect(incoming.last().locator('.chat-author')).toHaveCount(0);
    await a.screenshot({ path: '.tmp/chat-ui-after/incoming-group-long-message.png' });
    const target = incoming.first().locator('.chat-bubble');
    await target.dispatchEvent('pointerdown', { button: 0, clientX: 100, clientY: 200, pointerType: 'touch' });
    await expect(a.locator('.chat-picker')).toBeVisible();
    await target.dispatchEvent('pointerup');
    await expect(a.locator('.chat-picker-options button')).toHaveCount(6);
    await a.getByRole('button', { name: 'Close', exact: true }).click();
    expect(historyReads, 'Receiving/grouping messages must not refetch history').toBe(0);
    await a.route('**/rest/v1/rpc/send_circle_chat', route => route.abort(), { times: 1 });
    await a.getByLabel('Message your Circle').fill(`${marker} retry check`);
    await a.getByRole('button', { name: 'Send message', exact: true }).click();
    const failed = a.locator('.circle-chat-message').filter({ hasText: `${marker} retry check` });
    await expect(failed.getByRole('button', { name: /Not sent/ })).toBeVisible();
    await a.screenshot({ path: '.tmp/chat-ui-after/failed-message.png' });
    await failed.getByRole('button', { name: /Not sent/ }).click();
    await expect(b.getByText(`${marker} retry check`, { exact: true })).toBeVisible();
    await expect(failed.getByRole('button', { name: /Not sent/ })).toHaveCount(0);
  } finally { await Promise.all(contexts.map(c => c.close())); }
});

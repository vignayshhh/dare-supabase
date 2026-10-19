import { test, expect, devices, type Page } from '@playwright/test';
import { signIn } from './helpers';

// Playwright does not open an OS keyboard. Keep the layout viewport unchanged
// and reproduce keyboard-driven VisualViewport resize + pan events explicitly.
async function keyboardViewport(page: Page, height: number, top = 0) {
  await page.evaluate(({ height, top }) => {
    const vv = window.visualViewport!;
    Object.defineProperty(vv, 'height', { configurable: true, get: () => height });
    Object.defineProperty(vv, 'offsetTop', { configurable: true, get: () => top });
    vv.dispatchEvent(new Event('resize'));
    vv.dispatchEvent(new Event('scroll'));
  }, { height, top });
}

for (const device of ['Pixel 7', 'iPhone 13']) {
  test(`${device}: no demo flash, composer follows keyboard viewport and pan`, async ({ browser }) => {
    test.setTimeout(90_000);
    const context = await browser.newContext({ ...devices[device], defaultBrowserType: undefined } as Parameters<typeof browser.newContext>[0]);
    const page = await context.newPage();
    try {
      await signIn(page, 'A');
      await page.getByRole('button', { name: 'Messages', exact: true }).click();
      await page.locator('.chat-inbox-row').filter({ hasText: 'DARE QA B' }).first().click();
      const dm = page.getByRole('textbox', { name: 'Message', exact: true });
      await expect(dm).toBeVisible();
      await expect(page.locator('[data-message-id]').first()).toBeVisible({ timeout: 30_000 });
      await page.getByRole('button', { name: 'Chat options' }).click();
      await page.getByRole('button', { name: 'Games', exact: true }).click();
      await expect(page.getByText('Pick a game', { exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Back to chat', exact: true }).click();
      await expect(dm).toBeVisible();
      const fullHeight = await page.evaluate(() => innerHeight);
      await page.screenshot({ path: `.tmp/chat-keyboard/${device}-dm-header.png` });
      for (const [height, top] of [[400, 0], [350, 48], [430, 0]]) {
        await dm.fill('Testing multiline input\nwith the keyboard open');
        await dm.focus();
        await keyboardViewport(page, height, top);
        await expect.poll(async () => (await page.locator('.pop-message-input-bar').boundingBox())!.y + (await page.locator('.pop-message-input-bar').boundingBox())!.height).toBeLessThanOrEqual(height + top + 1);
        const inputBox = (await dm.boundingBox())!;
        expect(inputBox.y).toBeGreaterThanOrEqual(top);
        expect(inputBox.y + inputBox.height).toBeLessThanOrEqual(height + top);
        expect(await page.evaluate(() => innerHeight)).toBe(fullHeight);
      }
      await page.screenshot({ path: `.tmp/chat-keyboard/${device}-dm-keyboard.png` });
      await dm.fill(''); await dm.blur();
      await keyboardViewport(page, fullHeight);
      await expect(page.locator('.pop-messaging-screen')).toHaveCSS('height', `${fullHeight}px`);
      await page.getByRole('button', { name: 'Back to chats' }).click();
      await page.route('**/rest/v1/circle_chat_messages?*', async route => {
        await new Promise(resolve => setTimeout(resolve, 900));
        await route.continue();
      });
      await page.locator('.circle-chat-entry').click();
      await expect(page.getByText('Finding the group chat…')).toBeVisible();
      await expect(page.getByText('Okay, who is actually brave enough for tonight?')).toHaveCount(0);
      await expect(page.locator('[data-circle-message-id^="demo-"]')).toHaveCount(0);
      await page.screenshot({ path: `.tmp/chat-keyboard/${device}-circle-loading.png` });
      await expect(page.getByText('Finding the group chat…')).toBeHidden({ timeout: 30_000 });
      await page.screenshot({ path: `.tmp/chat-keyboard/${device}-circle-header.png` });
      const circle = page.getByLabel('Message your Circle');
      await circle.fill('A message that stays visible\nwhile typing on a phone');
      await circle.focus();
      for (const [height, top] of [[400, 0], [350, 48], [430, 0]]) {
        await keyboardViewport(page, height, top);
        await expect.poll(async () => {
          const box = (await page.locator('.circle-chat-composer').boundingBox())!;
          return box.y + box.height;
        }).toBeLessThanOrEqual(height + top + 1);
        const inputBox = (await circle.boundingBox())!;
        expect(inputBox.y).toBeGreaterThanOrEqual(top);
        expect(inputBox.y + inputBox.height).toBeLessThanOrEqual(height + top);
        expect(await page.evaluate(() => innerHeight)).toBe(fullHeight);
      }
      await page.screenshot({ path: `.tmp/chat-keyboard/${device}-circle-keyboard.png` });
      await circle.fill(''); await circle.blur();
      await keyboardViewport(page, fullHeight);
      await expect(page.locator('.circle-chat-screen')).toHaveCSS('height', `${fullHeight}px`);
    } finally { await context.close(); }
  });
}

import { expect, test, type Page } from "@playwright/test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { completeOnboardingIfShown, signIn } from "./helpers";
import { qa } from "./qa-env";

const syntheticPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLz0QAAAABJRU5ErkJggg==",
  "base64",
);

async function openConversation(page: Page, name: string) {
  await page.getByRole("button", { name: "Messages", exact: true }).click();
  const row = page.locator(".chat-inbox-row").filter({ hasText: name });
  await expect(row).toBeVisible({ timeout: 10_000 });
  await row.click();
  await expect(page.locator('textarea[placeholder="Message..."]')).toBeVisible({ timeout: 10_000 });
}

async function expectLoadedPhoto(page: Page, alt: "Sent photo" | "Received photo", timeout = 25_000) {
  const photo = page.getByAltText(alt).last();
  await expect(photo).toBeVisible({ timeout });
  await expect.poll(() => photo.evaluate((image) => {
    const element = image as HTMLImageElement;
    return element.complete && element.naturalWidth > 0;
  }), { timeout }).toBe(true);
}

test("A's image message reaches B live and remains usable after reload", async ({ browser }) => {
  test.skip(!qa.writeEnabled, "Set DARE_QA_ALLOW_WRITES=true for authorized bounded message QA.");
  test.skip(!qa.messageWriteEnabled, "Set DARE_QA_ALLOW_MESSAGE_WRITE_ONCE=true for deliberate QA media.");
  test.setTimeout(100_000);

  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();
  try {
    await signIn(pageA, "A");
    await completeOnboardingIfShown(pageA);
    await openConversation(pageA, "DARE QA B");
    await signIn(pageB, "B");
    await completeOnboardingIfShown(pageB);
    await openConversation(pageB, "DARE QA A");

    const input = pageA.locator('input[type="file"][accept="image/*"][multiple]');
    await input.setInputFiles({
      name: `dare-qa-message-${qa.runId}-${Date.now()}.png`,
      mimeType: "image/png",
      buffer: syntheticPng,
    });
    await expectLoadedPhoto(pageA, "Sent photo");
    await expectLoadedPhoto(pageB, "Received photo");

    await pageB.reload();
    await openConversation(pageB, "DARE QA A");
    await expectLoadedPhoto(pageB, "Received photo");
    await pageB.getByRole("button", { name: /Open received photo.*fullscreen/ }).last().click();
    await expect(pageB.getByAltText(/Chat photo \d+ of \d+/).first()).toBeVisible({ timeout: 10_000 });
  } finally {
    await contextB.close();
    await contextA.close();
  }
});

test("failed image upload stays local and sends once after explicit retry", async ({ browser }) => {
  test.skip(!qa.writeEnabled, "Set DARE_QA_ALLOW_WRITES=true for authorized bounded message QA.");
  test.skip(!qa.messageWriteEnabled, "Set DARE_QA_ALLOW_MESSAGE_WRITE_ONCE=true for deliberate QA media.");
  test.setTimeout(100_000);

  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();
  let failedUpload = false;
  try {
    await signIn(pageA, "A");
    await completeOnboardingIfShown(pageA);
    await openConversation(pageA, "DARE QA B");
    await signIn(pageB, "B");
    await completeOnboardingIfShown(pageB);
    await openConversation(pageB, "DARE QA A");

    await pageA.route("**/storage/v1/object/**", async (route) => {
      if (!failedUpload && route.request().method() === "POST") {
        failedUpload = true;
        await route.abort("failed");
        return;
      }
      await route.continue();
    });
    const input = pageA.locator('input[type="file"][accept="image/*"][multiple]');
    await input.setInputFiles({
      name: `dare-qa-message-retry-${qa.runId}-${Date.now()}.png`,
      mimeType: "image/png",
      buffer: syntheticPng,
    });
    const retry = pageA.getByRole("button", { name: "Retry photo upload", exact: true });
    await expect(retry).toBeVisible({ timeout: 20_000 });
    await retry.click();
    await expectLoadedPhoto(pageB, "Received photo");
  } finally {
    await contextB.close();
    await contextA.close();
  }
});

test("expired stored photo URL refreshes on mobile delivery", async ({ browser }) => {
  test.skip(!qa.writeEnabled, "Set DARE_QA_ALLOW_WRITES=true for authorized bounded message QA.");
  test.skip(!qa.messageWriteEnabled, "Set DARE_QA_ALLOW_MESSAGE_WRITE_ONCE=true for deliberate QA media.");
  test.setTimeout(110_000);
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();
  try {
    await signIn(pageA, "A");
    await completeOnboardingIfShown(pageA);
    await openConversation(pageA, "DARE QA B");
    await signIn(pageB, "B");
    await completeOnboardingIfShown(pageB);
    await openConversation(pageB, "DARE QA A");
    const input = pageA.locator('input[type="file"][accept="image/*"][multiple]');
    await input.setInputFiles({ name: `dare-qa-message-expiry-${qa.runId}-${Date.now()}.png`, mimeType: "image/png", buffer: syntheticPng });
    await expectLoadedPhoto(pageB, "Received photo");

    let rewrote = false;
    await pageB.route("**/rest/v1/messages*", async (route) => {
      const response = await route.fetch();
      const text = await response.text();
      if (!rewrote || (!text.includes("media_url") && !text.includes("media_path"))) {
        await route.fulfill({ response, body: text });
        return;
      }
      try {
        const json = JSON.parse(text);
        const stale = (value: unknown) => {
          if (typeof value !== "string" || !value.includes("/storage/v1/object/sign/")) return value;
          const url = new URL(value);
          const payload = Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) - 60 })).toString("base64url");
          url.searchParams.set("token", `x.${payload}.z`);
          rewrote = false;
          return url.toString();
        };
        const rewrite = (value: any): any => Array.isArray(value) ? value.map(rewrite) : value && typeof value === "object" ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, key === "media_url" || key === "media_path" ? stale(item) : rewrite(item)])) : value;
        await route.fulfill({ response, body: JSON.stringify(rewrite(json)) });
      } catch {
        await route.fulfill({ response, body: text });
      }
    });
    rewrote = true;
    await pageB.reload();
    await openConversation(pageB, "DARE QA A");
    await expectLoadedPhoto(pageB, "Received photo", 30_000);
    expect(rewrote).toBe(false);
  } finally {
    await contextB.close();
    await contextA.close();
  }
});

test("mobile can cancel an in-flight photo upload without sending", async ({ browser }) => {
  test.skip(!qa.writeEnabled, "Set DARE_QA_ALLOW_WRITES=true for authorized bounded message QA.");
  test.skip(!qa.messageWriteEnabled, "Set DARE_QA_ALLOW_MESSAGE_WRITE_ONCE=true for deliberate QA media.");
  test.setTimeout(60_000);
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await signIn(page, "A");
    await completeOnboardingIfShown(page);
    await openConversation(page, "DARE QA B");
    await page.route("**/storage/v1/object/**", async (route) => {
      if (route.request().method() === "POST") {
        await new Promise((resolve) => setTimeout(resolve, 5_000));
        await route.abort("timedout");
        return;
      }
      await route.continue();
    });
    await page.locator('input[type="file"][accept="image/*"][multiple]').setInputFiles({ name: `dare-qa-message-cancel-${qa.runId}-${Date.now()}.png`, mimeType: "image/png", buffer: syntheticPng });
    const cancel = page.getByRole("button", { name: "Cancel photo upload", exact: true });
    await expect(cancel).toBeVisible({ timeout: 10_000 });
    await cancel.click();
    await expect(page.getByRole("button", { name: "Cancel photo upload", exact: true })).toHaveCount(0);
  } finally {
    await context.close();
  }
});

test("mobile rejects a message image over the 100 MB boundary before storage", async ({ browser }) => {
  test.skip(!qa.writeEnabled, "Set DARE_QA_ALLOW_WRITES=true for authorized bounded message QA.");
  test.skip(!qa.messageWriteEnabled, "Set DARE_QA_ALLOW_MESSAGE_WRITE_ONCE=true for deliberate QA media.");
  test.setTimeout(90_000);
  const context = await browser.newContext();
  const page = await context.newPage();
  let storagePosts = 0;
  try {
    await signIn(page, "A");
    await completeOnboardingIfShown(page);
    await openConversation(page, "DARE QA B");
    await page.route("**/storage/v1/object/**", async (route) => {
      if (route.request().method() === "POST") storagePosts += 1;
      await route.continue();
    });
    const oversizedPath = path.join(os.tmpdir(), `dare-qa-message-oversize-${qa.runId}-${Date.now()}.png`);
    fs.writeFileSync(oversizedPath, Buffer.alloc(100 * 1024 * 1024 + 1, 0));
    await page.locator('input[type="file"][accept="image/*"][multiple]').setInputFiles(oversizedPath);
    await expect(page.getByRole("button", { name: "Retry photo upload", exact: true })).toBeVisible({ timeout: 20_000 });
    expect(storagePosts).toBe(0);
    fs.rmSync(oversizedPath, { force: true });
  } finally {
    await context.close();
  }
});


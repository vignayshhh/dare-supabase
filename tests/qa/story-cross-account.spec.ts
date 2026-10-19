import { expect, test } from "@playwright/test";
import { completeOnboardingIfShown, signIn } from "./helpers";
import { qa } from "./qa-env";

const syntheticPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLz0QAAAABJRU5ErkJggg==",
  "base64",
);

test("A posts a dedication story addressed to B and B opens it", async ({ browser }) => {
  test.skip(!qa.storyWriteEnabled, "Set DARE_QA_ALLOW_STORY_WRITE_ONCE=true for the authorized one-shot story check.");
  test.setTimeout(90_000);
  const accountA = await browser.newContext();
  const accountB = await browser.newContext();
  const pageA = await accountA.newPage();
  const pageB = await accountB.newPage();

  try {
    await signIn(pageA, "A");
    await completeOnboardingIfShown(pageA);
    await pageA.getByLabel("Create story", { exact: true }).dispatchEvent("click");
    await expect(pageA.getByText("Choose your story type", { exact: true })).toBeVisible();
    await pageA.getByText("Dedication story", { exact: true }).click();
    await expect(pageA.getByText("Dedication story", { exact: true }).last()).toBeVisible();
    const recipient = pageA.getByRole("button", { name: /DARE QA B/i }).first();
    await expect(recipient).toBeVisible({ timeout: 15_000 });
    await recipient.click();

    const chooser = pageA.waitForEvent("filechooser");
    await pageA.getByLabel("Select story media", { exact: true }).click();
    await (await chooser).setFiles({
      name: `dare-qa-dedication-${qa.runId}.png`,
      mimeType: "image/png",
      buffer: syntheticPng,
    });
    await expect(pageA.getByAltText("Story preview")).toBeVisible({ timeout: 20_000 });
    await pageA.getByRole("button", { name: "Post to Your Story", exact: true }).click();
    await expect(pageA.getByAltText("Story preview")).toBeHidden({ timeout: 30_000 });

    await signIn(pageB, "B");
    await completeOnboardingIfShown(pageB);
    const story = pageB.getByLabel(/Open DARE QA A.*story/i).first();
    await expect(story).toBeVisible({ timeout: 20_000 });
    await story.click();
    await expect(pageB.locator('[data-story-media="true"]')).toBeVisible({ timeout: 5_000 });
  } finally {
    await accountB.close();
    await accountA.close();
  }
});

test("A posts a synthetic image story and B opens it", async ({ browser }) => {
  test.skip(!qa.storyWriteEnabled, "Set DARE_QA_ALLOW_STORY_WRITE_ONCE=true for the authorized one-shot story check.");
  test.setTimeout(90_000);
  const accountA = await browser.newContext();
  const accountB = await browser.newContext();
  const pageA = await accountA.newPage();
  const pageB = await accountB.newPage();

  try {
    await signIn(pageA, "A");
    await completeOnboardingIfShown(pageA);
    await pageA.getByLabel("Create story", { exact: true }).dispatchEvent("click");
    await expect(pageA.getByText("Choose your story type", { exact: true })).toBeVisible();
    await pageA.getByText("Normal story", { exact: true }).click();
    const chooser = pageA.waitForEvent("filechooser");
    await pageA.getByLabel("Select story media", { exact: true }).click();
    await (await chooser).setFiles({
      name: "dare-qa-story.png",
      mimeType: "image/png",
      buffer: syntheticPng,
    });
    await expect(pageA.getByAltText("Story preview")).toBeVisible({ timeout: 20_000 });
    await pageA.getByRole("button", { name: "Post to Your Story", exact: true }).click();
    await expect(pageA.getByAltText("Story preview")).toBeHidden({ timeout: 30_000 });

    await signIn(pageB, "B");
    await completeOnboardingIfShown(pageB);
    const story = pageB.getByLabel(/Open DARE QA A.*story/i).first();
    await expect(story).toBeVisible({ timeout: 20_000 });
    await story.click();
    await expect(pageB.locator('[data-story-media="true"]')).toBeVisible({ timeout: 5_000 });
  } finally {
    await accountB.close();
    await accountA.close();
  }
});

test("B can open A's existing QA story viewer", async ({ browser }) => {
  test.setTimeout(45_000);
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    const storyFeed = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/stories/friends");
    await signIn(page, "B");
    await completeOnboardingIfShown(page);
    const response = await storyFeed;
    expect(response.status()).toBe(200);
    const payload = await response.json();
    const stories = Array.isArray(payload) ? payload : payload.data;
    expect(Array.isArray(stories)).toBe(true);
    const authorUsername = qa.account("A").username.replace(/^@/, "").toLowerCase();
    const currentFixture = stories.find((story: any) =>
      String(story.author?.username || "").replace(/^@/, "").toLowerCase() === authorUsername,
    );
    test.skip(!currentFixture, "No unexpired A Story fixture in the successful friend feed; run the gated Story creation test to provision one.");
    const story = page.getByLabel(/Open DARE QA A.*story/i).first();
    await expect(story).toBeVisible({ timeout: 20_000 });
    await story.click();
    await expect(page.locator('[data-story-media="true"]')).toBeVisible({ timeout: 5_000 });
    await expect.poll(() => page.locator('[data-story-media="true"]').evaluate((media) => {
      if (media instanceof HTMLImageElement) return media.naturalWidth;
      if (media instanceof HTMLVideoElement) return media.readyState > 0 ? 1 : 0;
      return 1;
    }), { timeout: 10_000 }).toBeGreaterThan(0);
  } finally {
    await context.close();
  }
});

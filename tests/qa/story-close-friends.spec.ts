import { expect, test, type Page } from "@playwright/test";
import { completeOnboardingIfShown, signIn } from "./helpers";
import { qa } from "./qa-env";

const syntheticPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLz0QAAAABJRU5ErkJggg==",
  "base64",
);

async function ensureBIsACloseFriend(pageA: Page) {
  await pageA.getByRole("button", { name: "DARE QA A", exact: true }).first().click();
  await pageA.getByLabel("Find people", { exact: true }).click();
  await pageA
    .getByPlaceholder("Search by username or display name")
    .fill(qa.account("B").username);
  const bUsername = qa.account("B").username.replace(/^@/, "");
  await pageA
    .getByRole("button", { name: new RegExp(`DARE QA B\\s+@${bUsername}`, "i") })
    .click();

  const friends = pageA.getByRole("button", { name: /^\d+ Friends$/ });
  await expect(friends).toBeVisible({ timeout: 15_000 });
  await friends.click();

  const add = pageA.getByRole("button", { name: "Add to Close Friends", exact: true });
  if (await add.isVisible().catch(() => false)) {
    const persisted = pageA.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        new URL(response.url()).pathname.endsWith("/rest/v1/close_friends"),
    );
    await add.click();
    expect((await persisted).status()).toBeLessThan(300);
  }
  await expect(
    pageA.getByRole("button", { name: "Remove from Close Friends", exact: true }),
  ).toBeVisible({ timeout: 10_000 });
}

test("A publishes a Close Friends story and B receives and opens it", async ({ browser }) => {
  test.skip(
    !qa.writeEnabled || !qa.storyWriteEnabled,
    "Close Friends story creation requires the authorized relationship and Story write gates.",
  );
  test.setTimeout(120_000);

  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();

  try {
    await signIn(pageA, "A");
    await completeOnboardingIfShown(pageA);
    await ensureBIsACloseFriend(pageA);

    await pageA.goto("/", { waitUntil: "networkidle" });
    await pageA.getByLabel("Create story", { exact: true }).dispatchEvent("click");
    await expect(pageA.getByText("Choose your story type", { exact: true })).toBeVisible();
    await pageA.getByText("Normal story", { exact: true }).click();

    const chooser = pageA.waitForEvent("filechooser");
    await pageA.getByLabel("Select story media", { exact: true }).click();
    await (await chooser).setFiles({
      name: `dare-qa-close-friends-${qa.runId}.png`,
      mimeType: "image/png",
      buffer: syntheticPng,
    });
    await expect(pageA.getByAltText("Story preview")).toBeVisible({ timeout: 20_000 });
    await pageA.getByRole("button", { name: "Close Friends", exact: true }).click();
    const createStory = pageA.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        new URL(response.url()).pathname.endsWith("/rest/v1/stories"),
    );
    await pageA.getByRole("button", { name: "Post to Close Friends", exact: true }).click();
    expect((await createStory).status()).toBeLessThan(300);
    await expect(pageA.getByAltText("Story preview")).toBeHidden({ timeout: 30_000 });

    const storyFeed = pageB.waitForResponse(
      (response) => new URL(response.url()).pathname === "/api/stories/friends",
    );
    await signIn(pageB, "B");
    await completeOnboardingIfShown(pageB);
    const feedResponse = await storyFeed;
    expect(feedResponse.status()).toBe(200);
    const payload = await feedResponse.json();
    const stories = Array.isArray(payload) ? payload : payload.data;
    const authorUsername = qa.account("A").username.replace(/^@/, "").toLowerCase();
    const closeFriendsStory = stories.find(
      (story: any) =>
        String(story.author?.username || "").replace(/^@/, "").toLowerCase() ===
          authorUsername && story.visibility === "CLOSE_FRIENDS",
    );
    expect(closeFriendsStory).toBeTruthy();

    const story = pageB.getByLabel(/Open DARE QA A.*story/i).first();
    await expect(story).toBeVisible({ timeout: 20_000 });
    await story.click();
    await expect(pageB.locator('[data-story-media="true"]')).toBeVisible({ timeout: 8_000 });
    await expect
      .poll(
        () =>
          pageB.locator('[data-story-media="true"]').evaluate((media) => {
            if (media instanceof HTMLImageElement) return media.naturalWidth;
            if (media instanceof HTMLVideoElement) return media.readyState > 0 ? 1 : 0;
            return 0;
          }),
        { timeout: 10_000 },
      )
      .toBeGreaterThan(0);
  } finally {
    await contextB.close();
    await contextA.close();
  }
});

test("B reopens the retained Close Friends story without a write", async ({ page }) => {
  test.setTimeout(60_000);
  const storyFeed = page.waitForResponse(
    (response) => new URL(response.url()).pathname === "/api/stories/friends",
  );
  await signIn(page, "B");
  await completeOnboardingIfShown(page);
  const response = await storyFeed;
  expect(response.status()).toBe(200);
  const payload = await response.json();
  const stories = Array.isArray(payload) ? payload : payload.data;
  const authorUsername = qa.account("A").username.replace(/^@/, "").toLowerCase();
  expect(
    stories.some(
      (story: any) =>
        String(story.author?.username || "").replace(/^@/, "").toLowerCase() ===
          authorUsername && story.visibility === "CLOSE_FRIENDS",
    ),
  ).toBe(true);

  const story = page.getByLabel(/Open DARE QA A.*story/i).first();
  await expect(story).toBeVisible({ timeout: 20_000 });
  await story.click();
  const media = page.locator('[data-story-media="true"]');
  await expect(media).toBeVisible({ timeout: 8_000 });
  await expect
    .poll(
      () =>
        media.evaluate((element) => {
          if (element instanceof HTMLImageElement) return element.naturalWidth;
          if (element instanceof HTMLVideoElement) return element.readyState > 0 ? 1 : 0;
          return 0;
        }),
      { timeout: 10_000 },
    )
    .toBeGreaterThan(0);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
  ).toBe(true);
});

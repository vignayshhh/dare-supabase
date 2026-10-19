import { expect, test, type Page } from "@playwright/test";
import { completeOnboardingIfShown, signIn } from "./helpers";
import { qa } from "./qa-env";

const marker = `DARE-QA-${qa.runId}-feed-image-carousel-01`;
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLz0QAAAABJRU5ErkJggg==", "base64");

async function assertCarousel(page: Page) {
  const unintendedLikes: string[] = [];
  const observe = (request: import("@playwright/test").Request) => {
    const path = new URL(request.url()).pathname;
    if (request.method() === "POST" && /^\/api\/posts\/[^/]+\/like$/.test(path)) unintendedLikes.push(path);
  };
  page.on("request", observe);
  try {
    const post = page.locator(".feed-post-card").filter({ hasText: marker }).first();
    await expect(post).toBeVisible({ timeout: 25_000 });
    for (const slide of [1, 2]) {
      await expect.poll(() => post.getByAltText(`Slide ${slide}`, { exact: true }).evaluate(
        (image: HTMLImageElement) => image.complete && image.naturalWidth > 0 && new URL(image.currentSrc).pathname.startsWith("/storage/v1/object/sign/post-media/"),
      ), { timeout: 15_000 }).toBe(true);
    }
    await post.getByRole("button", { name: "Next image", exact: true }).click();
    await expect(post.getByRole("button", { name: "Next image", exact: true })).toBeDisabled();
    await expect(post.getByRole("button", { name: "Previous image", exact: true })).toBeEnabled();
    await post.getByRole("button", { name: "Previous image", exact: true }).click();
    await expect(post.getByRole("button", { name: "Previous image", exact: true })).toBeDisabled();
    await page.waitForTimeout(350);
    expect(unintendedLikes, "Carousel navigation must not add post likes").toHaveLength(0);
  } finally {
    page.off("request", observe);
  }
}

async function readAccountBLikeCount(page: Page) {
  const post = page.locator(".feed-post-card").filter({ hasText: marker }).first();
  await post.getByRole("button", { name: "Open likes", exact: true }).click();
  const sheet = page.locator(".app-modal-sheet");
  await expect(sheet.getByRole("heading", { name: "Likes", exact: true })).toBeVisible();
  const accountRow = sheet.locator("div.flex.items-center.gap-3").filter({ hasText: "DARE QA B" }).first();
  await expect(accountRow).toBeVisible({ timeout: 10_000 });
  const label = await accountRow.getByText(/^liked \d+ (?:time|times)$/).innerText();
  const count = Number(label.match(/\d+/)?.[0]);
  expect(count).toBeGreaterThan(0);
  await page.locator(".app-modal-backdrop").click({ position: { x: 5, y: 5 } });
  await expect(sheet).toBeHidden();
  return count;
}

test("A uploads a two-image feed carousel and B sees loaded persisted slides", async ({ browser }) => {
  test.skip(!qa.writeEnabled || !qa.postWriteEnabled, "Requires the general and post-write gates.");
  test.setTimeout(120_000);
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  try {
    const pageA = await contextA.newPage();
    const initial = pageA.waitForResponse((response) => new URL(response.url()).pathname === "/api/posts/feed");
    await signIn(pageA, "A");
    await completeOnboardingIfShown(pageA);
    await pageA.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
    const feed = await (await initial).json();
    const existing = (feed.items || feed.posts || []).find((post: any) => (post.content || post.body) === marker);
    if (!existing) {
      const home = pageA.getByLabel("Home", { exact: true });
      await home.dispatchEvent("pointerdown", { pointerType: "touch" });
      await pageA.waitForTimeout(550);
      await home.dispatchEvent("pointerup", { pointerType: "touch" });
      await pageA.getByRole("dialog", { name: "Choose center action" }).getByRole("button", { name: "Create", exact: true }).click();
      await pageA.getByText("Post to Feed", { exact: true }).click();
      await expect(pageA.getByRole("heading", { name: "Create Post" })).toBeVisible();
      await pageA.locator('input[type="file"][multiple]').setInputFiles([
        { name: "dare-qa-feed-slide-1.png", mimeType: "image/png", buffer: png },
        { name: "dare-qa-feed-slide-2.png", mimeType: "image/png", buffer: png },
      ]);
      await pageA.getByPlaceholder("Add a caption...").fill(marker);
      const publish = pageA.waitForResponse((response) => response.request().method() === "POST" && new URL(response.url()).pathname === "/api/posts", { timeout: 40_000 });
      await pageA.getByRole("button", { name: /^Post/ }).click();
      const response = await publish;
      expect(response.status()).toBe(200);
      const request = response.request().postDataJSON();
      expect(request.media_urls).toHaveLength(2);
      expect(request.media_type).toBe("PHOTO");
    }
    await assertCarousel(pageA);
    const pageB = await contextB.newPage();
    await signIn(pageB, "B");
    await completeOnboardingIfShown(pageB);
    await pageB.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
    await assertCarousel(pageB);
    await pageB.reload({ waitUntil: "networkidle" });
    await pageB.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
    await assertCarousel(pageB);
  } finally {
    await contextA.close();
    await contextB.close();
  }
});

test("B reads the retained feed carousel with working image navigation", async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  await signIn(page, "B");
  await completeOnboardingIfShown(page);
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
  await assertCarousel(page);
  const dimensions = await page.evaluate(() => ({ viewport: innerWidth, content: document.documentElement.scrollWidth }));
  expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport + 1);
  await page.screenshot({ path: testInfo.outputPath("persisted-feed-carousel.png"), fullPage: false });
});

test("B's intentional media double-taps add repeat likes that persist for A", async ({ browser }) => {
  test.skip(!qa.writeEnabled, "Requires the authorized general write gate.");
  test.setTimeout(90_000);
  const contextB = await browser.newContext();
  const contextA = await browser.newContext();
  try {
    const pageB = await contextB.newPage();
    await signIn(pageB, "B");
    await completeOnboardingIfShown(pageB);
    await pageB.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
    let postB = pageB.locator(".feed-post-card").filter({ hasText: marker }).first();
    await expect(postB).toBeVisible({ timeout: 25_000 });
    const media = postB.locator("[data-feed-post-media]");
    const mediaId = await media.getAttribute("id");
    expect(mediaId).toMatch(/^media-[0-9a-f-]+$/);
    const postId = mediaId!.slice("media-".length);
    const responses: number[] = [];
    const observe = (response: import("@playwright/test").Response) => {
      if (response.request().method() === "POST" && new URL(response.url()).pathname === `/api/posts/${postId}/like`) {
        responses.push(response.status());
      }
    };
    pageB.on("response", observe);
    try {
      await media.dblclick({ position: { x: 48, y: 80 }, delay: 60 });
      await expect.poll(() => responses.length, { timeout: 10_000 }).toBe(1);
      await pageB.waitForTimeout(400);
      await media.dblclick({ position: { x: 48, y: 80 }, delay: 60 });
      await expect.poll(() => responses.length, { timeout: 10_000 }).toBe(2);
      expect(responses).toEqual([200, 200]);
    } finally {
      pageB.off("response", observe);
    }

    await pageB.reload({ waitUntil: "networkidle" });
    await pageB.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
    postB = pageB.locator(".feed-post-card").filter({ hasText: marker }).first();
    await expect(postB).toBeVisible({ timeout: 25_000 });
    const persistedCount = await readAccountBLikeCount(pageB);
    expect(persistedCount).toBeGreaterThanOrEqual(2);

    const pageA = await contextA.newPage();
    await signIn(pageA, "A");
    await completeOnboardingIfShown(pageA);
    await pageA.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
    expect(await readAccountBLikeCount(pageA)).toBe(persistedCount);
  } finally {
    await contextB.close();
    await contextA.close();
  }
});

import { expect, test, type Page } from "@playwright/test";
import { completeOnboardingIfShown, signIn } from "./helpers";
import { qa } from "./qa-env";

const marker = `DARE-QA-${qa.runId}-feed-video-01`;

async function tinyWebm(page: Page) {
  const encoded = await page.evaluate(async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 80;
    const context = canvas.getContext("2d")!;
    const stream = canvas.captureStream(12);
    const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp8")
      ? "video/webm;codecs=vp8"
      : "video/webm";
    const chunks: BlobPart[] = [];
    const recorder = new MediaRecorder(stream, { mimeType });
    recorder.ondataavailable = (event) => {
      if (event.data.size) chunks.push(event.data);
    };
    const stopped = new Promise<void>((resolve) => {
      recorder.onstop = () => resolve();
    });
    recorder.start(100);
    for (let frame = 0; frame < 18; frame += 1) {
      context.fillStyle = frame % 2 ? "#22c55e" : "#111827";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = "#ffffff";
      context.fillRect(8 + frame * 2, 28, 12, 12);
      await new Promise((resolve) => setTimeout(resolve, 60));
    }
    recorder.stop();
    await stopped;
    stream.getTracks().forEach((track) => track.stop());
    const blob = new Blob(chunks, { type: "video/webm" });
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
  });
  return Buffer.from(encoded, "base64");
}

async function assertVideoPost(page: Page) {
  const post = page.locator(".feed-post-card").filter({ hasText: marker }).first();
  await expect(post).toBeVisible({ timeout: 30_000 });
  const video = post.getByLabel("Post video", { exact: true });
  await expect(video).toBeVisible();
  await expect.poll(() => video.evaluate((element: HTMLVideoElement) => ({
    controls: element.controls,
    loaded: element.readyState >= HTMLMediaElement.HAVE_METADATA,
    duration: Number.isFinite(element.duration) && element.duration > 0,
    signedPath: new URL(element.currentSrc).pathname.startsWith("/storage/v1/object/sign/post-media/"),
  })), { timeout: 20_000 }).toEqual({ controls: true, loaded: true, duration: true, signedPath: true });
  expect(await video.evaluate(async (element: HTMLVideoElement) => {
    element.muted = true;
    await element.play();
    await new Promise((resolve) => setTimeout(resolve, 120));
    const progressed = element.currentTime > 0;
    element.pause();
    return progressed;
  })).toBe(true);
}

test("A uploads a video feed post and B receives a loaded persistent player", async ({ browser }) => {
  test.skip(!qa.writeEnabled || !qa.postWriteEnabled, "Requires the general and post-write gates.");
  test.setTimeout(150_000);
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  try {
    const pageA = await contextA.newPage();
    await signIn(pageA, "A");
    await completeOnboardingIfShown(pageA);
    await pageA.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
    if ((await pageA.getByText(marker, { exact: false }).count()) === 0) {
      const home = pageA.getByLabel("Home", { exact: true });
      await home.dispatchEvent("pointerdown", { pointerType: "touch" });
      await pageA.waitForTimeout(550);
      await home.dispatchEvent("pointerup", { pointerType: "touch" });
      await pageA.getByRole("dialog", { name: "Choose center action" }).getByRole("button", { name: "Create", exact: true }).click();
      await pageA.getByText("Post to Feed", { exact: true }).click();
      const video = await tinyWebm(pageA);
      expect(video.length).toBeGreaterThan(100);
      await pageA.locator('input[type="file"][accept="image/*,video/*,audio/*"]').setInputFiles({
        name: "dare-qa-video.webm",
        mimeType: "video/webm",
        buffer: video,
      });
      await expect(pageA.getByAltText("Video", { exact: true })).toBeVisible({ timeout: 20_000 });
      await pageA.getByPlaceholder("Add a caption...").fill(marker);
      const publish = pageA.waitForResponse((response) => response.request().method() === "POST" && new URL(response.url()).pathname === "/api/posts", { timeout: 45_000 });
      await pageA.getByRole("button", { name: /^Post/ }).click();
      const response = await publish;
      expect(response.ok()).toBe(true);
      expect(response.request().postDataJSON().media_type).toBe("VIDEO");
    }
    await assertVideoPost(pageA);

    const pageB = await contextB.newPage();
    await signIn(pageB, "B");
    await completeOnboardingIfShown(pageB);
    await pageB.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
    await assertVideoPost(pageB);
    await pageB.reload({ waitUntil: "networkidle" });
    await pageB.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
    await assertVideoPost(pageB);
  } finally {
    await contextA.close();
    await contextB.close();
  }
});

test("B reads the retained playable video post", async ({ page }) => {
  await signIn(page, "B");
  await completeOnboardingIfShown(page);
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
  await assertVideoPost(page);
  const dimensions = await page.evaluate(() => ({ viewport: innerWidth, content: document.documentElement.scrollWidth }));
  expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport + 1);
});

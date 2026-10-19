import { expect, test, type Page } from "@playwright/test";
import { completeOnboardingIfShown, signIn } from "./helpers";
import { qa } from "./qa-env";

const marker = `DARE-QA-${qa.runId}-feed-audio-01`;

function tinyWav() {
  const sampleRate = 8_000;
  const sampleCount = 2_000;
  const wav = Buffer.alloc(44 + sampleCount, 128);
  wav.write("RIFF", 0, "ascii");
  wav.writeUInt32LE(36 + sampleCount, 4);
  wav.write("WAVE", 8, "ascii");
  wav.write("fmt ", 12, "ascii");
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(sampleRate, 24);
  wav.writeUInt32LE(sampleRate, 28);
  wav.writeUInt16LE(1, 32);
  wav.writeUInt16LE(8, 34);
  wav.write("data", 36, "ascii");
  wav.writeUInt32LE(sampleCount, 40);
  return wav;
}

async function assertAudioPost(page: Page) {
  const post = page.locator(".feed-post-card").filter({ hasText: marker }).first();
  await expect(post).toBeVisible({ timeout: 30_000 });
  const audio = post.getByLabel("Post audio", { exact: true });
  await expect(audio).toBeVisible();
  await expect.poll(() => audio.evaluate((element: HTMLAudioElement) => ({
    controls: element.controls,
    loaded: element.readyState >= HTMLMediaElement.HAVE_METADATA,
    signedPath: new URL(element.currentSrc).pathname.startsWith("/storage/v1/object/sign/post-media/"),
  })), { timeout: 20_000 }).toEqual({ controls: true, loaded: true, signedPath: true });
  expect(await audio.evaluate(async (element: HTMLAudioElement) => {
    element.muted = true;
    await element.play();
    await new Promise((resolve) => setTimeout(resolve, 120));
    const progressed = element.currentTime > 0;
    element.pause();
    return progressed;
  })).toBe(true);
}

test("A uploads an audio feed post and B receives a loaded persistent player", async ({ browser }) => {
  test.skip(!qa.writeEnabled || !qa.postWriteEnabled, "Requires the general and post-write gates.");
  test.setTimeout(120_000);
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
      await pageA.locator('input[type="file"][accept="image/*,video/*,audio/*"]').setInputFiles({
        name: "dare-qa-audio.wav",
        mimeType: "audio/wav",
        buffer: tinyWav(),
      });
      await expect(pageA.getByText("Audio File", { exact: true })).toBeVisible();
      await pageA.getByPlaceholder("Add a caption...").fill(marker);
      const publish = pageA.waitForResponse((response) => response.request().method() === "POST" && new URL(response.url()).pathname === "/api/posts", { timeout: 45_000 });
      await pageA.getByRole("button", { name: /^Post/ }).click();
      const response = await publish;
      expect(response.ok()).toBe(true);
      expect(response.request().postDataJSON().media_type).toBe("AUDIO");
    }
    await assertAudioPost(pageA);

    const pageB = await contextB.newPage();
    await signIn(pageB, "B");
    await completeOnboardingIfShown(pageB);
    await pageB.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
    await assertAudioPost(pageB);
    await pageB.reload({ waitUntil: "networkidle" });
    await pageB.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
    await assertAudioPost(pageB);
  } finally {
    await contextA.close();
    await contextB.close();
  }
});

test("B reads the retained playable audio post", async ({ page }) => {
  await signIn(page, "B");
  await completeOnboardingIfShown(page);
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
  await assertAudioPost(page);
  const dimensions = await page.evaluate(() => ({ viewport: innerWidth, content: document.documentElement.scrollWidth }));
  expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport + 1);
});

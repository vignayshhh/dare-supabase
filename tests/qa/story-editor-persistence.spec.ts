import { expect, test } from "@playwright/test";
import { completeOnboardingIfShown, signIn } from "./helpers";
import { qa } from "./qa-env";

const syntheticPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLz0QAAAABJRU5ErkJggg==",
  "base64",
);

test("A's Story text, effect, music, and drawing persist for B", async ({ browser }) => {
  test.skip(
    !qa.writeEnabled || !qa.storyWriteEnabled,
    "Story editor persistence requires the authorized Story write gate.",
  );
  test.setTimeout(120_000);
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();
  const marker = `QA EDITOR ${qa.runId}`;

  try {
    await signIn(pageA, "A");
    await completeOnboardingIfShown(pageA);
    await pageA.getByLabel("Create story", { exact: true }).dispatchEvent("click");
    await pageA.getByText("Normal story", { exact: true }).click();
    const chooser = pageA.waitForEvent("filechooser");
    await pageA.getByLabel("Select story media", { exact: true }).click();
    await (await chooser).setFiles({
      name: `dare-qa-story-editor-${qa.runId}.png`,
      mimeType: "image/png",
      buffer: syntheticPng,
    });
    await expect(pageA.getByAltText("Story preview")).toBeVisible({ timeout: 20_000 });

    await pageA.getByLabel("Add text", { exact: true }).click();
    await pageA.getByPlaceholder("Type", { exact: true }).fill(marker);
    await pageA.getByRole("button", { name: "Typewriter", exact: true }).click();
    await pageA.getByRole("button", { name: "Bg", exact: true }).click();
    await pageA.getByRole("button", { name: /Align/ }).click();
    await pageA.getByLabel("Use #facc15", { exact: true }).click();
    await pageA.getByRole("button", { name: "Done", exact: true }).click();

    await pageA.getByLabel("Effects", { exact: true }).click();
    await pageA.getByLabel("Add music", { exact: true }).click();
    await pageA.getByRole("button", { name: /Pulse.*Generated soft beat/i }).click();
    await pageA.getByLabel("Close music", { exact: true }).click();

    await pageA.getByLabel("Draw", { exact: true }).click();
    await pageA.getByRole("button", { name: "Marker", exact: true }).click();
    await pageA.getByLabel("Use brush #facc15", { exact: true }).click();
    const hotspot = pageA.locator(".story-draw-hotspot");
    const box = await hotspot.boundingBox();
    expect(box).toBeTruthy();
    await pageA.mouse.move(box!.x + box!.width * 0.25, box!.y + box!.height * 0.35);
    await pageA.mouse.down();
    await pageA.mouse.move(box!.x + box!.width * 0.72, box!.y + box!.height * 0.68, {
      steps: 8,
    });
    await pageA.mouse.up();
    await pageA.getByRole("button", { name: "Done", exact: true }).click();

    const created = pageA.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        new URL(response.url()).pathname.endsWith("/rest/v1/stories"),
    );
    await pageA.getByRole("button", { name: "Post to Your Story", exact: true }).click();
    expect((await created).status()).toBeLessThan(300);

    const storyFeed = pageB.waitForResponse(
      (response) => new URL(response.url()).pathname === "/api/stories/friends",
    );
    await signIn(pageB, "B");
    await completeOnboardingIfShown(pageB);
    const feedResponse = await storyFeed;
    expect(feedResponse.status()).toBe(200);
    const payload = await feedResponse.json();
    const stories = Array.isArray(payload) ? payload : payload.data;
    const persisted = stories.find((story: any) => story.storyText?.text === marker);
    expect(persisted).toMatchObject({
      storyFilter: "vivid",
      storyMusic: { id: "pulse", label: "Pulse" },
      storyText: {
        text: marker,
        color: "#facc15",
        font: "Typewriter",
        background: false,
        align: "left",
      },
    });
    expect(persisted.storyDrawPaths).toHaveLength(1);
    expect(persisted.storyDrawPaths[0]).toMatchObject({
      color: "#facc15",
      brush: "Marker",
    });

    const story = pageB.getByLabel(/Open DARE QA A.*story/i).first();
    await story.click();
    await expect(pageB.getByText(marker, { exact: true })).toBeVisible({ timeout: 8_000 });
    await expect(pageB.locator('[data-story-drawing="true"] path')).toHaveCount(1);
    await expect(pageB.locator('[data-story-media="true"]')).toHaveCSS(
      "filter",
      /saturate\(1\.28\).*contrast\(1\.08\)/,
    );
  } finally {
    await contextB.close();
    await contextA.close();
  }
});

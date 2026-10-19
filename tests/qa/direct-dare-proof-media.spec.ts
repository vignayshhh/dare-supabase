import { expect, test, type Page } from "@playwright/test";
import { completeOnboardingIfShown, signIn } from "./helpers";
import { qa } from "./qa-env";

async function openProof(page: Page) {
  await page.getByRole("button", { name: "Dares", exact: true }).click({ force: true });
  const entry = page.locator('[data-reel-index="0"]');
  await expect(entry).toBeVisible({ timeout: 30_000 });
  await entry.locator(".pop-dare-cover-card").dblclick();
  await expect.poll(() => entry.getByAltText("Dare proof", { exact: true }).evaluate(
    (image: HTMLImageElement) => image.complete && image.naturalWidth > 0,
  )).toBe(true);
  await expect(entry.getByRole("button", { name: "Like dare proof" })).toBeVisible({ timeout: 20_000 });
  return entry;
}

test("B's direct-Dare proof like and view persist", async ({ page }) => {
  test.skip(!qa.writeEnabled, "Requires DARE_QA_ALLOW_WRITES=true.");
  test.setTimeout(90_000);
  const viewWrite = page.waitForResponse((response) =>
    response.request().method() === "POST" &&
    new URL(response.url()).pathname.endsWith("/rest/v1/dare_views"),
  );
  await signIn(page, "B");
  await completeOnboardingIfShown(page);
  let entry = await openProof(page);
  expect((await viewWrite).status()).toBe(201);
  await expect.poll(async () => Number(await entry.getByLabel("Dare proof views").textContent())).toBeGreaterThan(0);
  const like = entry.getByRole("button", { name: "Like dare proof" });
  if ((await like.getAttribute("aria-pressed")) !== "true") {
    const write = page.waitForResponse((response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname.endsWith("/rest/v1/dare_media_likes"),
    );
    await like.click();
    const response = await write;
    expect(response.status(), await response.text()).toBe(201);
  }
  await expect(like).toHaveAttribute("aria-pressed", "true");
  await expect.poll(async () => Number(await like.textContent())).toBeGreaterThan(0);
  await page.reload({ waitUntil: "networkidle" });
  entry = await openProof(page);
  await expect(entry.getByRole("button", { name: "Like dare proof" })).toHaveAttribute("aria-pressed", "true");
  await expect.poll(async () => Number(await entry.getByRole("button", { name: "Like dare proof" }).textContent())).toBeGreaterThan(0);
  await expect.poll(async () => Number(await entry.getByLabel("Dare proof views").textContent())).toBeGreaterThan(0);
});

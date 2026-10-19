import { expect, test, type Page } from "@playwright/test";
import { completeOnboardingIfShown, signIn } from "./helpers";
import { qa } from "./qa-env";

const suffix = Date.now();
const markers = {
  deal: `DARE-QA-${qa.runId}-deal-${suffix}`,
  rumour: `DARE-QA-${qa.runId}-rumour-${suffix}`,
  promise: `DARE-QA-${qa.runId}-promise-${suffix}`,
  custom: `DARE-QA-${qa.runId}-custom-${suffix}`,
};

async function openTextComposer(page: Page, label: string) {
  const home = page.getByLabel("Home", { exact: true });
  const chooser = page.getByRole("dialog", { name: "Choose center action" });
  for (let attempt = 0; attempt < 2 && !(await chooser.isVisible().catch(() => false)); attempt += 1) {
    await home.scrollIntoViewIfNeeded();
    await home.dispatchEvent("pointerdown", { pointerType: "touch", pointerId: attempt + 1, isPrimary: true });
    await page.waitForTimeout(650);
    await home.dispatchEvent("pointerup", { pointerType: "touch", pointerId: attempt + 1, isPrimary: true });
    await page.waitForTimeout(150);
  }
  await expect(chooser).toBeVisible();
  await chooser.getByRole("button", { name: "Create", exact: true }).click();
  await page.getByText("Text Based Verdicts", { exact: true }).click();
  await page.getByText(label, { exact: true }).click();
}

async function waitForDramaPost(page: Page) {
  const response = await page.waitForResponse(
    (candidate) => candidate.request().method() === "POST" && new URL(candidate.url()).pathname === "/api/drama",
    { timeout: 30_000 },
  );
  const body = await response.text().catch(() => "");
  expect(response.ok(), `${response.status()} ${body}`).toBe(true);
}

async function selectDramaFilter(page: Page, label: string) {
  const filter = page.getByRole("button", { name: /Filter cards:/i });
  await expect(filter).toBeVisible({ timeout: 30_000 });
  await filter.click();
  await page.getByRole("button", { name: label, exact: true }).click();
}

test("B creates Deal, Rumour, Promise, and Custom cards and A sees/votes them", async ({ browser }) => {
  test.skip(
    !qa.writeEnabled || !qa.dramaWriteEnabled,
    "Drama card writes require DARE_QA_ALLOW_WRITES=true and DARE_QA_ALLOW_DRAMA_WRITE_ONCE=true.",
  );
  test.setTimeout(150_000);
  const accountA = await browser.newContext();
  const accountB = await browser.newContext();
  const pageA = await accountA.newPage();
  const pageB = await accountB.newPage();

  try {
    await signIn(pageA, "A");
    await completeOnboardingIfShown(pageA);
    await signIn(pageB, "B");
    await completeOnboardingIfShown(pageB);

    await openTextComposer(pageB, "Make Deal");
    await expect(pageB.getByRole("heading", { name: "Make it count" })).toBeVisible();
    await pageB.getByRole("button", { name: "Friend", exact: true }).click();
    const friend = pageB.getByRole("button", { name: /DARE QA A.*@dareqa_a1ca2/i });
    await expect(friend).toBeVisible({ timeout: 10_000 });
    await friend.click();
    await pageB.getByPlaceholder("If I pass this exam...").fill(markers.deal);
    await pageB.getByPlaceholder("Pizza for everyone").fill("DARE-QA deal win");
    await pageB.getByPlaceholder("Post my old school photos").fill("DARE-QA deal loss");
    const dealResponse = waitForDramaPost(pageB);
    await pageB.getByRole("button", { name: "Post Deal", exact: true }).click();
    await dealResponse;
    await pageB.waitForTimeout(700);

    await openTextComposer(pageB, "Drop a Rumour");
    await expect(pageB.getByRole("heading", { name: "Spill the tea" })).toBeVisible();
    await pageB.getByPlaceholder("Word is that...").fill(markers.rumour);
    await pageB.getByPlaceholder("heard around").fill("DARE-QA source");
    const rumourResponse = waitForDramaPost(pageB);
    await pageB.getByRole("button", { name: "Post Rumour", exact: true }).click();
    await rumourResponse;
    await pageB.waitForTimeout(700);

    await openTextComposer(pageB, "Make a Promise");
    await expect(pageB.getByRole("heading", { name: "Put it on record" })).toBeVisible();
    await pageB.getByPlaceholder("I promise to...").fill(markers.promise);
    await pageB.getByRole("button", { name: "The crew", exact: true }).click();
    await pageB.getByPlaceholder("the crew").fill("DARE-QA crew");
    const promiseResponse = waitForDramaPost(pageB);
    await pageB.getByRole("button", { name: "Post Promise", exact: true }).click();
    await promiseResponse;
    await pageB.waitForTimeout(700);

    await openTextComposer(pageB, "Custom Card");
    await expect(pageB.getByRole("heading", { name: "Make any card" })).toBeVisible();
    await pageB.getByPlaceholder("Revanth is secretly Batman.").fill(markers.custom);
    await pageB.getByPlaceholder("Obviously").fill("DARE-QA yes");
    await pageB.getByPlaceholder("Delusional").fill("DARE-QA no");
    const customResponse = waitForDramaPost(pageB);
    await pageB.getByRole("button", { name: "Post Custom", exact: true }).click();
    await customResponse;

    const feedNav = pageA.getByRole("button", { name: "Feed", exact: true });
    await expect(feedNav).toBeVisible({ timeout: 15_000 });
    await feedNav.click();
    const mainFilter = pageA.getByRole("button", { name: /Filter cards:/i });
    if (!(await mainFilter.isVisible().catch(() => false))) {
      await feedNav.click();
    }
    await expect(mainFilter).toBeVisible({ timeout: 30_000 });
    const filterByMarker: Array<[string, string]> = [
      [markers.deal, "Predictions"],
      [markers.rumour, "Rumours"],
      [markers.promise, "Promises"],
      [markers.custom, "Custom"],
    ];
    for (const [marker, filterLabel] of filterByMarker) {
      await selectDramaFilter(pageA, filterLabel);
      const cardText = pageA.getByText(marker, { exact: true }).first();
      await expect(cardText).toBeVisible({ timeout: 30_000 });
    }
    await selectDramaFilter(pageA, "All cards");

    const rumourCard = pageA.locator("article").filter({ hasText: markers.rumour }).last();
    const believe = rumourCard.getByRole("button", { name: /BELIEVE IT/i }).first();
    if (await believe.isVisible().catch(() => false)) await believe.click();
    const promiseCard = pageA.locator("article").filter({ hasText: markers.promise }).last();
    const keep = promiseCard.getByRole("button", { name: /WILL KEEP/i }).first();
    if (await keep.isVisible().catch(() => false)) await keep.click();
    const customCard = pageA.locator("article").filter({ hasText: markers.custom }).last();
    const customChoice = customCard.getByRole("button", { name: "DARE-QA yes", exact: true }).first();
    if (await customChoice.isVisible().catch(() => false)) await customChoice.click();
  } finally {
    await accountB.close();
    await accountA.close();
  }
});


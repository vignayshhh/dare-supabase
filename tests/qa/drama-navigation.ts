import { expect, type Page } from "@playwright/test";

async function openDramaCards(page: Page, kind: "Predictions" | "Rumours" | "Promises", results: boolean) {
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
  const filter = page.getByRole("button", { name: /Filter cards:/i });
  for (let attempt = 0; attempt < 3 && !(await filter.isVisible().catch(() => false)); attempt += 1) {
    // Inactive cached screens also contain a hidden `Feed` button. Restrict to
    // the visible bottom-nav control so this is a real user navigation.
    await page.locator('button[aria-label="Feed"]:visible').click();
    await filter.waitFor({ state: "visible", timeout: 5_000 }).catch(() => undefined);
  }
  await expect(filter).toBeVisible({ timeout: 30_000 });
  await filter.click();
  await page.getByRole("button", { name: kind, exact: true }).click();
  if (results) await page.getByRole("button", { name: "Happened already", exact: true }).click();
}

export async function openDramaResults(page: Page, kind: "Predictions" | "Rumours" | "Promises") {
  await page.reload({ waitUntil: "domcontentloaded" });
  await openDramaCards(page, kind, true);
}

export async function openDramaSection(page: Page, kind: "Rumours" | "Promises") {
  await openDramaCards(page, kind, false);
}

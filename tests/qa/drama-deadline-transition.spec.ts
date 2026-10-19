import { expect, test } from "@playwright/test";
import { completeOnboardingIfShown, signIn } from "./helpers";
import { qa } from "./qa-env";

for (const account of ["A", "B"] as const) {
test(`${account} sees four B text cards move from Upcoming to Happened already at expiry`, async ({ page }) => {
  test.setTimeout(90_000);
  await page.clock.install();
  const feed = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/drama/feed");
  await signIn(page, account);
  await completeOnboardingIfShown(page);
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
  await page.getByRole("button", { name: "Feed", exact: true }).click();
  await page.getByRole("button", { name: /Filter cards:/ }).click();
  await page.getByRole("button", { name: "All cards", exact: true }).click();
  const data = await (await feed).json();
  const cardFor = (marker: string) => page.locator("article").filter({ has: page.getByText(marker, { exact: true }) });
  const fixtures = [
    { group: "predictions", field: "text", due: "deadline", kind: "prediction", outcome: "IT HAPPENED" },
    { group: "deals", field: "event", due: "resolutionDate", kind: "deal", outcome: "IT HAPPENED" },
    { group: "rumours", field: "statement", due: "deadline", kind: "rumour", outcome: "CONFIRM TRUE" },
    { group: "promises", field: "promise", due: "dueAt", kind: "promise", outcome: "PROMISE KEPT" },
  ].map((item) => {
    const marker = `DARE-QA-${qa.runId}-${item.kind}-audience-vote-20261015`;
    const post = data[item.group].find((post: any) => post[item.field] === marker);
    expect(post, marker).toBeTruthy();
    return { ...item, marker, deadlineMs: new Date(post[item.due]).getTime() };
  });
  for (const fixture of fixtures) {
    expect(fixture.deadlineMs).toBeGreaterThan(Date.now());
    await expect(cardFor(fixture.marker)).toHaveCount(1);
  }
  const custom = data.customs.find((post: any) => post.statement.startsWith("DARE-QA-") && post.creator.name === "DARE QA B");
  expect(custom).toBeTruthy();

  // Only this test browser's Date changes. Backend timestamps/data stay intact.
  await page.clock.setSystemTime(new Date(Math.max(...fixtures.map((item) => item.deadlineMs)) + 1000));
  for (const fixture of fixtures) {
    await expect(cardFor(fixture.marker)).toHaveCount(0, { timeout: 35_000 });
  }
  await expect(cardFor(custom.statement)).toHaveCount(1);
  await page.getByRole("button", { name: "Happened already", exact: true }).click();
  const intro = page.getByRole("button", { name: "Close outcome explanation", exact: true });
  if (await intro.isVisible().catch(() => false)) await intro.click();
  for (const fixture of fixtures) {
    const card = cardFor(fixture.marker);
    await expect(card).toHaveCount(1);
    await expect(card.getByRole("button", { name: /^You think this is/ })).toHaveCount(0);
    if (account === "B") {
      await expect(card.getByRole("button", { name: fixture.outcome, exact: true })).toBeVisible();
    } else {
      await expect(card.getByRole("button", { name: fixture.outcome, exact: true })).toHaveCount(0);
      await expect(card.getByText(/Waiting for DARE QA B/)).toBeVisible({ timeout: 15_000 });
    }
  }
  await expect(cardFor(custom.statement)).toHaveCount(0);
});
}

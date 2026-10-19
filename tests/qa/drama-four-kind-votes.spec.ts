import { expect, test, type Page } from "@playwright/test";
import { completeOnboardingIfShown, signIn } from "./helpers";
import { qa } from "./qa-env";

const cases = [
  { kind: "prediction", group: "predictions", filter: "Predictions", field: "text", label: "HAPPENS", vote: "happens" },
  { kind: "deal", group: "deals", filter: "Predictions", field: "event", label: "WILL HAPPEN", vote: "happens" },
  { kind: "rumour", group: "rumours", filter: "Rumours", field: "statement", label: "BELIEVE IT", vote: "believe" },
  { kind: "promise", group: "promises", filter: "Promises", field: "promise", label: "WILL KEEP", vote: "keep" },
] as const;

async function filter(page: Page, name: string) {
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
  await page.getByRole("button", { name: "Feed", exact: true }).click();
  await page.getByRole("button", { name: /Filter cards:/ }).click();
  await page.getByRole("button", { name, exact: true }).click();
}

for (const [author, voterAccount] of [["B", "A"], ["A", "B"]] as const) {
test(`${voterAccount} votes on ${author}'s four open text-card kinds and ${author} reads each persisted vote`, async ({ browser }) => {
  test.skip(!qa.writeEnabled || !qa.dramaWriteEnabled, "Requires the authorized drama fixture gate.");
  test.setTimeout(180_000);
  const contextB = await browser.newContext();
  const contextA = await browser.newContext();
  try {
    const pageB = await contextB.newPage();
    const initialFeed = pageB.waitForResponse((response) => new URL(response.url()).pathname === "/api/drama/feed");
    await signIn(pageB, author);
    await completeOnboardingIfShown(pageB);
    await filter(pageB, "All cards");
    const response = await initialFeed;
    const existing = await response.json();
    const authorization = response.request().headers().authorization;
    expect(authorization).toMatch(/^Bearer /);
    const fixtures: Array<{ id: string; marker: string; group: string; filter: string; label: string; vote: string }> = [];
    for (const item of cases) {
      const marker = `DARE-QA-${qa.runId}-${item.kind}-audience-vote-20261015${author === "A" ? "-by-A" : ""}`;
      let post = existing[item.group]?.find((candidate: any) => candidate[item.field] === marker);
      if (!post) {
        const result = await pageB.evaluate(async ({ kind, marker, authorization }) => {
          const csrf = crypto.randomUUID();
          document.cookie = `csrf-token=${csrf}; Path=/; SameSite=Lax`;
          const future = new Date(Date.now() + 24 * 60 * 60_000).toISOString();
          const subject = { type: "event", name: "DARE QA audience vote event" };
          const payloads: Record<string, unknown> = {
            prediction: { kind, text: marker, subject, deadline: future },
            deal: { kind, event: marker, scope: "self", subject, winOutcome: "QA win", loseOutcome: "QA loss", resolutionDate: future },
            rumour: { kind, statement: marker, sourceLabel: "QA source", deadline: future },
            promise: { kind, promise: marker, audience: "crew", targetLabel: "QA crew", dueAt: future },
          };
          const response = await fetch("/api/drama", {
            method: "POST",
            headers: { "content-type": "application/json", Authorization: authorization, "x-csrf-token": csrf },
            body: JSON.stringify(payloads[kind]),
          });
          return { status: response.status, body: await response.json() };
        }, { kind: item.kind, marker, authorization });
        expect(result.status, JSON.stringify(result.body)).toBe(200);
        post = result.body.post;
      }
      fixtures.push({ ...item, marker, id: post.id });
    }

    const pageA = await contextA.newPage();
    await signIn(pageA, voterAccount);
    await completeOnboardingIfShown(pageA);
    for (const fixture of fixtures) {
      await filter(pageA, fixture.filter);
      const card = pageA.locator("article").filter({ hasText: fixture.marker }).last();
      await expect(card).toBeVisible({ timeout: 20_000 });
      const selected = card.getByRole("button", { name: `You think this is ${fixture.label}`, exact: true });
      if (!(await selected.isVisible().catch(() => false))) {
        const choice = card.getByRole("button", { name: fixture.label, exact: true });
        await choice.click({ trial: true });
        const write = pageA.waitForResponse((response) => response.request().method() === "POST" && new URL(response.url()).pathname === `/api/drama/${fixture.id}/vote`);
        await choice.click();
        const response = await write;
        expect(response.status(), await response.text()).toBe(200);
      }
      await expect(selected).toBeVisible();
      await pageA.reload({ waitUntil: "networkidle" });
      await filter(pageA, fixture.filter);
      await expect(selected).toBeVisible({ timeout: 20_000 });
    }

    const recipientFeed = pageB.waitForResponse((response) => new URL(response.url()).pathname === "/api/drama/feed");
    await pageB.reload({ waitUntil: "networkidle" });
    await filter(pageB, "All cards");
    const persistedFeed = await (await recipientFeed).json();
    for (const fixture of fixtures) {
      const post = persistedFeed[fixture.group].find((candidate: any) => candidate.id === fixture.id);
      const voter = Object.values(post.voters).find((person: any) => person.name === `DARE QA ${voterAccount}`) as { id: string } | undefined;
      expect(voter, fixture.group).toBeTruthy();
      expect(post.votes[voter!.id], fixture.group).toBe(fixture.vote);
      await filter(pageB, fixture.filter);
      const card = pageB.locator("article").filter({ hasText: fixture.marker }).last();
      await expect(card.getByRole("button", { name: "See who voted" })).toContainText("1 vote");
    }
  } finally {
    await contextA.close();
    await contextB.close();
  }
});
}

import { expect, test } from "@playwright/test";
import { completeOnboardingIfShown, signIn } from "./helpers";
import { qa } from "./qa-env";

test("server rejects resolving every future text-card kind", async ({ page }) => {
  test.skip(!qa.writeEnabled || !qa.dramaWriteEnabled, "Authorized drama write gate required.");
  test.setTimeout(60_000);
  await signIn(page, "A");
  await completeOnboardingIfShown(page);
  const request = page.waitForRequest((candidate) => /^Bearer\s+.+/.test(candidate.headers().authorization || ""));
  await page.reload({ waitUntil: "domcontentloaded" });
  const authorization = (await request).headers().authorization;
  const results = await page.evaluate(async ({ authorization, runId }) => {
    const cases = [
      { kind: "prediction", value: "didnt", body: { kind: "prediction", text: `DARE-QA-${runId}-future-p-${Date.now()}`, subject: { type: "event", name: "future" } } },
      { kind: "deal", value: "lost", body: { kind: "deal", event: `DARE-QA-${runId}-future-d-${Date.now()}`, scope: "self", subject: { type: "event", name: "future" }, winOutcome: "win", loseOutcome: "loss" } },
      { kind: "rumour", value: "false", body: { kind: "rumour", statement: `DARE-QA-${runId}-future-r-${Date.now()}`, sourceLabel: "QA" } },
      { kind: "promise", value: "broken", body: { kind: "promise", promise: `DARE-QA-${runId}-future-pr-${Date.now()}`, audience: "self", targetLabel: "QA" } },
    ] as const;
    const deadline = new Date(Date.now() + 86_400_000).toISOString();
    const output: Array<{ kind: string; createStatus: number; hasId: boolean; resolveStatus: number; error: unknown }> = [];
    for (const item of cases) {
      const csrf = crypto.randomUUID();
      document.cookie = `csrf-token=${encodeURIComponent(csrf)}; Path=/; SameSite=Lax`;
      const create = await fetch("/api/drama", { method: "POST", headers: { "content-type": "application/json", Authorization: authorization, "x-csrf-token": csrf }, body: JSON.stringify({ ...item.body, deadline, resolutionDate: deadline, dueAt: deadline }) });
      const created = await create.json();
      const id = created?.post?.id || created?.id;
      const resolve = await fetch(`/api/drama/${id}/update`, { method: "POST", headers: { "content-type": "application/json", Authorization: authorization, "x-csrf-token": csrf }, body: JSON.stringify({ action: "resolve", value: item.value }) });
      output.push({ kind: item.kind, createStatus: create.status, hasId: Boolean(id), resolveStatus: resolve.status, error: (await resolve.json().catch(() => null))?.error });
    }
    return output;
  }, { authorization, runId: qa.runId });
  expect(results).toHaveLength(4);
  for (const result of results) {
    expect(result, result.kind).toMatchObject({ createStatus: 200, hasId: true, resolveStatus: 400 });
    expect(result.error, result.kind).toBeTruthy();
  }
});

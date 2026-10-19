import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";
import { qa } from "./qa-env";

test("QA A/B direct-chat fixture is available in the active Circle", async ({ browser }) => {
  test.skip(!qa.writeEnabled, "Requires the authorized bounded QA write flag.");
  test.setTimeout(90_000);
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  try {
    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();
    await Promise.all([pageA, pageB].map(page => page.addInitScript(() => { (window as any).__DARE_QA__ = true; })));
    await Promise.all([signIn(pageA, "A"), signIn(pageB, "B")]);
    const [circlesA, circlesB] = await Promise.all([pageA, pageB].map(page => page.evaluate(async () => {
      const client = (window as any).__DARE_QA_SUPABASE__;
      const { data, error } = await client.from("circles").select("id");
      if (error) throw new Error(error.message);
      return data as { id: string }[];
    })));
    const sharedCircle = circlesA.find(circle => circlesB.some(candidate => candidate.id === circle.id));
    expect(sharedCircle, "A and B need one shared QA Circle for a direct conversation.").toBeTruthy();
    const users = await Promise.all([pageA, pageB].map(page => page.evaluate(async () => (await (window as any).__DARE_QA_SUPABASE__.auth.getUser()).data.user?.id)));
    await Promise.all([pageA, pageB].map((page, index) => page.evaluate(({ userId, circleId }) => localStorage.setItem(`dare-active-circle:${userId}`, circleId), { userId: users[index], circleId: sharedCircle!.id })));
    await Promise.all([pageA.reload({ waitUntil: "networkidle" }), pageB.reload({ waitUntil: "networkidle" })]);
    const bId = await pageB.evaluate(async () => (await (window as any).__DARE_QA_SUPABASE__.auth.getUser()).data.user?.id);
    const conversation = await pageA.evaluate(async (otherUserId) => {
      const client = (window as any).__DARE_QA_SUPABASE__;
      const { data, error } = await client.rpc("get_or_create_direct_conversation", { p_other_user_id: otherUserId });
      if (error) throw new Error(error.message);
      return data;
    }, bId);
    expect(conversation?.id).toBeTruthy();
    const rawInboxes = await Promise.all([pageA, pageB].map(page => page.evaluate(async () => {
      const client = (window as any).__DARE_QA_SUPABASE__;
      const userId = (await client.auth.getUser()).data.user?.id;
      const { data, error } = await client.rpc("get_inbox_page", { p_user_id: userId, p_limit: 100 });
      if (error) throw new Error(error.message);
      return data;
    })));
    console.log("DARE_DIRECT_FIXTURE_RAW_INBOX", JSON.stringify({ conversation, rawInboxes }));
    expect(rawInboxes[0].some((row: any) => row.conversation_id === conversation.id)).toBe(true);
    expect(rawInboxes[1].some((row: any) => row.conversation_id === conversation.id)).toBe(true);
    await Promise.all([pageA.reload({ waitUntil: "networkidle" }), pageB.reload({ waitUntil: "networkidle" })]);
    for (const [page, name] of [[pageA, "DARE QA B"], [pageB, "DARE QA A"]] as const) {
      await page.getByRole("button", { name: "Messages", exact: true }).click();
      await expect(page.locator(".chat-inbox-row").filter({ hasText: name })).toBeVisible({ timeout: 15_000 });
    }
  } finally {
    await contextB.close();
    await contextA.close();
  }
});

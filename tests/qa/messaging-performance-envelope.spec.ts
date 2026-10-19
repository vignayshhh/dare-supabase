import { expect, test, type Page } from "@playwright/test";
import { completeOnboardingIfShown, signIn } from "./helpers";
import { qa } from "./qa-env";

const burstSize = 24;
const run = `${qa.runId}-${Date.now()}`;

async function openConversation(page: Page, name: string) {
  await page.getByRole("button", { name: "Messages", exact: true }).click();
  const row = page.locator(".chat-inbox-row").filter({ hasText: name });
  await expect(row).toBeVisible({ timeout: 15_000 });
  await row.click();
  await expect(page.locator('textarea[placeholder="Message..."]')).toBeVisible({ timeout: 15_000 });
}

async function visible(page: Page, text: string, timeout = 3_000) {
  await expect.poll(async () => page.getByText(text, { exact: true }).count().catch(() => 0), { timeout }).toBeGreaterThan(0);
}

function installRealtimeProbe(page: Page) {
  return page.addInitScript(() => {
    (window as any).__DARE_QA__ = true;
    const stats = { topics: [] as string[], sockets: 0, opens: 0, closes: 0 };
    (window as any).__qaRealtime = stats;
    const Native = window.WebSocket;
    const Wrapped = function(this: WebSocket, ...args: ConstructorParameters<typeof WebSocket>) {
      const ws = new Native(...args);
      stats.sockets += 1;
      ws.addEventListener("open", () => { stats.opens += 1; });
      ws.addEventListener("close", () => { stats.closes += 1; });
      const record = (value: unknown) => {
        try {
          const payload = typeof value === "string" ? JSON.parse(value) : null;
          const topic = payload?.topic;
          if (typeof topic === "string" && !stats.topics.includes(topic)) stats.topics.push(topic);
        } catch { /* non-JSON websocket frame */ }
      };
      const send = ws.send.bind(ws);
      ws.send = (value: string | ArrayBufferLike | Blob | ArrayBufferView) => { record(value); return send(value); };
      ws.addEventListener("message", (event) => record(event.data));
      return ws;
    } as unknown as typeof WebSocket;
    (Wrapped as any).prototype = Native.prototype;
    window.WebSocket = Wrapped;
  });
}

async function collectRealtime(page: Page) {
  return page.evaluate(() => {
    const client = (window as any).__DARE_QA_SUPABASE__;
    const channels = client?.realtime?.getChannels?.() ?? [];
    return { ...(window as any).__qaRealtime, channels: channels.map((channel: any) => channel.topic).filter(Boolean) };
  });
}

test("mobile messaging resource envelope: 24-message event-driven burst", async ({ browser }) => {
  test.skip(!qa.writeEnabled, "Set DARE_QA_ALLOW_WRITES=true for the authorized bounded message check.");
  test.skip(!qa.messagePerfEnabled, "Set DARE_QA_ALLOW_MESSAGE_PERF_ONCE=true for the controlled burst.");
  test.setTimeout(180_000);
  const contextA = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const contextB = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();
  await installRealtimeProbe(pageA);
  await installRealtimeProbe(pageB);
  const calls = { aInbox: 0, bInbox: 0, aMessages: 0, bMessages: 0, sends: 0 };
  const count = (page: Page, side: "a" | "b") => page.on("request", (request) => {
    const url = request.url();
    if (url.includes("/rpc/send_message")) calls.sends += 1;
    if (url.includes("/rpc/get_inbox_page")) calls[`${side}Inbox`] += 1;
    if (url.includes("/rest/v1/messages")) calls[`${side}Messages`] += 1;
  });
  count(pageA, "a"); count(pageB, "b");
  const markers = Array.from({ length: burstSize }, (_, i) => `DARE-PERF-${run}-${String(i + 1).padStart(2, "0")}`);
  const latencies: number[] = [];
  try {
    await signIn(pageA, "A"); await completeOnboardingIfShown(pageA); await openConversation(pageA, "DARE QA B");
    await signIn(pageB, "B"); await completeOnboardingIfShown(pageB); await openConversation(pageB, "DARE QA A");
    const missed: string[] = [];
    for (const marker of markers) {
      const started = Date.now();
      const response = pageA.waitForResponse((r) => r.request().method() === "POST" && r.url().includes("/rpc/send_message"));
      await pageA.locator('textarea[placeholder="Message..."]').fill(marker);
      await pageA.getByRole("button", { name: "Send message" }).click();
      expect((await response).ok()).toBe(true);
      try {
        await visible(pageB, marker);
        latencies.push(Date.now() - started);
      } catch {
        // One bounded recovery read only after live delivery misses; never poll.
        missed.push(marker);
      }
    }
    if (missed.length) {
      const recoveryStarted = Date.now();
      await pageB.reload();
      await openConversation(pageB, "DARE QA A");
      // Virtualized history may unmount older bubbles; verify durable tail once.
      await visible(pageB, markers.at(-1)!, 15_000);
      latencies.push(Date.now() - recoveryStarted);
    }
    const realtimeA = await collectRealtime(pageA);
    const realtimeB = await collectRealtime(pageB);
    const sorted = [...latencies].sort((a, b) => a - b);
    const p50 = sorted[Math.floor(sorted.length * 0.5)];
    const p95 = sorted[Math.floor(sorted.length * 0.95)];
    const messagingTopics = (stats: any) => stats.channels.filter((topic: string) => /inbox:|conversation-messages:|message-events:|typing:|conversation-state:|presence:user:|profile:/.test(topic));
    const report = { burstSize, missedLive: missed.length, latencyMs: { min: sorted[0], p50, p95, max: sorted.at(-1) }, calls, realtime: { a: { ...realtimeA, messagingChannelCount: messagingTopics(realtimeA).length }, b: { ...realtimeB, messagingChannelCount: messagingTopics(realtimeB).length } } };
    console.log("DARE_MESSAGE_RESOURCE_ENVELOPE", JSON.stringify(report));
    expect(calls.sends).toBe(burstSize);
    expect(calls.aInbox).toBeLessThanOrEqual(10);
    expect(calls.bInbox).toBeLessThanOrEqual(10);
    expect(calls.aMessages).toBeLessThanOrEqual(3);
    expect(calls.bMessages).toBeLessThanOrEqual(4);
    expect(realtimeA.channels.length).toBeLessThanOrEqual(16);
    expect(realtimeB.channels.length).toBeLessThanOrEqual(16);
    expect(messagingTopics(realtimeA).length).toBeLessThanOrEqual(9);
    expect(messagingTopics(realtimeB).length).toBeLessThanOrEqual(9);
    expect(realtimeA.closes).toBe(0);
    expect(realtimeB.closes).toBe(0);
  } finally { await contextB.close(); await contextA.close(); }
});

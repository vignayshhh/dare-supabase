import { expect, test, type Page } from '@playwright/test';
import { signIn } from './helpers';
import { qa } from './qa-env';

async function registry(page: Page) {
  return page.evaluate(async () => {
    const client = (window as any).__DARE_QA_SUPABASE__;
    const { data, error } = await client.from('circles').select('id,name,circle_members(user_id)');
    if (error) throw new Error(error.message);
    return data as { id: string; name: string; circle_members: { user_id: string }[] }[];
  });
}
async function enter(page: Page, circleId: string) {
  const userId = await page.evaluate(async () => (await (window as any).__DARE_QA_SUPABASE__.auth.getUser()).data.user.id);
  await page.evaluate(({ id, target }) => localStorage.setItem(`dare-active-circle:${id}`, target), { id: userId, target: circleId });
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Messages', exact: true }).click();
  await page.locator('.circle-chat-entry').click();
  await expect(page.getByLabel('Connected', { exact: true })).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('.circle-chat-feed')).toBeVisible();
}

test('A/B Circle messaging, source picker and persisted Promise use the normal flow', async ({ browser }) => {
  test.skip(!qa.writeEnabled, 'Requires the authorized bounded QA write flag.');
  test.setTimeout(150_000);
  const contexts = await Promise.all([browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }), browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })]);
  const [a, b] = await Promise.all(contexts.map(context => context.newPage()));
  const marker = `CHAT-QA-${qa.runId}`;
  try {
    for (const page of [a, b]) await page.addInitScript(() => { (window as any).__DARE_QA__ = true; });
    await signIn(a, 'A'); await signIn(b, 'B');
    const [circlesA, circlesB] = await Promise.all([registry(a), registry(b)]);
    const shared = circlesA.filter(circle => circlesB.some(other => other.id === circle.id)).sort((x, y) => x.circle_members.length - y.circle_members.length)[0];
    expect(shared, 'A/B need a shared QA Circle').toBeTruthy();
    await enter(a, shared.id); await enter(b, shared.id);
    let bMessageReads = 0;
    b.on('request', request => { if (request.method() === 'GET' && request.url().includes('/rest/v1/circle_chat_messages')) bMessageReads++; });
    await a.getByLabel('Message your Circle').fill(marker);
    await a.getByRole('button', { name: 'Send message', exact: true }).click();
    const bubbleA = a.locator('.circle-chat-message').filter({ hasText: marker }).first();
    const bubbleB = b.locator('.circle-chat-message').filter({ hasText: marker }).first();
    await expect(bubbleB).toBeVisible({ timeout: 15_000 });
    await expect(bubbleA).not.toContainText('sending');
    expect(bMessageReads, 'Receive merges the Broadcast without a history read').toBe(0);
    await bubbleA.getByRole('button', { name: /Create interaction/ }).click();
    await expect(a.locator('.chat-picker')).toBeVisible();
    await expect(a.locator('.chat-picker-options button')).toHaveCount(6);
    await a.screenshot({ path: 'test-results/contextual-chat-picker-mobile.png' });
    await a.locator('.chat-picker-options button').filter({ hasText: 'Promise' }).click();
    await expect(a.getByRole('heading', { name: 'Put it on record' })).toBeVisible().catch(async () => {
      await expect(a.locator('.promise-create-screen')).toBeVisible();
    });
    await expect(a.locator('.promise-create-screen textarea')).toHaveValue(marker);
    await a.getByRole('button', { name: 'A friend', exact: true }).click();
    const bId = await b.evaluate(async () => (await (window as any).__DARE_QA_SUPABASE__.auth.getUser()).data.user.id);
    await a.getByLabel('Promise recipient').selectOption(bId);
    const created = a.waitForResponse(response => response.request().method() === 'POST' && new URL(response.url()).pathname === '/api/drama');
    await a.getByRole('button', { name: 'Post Promise', exact: true }).click();
    const response = await created;
    expect(response.status(), await response.text()).toBe(200);
    const { post } = await response.json();
    await expect(b.locator('.chat-interaction-card').filter({ hasText: marker })).toBeVisible({ timeout: 15_000 });
    await b.locator('.chat-interaction-card').filter({ hasText: marker }).click();
    await expect(b.locator('.chat-source-quote').first()).toContainText(marker);
    await expect(b.getByRole('button', { name: 'I’m in', exact: true })).toBeVisible();
    await b.getByRole('button', { name: 'I’m in', exact: true }).click();
    await expect(b.locator('p:visible', { hasText: 'Everyone confirmed. It’s on.' })).toBeVisible({ timeout: 15_000 });
    await b.screenshot({ path: 'test-results/contextual-promise-confirmed-mobile.png' });
    const persisted = await b.evaluate(async (id) => {
      const client = (window as any).__DARE_QA_SUPABASE__;
      const { data, error } = await client.from('circle_chat_messages').select('id,source_message_id,status').eq('interaction_id', id).single();
      if (error) throw new Error(error.message); return data;
    }, post.id);
    expect(persisted.source_message_id).toBeTruthy(); expect(persisted.status).toBe('confirmed');
    await b.getByRole('button', { name: 'Back to Circle chat', exact: true }).click();
    await expect(b.locator('.chat-interaction-card').filter({ hasText: marker })).toContainText('confirmed');
    await b.screenshot({ path: 'test-results/contextual-chat-mobile.png' });
    await b.reload({ waitUntil: 'networkidle' });
    await enter(b, shared.id);
    await expect(b.locator('.chat-interaction-card').filter({ hasText: marker })).toContainText('confirmed');
    await b.emulateMedia({ reducedMotion: 'reduce' });
    await b.locator('.circle-chat-message').filter({ hasText: marker }).first().getByRole('button', { name: /Create interaction/ }).click();
    expect(await b.locator('.chat-picker').evaluate(element => getComputedStyle(element).animationName)).toBe('none');
  } finally { await Promise.all(contexts.map(context => context.close())); }
});

test('A/B source message creates every contextual interaction type', async ({ browser }) => {
  test.skip(!qa.writeEnabled, 'Requires the authorized bounded QA write flag.');
  test.setTimeout(150_000);
  const contexts = await Promise.all([browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }), browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })]);
  const [a, b] = await Promise.all(contexts.map(context => context.newPage()));
  const marker = `CHAT-ALL-QA-${qa.runId}`;
  try {
    for (const page of [a, b]) await page.addInitScript(() => { (window as any).__DARE_QA__ = true; });
    await signIn(a, 'A'); await signIn(b, 'B');
    const [circlesA, circlesB] = await Promise.all([registry(a), registry(b)]);
    const shared = circlesA.filter(circle => circlesB.some(other => other.id === circle.id)).sort((x, y) => x.circle_members.length - y.circle_members.length)[0];
    expect(shared, 'A/B need a shared QA Circle').toBeTruthy();
    await enter(a, shared.id); await enter(b, shared.id);
    const bId = await b.evaluate(async () => (await (window as any).__DARE_QA_SUPABASE__.auth.getUser()).data.user.id);
    const result = await a.evaluate(async ({ circleId, receiverId, marker }) => {
      const client = (window as any).__DARE_QA_SUPABASE__;
      const sourceId = crypto.randomUUID();
      const sent = await client.rpc('send_circle_chat', { p_id: sourceId, p_circle: circleId, p_body: marker });
      if (sent.error) throw new Error(sent.error.message);
      const session = (await client.auth.getSession()).data.session;
      const csrf = crypto.randomUUID();
      document.cookie = `csrf-token=${csrf}; Path=/; SameSite=Lax`;
      const headers = { authorization: `Bearer ${session.access_token}`, 'content-type': 'application/json', 'x-csrf-token': csrf, 'x-circle-id': circleId, 'x-chat-source-id': sourceId };
      const future = new Date(Date.now() + 86_400_000).toISOString();
      const request = async (path: string, body: Record<string, unknown>) => {
        const response = await fetch(path, { method: 'POST', headers, body: JSON.stringify(body) });
        return { path, status: response.status, body: await response.text() };
      };
      const requests = [
        request('/api/dares', { receiverId, description: `${marker} dare` }),
        request('/api/truth', { receiverId, question: `${marker} truth?` }),
        request('/api/drama', { kind: 'prediction', text: `${marker} prediction`, subject: { type: 'friend', id: receiverId, name: 'DARE QA B' }, deadline: future }),
        request('/api/drama', { kind: 'deal', scope: 'friend', subject: { type: 'friend', id: receiverId, name: 'DARE QA B' }, event: `${marker} deal`, winOutcome: 'wins', loseOutcome: 'loses', resolutionDate: future }),
        request('/api/drama', { kind: 'promise', targetId: receiverId, audience: 'friend', promise: `${marker} promise`, dueAt: future, targetLabel: 'DARE QA B' }),
      ];
      const outcomes = await Promise.all(requests);
      const jail = await client.rpc('create_circle_jail_case', { p_id: crypto.randomUUID(), p_circle: circleId, p_target: receiverId, p_reason: `${marker} jail`, p_source: sourceId });
      return { sourceId, outcomes, jailError: jail.error?.message || null };
    }, { circleId: shared.id, receiverId: bId, marker });
    for (const outcome of result.outcomes) expect(outcome, `${outcome.path}: ${outcome.body}`).toMatchObject({ status: 200 });
    expect(result.jailError).toBeNull();
    await expect(b.locator('.chat-interaction-card').filter({ hasText: marker })).toHaveCount(6, { timeout: 20_000 });
    const linkedKinds = await b.evaluate(async (sourceId) => {
      const client = (window as any).__DARE_QA_SUPABASE__;
      const { data, error } = await client.from('circle_chat_messages').select('interaction_kind').eq('source_message_id', sourceId).not('interaction_kind', 'is', null);
      if (error) throw new Error(error.message);
      return data.map((row: { interaction_kind: string }) => row.interaction_kind).sort();
    }, result.sourceId);
    expect(linkedKinds).toEqual(['dare', 'deal', 'jail', 'prediction', 'promise', 'truth']);
  } finally { await Promise.all(contexts.map(context => context.close())); }
});

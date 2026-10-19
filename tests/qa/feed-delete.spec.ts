import { expect, test } from "@playwright/test";
import { completeOnboardingIfShown, signIn } from "./helpers";
import { qa } from "./qa-env";

const marker = `DARE-QA-${qa.runId}-feed-delete-disposable-01`;

test("A deletes a disposable own post and it stays absent for B", async ({ browser }) => {
  test.skip(!qa.writeEnabled || !qa.postWriteEnabled, "Requires the general and post-write gates.");
  test.setTimeout(100_000);
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  try {
    const pageA = await contextA.newPage();
    await signIn(pageA, "A");
    await completeOnboardingIfShown(pageA);
    await pageA.reload({ waitUntil: "networkidle" });
    await pageA.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
    let matchingPosts = pageA.locator(".feed-post-card").filter({ hasText: marker });
    if ((await matchingPosts.count()) === 0) {
      const home = pageA.getByLabel("Home", { exact: true });
      await home.dispatchEvent("pointerdown", { pointerType: "touch" });
      await pageA.waitForTimeout(550);
      await home.dispatchEvent("pointerup", { pointerType: "touch" });
      await pageA.getByRole("dialog", { name: "Choose center action" }).getByRole("button", { name: "Create", exact: true }).click();
      await pageA.getByText("Post to Feed", { exact: true }).click();
      await pageA.getByPlaceholder("Add a caption...").fill(marker);
      const publish = pageA.waitForResponse((response) => response.request().method() === "POST" && new URL(response.url()).pathname === "/api/posts", { timeout: 30_000 });
      await pageA.getByRole("button", { name: /^Post/ }).click();
      expect((await publish).ok()).toBe(true);
      matchingPosts = pageA.locator(".feed-post-card").filter({ hasText: marker });
    }
    await expect(matchingPosts.first()).toBeVisible({ timeout: 25_000 });
    for (let attempt = 0; attempt < 10 && (await matchingPosts.count()) > 0; attempt += 1) {
      const post = matchingPosts.first();
      const id = (await post.getAttribute("id"))!.replace(/^feed-post-/, "");
      const exactPost = pageA.locator(`#feed-post-${id}`);
      await post.getByRole("button", { name: "Post options", exact: true }).click();
      pageA.once("dialog", (dialog) => dialog.accept());
      const deletion = pageA.waitForResponse((response) => response.request().method() === "DELETE" && new URL(response.url()).pathname === `/api/posts/${id}`, { timeout: 20_000 });
      await pageA.getByRole("button", { name: "Delete post", exact: true }).click();
      expect((await deletion).status()).toBe(200);
      await expect(exactPost).toHaveCount(0);
    }
    expect(await matchingPosts.count()).toBe(0);
    await pageA.reload({ waitUntil: "networkidle" });
    await expect(pageA.getByText(marker, { exact: false })).toHaveCount(0);

    const pageB = await contextB.newPage();
    await signIn(pageB, "B");
    await completeOnboardingIfShown(pageB);
    await expect(pageB.getByText(marker, { exact: false })).toHaveCount(0);
  } finally {
    await contextA.close();
    await contextB.close();
  }
});

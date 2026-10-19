import {
  decodeStoryReactionCursor,
  encodeStoryReactionCursor,
} from "@/middleware/services/story-reaction.service";

describe("story reaction cursors", () => {
  it("round-trips stable ordering fields without exposing a raw cursor", () => {
    const value = { createdAt: "2026-10-13T10:00:00.000Z", userId: "user-42" };
    const cursor = encodeStoryReactionCursor(value);

    expect(cursor).not.toBe(JSON.stringify(value));
    expect(decodeStoryReactionCursor(cursor)).toEqual(value);
  });

  it("rejects malformed cursors instead of broadening the query", () => {
    expect(decodeStoryReactionCursor("not-a-valid-cursor")).toBeUndefined();
  });
});

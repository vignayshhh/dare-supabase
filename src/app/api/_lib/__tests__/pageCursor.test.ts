import { decodePageCursor, encodePageCursor } from "../pageCursor";

describe("opaque page cursors", () => {
  it.each([
    { value: "2026-10-12T00:00:00.000Z", id: "post-1" },
    { value: 42, id: "row-2" },
    { value: true, id: "row-3" },
  ])("round-trips typed values", (cursor) => {
    expect(decodePageCursor(encodePageCursor(cursor))).toEqual(cursor);
  });

  it("accepts the legacy timestamp form without an id", () => {
    expect(decodePageCursor("2026-10-12T00:00:00.000Z")).toEqual({
      value: "2026-10-12T00:00:00.000Z",
      id: "",
    });
  });

  it("rejects malformed cursors", () => {
    expect(decodePageCursor("not-a-cursor")).toBeNull();
    expect(decodePageCursor(encodePageCursor({ value: "", id: "x" }))).toBeNull();
  });
});

/** @jest-environment node */
import {
  getActiveEventId,
  setActiveCircleId,
  setActiveEventId,
  withCircleHeader,
} from "../circleContext";

beforeEach(() => {
  setActiveCircleId(null);
  setActiveEventId(null);
});

test("an old Circle response cannot hydrate the destination Circle", async () => {
  let finish!: (value: Response) => void;
  const fetcher = jest.fn(
    () =>
      new Promise<Response>((resolve) => {
        finish = resolve;
      }),
  );
  setActiveCircleId("circle-a");
  const pending = withCircleHeader(fetcher as typeof fetch)(
    "https://example.com/rest/v1/posts",
  );
  setActiveCircleId("circle-b");
  finish({ ok: true } as Response);
  await expect(pending).rejects.toMatchObject({ name: "AbortError" });
});

test("switching Circles drops the previous Event context", () => {
  setActiveCircleId("circle-a");
  setActiveEventId("event-a");
  setActiveCircleId("circle-b");
  expect(getActiveEventId()).toBeNull();
});

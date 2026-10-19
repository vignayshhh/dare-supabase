/** Request context only; membership is always checked by the database/server. */
let activeCircleId: string | null = null;
let activeEventId: string | null = null;
export const getActiveCircleId = () => activeCircleId;
export const getActiveEventId = () => activeEventId;
export const setActiveEventId = (id: string | null) => {
  activeEventId = id;
};
export const setActiveCircleId = (id: string | null) => {
  if (id !== activeCircleId) activeEventId = null;
  activeCircleId = id;
};

export function withCircleHeader(fetcher: typeof fetch): typeof fetch {
  return async (input, init) => {
    const circleAtStart = activeCircleId;
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    const headers = new Headers(
      init?.headers ?? (input instanceof Request ? input.headers : undefined),
    );
    // Direct conversations are now Circle-scoped too. Their read RPCs must
    // carry the active Circle so the database's membership policy can return
    // the inbox row; omitting it makes a valid direct inbox look empty.
    if (activeCircleId) headers.set("x-circle-id", activeCircleId);
    if (activeEventId) headers.set("x-event-id", activeEventId);
    const response = await fetcher(input, { ...init, headers });
    // The Circle registry establishes the active context itself. Its response
    // remains valid while bootstrapping, even when another request switches
    // context before this membership query completes.
    const isCircleRegistry = /\/rest\/v1\/circles(?:[/?]|$)/.test(url);
    if (
      url.includes("/rest/v1/") &&
      !isCircleRegistry &&
      circleAtStart !== activeCircleId
    )
      throw new DOMException("Circle changed", "AbortError");
    return response;
  };
}

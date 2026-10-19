export function isBackendUnavailable(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;

  const maybeError = error as { code?: unknown; message?: unknown };
  const code = typeof maybeError.code === "string" ? maybeError.code : "";
  const message =
    typeof maybeError.message === "string"
      ? maybeError.message.toLowerCase()
      : "";

  return (
    ["unavailable", "fetch_error", "network_error", "PGRST301"].includes(code) ||
    message.includes("network request failed") ||
    message.includes("failed to fetch") ||
    message.includes("client is offline")
  );
}

export function isExpectedAbortError(error: unknown): boolean {
  if (!error) return false;
  const value = error as {
    name?: unknown;
    message?: unknown;
    hint?: unknown;
  };
  const text = [value.name, value.message, value.hint]
    .filter((part): part is string => typeof part === "string")
    .join(" ")
    .toLowerCase();

  return (
    text.includes("aborterror") ||
    text.includes("request was aborted") ||
    text.includes("circle changed")
  );
}

export function logBackendError(message: string, error: unknown): void {
  if (isBackendUnavailable(error) || isExpectedAbortError(error)) {
    console.warn(message);
    return;
  }

  console.error(message, error);
}

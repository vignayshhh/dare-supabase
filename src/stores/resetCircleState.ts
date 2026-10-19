import { setChatSource } from "@/lib/chatContext";
/** Clear content and subscriptions before another Circle becomes visible. */
export async function resetCircleState() {
  setChatSource(null);
  const modules = await Promise.all([
    import("./usePostsStore"),
    import("./useFeedStore"),
    import("./useStoryStore"),
    import("./useContentStore"),
    import("./useDareStore"),
    import("./useDareInteractionStore"),
    import("./useMessagingStore"),
    import("./useVerdictsStore"),
    import("./useDramaStore"),
    import("./useTruthStore"),
    import("./useTruthInteractionStore"),
    import("./useProfileStore"),
    import("./usePredictionStore"),
    import("./useDealStore"),
    import("./useAuraStore"),
  ]);
  const { invalidateDramaFeed } = await import("./dramaBackend");
  invalidateDramaFeed();
  for (const storeModule of modules)
    for (const [name, candidate] of Object.entries(storeModule)) {
      if (
        !name.startsWith("use") ||
        typeof candidate !== "function" ||
        !("getInitialState" in candidate)
      )
        continue;
      const store = candidate as unknown as {
        getState: () => Record<string, unknown>;
        getInitialState: () => Record<string, unknown>;
        setState: (state: Record<string, unknown>, replace: boolean) => void;
      };
      const state = store.getState();
      for (const [key, value] of Object.entries(state)) {
        if (/(unsubscribe|unsub)$/i.test(key) && typeof value === "function")
          value();
        if (/unsubscribes$/i.test(key) && value && typeof value === "object")
          for (const fn of Object.values(value))
            if (typeof fn === "function") fn();
      }
      store.setState(store.getInitialState(), true);
    }
}

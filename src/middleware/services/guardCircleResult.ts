import { getActiveCircleId } from '@/lib/circleContext';

/** Fence a complete service operation, including enrichment after its first query. */
export function guardCircleResult<T extends object>(service: T): T {
  return new Proxy(service, {
    get(target, key, receiver) {
      const value = Reflect.get(target, key, receiver);
      if (typeof value !== 'function') return value;
      return (...args: unknown[]) => {
        const circleId = getActiveCircleId();
        const result = value.apply(target, args);
        if (!result || typeof result.then !== 'function') return result;
        return Promise.resolve(result).then(data => {
          if (circleId !== getActiveCircleId()) throw new DOMException('Circle changed', 'AbortError');
          return data;
        });
      };
    },
  });
}

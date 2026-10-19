/**
 * Composable request pipeline for state-changing endpoints.
 *
 * Every POST/PATCH/DELETE handler should wrap its body with
 * `withSecurity(...)`. In order, it:
 *   1. Extracts IP from x-forwarded-for / x-real-ip.
 *   2. Rejects blocked IPs (edge middleware already does this but we
 *      double-check in case middleware is bypassed).
 *   3. Runs cheap bot heuristics; optionally verifies Turnstile.
 *   4. Verifies the Supabase ID token; optionally requires admin.
 *   5. Verifies CSRF double-submit token.
 *   6. Enforces a Redis rate-limit bucket (per uid or per ip).
 *
 * Any failure short-circuits with a JSON error. Success calls the
 * handler with a rich `SecurityContext`.
 */
import "server-only";
import { NextResponse } from "next/server";
import { verifyRequestAuth, AuthError } from "./auth";
import { enforceRateLimit, type LimitConfig } from "./rateLimit";
import { RedisUnavailableError } from "./redis";
import { getClientIp, isIpBlocked } from "./ipBlock";
import { cheapBotCheck, verifyTurnstile } from "./botCheck";
import { verifyCsrf } from "./csrf";
import { logSecurityEventServer } from "@/security/securityLogger";

import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { runInCircle } from "@/lib/supabase/requestContext";

export interface SecurityContext {
  uid: string;
  circleId?: string;
  ip: string | null;
  token: Awaited<ReturnType<typeof verifyRequestAuth>>;
}

export interface WithSecurityOptions {
  rateLimit: LimitConfig;
  requireAdmin?: boolean;
  requireTurnstile?: boolean;
  skipCsrf?: boolean; // only for idempotent beacons like /api/posts/view
  skipRateLimit?: boolean; // intentional high-frequency gestures (e.g. repeat likes)
  allowRedisFallback?: boolean; // for low-risk, idempotent social actions
}

const REDIS_SECURITY_ON_READS = process.env.REDIS_SECURITY_ON_READS === "true";
const localReadLimits = new Map<string, { count: number; resetAt: number }>();

function isReadRequest(req: Request): boolean {
  return req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS";
}

function enforceLocalReadLimit(
  cfg: LimitConfig,
  subject: string,
): { allowed: boolean; remaining: number; retryAfterMs: number } {
  const now = Date.now();
  const key = `${cfg.bucket}:${subject}`;
  const current = localReadLimits.get(key);
  const next =
    current && current.resetAt > now
      ? { count: current.count + 1, resetAt: current.resetAt }
      : { count: 1, resetAt: now + cfg.windowMs };

  localReadLimits.set(key, next);
  const allowed = next.count <= cfg.max;
  return {
    allowed,
    remaining: Math.max(0, cfg.max - next.count),
    retryAfterMs: allowed ? 0 : Math.max(0, next.resetAt - now),
  };
}

export function withSecurity<T>(
  opts: WithSecurityOptions,
  handler: (req: Request, ctx: SecurityContext) => Promise<T>,
) {
  return async (req: Request): Promise<Response> => {
    try {
      const ip = getClientIp(req);
      const readRequest = isReadRequest(req);
      const useRedisForReadSecurity = !readRequest || REDIS_SECURITY_ON_READS || opts.requireAdmin;

      if (useRedisForReadSecurity) {
        try {
          if (await isIpBlocked(ip)) {
            // Log IP block event
            await logSecurityEventServer({
              type: "ip_blocked",
              userId: undefined,
              details: { reason: "IP blocklist" },
              severity: "high",
              ipAddress: ip || undefined,
              userAgent: req.headers.get("user-agent") || undefined,
            });
            return NextResponse.json({ error: "forbidden" }, { status: 403 });
          }
        } catch (e) {
          if (!(opts.allowRedisFallback && e instanceof RedisUnavailableError)) {
            throw e;
          }
          console.warn(
            `[security] Redis unavailable for IP blocklist on ${new URL(req.url).pathname}; continuing with route-local fallback.`,
          );
        }
      }

      let cheap: Awaited<ReturnType<typeof cheapBotCheck>>;
      try {
        cheap = await cheapBotCheck(req, ip);
      } catch (e) {
        if (!(opts.allowRedisFallback && e instanceof RedisUnavailableError)) {
          throw e;
        }
        console.warn(
          `[security] Redis unavailable for bot burst detection on ${new URL(req.url).pathname}; continuing with route-local fallback.`,
        );
        cheap = { ok: true };
      }
      if (!cheap.ok) {
        // Log bot detection
        await logSecurityEventServer({
          type: "bot_detected",
          userId: undefined,
          details: { reason: cheap.reason },
          severity: "medium",
          ipAddress: ip || undefined,
          userAgent: req.headers.get("user-agent") || undefined,
        });
        return NextResponse.json(
          { error: "blocked", reason: cheap.reason },
          { status: 403 },
        );
      }

      const turnstile = await verifyTurnstile(req, ip, !!opts.requireTurnstile);
      if (!turnstile.ok) {
        // Log Turnstile failure
        await logSecurityEventServer({
          type: "bot_detected",
          userId: undefined,
          details: { reason: turnstile.reason },
          severity: "medium",
          ipAddress: ip || undefined,
          userAgent: req.headers.get("user-agent") || undefined,
        });
        return NextResponse.json(
          { error: "challenge_required", reason: turnstile.reason },
          { status: 401 },
        );
      }

      const token = await verifyRequestAuth(req, {
        requireAdmin: opts.requireAdmin,
      });

      if (!opts.skipCsrf && !verifyCsrf(req)) {
        // Log CSRF failure
        await logSecurityEventServer({
          type: "csrf_failure",
          userId: token.uid,
          details: { path: new URL(req.url).pathname },
          severity: "high",
          ipAddress: ip || undefined,
          userAgent: req.headers.get("user-agent") || undefined,
        });
        return NextResponse.json({ error: "csrf" }, { status: 403 });
      }

      let rl: ReturnType<typeof enforceLocalReadLimit> | null = null;
      if (!opts.skipRateLimit) {
        if (useRedisForReadSecurity) {
          try {
            rl = await enforceRateLimit(opts.rateLimit, token.uid);
          } catch (e) {
            if (!(opts.allowRedisFallback && e instanceof RedisUnavailableError)) {
              throw e;
            }
            console.warn(
              `[security] Redis unavailable for rate limiting bucket "${opts.rateLimit.bucket}" on ${new URL(req.url).pathname}; using in-process fallback.`,
            );
            rl = enforceLocalReadLimit(opts.rateLimit, token.uid);
          }
        } else {
          rl = enforceLocalReadLimit(opts.rateLimit, token.uid);
        }
      }
      if (rl && !rl.allowed) {
        // Log rate limit exceeded
        await logSecurityEventServer({
          type: "rate_limit_exceeded",
          userId: token.uid,
          details: {
            bucket: opts.rateLimit.bucket,
            retryAfter: rl.retryAfterMs,
          },
          severity: "medium",
          ipAddress: ip || undefined,
          userAgent: req.headers.get("user-agent") || undefined,
        });
        return NextResponse.json(
          { error: "rate_limited", retry_after_ms: rl.retryAfterMs },
          {
            status: 429,
            headers: {
              "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)),
            },
          },
        );
      }

      const path = new URL(req.url).pathname;
      const socialRequest = new RegExp('^/api/(posts|stories|dares|truth|drama|verdicts|community|birthday|aura)(/|$)').test(path);
      const circleId = req.headers.get('x-circle-id');
      if (socialRequest && (!circleId || !/^[0-9a-f-]{36}$/i.test(circleId))) {
        return NextResponse.json({ error: 'Select a Circle first.' }, { status: 400 });
      }
      if (socialRequest) {
        const { data, error } = await (getSupabaseAdminClient() as any).rpc('is_circle_member', { p_circle: circleId, p_user: token.uid });
        if (error || data !== true) return NextResponse.json({ error: 'Circle unavailable.' }, { status: 403 });
      }
      const context = { uid: token.uid, ip, token, circleId: socialRequest ? circleId! : undefined };
      const result = await (socialRequest
        ? runInCircle(circleId!, token.uid, req.headers.get('authorization')!, () => handler(req, context), req.headers.get("x-event-id"), req.headers.get("x-chat-source-id"))
        : handler(req, context));
      if (result instanceof Response) return result;
      return NextResponse.json({ ok: true, data: result });
    } catch (e) {
      if (e instanceof RedisUnavailableError) {
        await logSecurityEventServer({
          type: "security_violation",
          userId: undefined,
          details: { error: e.message, feature: e.feature },
          severity: "critical",
          ipAddress: getClientIp(req) || undefined,
          userAgent: req.headers.get("user-agent") || undefined,
        });
        return NextResponse.json(
          { error: "redis_unavailable", message: e.message },
          { status: 503 },
        );
      }

      if (e instanceof AuthError) {
        // Log authentication failure
        await logSecurityEventServer({
          type: "auth_failure",
          userId: undefined,
          details: { error: e.message, status: e.status },
          severity: "high",
          ipAddress: getClientIp(req) || undefined,
          userAgent: req.headers.get("user-agent") || undefined,
        });
        return NextResponse.json({ error: e.message }, { status: e.status });
      }
      console.error("withSecurity handler failure", e);
      await logSecurityEventServer({
        type: "security_violation",
        userId: undefined,
        details: { error: e instanceof Error ? e.message : String(e) },
        severity: "critical",
        ipAddress: getClientIp(req) || undefined,
        userAgent: req.headers.get("user-agent") || undefined,
      });
      // In development, surface the real error so the browser devtools
      // reveal the root cause without needing terminal access. Production
      // stays opaque to avoid leaking server internals.
      if (process.env.NODE_ENV !== "production") {
        return NextResponse.json(
          {
            error: "internal",
            message: e instanceof Error ? e.message : String(e),
            stack: e instanceof Error ? e.stack : undefined,
          },
          { status: 500 },
        );
      }
      return NextResponse.json({ error: "internal" }, { status: 500 });
    }
  };
}

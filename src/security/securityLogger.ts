import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export interface SecurityEvent {
  type: "auth_failure" | "rate_limit_exceeded" | "invalid_input" | "suspicious_activity" | "account_locked" | "security_violation" | "auth_success" | "profile_update" | "password_change" | "email_change" | "account_deletion" | "data_export" | "new_device_login" | "content_flagged" | "admin_action" | "2fa_enabled" | "2fa_disabled" | "2fa_failed" | "csrf_failure" | "bot_detected" | "ip_blocked" | "xss_attempt" | "injection_attempt";
  userId?: string;
  email?: string;
  details: Record<string, unknown>;
  severity: "low" | "medium" | "high" | "critical";
  ipAddress?: string;
  deviceFingerprint?: string;
  userAgent?: string;
  path?: string;
  method?: string;
}

async function insertEvent(event: SecurityEvent, server = false): Promise<void> {
  if (process.env.NODE_ENV !== "production") {
    console.log("[SECURITY]", event.type, event.severity, event.details);
    return;
  }
  try {
    const client = server ? getSupabaseAdminClient() : getSupabaseBrowserClient();
    const { data: { user } } = await client.auth.getUser();
    const row = {
      type: event.type,
      user_id: event.userId ?? user?.id ?? null,
      email: event.email ?? user?.email ?? null,
      details: event.details,
      severity: event.severity,
      ip_address: event.ipAddress ?? "unknown",
      device_fingerprint: event.deviceFingerprint ?? "unknown",
      user_agent: event.userAgent ?? (typeof navigator === "undefined" ? "server-side" : navigator.userAgent),
      path: event.path ?? null,
      method: event.method ?? null,
      environment: process.env.NODE_ENV,
    };
    const { error } = await client.from("security_logs").insert(row);
    if (error) throw error;
    if (event.severity === "critical") {
      const { error: alertError } = await client.from("security_alerts").insert({
        event: event.type,
        severity: event.severity,
        user_id: row.user_id,
        details: event.details,
        acknowledged: false,
      });
      if (alertError) throw alertError;
    }
  } catch (error) {
    console.error("Failed to log security event:", error);
  }
}

export const logSecurityEvent = insertEvent;
export const logSecurityEventServer = (event: SecurityEvent) => insertEvent(event, true);
export async function logAuthFailure(email: string, reason: string) { return insertEvent({ type: "auth_failure", email, details: { reason }, severity: "high" }); }
export async function logRateLimitExceeded(action: string, userId: string) { return insertEvent({ type: "rate_limit_exceeded", userId, details: { action }, severity: "medium" }); }
export async function logInvalidInput(field: string, value: string, reason: string) { return insertEvent({ type: "invalid_input", details: { field, value: value.slice(0, 100), reason }, severity: "low" }); }
export async function logSuspiciousActivity(activity: string, details: Record<string, unknown>) { return insertEvent({ type: "suspicious_activity", details: { activity, ...details }, severity: "high" }); }
export async function logAccountLockout(email: string, failedAttempts: number, lockoutDuration: string) { return insertEvent({ type: "account_locked", email, details: { failedAttempts, lockoutDuration }, severity: "critical" }); }
export async function logSecurityViolation(violation: string, details: Record<string, unknown>) { return insertEvent({ type: "security_violation", details: { violation, ...details }, severity: "critical" }); }
export async function logAuthSuccess(userId: string, method: string) { return insertEvent({ type: "auth_success", userId, details: { method }, severity: "low" }); }
export async function logProfileUpdate(userId: string, fields: string[]) { return insertEvent({ type: "profile_update", userId, details: { fields }, severity: "low" }); }
export async function logPasswordChange(userId: string) { return insertEvent({ type: "password_change", userId, details: {}, severity: "high" }); }
export async function logEmailChange(userId: string, oldEmail: string, newEmail: string) { return insertEvent({ type: "email_change", userId, details: { oldEmail, newEmail }, severity: "high" }); }
export async function logAccountDeletion(userId: string, email: string) { return insertEvent({ type: "account_deletion", userId, email, details: {}, severity: "critical" }); }
export async function logDataExport(userId: string, recordCount: number) { return insertEvent({ type: "data_export", userId, details: { recordCount }, severity: "medium" }); }
export async function logNewDeviceLogin(userId: string, deviceFingerprint: string, isNewDevice: boolean) { return insertEvent({ type: "new_device_login", userId, deviceFingerprint, details: { isNewDevice }, severity: isNewDevice ? "medium" : "low" }); }
export async function logContentFlagged(userId: string, contentType: string, reason: string) { return insertEvent({ type: "content_flagged", userId, details: { contentType, reason }, severity: "medium" }); }
export async function logAdminAction(adminUserId: string, action: string, targetUserId?: string) { return insertEvent({ type: "admin_action", userId: adminUserId, details: { action, targetUserId }, severity: "high" }); }
export async function log2FAEnabled(userId: string, method: string) { return insertEvent({ type: "2fa_enabled", userId, details: { method }, severity: "medium" }); }
export async function log2FADisabled(userId: string) { return insertEvent({ type: "2fa_disabled", userId, details: {}, severity: "high" }); }
export async function log2FAFailed(userId: string, reason: string) { return insertEvent({ type: "2fa_failed", userId, details: { reason }, severity: "high" }); }

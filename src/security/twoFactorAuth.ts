import { getSupabaseBrowserClient } from "@/lib/supabase/client";

interface TwoFactorSettings {
  enabled: boolean;
  method: "email" | "sms" | "none";
  phoneNumber?: string;
  verified: boolean;
  secret?: string;
  backupCodes?: string[];
  lastUsedAt?: number;
}

class TwoFactorAuthService {
  async getSettings(userId: string): Promise<TwoFactorSettings | null> {
    try {
      const { data, error } = await getSupabaseBrowserClient()
        .from("two_factor_settings")
        .select("enabled,method,phone_number,verified,secret,backup_codes,last_used_at")
        .eq("user_id", userId).maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return {
        enabled: data.enabled,
        method: data.method as TwoFactorSettings["method"],
        phoneNumber: data.phone_number ?? undefined,
        verified: data.verified,
        secret: data.secret ?? undefined,
        backupCodes: data.backup_codes,
        lastUsedAt: data.last_used_at ? Date.parse(data.last_used_at) : undefined,
      };
    } catch (error) {
      console.error("Error getting 2FA settings:", error);
      return null;
    }
  }

  async isEnabled(userId: string): Promise<boolean> {
    const settings = await this.getSettings(userId);
    return Boolean(settings?.enabled && settings.verified);
  }

  async enableTwoFactor(userId: string, method: "email" | "sms", phoneNumber?: string) {
    try {
      const { error } = await getSupabaseBrowserClient().from("two_factor_settings").upsert({
        user_id: userId, enabled: true, method, phone_number: phoneNumber || null,
        verified: false, secret: this.generateSecret(), backup_codes: this.generateBackupCodes(),
        updated_at: new Date().toISOString(),
      });
      if (error) throw error;
      return { success: true };
    } catch (error) {
      console.error("Error enabling 2FA:", error);
      return { success: false, error: "Failed to enable 2FA" };
    }
  }

  async verifySetup(userId: string, code: string) {
    void code;
    if (!(await this.getSettings(userId))) return { success: false, error: "2FA not enabled" };
    return { success: false, error: "2FA verification is not available (server-side verifier required)" };
  }

  async verifyCode(userId: string, code: string) {
    void code;
    const settings = await this.getSettings(userId);
    if (!settings?.enabled || !settings.verified) return { success: true };
    return { success: false, error: "2FA verification is not available (server-side verifier required)" };
  }

  async disableTwoFactor(userId?: string) {
    if (!userId) return { success: false, error: "Not authenticated" };
    try {
      const { error } = await getSupabaseBrowserClient().from("two_factor_settings")
        .update({ enabled: false, verified: false, updated_at: new Date().toISOString() })
        .eq("user_id", userId);
      if (error) throw error;
      return { success: true };
    } catch (error) {
      console.error("Error disabling 2FA:", error);
      return { success: false, error: "Failed to enable 2FA" };
    }
  }

  async isRequiredForOperation(userId: string, operation: string): Promise<boolean> {
    const settings = await this.getSettings(userId);
    return Boolean(settings?.enabled && settings.verified && [
      "change_password", "change_email", "delete_account", "export_data",
    ].includes(operation));
  }

  private generateSecret(): string {
    return Array.from(crypto.getRandomValues(new Uint8Array(32)))
      .map((byte) => byte.toString(16).padStart(2, "0")).join("");
  }

  private generateBackupCodes(): string[] {
    return Array.from({ length: 10 }, () => Array.from(crypto.getRandomValues(new Uint8Array(4)))
      .map((byte) => byte.toString(16).padStart(2, "0")).join("").toUpperCase().slice(0, 8));
  }
}

export const twoFactorAuthService = new TwoFactorAuthService();

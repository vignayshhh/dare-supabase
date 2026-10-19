import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { dareService } from "./dare.service";
import { friendsService } from "./friends.service";

export interface ModerationAction {
  id: string;
  moderator_id: string;
  target_user_id: string;
  action_type:
    | "warning"
    | "temporary_ban"
    | "permanent_ban"
    | "content_removal";
  reason: string;
  details?: string;
  expires_at?: string;
  created_at: string;
}

export interface ContentReport {
  id: string;
  reporter_id: string;
  content_type: "dare" | "post" | "message" | "user_profile";
  content_id: string;
  reason: string;
  details?: string;
  status: "pending" | "reviewed" | "resolved" | "dismissed";
  reviewed_by?: string;
  reviewed_at?: string;
  resolution?: string;
  created_at: string;
}

export interface OverrideVote {
  id: string;
  dare_id: string;
  voter_id: string;
  vote_type: "real" | "fake";
  is_override: boolean;
  override_reason?: string;
  created_at: string;
}

class ModerationService {
  private get client() {
    return getSupabaseBrowserClient();
  }
  async createContentReport(
    report: Omit<ContentReport, "id" | "created_at" | "status">,
  ): Promise<ContentReport> {
    try {
      const { data, error } = await this.client.from("reports").insert({
        reporter_id: report.reporter_id, subject_type: report.content_type,
        subject_id: report.content_id, reason: report.reason, detail: report.details,
        status: "OPEN",
      }).select("id,reporter_id,subject_type,subject_id,reason,detail,status,created_at").single();
      if (error) throw error;
      return { id: data.id, reporter_id: data.reporter_id, content_type: data.subject_type, content_id: data.subject_id, reason: data.reason, details: data.detail, status: data.status.toLowerCase(), created_at: data.created_at } as ContentReport;
    } catch (error) {
      console.error("Error creating content report:", error);
      throw error;
    }
  }

  async getReportsForReview(): Promise<ContentReport[]> {
    try {
      const { data, error } = await this.client.from("reports").select("id,reporter_id,subject_type,subject_id,reason,detail,status,created_at")
        .in("status", ["OPEN", "REVIEWING"]).order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((row) => ({ id: row.id, reporter_id: row.reporter_id, content_type: row.subject_type, content_id: row.subject_id, reason: row.reason, details: row.detail, status: row.status.toLowerCase(), created_at: row.created_at })) as ContentReport[];
    } catch (error) {
      console.error("Error getting reports for review:", error);
      return [];
    }
  }

  async reviewReport(
    reportId: string,
    moderatorId: string,
    resolution: string,
    status: "resolved" | "dismissed",
  ): Promise<ContentReport> {
    try {
      const { data, error } = await this.client.from("reports").update({
        status: status === "resolved" ? "RESOLVED" : "DISMISSED",
        resolved_by: moderatorId, detail: resolution, updated_at: new Date().toISOString(),
      }).eq("id", reportId).select("id,reporter_id,subject_type,subject_id,reason,detail,status,created_at").maybeSingle();
      if (error) throw error;
      if (!data) {
        throw new Error("Report not found after update");
      }
      return { id: data.id, reporter_id: data.reporter_id, content_type: data.subject_type, content_id: data.subject_id, reason: data.reason, details: data.detail, status: data.status.toLowerCase(), created_at: data.created_at } as ContentReport;
    } catch (error) {
      console.error("Error reviewing report:", error);
      throw error;
    }
  }

  async createModerationAction(
    action: Omit<ModerationAction, "id" | "created_at">,
  ): Promise<ModerationAction> {
    try {
      const { data, error } = await this.client.from("moderation_actions").insert({
        admin_id: action.moderator_id, target_user_id: action.target_user_id,
        action: action.action_type, reason: action.reason, expires_at: action.expires_at ?? null,
      }).select("id,admin_id,target_user_id,action,reason,expires_at,created_at").single();
      if (error) throw error;
      return { id: data.id, moderator_id: data.admin_id, target_user_id: data.target_user_id, action_type: data.action, reason: data.reason, expires_at: data.expires_at, created_at: data.created_at } as ModerationAction;
    } catch (error) {
      console.error("Error creating moderation action:", error);
      throw error;
    }
  }

  async getActiveModerationActions(
    userId: string,
  ): Promise<ModerationAction[]> {
    try {
      const { data, error } = await this.client.from("moderation_actions")
        .select("id,admin_id,target_user_id,action,reason,expires_at,created_at")
        .eq("target_user_id", userId).in("action", ["temporary_ban", "permanent_ban"]);
      if (error) throw error;
      const actions = (data ?? []).map((row) => ({ id: row.id, moderator_id: row.admin_id, target_user_id: row.target_user_id, action_type: row.action, reason: row.reason, expires_at: row.expires_at, created_at: row.created_at })) as ModerationAction[];

      const now = new Date();
      return actions.filter((action) => {
        if (action.action_type === "temporary_ban" && action.expires_at) {
          return new Date(action.expires_at) > now;
        }
        return action.action_type === "permanent_ban";
      });
    } catch (error) {
      console.error("Error getting active moderation actions:", error);
      return [];
    }
  }

  async isUserBanned(userId: string): Promise<boolean> {
    try {
      const activeActions = await this.getActiveModerationActions(userId);
      return activeActions.some(
        (action) =>
          action.action_type === "permanent_ban" ||
          (action.action_type === "temporary_ban" &&
            (!action.expires_at || new Date(action.expires_at) > new Date())),
      );
    } catch (error) {
      console.error("Error checking if user is banned:", error);
      return false;
    }
  }

  async processFriendsOverride(dareId: string): Promise<boolean> {
    try {
      const dare = await dareService.getDare(dareId);
      if (!dare || (dare.state as string) !== "rejected_by_friends") {
        throw new Error("Invalid dare state for friends override");
      }

      const challengerFriends = await friendsService.getFriends(
        dare.challenger_id,
      );
      const receiverFriends = await friendsService.getFriends(dare.receiver_id);

      const allFriends = new Map();
      challengerFriends.forEach((friend) =>
        allFriends.set(friend.user_id, friend),
      );
      receiverFriends.forEach((friend) =>
        allFriends.set(friend.user_id, friend),
      );

      const totalFriends = allFriends.size;
      const requiredVotes = Math.ceil(totalFriends * 0.1);

      const { data: existingVotes, error } = await this.client.from("dare_votes")
        .select("dare_id,voter_id,vote,created_at").eq("dare_id", dareId);
      if (error) throw error;

      const overrideVotes = existingVotes.filter(
        (vote) => (vote.vote === "APPROVE" || vote.vote === "REAL") && allFriends.has(vote.voter_id),
      );

      if (overrideVotes.length >= requiredVotes) {
        await dareService.approveDare(dareId);

        for (const vote of overrideVotes) {
          await this.recordOverrideVote(
            dareId,
            vote.voter_id,
            "real",
            "Friends override successful",
          );
        }

        return true;
      } else {
        await dareService.rejectDareByFriends(dareId);

        for (const vote of overrideVotes) {
          await this.recordOverrideVote(
            dareId,
            vote.voter_id,
            "real",
            "Friends override failed",
          );
        }

        return false;
      }
    } catch (error) {
      console.error("Error processing friends override:", error);
      throw error;
    }
  }

  private async recordOverrideVote(
    dareId: string,
    voterId: string,
    voteType: "real" | "fake",
    reason?: string,
  ): Promise<OverrideVote> {
    try {
      const voteData = {
        dare_id: dareId,
        voter_id: voterId,
        vote_type: voteType,
        is_override: true,
        override_reason: reason,
        created_at: new Date().toISOString(),
      };

      const { data, error } = await this.client.from("override_votes").upsert(voteData, { onConflict: "dare_id,voter_id" })
        .select("id,dare_id,voter_id,vote_type,is_override,override_reason,created_at").single();
      if (error) throw error;
      return data as OverrideVote;
    } catch (error) {
      console.error("Error recording override vote:", error);
      throw error;
    }
  }

  async getOverrideVotes(dareId: string): Promise<OverrideVote[]> {
    try {
      const { data, error } = await this.client.from("override_votes").select("id,dare_id,voter_id,vote_type,is_override,override_reason,created_at")
        .eq("dare_id", dareId).order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as OverrideVote[];
    } catch (error) {
      console.error("Error getting override votes:", error);
      return [];
    }
  }

  async canUserOverrideDare(dareId: string, userId: string): Promise<boolean> {
    try {
      const dare = await dareService.getDare(dareId);
      if (!dare || (dare.state as string) !== "rejected_by_friends") {
        return false;
      }

      const isFriendsWithChallenger = await friendsService.areFriends(
        userId,
        dare.challenger_id,
      );
      const isFriendsWithReceiver = await friendsService.areFriends(
        userId,
        dare.receiver_id,
      );

      if (!isFriendsWithChallenger && !isFriendsWithReceiver) {
        return false;
      }

      const existingVotes = await this.getOverrideVotes(dareId);
      const alreadyVoted = existingVotes.some(
        (vote) => vote.voter_id === userId,
      );

      return !alreadyVoted;
    } catch (error) {
      console.error("Error checking if user can override dare:", error);
      return false;
    }
  }

  async submitOverrideVote(
    dareId: string,
    userId: string,
    voteType: "real" | "fake",
  ): Promise<boolean> {
    try {
      if (!(await this.canUserOverrideDare(dareId, userId))) {
        throw new Error("User cannot override this dare");
      }

      await this.recordOverrideVote(
        dareId,
        userId,
        voteType,
        "Friends override vote",
      );
      await this.processFriendsOverride(dareId);

      return true;
    } catch (error) {
      console.error("Error submitting override vote:", error);
      throw error;
    }
  }

  async getModerationHistory(userId: string): Promise<ModerationAction[]> {
    try {
      const { data, error } = await this.client.from("moderation_actions")
        .select("id,admin_id,target_user_id,action,reason,created_at")
        .eq("target_user_id", userId).order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((row) => ({ id: row.id, moderator_id: row.admin_id, target_user_id: row.target_user_id, action_type: row.action, reason: row.reason, created_at: row.created_at })) as ModerationAction[];
    } catch (error) {
      console.error("Error getting moderation history:", error);
      return [];
    }
  }

  async cleanupExpiredActions(): Promise<void> {
    try {
      const now = new Date().toISOString();
      const { error } = await this.client.from("moderation_actions")
        .update({ action: "expired_ban" }).eq("action", "temporary_ban").lt("expires_at", now);
      if (error) throw error;
    } catch (error) {
      console.error("Error cleaning up expired actions:", error);
    }
  }
}

export const moderationService = new ModerationService();

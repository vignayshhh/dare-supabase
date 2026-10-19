import "server-only";
import { NextResponse } from "next/server";
import { withSecurity } from "../../_lib/withSecurity";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { LIMITS } from "../../_lib/rateLimit";
import { attachMediaAssetsForUrls } from "../../_lib/mediaAssets";

type CreateCommunityDareBody = {
  title?: string;
  description?: string;
  durationDays?: number;
  thumbnailUrl?: string;
  creatorUsername?: string;
  creatorDisplayName?: string;
  creatorAvatarUrl?: string;
};

const MIN_REQUIRED_MEMBERS = 2;
const DEFAULT_BANNER =
  "radial-gradient(circle at 18% 18%, rgba(74,222,128,0.34), transparent 24%), radial-gradient(circle at 82% 22%, rgba(56,189,248,0.24), transparent 25%), repeating-linear-gradient(120deg, rgba(255,255,255,0.045) 0 1px, transparent 1px 17px), linear-gradient(145deg, rgba(8,22,13,0.98), rgba(4,8,5,1) 54%, rgba(10,34,42,0.94))";

function sanitizeText(value: unknown, maxLength: number) {
  if (typeof value !== "string") return "";
  return value
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function normalizeUsername(value: unknown) {
  return (
    sanitizeText(typeof value === "string" ? value.replace(/^@/, "") : "", 40) ||
    "dareuser"
  );
}

function validateMediaUrl(value: unknown) {
  const url = sanitizeText(value, 2000);
  if (!url) return "";

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("bad thumbnail");
  }

  if (parsed.protocol !== "https:") {
    throw new Error("bad thumbnail");
  }

  const hostname = parsed.hostname.toLowerCase();
  const allowedHosts = [
    "storage.googleapis.com",
    "*.supabase.co",
  ];
  const allowed = allowedHosts.some(
    (host) => hostname === host || hostname.endsWith(`.${host}`),
  );
  if (!allowed) {
    throw new Error("bad thumbnail");
  }

  return url;
}

function formatStartedAt(createdAtMs: number) {
  return new Date(createdAtMs).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export const POST = withSecurity(
  {
    rateLimit: LIMITS.COMMUNITY_DARE_CREATE,
    skipCsrf: true,
  },
  async (req, ctx) => {
    let body: CreateCommunityDareBody = {};
    try {
      body = (await req.json()) as CreateCommunityDareBody;
    } catch {
      return NextResponse.json({ error: "bad body" }, { status: 400 });
    }

    const title = sanitizeText(body.title, 90);
    const description = sanitizeText(body.description, 700);
    const durationDays = Math.min(
      365,
      Math.max(1, Number(body.durationDays || 7)),
    );

    if (title.length < 4) {
      return NextResponse.json({ error: "title required" }, { status: 400 });
    }
    if (description.length < 12) {
      return NextResponse.json(
        { error: "description required" },
        { status: 400 },
      );
    }

    let imageUrl = "";
    try {
      imageUrl = validateMediaUrl(body.thumbnailUrl);
    } catch {
      return NextResponse.json({ error: "bad thumbnail" }, { status: 400 });
    }

    const { data: user, error: profileError } = await (getSupabaseAdminClient() as any).from("profiles").select("username,display_name,avatar_url").eq("id",ctx.uid).maybeSingle();
    if (profileError) throw profileError;
    const creatorUsername = normalizeUsername(
      body.creatorUsername || user.username,
    );
    const creatorDisplayName =
      sanitizeText(
        body.creatorDisplayName ||
          user.display_name ||
          user.displayName ||
          creatorUsername,
        80,
      ) || "Dare User";
    const creatorAvatarUrl = sanitizeText(
      body.creatorAvatarUrl || user.avatar_url || user.avatarUrl || "",
      2000,
    );
    const createdAtMs = Date.now();
    const durationLabel = `${durationDays} ${
      durationDays === 1 ? "day" : "days"
    }`;
    const titleAccent = `for ${durationLabel}`;

    const challengeId = crypto.randomUUID();
    const summaryData = {
      challenge_id: challengeId,
      custom_dare: true,
      visibility: "friends",
      title,
      title_top: title,
      title_accent: titleAccent,
      description,
      duration_days: durationDays,
      duration_label: durationLabel,
      image_url: imageUrl,
      image_position: "center",
      banner: DEFAULT_BANNER,
      creator_id: ctx.uid,
      creator_username: creatorUsername,
      creator_display_name: creatorDisplayName,
      creator_avatar_url: creatorAvatarUrl,
      sponsored_by_dare: false,
      proof_label: "Challenge proof",
      proof_files: ["Daily photo or video proof"],
      accent: "#4ade80",
      secondary_accent: "#38bdf8",
      joined_count: 0,
      waiting_count: 0,
      active_count: 0,
      completed_count: 0,
      eliminated_count: 0,
      extra_count: 0,
      join_preview: [],
      batch_status: "open",
      min_required_members: MIN_REQUIRED_MEMBERS,
      registration_started_at: null,
      registration_ends_at: null,
      batch_started_at: null,
      created_at_ms: createdAtMs,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const { error } = await (getSupabaseAdminClient() as any).from("community_challenges").insert({
      id: challengeId, creator_id: ctx.uid, title, body: description, status: "OPEN",
      deadline_at: new Date(createdAtMs + durationDays * 86400000).toISOString(), metadata: summaryData,
    });
    if (error) throw error;
    const { error: summaryError } = await (getSupabaseAdminClient() as any).from("community_challenge_summaries").insert({
      id: challengeId,
      custom_dare: true,
      challenge_id: challengeId,
      title_top: title,
      title_accent: titleAccent,
      description,
      duration_days: durationDays,
      creator_id: ctx.uid,
      creator_username: creatorUsername,
      creator_display_name: creatorDisplayName,
      creator_avatar_url: creatorAvatarUrl,
      image_url: imageUrl,
      image_position: "center",
      banner: DEFAULT_BANNER,
      proof_label: "Challenge proof",
      proof_files: ["Daily photo or video proof"],
      batch_status: "open",
      min_required_members: MIN_REQUIRED_MEMBERS,
    });
    if (summaryError) throw summaryError;
    await attachMediaAssetsForUrls(getSupabaseAdminClient(), [imageUrl], "community_challenge", challengeId);

    return NextResponse.json({
      success: true,
      challenge: {
        id: challengeId,
        customDare: true,
        typeLabel: `Created by @${creatorUsername}`,
        countdown: "48:00:00",
        batchStatus: "open",
        minRequiredMembers: MIN_REQUIRED_MEMBERS,
        registrationStartedAtMs: null,
        registrationEndsAtMs: null,
        batchStartedAtMs: null,
        titleTop: title,
        titleAccent,
        joinedCount: 0,
        friendNames: [],
        joinPreview: [],
        extraFriends: 0,
        survivors: 0,
        eliminated: 0,
        accent: "#4ade80",
        secondaryAccent: "#38bdf8",
        imageUrl,
        imagePosition: "center",
        banner: DEFAULT_BANNER,
        description,
        startedAt: formatStartedAt(createdAtMs),
        durationLabel,
        creatorName: creatorDisplayName,
        creatorUsername,
        creatorAvatar: creatorAvatarUrl,
        sponsoredByDare: false,
        proofLabel: "Challenge proof",
        proofFiles: ["Daily photo or video proof"],
        icon: "spark",
      },
    });
  },
);

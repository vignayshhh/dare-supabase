import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export const STICKMAN_ACCESSORY_OPTIONS = [
  { id: "none", label: "Bare minimum", glyph: "Â·" },
  { id: "shades", label: "Main character shades", glyph: "â—‰" },
  { id: "beanie", label: "Tiny beanie", glyph: "âŒ’" },
  { id: "crown", label: "Crown energy", glyph: "â™›" },
  { id: "horns", label: "Chaos horns", glyph: "â™¢" },
  { id: "headphones", label: "Headphones on", glyph: "â—–â——" },
  { id: "halo", label: "Too innocent", glyph: "â—Œ" },
  { id: "flower", label: "Soft launch", glyph: "âœ¿" },
  { id: "bandana", label: "Street mode", glyph: "âŒ" },
  { id: "star", label: "Star player", glyph: "âœ¦" },
] as const;

export const STICKMAN_ANIMATION_OPTIONS = [
  { id: "idle", label: "Low-key", detail: "tiny sway" },
  { id: "wave", label: "Wave check", detail: "say hi" },
  { id: "bounce", label: "Bouncy", detail: "good mood" },
  { id: "dance", label: "Little dance", detail: "zero context" },
  { id: "swagger", label: "Strut", detail: "walk in" },
  { id: "sleepy", label: "Sleepy", detail: "five more mins" },
  { id: "spin", label: "Spin cycle", detail: "plot twist" },
  { id: "hype", label: "Hype", detail: "locked in" },
  { id: "float", label: "Floaty", detail: "unbothered" },
  { id: "sit", label: "Floor time", detail: "actually fine" },
] as const;

export type StickmanAccessoryId = (typeof STICKMAN_ACCESSORY_OPTIONS)[number]["id"];
export type StickmanAnimationId = (typeof STICKMAN_ANIMATION_OPTIONS)[number]["id"];

export interface StickmanCustomization {
  accessoryId: StickmanAccessoryId;
  animationId: StickmanAnimationId;
}

export const DEFAULT_STICKMAN_CUSTOMIZATION: StickmanCustomization = {
  accessoryId: "none",
  animationId: "idle",
};

const accessoryIds = new Set<string>(STICKMAN_ACCESSORY_OPTIONS.map((item) => item.id));
const animationIds = new Set<string>(STICKMAN_ANIMATION_OPTIONS.map((item) => item.id));

export function getStickmanCustomization(data: unknown): StickmanCustomization {
  const source = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  const accessoryId = typeof source.stickman_accessory_id === "string" && accessoryIds.has(source.stickman_accessory_id)
    ? (source.stickman_accessory_id as StickmanAccessoryId)
    : DEFAULT_STICKMAN_CUSTOMIZATION.accessoryId;
  const animationId = typeof source.stickman_animation_id === "string" && animationIds.has(source.stickman_animation_id)
    ? (source.stickman_animation_id as StickmanAnimationId)
    : DEFAULT_STICKMAN_CUSTOMIZATION.animationId;
  return { accessoryId, animationId };
}

class StickmanCustomizationService {
  async save(userId: string, customization: StickmanCustomization) {
    if (!userId) throw new Error("Missing user id");
    const safe = getStickmanCustomization({
      stickman_accessory_id: customization.accessoryId,
      stickman_animation_id: customization.animationId,
    });
    const { data } = await getSupabaseBrowserClient().auth.getUser();
    if (!data.user || data.user.id !== userId) throw new Error("Not authorized");
    const { error } = await getSupabaseBrowserClient().from("profiles").update({
      stickman_accessory_id: safe.accessoryId,
      stickman_animation_id: safe.animationId,
      stickman_customization_updated_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("id", userId);
    if (error) throw error;
    return safe;
  }
}

export const stickmanCustomizationService = new StickmanCustomizationService();

import type { Json } from "@/backend/types/database";

export type NativeRow = Record<string, unknown>;

export interface TruthActionRow extends NativeRow {
  challenger_id: string;
  receiver_id: string;
  question: string;
  state?: string | null;
  answer?: string | null;
  votes?: Json;
  created_at?: string | null;
  updated_at?: string | null;
  answered_at?: string | null;
  reviewed_at?: string | null;
}

export interface DareActionRow extends NativeRow {
  challenger_id: string;
  receiver_id: string;
  description: string;
  state?: string | null;
  proof_media_url?: string | null;
  proof_media_type?: string | null;
  proof_thumbnail_url?: string | null;
  challenger_vote?: string | null;
  validation_threshold_met?: boolean | null;
  created_at?: string | null;
  updated_at?: string | null;
  accepted_at?: string | null;
  proof_submitted_at?: string | null;
  completed_at?: string | null;
}

export interface DramaRow extends NativeRow {
  kind?: string | null;
  data?: Json;
  creator?: Json;
  creator_id?: string | null;
  votes?: Json;
  voters?: Json;
  comments?: Json;
  created_at?: string | null;
  resolution?: string | null;
  resolved_at?: string | null;
}

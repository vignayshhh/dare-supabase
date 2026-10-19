export type VerdictChoice = "one" | "two";

export type VerdictScope = "friends" | "topics";

export type VerdictMediaType = "PHOTO" | "VIDEO" | "GIF";

export interface VerdictAuthorDTO {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string;
}

export interface VerdictVoterPreviewDTO extends VerdictAuthorDTO {
  choice: VerdictChoice;
}

export interface VerdictDTO {
  id: string;
  author_id: string;
  author: VerdictAuthorDTO;
  question: string;
  description: string;
  choice_one_text: string;
  choice_two_text: string;
  media_url: string;
  media_type: VerdictMediaType;
  scope: VerdictScope;
  topic: string | null;
  total_votes: number;
  choice_one_votes: number;
  choice_two_votes: number;
  comments_count: number;
  voter_preview: VerdictVoterPreviewDTO[];
  my_vote: VerdictChoice | null;
  created_at: string;
  updated_at: string;
}

export interface VerdictCommentDTO {
  id: string;
  verdict_id: string;
  user_id: string;
  author: VerdictAuthorDTO;
  text: string;
  parent_id: string | null;
  created_at: string;
}

/** Bounded interaction metadata returned with every drama card. */
export interface DramaInteractionSummary {
  voteCounts: Record<string, number>;
  totalVotes: number;
  userVote: string | null;
  commentCount: number;
  revision: number;
}

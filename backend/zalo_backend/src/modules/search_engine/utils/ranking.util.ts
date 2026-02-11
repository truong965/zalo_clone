/**
 * Ranking & Relevance Utility
 * Calculates relevance score for search results
 *
 * Formula:
 * relevance_score = (
 *   fullTextMatchRank * 0.4 +
 *   recencyScore * 0.2 +
 *   relationshipScore * 0.2 +
 *   frequencyScore * 0.1 +
 *   interactionScore * 0.1
 * )
 */

import { RelationshipType } from '@common/constants/relationship-type.constant';

// Re-export for backward compatibility
export { RelationshipType };

export interface RankingWeights {
  fullTextMatch: number; // 0.4
  recency: number; // 0.2
  relationship: number; // 0.2
  frequency: number; // 0.1
  interaction: number; // 0.1
}

export class RankingUtil {
  private static defaultWeights: RankingWeights = {
    fullTextMatch: 0.4,
    recency: 0.2,
    relationship: 0.2,
    frequency: 0.1,
    interaction: 0.1,
  };

  /**
   * Calculate recency score using exponential decay
   * Recent messages get higher score, older messages decay exponentially
   * Formula: EXP(-daysAgo / 30)
   */
  static calculateRecencyScore(createdAt: Date): number {
    const now = new Date();
    const daysAgo =
      (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24);
    return Math.exp(-daysAgo / 30); // Decay over 30 days
  }

  /**
   * Calculate relationship score
   */
  static calculateRelationshipScore(relationship: RelationshipType): number {
    switch (relationship) {
      case RelationshipType.FRIEND:
        return 1.0;
      case RelationshipType.REQUEST_PENDING:
        return 0.7;
      case RelationshipType.NONE:
        return 0.3;
      case RelationshipType.BLOCKED:
        return 0; // Filtered out earlier, but included for completeness
      default:
        return 0.3;
    }
  }

  /**
   * Calculate frequency score (how many times keyword appears)
   * Formula: MIN(occurrences / 10, 1.0)
   */
  static calculateFrequencyScore(
    content: string | null | undefined,
    keyword: string,
  ): number {
    if (!content || content.trim() === '') return 0;

    const lowerContent = content.toLowerCase();
    const lowerKeyword = keyword.toLowerCase();

    let count = 0;
    let index = 0;

    while ((index = lowerContent.indexOf(lowerKeyword, index)) !== -1) {
      count++;
      index += lowerKeyword.length;
    }

    return Math.min(count / 10, 1.0);
  }

  /**
   * Calculate interaction score (has replies, reactions, etc.)
   * This is typically from database query
   */
  static calculateInteractionScore(
    hasReplies: boolean,
    hasReactions: boolean,
  ): number {
    let score = 0;
    if (hasReplies) score += 0.5;
    if (hasReactions) score += 0.5;
    return Math.min(score, 1.0);
  }

  /**
   * Full ranking calculation
   */
  static calculateFullScore(
    fullTextMatchRank: number, // 0-1, from PostgreSQL ts_rank()
    createdAt: Date,
    relationship: RelationshipType,
    content: string | null,
    keyword: string,
    hasReplies = false,
    hasReactions = false,
    weights: Partial<RankingWeights> = {},
  ): number {
    const mergedWeights = { ...this.defaultWeights, ...weights };

    const recencyScore = this.calculateRecencyScore(createdAt);
    const relationshipScore = this.calculateRelationshipScore(relationship);
    const frequencyScore = this.calculateFrequencyScore(content, keyword);
    const interactionScore = this.calculateInteractionScore(
      hasReplies,
      hasReactions,
    );

    return (
      fullTextMatchRank * mergedWeights.fullTextMatch +
      recencyScore * mergedWeights.recency +
      relationshipScore * mergedWeights.relationship +
      frequencyScore * mergedWeights.frequency +
      interactionScore * mergedWeights.interaction
    );
  }

  /**
   * Simple trigram similarity score (0-1)
   * For fallback when full-text search not available
   */
  static calculateTrigramSimilarity(text: string, keyword: string): number {
    if (!text || !keyword) return 0;

    const lowerText = text.toLowerCase();
    const lowerKeyword = keyword.toLowerCase();

    // Exact match
    if (lowerText === lowerKeyword) return 1.0;

    // Substring match
    if (lowerText.includes(lowerKeyword)) return 0.8;

    // Character set overlap (rough approximation)
    const textSet = new Set(lowerText);
    const keywordSet = new Set(lowerKeyword);
    const intersection = Array.from(keywordSet).filter((c) =>
      textSet.has(c),
    ).length;
    const union = new Set([...textSet, ...keywordSet]).size;

    return intersection / union;
  }

  /**
   * Sort results by relevance score
   */
  static sortByRelevance<T extends { rankScore?: number }>(
    items: T[],
    orderDesc = true,
  ): T[] {
    return items.sort((a, b) => {
      const scoreA = a.rankScore || 0;
      const scoreB = b.rankScore || 0;
      return orderDesc ? scoreB - scoreA : scoreA - scoreB;
    });
  }

  /**
   * Boost score based on algorithm preferences
   * Example: Boost recent messages during business hours
   */
  static applyBoost(baseScore: number, boostFactor = 1.2): number {
    return Math.min(baseScore * boostFactor, 1.0);
  }
}

export interface PollVoterPreview {
      id: string;
      displayName: string;
      avatarUrl: string | null;
}

export interface PollOptionDetail {
      id: string;
      text: string;
      sortOrder: number;
      voteCount: number;
      percent: number;
      voters: PollVoterPreview[];
}

export interface PollDetail {
      id: string;
      messageId: string;
      conversationId: string;
      creatorId: string;
      question: string;
      isMultipleChoices: boolean;
      allowAddOptions: boolean;
      isClosed: boolean;
      closedAt: string | null;
      totalVoters: number;
      myVotedOptionIds: string[];
      options: PollOptionDetail[];
}

export interface CreatePollParams {
      conversationId: string;
      question: string;
      options: string[];
      isMultipleChoices?: boolean;
      allowAddOptions?: boolean;
}

export interface CreatePollResponse {
      poll: PollDetail;
      pollMessage: Record<string, unknown>;
      systemMessage: Record<string, unknown>;
}

export interface VotePollParams {
      toggleOptionId?: string;
      optionIds?: string[];
}

export interface PollVoteUpdatedPayload {
      pollId: string;
      messageId: string;
      conversationId: string;
      poll: PollDetail;
}

export interface PollClosedPayload {
      pollId: string;
      messageId: string;
      conversationId: string;
      closedById: string;
}

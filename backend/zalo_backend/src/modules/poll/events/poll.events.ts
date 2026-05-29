export class PollCreatedEvent {
  constructor(
    public readonly pollId: string,
    public readonly conversationId: string,
    public readonly pollMessageId: string,
    public readonly systemMessageId: string,
    public readonly creatorId: string,
  ) {}
}

export class PollVoteChangedEvent {
  constructor(
    public readonly pollId: string,
    public readonly conversationId: string,
    public readonly messageId: string,
    public readonly voterId: string,
  ) {}
}

export class PollClosedEvent {
  constructor(
    public readonly pollId: string,
    public readonly conversationId: string,
    public readonly messageId: string,
    public readonly closedById: string,
  ) {}
}

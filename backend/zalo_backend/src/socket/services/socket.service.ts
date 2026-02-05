import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class SocketService {
  private readonly logger = new Logger(SocketService.name);

  constructor() {}
  async getClientsInConversation(conversationId: any) {}
  async sendToClient(payload: any) {}
}

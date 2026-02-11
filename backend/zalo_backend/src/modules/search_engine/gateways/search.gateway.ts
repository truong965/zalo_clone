import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import type { Server } from 'socket.io';
import {
  Injectable,
  Logger,
  UseGuards,
  UseInterceptors,
  UseFilters,
} from '@nestjs/common';
import { RealTimeSearchService } from '../services/real-time-search.service';
import { OnEvent } from '@nestjs/event-emitter';
import type {
  SearchSubscribePayload,
  SearchUpdateQueryPayload,
  SearchNewMatchPayload,
  SearchErrorPayload,
  SearchLoadMorePayload,
} from 'src/common/interfaces/search-socket.interface';
import type { AuthenticatedSocket } from 'src/common/interfaces/socket-client.interface';
import { SocketEvents } from 'src/common/constants/socket-events.constant';
import { WsThrottleGuard } from 'src/socket/guards/ws-throttle.guard';
import { WsTransformInterceptor } from 'src/common/interceptor/ws-transform.interceptor';
import { WsExceptionFilter } from 'src/socket/filters/ws-exception.filter';
import { safeJSON } from 'src/common/utils/json.util';
/**
 * SearchGateway (Phase B: TD-07 — Shared namespace)
 *
 * WebSocket Gateway for real-time search functionality.
 * Shares the `/socket.io` namespace with SocketGateway (base) and MessageGateway.
 * Clients connect through ONE namespace — SocketGateway handles auth & lifecycle.
 *
 * EVENTS:
 * CLIENT → SERVER:
 * - search:subscribe - Subscribe to a search query
 * - search:unsubscribe - Unsubscribe from current search
 * - search:updateQuery - Update search keyword (debounced)
 *
 * SERVER → CLIENT:
 * - search:results - Initial search results
 * - search:newMatch - New message matches active search
 * - search:resultRemoved - Message removed from search results
 * - search:suggestions - Autocomplete suggestions
 * - search:error - Error notification
 *
 * ARCHITECTURE:
 * - Shares `/socket.io` namespace — SocketGateway is the base (auth, presence, lifecycle)
 * - Does NOT implement OnGatewayConnection/OnGatewayDisconnect (SocketGateway owns lifecycle)
 * - Cleanup on disconnect via @OnEvent('user.socket.disconnected')
 * - Uses AuthenticatedSocket (client.userId set by SocketGateway after auth)
 * - Listens to search.internal.* events from SearchEventListener (single source of truth)
 *
 * SECURITY:
 * - WsThrottleGuard for rate limiting (same as MessageGateway)
 * - WsTransformInterceptor for BigInt serialization
 * - WsExceptionFilter for unified error handling
 */
@Injectable()
@WebSocketGateway({
  cors: { origin: '*', credentials: true },
  namespace: '/socket.io', // Phase B (TD-07): Share namespace with SocketGateway (base)
})
@UseGuards(WsThrottleGuard)
@UseInterceptors(WsTransformInterceptor)
@UseFilters(WsExceptionFilter)
export class SearchGateway {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(SearchGateway.name);

  constructor(private readonly realTimeSearchService: RealTimeSearchService) { }

  // ============================================================================
  // Lifecycle: Cleanup on disconnect (delegated from SocketGateway via event)
  // ============================================================================

  /**
   * Handle user socket disconnection — cleanup search subscriptions.
   * SocketGateway owns the connection lifecycle; this gateway reacts via event.
   */
  @OnEvent(SocketEvents.USER_SOCKET_DISCONNECTED)
  handleUserDisconnected(event: { userId: string; socketId: string }): void {
    if (event.userId) {
      this.realTimeSearchService.unsubscribe(event.userId, event.socketId);
      this.logger.debug(
        `Cleaned up search subscriptions for user ${event.userId} (socket: ${event.socketId})`,
      );
    }
  }

  // ============================================================================
  // Client → Server: Search subscription management
  // ============================================================================

  /**
   * Subscribe to real-time search updates
   *
   * CLIENT → SERVER
   * Event: search:subscribe
   * Payload: { keyword, conversationId?, searchType?, filters? }
   */
  @SubscribeMessage(SocketEvents.SEARCH_SUBSCRIBE)
  async handleSearchSubscribe(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: SearchSubscribePayload,
  ): Promise<{ status: string; keyword: string; message?: string }> {
    try {
      const userId = client.userId;

      if (!userId) {
        this.emitError(client, 'UNAUTHORIZED', 'User not authenticated');
        return { status: 'error', keyword: payload.keyword };
      }

      this.logger.log(
        `User ${userId} subscribing to search: "${payload.keyword}" (socket: ${client.id})`,
      );

      // Subscribe and get initial results
      const initialResults = await this.realTimeSearchService.subscribe(
        userId,
        client.id,
        payload,
      );

      // Emit initial results to client
      client.emit(SocketEvents.SEARCH_RESULTS, safeJSON(initialResults));

      this.logger.log(
        `Sent ${initialResults.totalCount} initial results to user ${userId}`,
      );

      return {
        status: 'subscribed',
        keyword: payload.keyword,
        message: `Subscribed to search: "${payload.keyword}"`,
      };
    } catch (error) {
      this.logger.error(
        `Failed to subscribe to search: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );

      this.emitError(
        client,
        'SERVER_ERROR',
        error instanceof Error ? error.message : 'Failed to subscribe',
      );

      return { status: 'error', keyword: payload.keyword };
    }
  }

  /**
   * Unsubscribe from real-time search
   *
   * CLIENT → SERVER
   * Event: search:unsubscribe
   */
  @SubscribeMessage(SocketEvents.SEARCH_UNSUBSCRIBE)
  async handleSearchUnsubscribe(
    @ConnectedSocket() client: AuthenticatedSocket,
  ): Promise<{ status: string }> {
    try {
      const userId = client.userId;

      if (!userId) {
        return { status: 'error' };
      }

      this.realTimeSearchService.unsubscribe(userId, client.id);

      this.logger.log(
        `User ${userId} unsubscribed from search (socket: ${client.id})`,
      );

      return { status: 'unsubscribed' };
    } catch (error) {
      this.logger.error(
        `Failed to unsubscribe: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      return { status: 'error' };
    }
  }

  /**
   * Update search query (when user types)
   *
   * CLIENT → SERVER
   * Event: search:updateQuery
   * Payload: { keyword, conversationId? }
   *
   * Note: Client should debounce this (300ms) before sending
   */
  @SubscribeMessage(SocketEvents.SEARCH_UPDATE_QUERY)
  async handleUpdateQuery(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: SearchUpdateQueryPayload,
  ): Promise<{ status: string }> {
    try {
      const userId = client.userId;

      if (!userId) {
        return { status: 'error' };
      }

      // Unsubscribe from old query
      this.realTimeSearchService.unsubscribe(userId, client.id);

      // Subscribe to new query
      const subscribePayload: SearchSubscribePayload = {
        keyword: payload.keyword,
        conversationId: payload.conversationId,
        searchType: 'CONVERSATION',
      };

      const results = await this.realTimeSearchService.subscribe(
        userId,
        client.id,
        subscribePayload,
      );

      // Emit updated results
      client.emit(SocketEvents.SEARCH_RESULTS, safeJSON(results));

      return { status: 'updated' };
    } catch (error) {
      this.logger.error(
        `Failed to update query: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      return { status: 'error' };
    }
  }

  /**
   * Load more search results (pagination)
   *
   * CLIENT → SERVER
   * Event: search:loadMore
   * Payload: { searchType, keyword, cursor, limit?, conversationId?, mediaType? }
   *
   * Responds with search:moreResults event
   */
  @SubscribeMessage(SocketEvents.SEARCH_LOAD_MORE)
  async handleSearchLoadMore(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: SearchLoadMorePayload,
  ): Promise<{ status: string }> {
    try {
      const userId = client.userId;

      if (!userId) {
        this.emitError(client, 'UNAUTHORIZED', 'User not authenticated');
        return { status: 'error' };
      }

      this.logger.debug(
        `User ${userId} loadMore: ${payload.searchType} cursor=${payload.cursor} (socket: ${client.id})`,
      );

      const moreResults = await this.realTimeSearchService.handleLoadMore(
        userId,
        payload,
      );

      // Emit more results to client
      client.emit(SocketEvents.SEARCH_MORE_RESULTS, safeJSON(moreResults));

      return { status: 'ok' };
    } catch (error) {
      this.logger.error(
        `Failed to load more: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );

      this.emitError(
        client,
        'SERVER_ERROR',
        error instanceof Error ? error.message : 'Failed to load more results',
      );

      return { status: 'error' };
    }
  }

  // ============================================================================
  // Internal event listeners (from SearchEventListener — single source of truth)
  // ============================================================================

  /**
   * Handle search.internal.newMatch from SearchEventListener
   * Receives pre-processed matching subscriptions and message data, emits to sockets.
   *
   * Phase A (TD-04): Replaces duplicate @OnEvent('message.sent') — no more double DB query.
   */
  @OnEvent(SocketEvents.SEARCH_INTERNAL_NEW_MATCH)
  async handleInternalNewMatch(event: {
    message: {
      id: bigint;
      conversationId: string;
      senderId: string | null;
      content: string | null;
      type: string;
      createdAt: Date;
      sender?: {
        id: string;
        displayName: string | null;
        avatarUrl: string | null;
        phoneNumber: string;
      } | null;
      conversation?: {
        id: string;
        type: 'DIRECT' | 'GROUP';
        name: string | null;
      } | null;
    };
    subscriptions: Array<{
      socketId: string;
      keyword: string;
    }>;
  }): Promise<void> {
    try {
      const { message, subscriptions } = event;

      for (const subscription of subscriptions) {
        const payload: SearchNewMatchPayload = {
          keyword: subscription.keyword,
          message: {
            id: message.id.toString(),
            conversationId: message.conversationId,
            senderId: message.senderId || '',
            senderName: message.sender?.displayName || 'Unknown',
            senderAvatarUrl: message.sender?.avatarUrl || undefined,
            content: message.content || '',
            type: message.type as any,
            createdAt: message.createdAt,
            conversationType: message.conversation?.type || 'DIRECT',
            conversationName: message.conversation?.name || undefined,
            preview: message.content || '',
            highlights: [],
          },
          conversationId: message.conversationId,
          matchedAt: new Date(),
        };

        this.server
          .to(subscription.socketId)
          .emit(SocketEvents.SEARCH_NEW_MATCH, safeJSON(payload));

        this.logger.debug(
          `Emitted new match to socket ${subscription.socketId} for keyword "${subscription.keyword}"`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Failed to handle ${SocketEvents.SEARCH_INTERNAL_NEW_MATCH}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * Handle search.internal.resultRemoved from SearchEventListener
   * A2: Targeted emit — only sends to subscribers watching the affected conversation,
   *     instead of broadcasting to all connected sockets.
   *
   * Phase A (TD-05): Implements the TODO that was left in message.deleted handler.
   */
  @OnEvent(SocketEvents.SEARCH_INTERNAL_RESULT_REMOVED)
  async handleInternalResultRemoved(event: {
    messageId: string;
    conversationId: string;
  }): Promise<void> {
    try {
      // A2: Only notify subscribers whose search scope includes this conversation
      const affectedSubscriptions =
        this.realTimeSearchService.getSubscriptionsForConversation(
          event.conversationId,
        );

      if (affectedSubscriptions.length === 0) {
        return;
      }

      const payload = {
        messageId: event.messageId,
        conversationId: event.conversationId,
        removedAt: new Date(),
      };

      for (const subscription of affectedSubscriptions) {
        this.server
          .to(subscription.socketId)
          .emit(SocketEvents.SEARCH_RESULT_REMOVED, payload);
      }

      this.logger.debug(
        `Emitted ${SocketEvents.SEARCH_RESULT_REMOVED} for message ${event.messageId} to ${affectedSubscriptions.length} subscriber(s)`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to handle ${SocketEvents.SEARCH_INTERNAL_RESULT_REMOVED}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  // ============================================================================
  // Private helpers
  // ============================================================================

  /**
   * Emit error to client
   */
  private emitError(
    client: AuthenticatedSocket,
    code: SearchErrorPayload['code'],
    message: string,
  ): void {
    const payload: SearchErrorPayload = {
      error: message,
      code,
      timestamp: new Date(),
    };

    client.emit(SocketEvents.SEARCH_ERROR, payload);
  }

  /**
   * Get active search statistics (for monitoring)
   */
  getStats() {
    return this.realTimeSearchService.getStats();
  }
}

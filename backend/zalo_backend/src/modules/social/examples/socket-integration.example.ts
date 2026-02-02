// /**
//  * Socket Gateway Integration Example
//  *
//  * Shows how to integrate social graph permissions into Socket.IO gateway
//  */

// import {
//   WebSocketGateway,
//   WebSocketServer,
//   SubscribeMessage,
//   OnGatewayConnection,
//   OnGatewayDisconnect,
//   ConnectedSocket,
//   MessageBody,
// } from '@nestjs/websockets';
// import { Server, Socket } from 'socket.io';
// import { Logger, UseGuards } from '@nestjs/common';
// import { BlockService } from '../services/block.service';
// import { PrivacyService } from '../services/privacy.service';
// import { FriendshipService } from '../services/friendship.service';

// /**
//  * Extended Socket interface with user information
//  */
// interface AuthenticatedSocket extends Socket {
//   userId?: string;
//   user?: any;
// }

// @WebSocketGateway({
//   cors: {
//     origin: '*', // Configure based on your needs
//   },
// })
// export class SocialAwareSocketGateway
//   implements OnGatewayConnection, OnGatewayDisconnect
// {
//   @WebSocketServer()
//   server: Server;

//   private readonly logger = new Logger(SocialAwareSocketGateway.name);

//   constructor(
//     private readonly blockService: BlockService,
//     private readonly privacyService: PrivacyService,
//     private readonly friendshipService: FriendshipService,
//   ) {}

//   /**
//    * Handle client connection
//    */
//   async handleConnection(client: AuthenticatedSocket) {
//     try {
//       // Extract user from token (your existing auth logic)
//       // const user = await this.validateToken(client.handshake.auth.token);
//       // client.userId = user.id;
//       // client.user = user;

//       this.logger.log(`Client connected: ${client.id}`);

//       // Join user to their personal room
//       // client.join(`user:${client.userId}`);
//     } catch (error) {
//       this.logger.error('Connection authentication failed', error);
//       client.disconnect();
//     }
//   }

//   /**
//    * Handle client disconnection
//    */
//   handleDisconnect(client: AuthenticatedSocket) {
//     this.logger.log(`Client disconnected: ${client.id}`);
//   }

//   /**
//    * INTEGRATION POINT 1: Sending messages
//    *
//    * Check permissions before emitting message to recipient
//    */
//   @SubscribeMessage('message:send')
//   async handleSendMessage(
//     @ConnectedSocket() client: AuthenticatedSocket,
//     @MessageBody() payload: { recipientId: string; content: string },
//   ) {
//     const senderId = client.userId;

//     if (!senderId) {
//       return { error: 'Not authenticated' };
//     }

//     try {
//       // 1. Check if blocked
//       const isBlocked = await this.blockService.isBlocked(
//         senderId,
//         payload.recipientId,
//       );

//       if (isBlocked) {
//         return { error: 'Cannot message blocked user' };
//       }

//       // 2. Check privacy settings
//       const canMessage = await this.privacyService.canUserMessageMe(
//         senderId,
//         payload.recipientId,
//       );

//       if (!canMessage) {
//         return {
//           error: 'User privacy settings do not allow messaging',
//           action: 'send_friend_request',
//         };
//       }

//       // 3. Permissions validated - emit message
//       this.server
//         .to(`user:${payload.recipientId}`)
//         .emit('message:new', {
//           senderId,
//           content: payload.content,
//           timestamp: new Date(),
//         });

//       return { success: true };
//     } catch (error) {
//       this.logger.error('Error sending message', error);
//       return { error: 'Failed to send message' };
//     }
//   }

//   /**
//    * INTEGRATION POINT 2: Typing indicators
//    *
//    * Only show typing indicator if users can message each other
//    */
//   @SubscribeMessage('typing:start')
//   async handleTypingStart(
//     @ConnectedSocket() client: AuthenticatedSocket,
//     @MessageBody() payload: { recipientId: string },
//   ) {
//     const senderId = client.userId;

//     if (!senderId) return;

//     try {
//       // Check if can message (includes block and privacy check)
//       const canMessage = await this.privacyService.canUserMessageMe(
//         senderId,
//         payload.recipientId,
//       );

//       if (canMessage) {
//         this.server
//           .to(`user:${payload.recipientId}`)
//           .emit('typing:indicator', {
//             userId: senderId,
//             typing: true,
//           });
//       }
//     } catch (error) {
//       this.logger.error('Error sending typing indicator', error);
//     }
//   }

//   /**
//    * INTEGRATION POINT 3: Call initiation
//    *
//    * Check permissions before ringing recipient
//    */
//   @SubscribeMessage('call:initiate')
//   async handleCallInitiate(
//     @ConnectedSocket() client: AuthenticatedSocket,
//     @MessageBody() payload: { calleeId: string },
//   ) {
//     const callerId = client.userId;

//     if (!callerId) {
//       return { error: 'Not authenticated' };
//     }

//     try {
//       // 1. Check if blocked
//       const isBlocked = await this.blockService.isBlocked(
//         callerId,
//         payload.calleeId,
//       );

//       if (isBlocked) {
//         return { error: 'Cannot call blocked user' };
//       }

//       // 2. Check privacy settings
//       const canCall = await this.privacyService.canUserCallMe(
//         callerId,
//         payload.calleeId,
//       );

//       if (!canCall) {
//         return {
//           error: 'User privacy settings do not allow calls',
//           action: 'send_friend_request',
//         };
//       }

//       // 3. Emit call ring to recipient
//       this.server
//         .to(`user:${payload.calleeId}`)
//         .emit('call:incoming', {
//           callerId,
//           callId: payload.calleeId, // Use actual call ID from CallHistoryService
//         });

//       return { success: true };
//     } catch (error) {
//       this.logger.error('Error initiating call', error);
//       return { error: 'Failed to initiate call' };
//     }
//   }

//   /**
//    * INTEGRATION POINT 4: Online status visibility
//    *
//    * Only share online status with users who have permission
//    */
//   async broadcastOnlineStatus(userId: string, status: 'online' | 'offline') {
//     try {
//       // Get user's privacy settings
//       const settings = await this.privacyService.getSettings(userId);

//       if (!settings.showOnlineStatus) {
//         // User has disabled online status - don't broadcast
//         return;
//       }

//       // Get friends list (if privacy is CONTACTS)
//       if (settings.showOnlineStatus === 'CONTACTS') {
//         const friends = await this.friendshipService.getFriendsList(userId, {
//           limit: 1000,
//         });

//         // Emit only to friends
//         friends.data.forEach((friend) => {
//           this.server.to(`user:${friend.userId}`).emit('user:status', {
//             userId,
//             status,
//           });
//         });
//       } else {
//         // EVERYONE - broadcast to all connected clients
//         this.server.emit('user:status', { userId, status });
//       }
//     } catch (error) {
//       this.logger.error('Error broadcasting online status', error);
//     }
//   }

//   /**
//    * HELPER: Disconnect user pair (called from event listener on block)
//    */
//   async disconnectUserPair(userId1: string, userId2: string): Promise<void> {
//     // Remove users from each other's rooms if they're in shared conversations
//     // Force update their UI to reflect block status
//     this.server.to(`user:${userId1}`).emit('user:blocked', {
//       blockedUserId: userId2,
//     });

//     this.server.to(`user:${userId2}`).emit('user:blocked', {
//       blockedUserId: userId1,
//     });
//   }

//   /**
//    * HELPER: Clear typing indicator between users
//    */
//   async clearTypingIndicator(
//     userId1: string,
//     userId2: string,
//   ): Promise<void> {
//     this.server.to(`user:${userId1}`).emit('typing:indicator', {
//       userId: userId2,
//       typing: false,
//     });

//     this.server.to(`user:${userId2}`).emit('typing:indicator', {
//       userId: userId1,
//       typing: false,
//     });
//   }

//   /**
//    * HELPER: Emit call termination (called from event listener)
//    */
//   async emitCallTerminated(
//     userId1: string,
//     userId2: string,
//     reason: string,
//   ): Promise<void> {
//     // Notify both users
//     this.server.to(`user:${userId1}`).emit('call:terminated', {
//       reason,
//       byUserId: userId2,
//     });

//     this.server.to(`user:${userId2}`).emit('call:terminated', {
//       reason,
//       byUserId: userId1,
//     });
//   }

//   /**
//    * HELPER: Notify friend request accepted
//    */
//   async notifyFriendRequestAccepted(
//     requesterId: string,
//     acceptedBy: string,
//   ): Promise<void> {
//     this.server.to(`user:${requesterId}`).emit('friendship:accepted', {
//       userId: acceptedBy,
//       timestamp: new Date(),
//     });
//   }

//   /**
//    * HELPER: Handle unfriend event
//    */
//   async handleUnfriend(userId1: string, userId2: string): Promise<void> {
//     // Check privacy settings to determine if call should be terminated
//     const settings1 = await this.privacyService.getSettings(userId1);
//     const settings2 = await this.privacyService.getSettings(userId2);

//     // If either user has privacy = CONTACTS, they can no longer interact
//     if (
//       settings1.whoCanCallMe === 'CONTACTS' ||
//       settings2.whoCanCallMe === 'CONTACTS'
//     ) {
//       // Terminate call through CallHistoryService
//       // (Will be handled by event listener)
//     }

//     // Emit unfriend notification
//     this.server.to(`user:${userId1}`).emit('friendship:removed', {
//       userId: userId2,
//     });

//     this.server.to(`user:${userId2}`).emit('friendship:removed', {
//       userId: userId1,
//     });
//   }
// }

// /**
//  * USAGE IN EXISTING SOCKET GATEWAY
//  *
//  * 1. Inject services:
//  *    constructor(
//  *      private readonly blockService: BlockService,
//  *      private readonly privacyService: PrivacyService,
//  *    ) {}
//  *
//  * 2. Add permission checks before emitting:
//  *    Before: this.server.emit('message', data);
//  *    After:  if (await this.canMessage(senderId, recipientId)) {
//  *              this.server.emit('message', data);
//  *            }
//  *
//  * 3. Listen to social graph events:
//  *    @OnEvent('user.blocked')
//  *    async handleBlock(payload) {
//  *      await this.disconnectUserPair(payload.blockerId, payload.blockedId);
//  *    }
//  */

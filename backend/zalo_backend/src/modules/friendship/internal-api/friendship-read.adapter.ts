import { Injectable } from '@nestjs/common';
import {
      IFriendshipReadPort,
} from '@common/contracts/internal-api';
import { FriendshipService } from '../service/friendship.service';

@Injectable()
export class FriendshipReadAdapter implements IFriendshipReadPort {
      constructor(private readonly friendshipService: FriendshipService) { }

      areFriends(userId1: string, userId2: string): Promise<boolean> {
            return this.friendshipService.areFriends(userId1, userId2);
      }

      getFriendIdsForPresence(userId: string): Promise<string[]> {
            return this.friendshipService.getFriendIdsForPresence(userId);
      }
}

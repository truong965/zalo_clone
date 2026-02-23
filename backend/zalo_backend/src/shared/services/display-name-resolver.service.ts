// src/shared/services/display-name-resolver.service.ts

import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/database/prisma.service';

/**
 * DisplayNameResolver — Cross-cutting service for resolving display names.
 *
 * Priority: UserContact.aliasName > UserContact.phoneBookName > User.displayName
 *
 * Queries user_contacts via Prisma directly (NO ContactService import)
 * to avoid circular dependency. PrismaService is @Global() so it's
 * always available without explicit module import.
 *
 * Usage:
 *   // Batch (preferred for lists)
 *   const nameMap = await resolver.batchResolve(viewerId, userIds);
 *   const name = nameMap.get(targetId) ?? fallback;
 *
 *   // Single (convenience wrapper)
 *   const name = await resolver.resolve(viewerId, targetId);
 */
@Injectable()
export class DisplayNameResolver {
      constructor(private readonly prisma: PrismaService) { }

      /**
       * Resolve display names for a batch of users, from the viewer's perspective.
       *
       * @param viewerId - The user viewing the names (determines contact-based overrides)
       * @param targetUserIds - User IDs to resolve names for
       * @returns Map<userId, resolvedDisplayName>
       */
      async batchResolve(
            viewerId: string,
            targetUserIds: string[],
      ): Promise<Map<string, string>> {
            const result = new Map<string, string>();

            if (targetUserIds.length === 0) return result;

            // Deduplicate and exclude viewer (viewer sees their own real name)
            const uniqueIds = [
                  ...new Set(targetUserIds.filter((id) => id !== viewerId)),
            ];
            if (uniqueIds.length === 0) return result;

            // 1. Query contacts for the viewer — get alias/phonebook overrides
            const contacts = await this.prisma.userContact.findMany({
                  where: {
                        ownerId: viewerId,
                        contactUserId: { in: uniqueIds },
                  },
                  select: {
                        contactUserId: true,
                        aliasName: true,
                        phoneBookName: true,
                        contactUser: {
                              select: { displayName: true },
                        },
                  },
            });

            // 2. Apply 3-level fallback: aliasName > phoneBookName > displayName
            const resolvedFromContacts = new Set<string>();
            for (const contact of contacts) {
                  const name =
                        contact.aliasName ??
                        contact.phoneBookName ??
                        contact.contactUser.displayName ??
                        'Unknown User';
                  result.set(contact.contactUserId, name);
                  resolvedFromContacts.add(contact.contactUserId);
            }

            // 3. For users not in contacts, use their profile displayName
            const unresolvedIds = uniqueIds.filter(
                  (id) => !resolvedFromContacts.has(id),
            );
            if (unresolvedIds.length > 0) {
                  const users = await this.prisma.user.findMany({
                        where: { id: { in: unresolvedIds } },
                        select: { id: true, displayName: true },
                  });
                  for (const user of users) {
                        result.set(user.id, user.displayName);
                  }
            }

            return result;
      }

      /**
       * Resolve a single target user's display name from multiple viewers' perspectives.
       * Inverse of batchResolve — one target, many viewers.
       *
       * Use case: socket broadcast where one sender's name must be resolved for each recipient.
       * Uses 2 queries total (1 user + 1 userContact batch) regardless of viewer count.
       *
       * @param viewerIds - Users who are viewing the target's name
       * @param targetUserId - The user whose name is being resolved
       * @returns Map<viewerId, resolvedDisplayName>
       */
      async batchResolveForViewers(
            viewerIds: string[],
            targetUserId: string,
      ): Promise<Map<string, string>> {
            const result = new Map<string, string>();
            if (viewerIds.length === 0) return result;

            // Exclude the target viewing themselves (they see their own real name)
            const uniqueViewerIds = [
                  ...new Set(viewerIds.filter((id) => id !== targetUserId)),
            ];
            if (uniqueViewerIds.length === 0) return result;

            // 2 parallel queries: target's base name + all viewers' contact records
            const [targetUser, contacts] = await Promise.all([
                  this.prisma.user.findUnique({
                        where: { id: targetUserId },
                        select: { displayName: true },
                  }),
                  this.prisma.userContact.findMany({
                        where: {
                              ownerId: { in: uniqueViewerIds },
                              contactUserId: targetUserId,
                        },
                        select: { ownerId: true, aliasName: true, phoneBookName: true },
                  }),
            ]);

            const baseName = targetUser?.displayName ?? 'Unknown User';
            const contactMap = new Map(
                  contacts.map((c) => [c.ownerId, c]),
            );

            for (const viewerId of uniqueViewerIds) {
                  const contact = contactMap.get(viewerId);
                  result.set(
                        viewerId,
                        contact?.aliasName ?? contact?.phoneBookName ?? baseName,
                  );
            }

            return result;
      }

      /**
       * Resolve a single user's display name from the viewer's perspective.
       * Convenience wrapper around batchResolve for single lookups.
       */
      async resolve(viewerId: string, targetUserId: string): Promise<string> {
            const map = await this.batchResolve(viewerId, [targetUserId]);
            return map.get(targetUserId) ?? 'Unknown User';
      }
}

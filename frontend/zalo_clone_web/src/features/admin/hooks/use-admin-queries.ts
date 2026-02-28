/**
 * Admin Feature — TanStack Query Hooks
 *
 * Provides query and mutation hooks for all admin panel endpoints.
 * Follows the same pattern as features/contacts/api/friendship.api.ts.
 *
 * Conventions:
 * - Query keys are structured for granular cache invalidation
 * - Mutations invalidate related queries on success
 * - `staleTime` tuned per data freshness: real-time (30s), historical (5min)
 * - `refetchInterval` on overview for auto-refresh dashboard KPIs
 */

import {
      useQuery,
      useMutation,
      useQueryClient,
} from '@tanstack/react-query';
import {
      getStatsOverview,
      getStatsDaily,
      getUsers,
      getUserDetail,
      suspendUser,
      activateUser,
      forceLogoutUser,
      getCalls,
      getConversations,
      getActivitySuspended,
      getActivityInactive,
      getActivityHighActivity,
      getActivityMultiDevice,
      getSystemStatus,
      getRoles,
      createRole,
      updateRole,
      deleteRole,
} from '../api/admin.api';
import type {
      DailyStatsQuery,
      UserListQuery,
      CallListQuery,
      ConversationListQuery,
} from '../types';

// ============================================================================
// Query Keys — structured for selective invalidation
// ============================================================================

export const adminKeys = {
      all: ['admin'] as const,

      // Stats
      stats: () => [...adminKeys.all, 'stats'] as const,
      statsOverview: () => [...adminKeys.stats(), 'overview'] as const,
      statsDaily: (params?: DailyStatsQuery) =>
            [...adminKeys.stats(), 'daily', params] as const,

      // Users
      users: () => [...adminKeys.all, 'users'] as const,
      userList: (params?: UserListQuery) =>
            [...adminKeys.users(), 'list', params] as const,
      userDetail: (id: string) =>
            [...adminKeys.users(), 'detail', id] as const,

      // Calls
      calls: (params?: CallListQuery) =>
            [...adminKeys.all, 'calls', params] as const,

      // Conversations
      conversations: (params?: ConversationListQuery) =>
            [...adminKeys.all, 'conversations', params] as const,

      // Activity
      activity: () => [...adminKeys.all, 'activity'] as const,
      activitySuspended: () => [...adminKeys.activity(), 'suspended'] as const,
      activityInactive: (days?: number) =>
            [...adminKeys.activity(), 'inactive', days] as const,
      activityHighActivity: (params?: { hours?: number; threshold?: number }) =>
            [...adminKeys.activity(), 'high-activity', params] as const,
      activityMultiDevice: (params?: { minSessions?: number }) =>
            [...adminKeys.activity(), 'multi-device', params] as const,

      // System
      systemStatus: () => [...adminKeys.all, 'system', 'status'] as const,

      // Roles
      roles: () => [...adminKeys.all, 'roles'] as const,
      roleList: (params?: { current?: number; pageSize?: number }) =>
            [...adminKeys.roles(), 'list', params] as const,
} as const;

// ============================================================================
// Stats Hooks
// ============================================================================

/**
 * Real-time KPI overview. Auto-refreshes every 30s for dashboard live feel.
 */
export function useStatsOverview() {
      return useQuery({
            queryKey: adminKeys.statsOverview(),
            queryFn: getStatsOverview,
            staleTime: 15_000,
            refetchInterval: 30_000,
      });
}

/**
 * Historical daily stats. Stable data — longer stale time.
 */
export function useStatsDaily(params?: DailyStatsQuery) {
      return useQuery({
            queryKey: adminKeys.statsDaily(params),
            queryFn: () => getStatsDaily(params),
            staleTime: 5 * 60_000,
      });
}

// ============================================================================
// User Hooks
// ============================================================================

/**
 * Paginated user list with server-side filters.
 */
export function useAdminUsers(params?: UserListQuery) {
      return useQuery({
            queryKey: adminKeys.userList(params),
            queryFn: () => getUsers(params),
            staleTime: 30_000,
      });
}

/**
 * User detail — enabled only when `id` is provided.
 */
export function useAdminUserDetail(id: string | null) {
      return useQuery({
            queryKey: adminKeys.userDetail(id ?? ''),
            queryFn: () => getUserDetail(id!),
            enabled: !!id,
            staleTime: 30_000,
      });
}

/**
 * Suspend user mutation. Invalidates user list + detail + activity on success.
 */
export function useSuspendUser() {
      const qc = useQueryClient();
      return useMutation({
            mutationFn: suspendUser,
            onSuccess: () => {
                  void qc.invalidateQueries({ queryKey: adminKeys.users() });
                  void qc.invalidateQueries({ queryKey: adminKeys.activitySuspended() });
            },
      });
}

/**
 * Activate user mutation. Invalidates user list + activity on success.
 */
export function useActivateUser() {
      const qc = useQueryClient();
      return useMutation({
            mutationFn: activateUser,
            onSuccess: () => {
                  void qc.invalidateQueries({ queryKey: adminKeys.users() });
                  void qc.invalidateQueries({ queryKey: adminKeys.activitySuspended() });
            },
      });
}

/**
 * Force logout mutation. Invalidates user detail (sessions change).
 */
export function useForceLogoutUser() {
      const qc = useQueryClient();
      return useMutation({
            mutationFn: forceLogoutUser,
            onSuccess: () => {
                  void qc.invalidateQueries({ queryKey: adminKeys.users() });
                  void qc.invalidateQueries({
                        queryKey: adminKeys.activityMultiDevice(),
                  });
            },
      });
}

// ============================================================================
// Calls Hooks
// ============================================================================

/**
 * Paginated call history with filters.
 */
export function useAdminCalls(params?: CallListQuery) {
      return useQuery({
            queryKey: adminKeys.calls(params),
            queryFn: () => getCalls(params),
            staleTime: 30_000,
      });
}

// ============================================================================
// Conversation Hooks
// ============================================================================

/**
 * Paginated conversation list (no message content).
 */
export function useAdminConversations(params?: ConversationListQuery) {
      return useQuery({
            queryKey: adminKeys.conversations(params),
            queryFn: () => getConversations(params),
            staleTime: 30_000,
      });
}

// ============================================================================
// Activity Hooks
// ============================================================================

/**
 * Suspended users list.
 */
export function useActivitySuspended() {
      return useQuery({
            queryKey: adminKeys.activitySuspended(),
            queryFn: getActivitySuspended,
            staleTime: 30_000,
      });
}

/**
 * Inactive users (not seen in N days).
 */
export function useActivityInactive(days?: number) {
      return useQuery({
            queryKey: adminKeys.activityInactive(days),
            queryFn: () => getActivityInactive(days),
            staleTime: 60_000,
      });
}

/**
 * High-activity users (potential spam detection).
 */
export function useActivityHighActivity(params?: {
      hours?: number;
      threshold?: number;
}) {
      return useQuery({
            queryKey: adminKeys.activityHighActivity(params),
            queryFn: () => getActivityHighActivity(params),
            staleTime: 60_000,
      });
}

/**
 * Users with multiple active sessions.
 */
export function useActivityMultiDevice(params?: { minSessions?: number }) {
      return useQuery({
            queryKey: adminKeys.activityMultiDevice(params),
            queryFn: () => getActivityMultiDevice(params),
            staleTime: 60_000,
      });
}

// ============================================================================
// System Hooks
// ============================================================================

/**
 * Infrastructure health check.
 */
export function useSystemStatus() {
      return useQuery({
            queryKey: adminKeys.systemStatus(),
            queryFn: getSystemStatus,
            staleTime: 15_000,
      });
}

// ============================================================================
// Roles Hooks
// ============================================================================

/**
 * Paginated roles list.
 */
export function useAdminRoles(params?: { current?: number; pageSize?: number }) {
      return useQuery({
            queryKey: adminKeys.roleList(params),
            queryFn: () => getRoles(params),
            staleTime: 60_000,
      });
}

/**
 * Create role mutation.
 */
export function useCreateRole() {
      const qc = useQueryClient();
      return useMutation({
            mutationFn: createRole,
            onSuccess: () => {
                  void qc.invalidateQueries({ queryKey: adminKeys.roles() });
            },
      });
}

/**
 * Update role mutation.
 */
export function useUpdateRole() {
      const qc = useQueryClient();
      return useMutation({
            mutationFn: updateRole,
            onSuccess: () => {
                  void qc.invalidateQueries({ queryKey: adminKeys.roles() });
            },
      });
}

/**
 * Delete role mutation.
 */
export function useDeleteRole() {
      const qc = useQueryClient();
      return useMutation({
            mutationFn: deleteRole,
            onSuccess: () => {
                  void qc.invalidateQueries({ queryKey: adminKeys.roles() });
            },
      });
}

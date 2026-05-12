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
      type UseMutationOptions,
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
      getGroups,
      getGroupDetail,
      createGroup,
      updateGroup,
      addGroupMembers,
      removeGroupMember,
      updateGroupMemberRole,
      forceCloseGroup,
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
      GroupListQuery,
      ActionResponse,
      AdminRole,
      CreateRoleDto,
      UpdateRoleDto,
      CreateAdminGroupDto,
      UpdateAdminGroupDto,
      AdminGroupDetail,
      AdminGroupMemberRole,
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

      // Groups
      groups: () => [...adminKeys.all, 'groups'] as const,
      groupList: (params?: GroupListQuery) =>
            [...adminKeys.groups(), 'list', params] as const,
      groupDetail: (id: string) =>
            [...adminKeys.groups(), 'detail', id] as const,

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
export function useSuspendUser(
      options?: UseMutationOptions<ActionResponse, Error, string, unknown>
) {
      const qc = useQueryClient();
      return useMutation({
            ...options,
            mutationFn: suspendUser,
            onSuccess: (...args) => {
                  void qc.invalidateQueries({ queryKey: adminKeys.users() });
                  void qc.invalidateQueries({ queryKey: adminKeys.activitySuspended() });
                  options?.onSuccess?.(...args);
            },
      });
}

/**
 * Activate user mutation. Invalidates user list + activity on success.
 */
export function useActivateUser(
      options?: UseMutationOptions<ActionResponse, Error, string, unknown>
) {
      const qc = useQueryClient();
      return useMutation({
            ...options,
            mutationFn: activateUser,
            onSuccess: (...args) => {
                  void qc.invalidateQueries({ queryKey: adminKeys.users() });
                  void qc.invalidateQueries({ queryKey: adminKeys.activitySuspended() });
                  options?.onSuccess?.(...args);
            },
      });
}

/**
 * Force logout mutation. Invalidates user detail (sessions change).
 */
export function useForceLogoutUser(
      options?: UseMutationOptions<ActionResponse, Error, string, unknown>
) {
      const qc = useQueryClient();
      return useMutation({
            ...options,
            mutationFn: forceLogoutUser,
            onSuccess: (...args) => {
                  void qc.invalidateQueries({ queryKey: adminKeys.users() });
                  void qc.invalidateQueries({
                        queryKey: adminKeys.activityMultiDevice(),
                  });
                  options?.onSuccess?.(...args);
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
// Group Hooks
// ============================================================================

export function useAdminGroups(params?: GroupListQuery) {
      return useQuery({
            queryKey: adminKeys.groupList(params),
            queryFn: () => getGroups(params),
            staleTime: 30_000,
      });
}

export function useAdminGroupDetail(id: string | null) {
      return useQuery({
            queryKey: adminKeys.groupDetail(id ?? ''),
            queryFn: () => getGroupDetail(id!),
            enabled: !!id,
            staleTime: 30_000,
      });
}

export function useCreateGroup(
      options?: UseMutationOptions<AdminGroupDetail, Error, CreateAdminGroupDto, unknown>
) {
      const qc = useQueryClient();
      return useMutation({
            ...options,
            mutationFn: createGroup,
            onSuccess: (...args) => {
                  void qc.invalidateQueries({ queryKey: adminKeys.groups() });
                  void qc.invalidateQueries({ queryKey: adminKeys.conversations() });
                  options?.onSuccess?.(...args);
            },
      });
}

export function useUpdateGroup(
      options?: UseMutationOptions<AdminGroupDetail, Error, UpdateAdminGroupDto & { id: string }, unknown>
) {
      const qc = useQueryClient();
      return useMutation({
            ...options,
            mutationFn: updateGroup,
            onSuccess: (...args) => {
                  void qc.invalidateQueries({ queryKey: adminKeys.groups() });
                  void qc.invalidateQueries({ queryKey: adminKeys.conversations() });
                  options?.onSuccess?.(...args);
            },
      });
}

export function useAddGroupMembers(
      options?: UseMutationOptions<
            ActionResponse & { addedCount?: number },
            Error,
            { id: string; userIds: string[] },
            unknown
      >
) {
      const qc = useQueryClient();
      return useMutation({
            ...options,
            mutationFn: addGroupMembers,
            onSuccess: (...args) => {
                  void qc.invalidateQueries({ queryKey: adminKeys.groups() });
                  options?.onSuccess?.(...args);
            },
      });
}

export function useRemoveGroupMember(
      options?: UseMutationOptions<ActionResponse, Error, { id: string; userId: string }, unknown>
) {
      const qc = useQueryClient();
      return useMutation({
            ...options,
            mutationFn: removeGroupMember,
            onSuccess: (...args) => {
                  void qc.invalidateQueries({ queryKey: adminKeys.groups() });
                  options?.onSuccess?.(...args);
            },
      });
}

export function useUpdateGroupMemberRole(
      options?: UseMutationOptions<
            ActionResponse,
            Error,
            { id: string; userId: string; role: AdminGroupMemberRole },
            unknown
      >
) {
      const qc = useQueryClient();
      return useMutation({
            ...options,
            mutationFn: updateGroupMemberRole,
            onSuccess: (...args) => {
                  void qc.invalidateQueries({ queryKey: adminKeys.groups() });
                  options?.onSuccess?.(...args);
            },
      });
}

export function useForceCloseGroup(
      options?: UseMutationOptions<ActionResponse, Error, string, unknown>
) {
      const qc = useQueryClient();
      return useMutation({
            ...options,
            mutationFn: forceCloseGroup,
            onSuccess: (...args) => {
                  void qc.invalidateQueries({ queryKey: adminKeys.groups() });
                  void qc.invalidateQueries({ queryKey: adminKeys.conversations() });
                  options?.onSuccess?.(...args);
            },
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
export function useCreateRole(
      options?: UseMutationOptions<AdminRole, Error, CreateRoleDto, unknown>
) {
      const qc = useQueryClient();
      return useMutation({
            ...options,
            mutationFn: createRole,
            onSuccess: (...args) => {
                  void qc.invalidateQueries({ queryKey: adminKeys.roles() });
                  options?.onSuccess?.(...args);
            },
      });
}

/**
 * Update role mutation.
 */
export function useUpdateRole(
      options?: UseMutationOptions<AdminRole, Error, UpdateRoleDto & { id: string }, unknown>
) {
      const qc = useQueryClient();
      return useMutation({
            ...options,
            mutationFn: updateRole,
            onSuccess: (...args) => {
                  void qc.invalidateQueries({ queryKey: adminKeys.roles() });
                  options?.onSuccess?.(...args);
            },
      });
}

/**
 * Delete role mutation.
 */
export function useDeleteRole(
      options?: UseMutationOptions<ActionResponse, Error, string, unknown>
) {
      const qc = useQueryClient();
      return useMutation({
            ...options,
            mutationFn: deleteRole,
            onSuccess: (...args) => {
                  void qc.invalidateQueries({ queryKey: adminKeys.roles() });
                  options?.onSuccess?.(...args);
            },
      });
}

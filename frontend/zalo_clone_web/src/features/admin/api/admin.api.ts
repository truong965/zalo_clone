/**
 * Admin API — REST functions
 *
 * Pure async functions that wrap axios calls for admin endpoints.
 * Co-located with types for easy import.
 * Backend wraps all responses in { statusCode, message, data }.
 */

import apiClient from '@/lib/axios';
import { API_ENDPOINTS } from '@/constants/api-endpoints';
import type {
      StatsOverview,
      DailyStats,
      DailyStatsQuery,
      AdminUserListItem,
      AdminUserDetail,
      UserListQuery,
      AdminCallItem,
      CallListQuery,
      AdminConversationItem,
      ConversationListQuery,
      SuspendedUser,
      InactiveUser,
      HighActivityUser,
      MultiDeviceUser,
      SystemStatus,
      ActionResponse,
      PaginatedResponse,
      RoleListResponse,
      AdminRole,
      CreateRoleDto,
      UpdateRoleDto,
} from '../types';

const E = API_ENDPOINTS.ADMIN;

// ============================================================================
// Stats
// ============================================================================

export async function getStatsOverview(): Promise<StatsOverview> {
      const { data: response } = await apiClient.get(E.STATS.OVERVIEW);
      return response.data ?? response;
}

export async function getStatsDaily(
      params?: DailyStatsQuery,
): Promise<DailyStats[]> {
      const { data: response } = await apiClient.get(E.STATS.DAILY, { params });
      return response.data ?? response;
}

// ============================================================================
// Users
// ============================================================================

export async function getUsers(
      params?: UserListQuery,
): Promise<PaginatedResponse<AdminUserListItem>> {
      const { data: response } = await apiClient.get(E.USERS.LIST, { params });
      return response.data ?? response;
}

export async function getUserDetail(
      id: string,
): Promise<AdminUserDetail> {
      const { data: response } = await apiClient.get(E.USERS.DETAIL(id));
      return response.data ?? response;
}

export async function suspendUser(id: string): Promise<ActionResponse> {
      const { data: response } = await apiClient.patch(E.USERS.SUSPEND(id));
      return response.data ?? response;
}

export async function activateUser(id: string): Promise<ActionResponse> {
      const { data: response } = await apiClient.patch(E.USERS.ACTIVATE(id));
      return response.data ?? response;
}

export async function forceLogoutUser(id: string): Promise<ActionResponse> {
      const { data: response } = await apiClient.post(E.USERS.FORCE_LOGOUT(id));
      return response.data ?? response;
}

// ============================================================================
// Calls
// ============================================================================

export async function getCalls(
      params?: CallListQuery,
): Promise<PaginatedResponse<AdminCallItem>> {
      const { data: response } = await apiClient.get(E.CALLS, { params });
      return response.data ?? response;
}

// ============================================================================
// Conversations
// ============================================================================

export async function getConversations(
      params?: ConversationListQuery,
): Promise<PaginatedResponse<AdminConversationItem>> {
      const { data: response } = await apiClient.get(E.CONVERSATIONS, { params });
      return response.data ?? response;
}

// ============================================================================
// Activity
// ============================================================================

export async function getActivitySuspended(): Promise<SuspendedUser[]> {
      const { data: response } = await apiClient.get(E.ACTIVITY.SUSPENDED);
      return response.data ?? response;
}

export async function getActivityInactive(
      days?: number,
): Promise<InactiveUser[]> {
      const { data: response } = await apiClient.get(E.ACTIVITY.INACTIVE, {
            params: days ? { days } : undefined,
      });
      return response.data ?? response;
}

export async function getActivityHighActivity(params?: {
      hours?: number;
      threshold?: number;
}): Promise<HighActivityUser[]> {
      const { data: response } = await apiClient.get(E.ACTIVITY.HIGH_ACTIVITY, {
            params,
      });
      return response.data ?? response;
}

export async function getActivityMultiDevice(params?: {
      minSessions?: number;
}): Promise<MultiDeviceUser[]> {
      const { data: response } = await apiClient.get(E.ACTIVITY.MULTI_DEVICE, {
            params,
      });
      return response.data ?? response;
}

// ============================================================================
// System
// ============================================================================

export async function getSystemStatus(): Promise<SystemStatus> {
      const { data: response } = await apiClient.get(E.SYSTEM.STATUS);
      return response.data ?? response;
}

// ============================================================================
// Roles (RBAC)
// ============================================================================

export async function getRoles(params?: {
      current?: number;
      pageSize?: number;
}): Promise<RoleListResponse> {
      const { data: response } = await apiClient.get(E.ROLES.LIST, { params });
      return response.data ?? response;
}

export async function getRoleDetail(id: string): Promise<AdminRole> {
      const { data: response } = await apiClient.get(E.ROLES.DETAIL(id));
      return response.data ?? response;
}

export async function createRole(dto: CreateRoleDto): Promise<AdminRole> {
      const { data: response } = await apiClient.post(E.ROLES.CREATE, dto);
      return response.data ?? response;
}

export async function updateRole({
      id,
      ...dto
}: UpdateRoleDto & { id: string }): Promise<AdminRole> {
      const { data: response } = await apiClient.patch(E.ROLES.UPDATE(id), dto);
      return response.data ?? response;
}

export async function deleteRole(id: string): Promise<ActionResponse> {
      const { data: response } = await apiClient.delete(E.ROLES.DELETE(id));
      return response.data ?? response;
}

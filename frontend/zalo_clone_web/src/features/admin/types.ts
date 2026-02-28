/**
 * Admin Feature — Shared Types
 *
 * Mirrors backend DTOs and response shapes for the admin panel.
 */

// ============================================================================
// Common
// ============================================================================

export interface PaginatedResponse<T> {
      data: T[];
      total: number;
      page: number;
      limit: number;
}

// ============================================================================
// Stats
// ============================================================================

export interface StatsOverview {
      totalUsers: number;
      onlineUsers: number;
      messagesToday: number;
      callsToday: number;
}

export interface DailyStats {
      date: string;
      newUsers: number;
      activeUsers: number;
      messagesTotal: number;
      messagesByType: Record<string, number>;
      callsTotal: number;
      callsByType: Record<string, number>;
      callsByStatus: Record<string, number>;
      callAvgDuration: number;
      mediaUploads: number;
      mediaBytes: string; // BigInt serialized as string
}

export interface DailyStatsQuery {
      from?: string;
      to?: string;
}

// ============================================================================
// Users
// ============================================================================

export interface AdminUserListItem {
      id: string;
      displayName: string;
      phoneNumber: string;
      avatarUrl: string | null;
      status: UserStatus;
      lastSeenAt: string | null;
      createdAt: string;
}

export interface AdminUserDetail {
      profile: {
            id: string;
            displayName: string;
            phoneNumber: string;
            avatarUrl: string | null;
            bio: string | null;
            dateOfBirth: string | null;
            gender: string | null;
            status: UserStatus;
            lastSeenAt: string | null;
            createdAt: string;
            role: { name: string } | null;
      };
      activitySummary: {
            messageCount: number;
            calls: Record<string, number>;
      };
      activeSessions: AdminSession[];
}

export interface AdminSession {
      id: string;
      deviceId: string;
      deviceName: string | null;
      platform: string | null;
      ipAddress: string | null;
      lastUsedAt: string;
      issuedAt: string;
}

export type UserStatus = 'ACTIVE' | 'INACTIVE' | 'SUSPENDED' | 'DELETED';

export interface UserListQuery {
      status?: UserStatus;
      platform?: string;
      search?: string;
      dateFrom?: string;
      dateTo?: string;
      page?: number;
      limit?: number;
}

// ============================================================================
// Calls
// ============================================================================

export interface AdminCallItem {
      id: string;
      callType: 'VOICE' | 'VIDEO';
      status: string;
      duration: number | null;
      participantCount: number;
      startedAt: string;
      endedAt: string | null;
      initiator: { id: string; displayName: string };
      _count: { participants: number };
}

export interface CallListQuery {
      type?: string;
      status?: string;
      from?: string;
      to?: string;
      page?: number;
      limit?: number;
}

// ============================================================================
// Conversations
// ============================================================================

export interface AdminConversationItem {
      id: string;
      type: 'DIRECT' | 'GROUP';
      name: string | null;
      avatarUrl: string | null;
      lastMessageAt: string | null;
      createdAt: string;
      _count: { members: number };
}

export interface ConversationListQuery {
      type?: string;
      page?: number;
      limit?: number;
}

// ============================================================================
// Activity
// ============================================================================

export interface SuspendedUser {
      id: string;
      displayName: string;
      phoneNumber: string;
      avatarUrl: string | null;
      lastSeenAt: string | null;
      updatedAt: string | null;
}

export interface InactiveUser {
      id: string;
      displayName: string;
      phoneNumber: string;
      lastSeenAt: string | null;
      createdAt: string;
}

export interface HighActivityUser {
      user: { id: string; displayName: string; phoneNumber: string; status: string };
      messageCount: number;
      windowHours: number;
}

export interface MultiDeviceUser {
      user: { id: string; displayName: string; phoneNumber: string; status: string };
      sessionCount: number;
      sessions: {
            userId: string;
            deviceId: string;
            deviceName: string | null;
            platform: string | null;
            ipAddress: string | null;
            lastUsedAt: string;
      }[];
}

// ============================================================================
// System
// ============================================================================

export interface SystemStatus {
      redis: { connected: boolean; latencyMs: number };
      database: { connected: boolean; latencyMs: number };
      storage: { connected: boolean; totalFiles: number; usedBytes: string };
      activeSocketConnections: number;
      timestamp: string;
}

// ============================================================================
// Mutation responses
// ============================================================================

export interface ActionResponse {
      success: boolean;
      message: string;
}

// ============================================================================
// Roles (RBAC)
// ============================================================================

export interface AdminRole {
      id: string;
      name: string;
      description: string | null;
      isActive: boolean;
      createdAt: string;
      updatedAt: string;
      rolePermissions?: { permissionId: string }[];
      _count?: { users: number };
}

export interface RoleListResponse {
      meta: { current: number; pageSize: number; pages: number; total: number };
      result: AdminRole[];
}

export interface CreateRoleDto {
      name: string;
      description?: string;
      isActive?: boolean;
      permissions?: string[];
}

export interface UpdateRoleDto extends Partial<CreateRoleDto> { }


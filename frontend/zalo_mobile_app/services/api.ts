import type { ConversationSearchMember } from '@/features/chats/search.types';
import type { ContactSearchResult, SearchHistoryItem, SearchSuggestion, TrendingKeyword } from '@/features/search/types';
import type {
      AuthResponse,
      ChangePasswordPayload,
      DeviceSession,
      ForgotPasswordPayload,
      LoginPayload,
      QrScanResponse,
      RegisterPayload,
      RequestRegisterOtpPayload,
      ResetPasswordPayload,
      TwoFactorMethod,
      TwoFactorRequiredResponse,
      TwoFactorSetupResponse,
      UpdateUserPayload,
      UserProfile,
      VerifyRegisterOtpPayload,
      VerifyTwoFactorRequest,
} from '@/types/auth';
import type { BlockedListResponse } from '@/types/block';
import type { CallHistoryItem, CursorPaginatedResult } from '@/types/call';
import type { ContactItemDto, ContactResponseDto } from '@/types/contact';
import type {
      Conversation,
      ConversationListResponse,
      JoinGroupPreviewResponse,
      JoinGroupResponse
} from '@/types/conversation';
import type { Message, RecentMediaItemDto } from '@/types/message';
import type { PrivacySettings, UpdatePrivacySettingsPayload } from '@/types/privacy';
import type { CreateReminderParams, ReminderItem, UpdateReminderParams } from '@/types/reminder';
import { getStableDeviceId } from '@/utils/device-identity';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { Dimensions, NativeModules, Platform } from 'react-native';

const API_PORT = '8000';
const API_BASE_URL = resolveApiBaseUrl();
const API_DEBUG = process.env.EXPO_PUBLIC_API_DEBUG === 'true';

function resolvePlatformHeader(): 'IOS' | 'ANDROID' | 'WEB' {
      if (Platform.OS === 'ios') {
            return 'IOS';
      }

      if (Platform.OS === 'android') {
            return 'ANDROID';
      }

      return 'WEB';
}

function resolveDeviceTypeHeader(): 'MOBILE' | 'WEB' {
      return Platform.OS === 'web' ? 'WEB' : 'MOBILE';
}

function resolveDeviceNameHeader(): string {
      return (
            Device.modelName ||
            Device.deviceName ||
            Constants.expoConfig?.name ||
            Constants.expoConfig?.slug ||
            (Platform.OS === 'ios' ? 'iOS App' : Platform.OS === 'android' ? 'Android App' : 'Web App')
      );
}

function resolveScreenResolution(): string {
      const { width, height } = Dimensions.get('window');
      return `${Math.round(width)}x${Math.round(height)}`;
}

function resolveTimezone(): string {
      // Intended for modern environments, fallback for older ones
      try {
            return Intl.DateTimeFormat().resolvedOptions().timeZone || '';
      } catch {
            return '';
      }
}

import { getDevicePublicKey, getDeviceKeyAlgorithm } from '../utils/device-crypto';

async function getDeviceHeaders(): Promise<Record<string, string>> {
      const publicKey = await getDevicePublicKey();

      return {
            'X-Device-Type': resolveDeviceTypeHeader(),
            'X-Platform': resolvePlatformHeader(),
            'X-Device-Name': resolveDeviceNameHeader(),
            'X-Screen-Resolution': resolveScreenResolution(),
            'X-Timezone': resolveTimezone(),
            'X-Device-Id': await getStableDeviceId(),
            'X-OS-Name': Platform.OS === 'ios' ? 'iOS' : Platform.OS === 'android' ? 'Android' : 'Unknown',
            'X-OS-Version': String(Platform.Version ?? ''),
            ...(publicKey ? {
                  'X-Public-Key': publicKey,
                  'X-Key-Algorithm': getDeviceKeyAlgorithm(),
            } : {}),
      };
}

type ApiEnvelope<T> = {
      data: T;
      message?: string;
      statusCode?: number;
};

export class ApiRequestError extends Error {
      status: number;
      details?: string | string[];
      requestUrl?: string;
      requestMethod?: string;

      constructor(
            message: string,
            status: number,
            details?: string | string[],
            requestUrl?: string,
            requestMethod?: string,
      ) {
            super(message);
            this.name = 'ApiRequestError';
            this.status = status;
            this.details = details;
            this.requestUrl = requestUrl;
            this.requestMethod = requestMethod;
      }
}

function debugLog(label: string, payload: Record<string, unknown>) {
      if (!API_DEBUG) {
            return;
      }

      console.log(`[mobileApi] ${label}`, payload);
}

function getHostName(raw?: string | null): string | null {
      if (!raw) {
            return null;
      }

      const normalized = raw.includes('://') ? raw : `http://${raw}`;

      try {
            return new URL(normalized).hostname;
      } catch {
            return null;
      }
}

function getDevHostFromMetro(): string | null {
      const sourceCode = (NativeModules as { SourceCode?: { scriptURL?: string } }).SourceCode;
      const scriptURL = sourceCode?.scriptURL;

      return getHostName(scriptURL);
}

function getDevHostFromExpoRuntime(): string | null {
      const hostUri =
            Constants.expoConfig?.hostUri ??
            (Constants as unknown as { manifest2?: { extra?: { expoGo?: { debuggerHost?: string } } } }).manifest2
                  ?.extra?.expoGo?.debuggerHost;

      return getHostName(hostUri);
}

function resolveDevHost(): { host: string | null; source: string } {
      const expoHost = getDevHostFromExpoRuntime();
      if (expoHost) {
            return { host: expoHost, source: 'expo-runtime' };
      }

      const metroHost = getDevHostFromMetro();
      if (metroHost) {
            return { host: metroHost, source: 'metro-script-url' };
      }

      return { host: null, source: 'none' };
}

function resolveApiBaseUrl(): string {
      const envBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL?.trim();

      if (envBaseUrl) {
            return envBaseUrl;
      }

      if (__DEV__) {
            const { host, source } = resolveDevHost();
            if (host) {
                  const resolved = `http://${host}:${API_PORT}`;
                  if (API_DEBUG) {
                        console.log('[mobileApi] config:auto_base_url', { resolved, source, platform: Platform.OS });
                  }
                  return resolved;
            }

            if (API_DEBUG) {
                  console.log('[mobileApi] config:auto_base_url_fallback', {
                        reason: 'dev-host-not-found',
                        platform: Platform.OS,
                  });
            }
      }

      if (Platform.OS === 'android') {
            return `http://10.0.2.2:${API_PORT}`;
      }

      return `http://localhost:${API_PORT}`;
}

function buildUrl(path: string): string {
      if (path.startsWith('http://') || path.startsWith('https://')) {
            return path;
      }

      return `${API_BASE_URL}${path}`;
}

function wait(ms: number): Promise<void> {
      return new Promise((resolve) => setTimeout(resolve, ms));
}

async function apiRequest<T>(
      path: string,
      options: RequestInit,
      accessToken?: string,
      config?: { rawResponse?: false },
): Promise<T>;
async function apiRequest(
      path: string,
      options: RequestInit,
      accessToken: string | undefined,
      config: { rawResponse: true },
): Promise<Response>;
async function apiRequest<T>(
      path: string,
      options: RequestInit = {},
      accessToken?: string,
      config: { rawResponse?: boolean } = {},
): Promise<T | Response> {
      const url = buildUrl(path);
      const method = options.method ?? 'GET';
      const deviceHeaders = await getDeviceHeaders();
      const headers: HeadersInit = {
            'Content-Type': 'application/json',
            ...deviceHeaders,
            ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
            ...(options.headers ?? {}),
      };

      debugLog('request:start', {
            method,
            url,
            hasAuthToken: Boolean(accessToken),
      });

      let response: Response;
      try {
            response = await fetch(url, {
                  ...options,
                  headers,
            });
      } catch (error) {
            const rawMessage = error instanceof Error ? error.message : String(error);

            debugLog('request:network_error', {
                  method,
                  url,
                  error: rawMessage,
            });

            throw new ApiRequestError(
                  `Network request failed (${method} ${url}). Kiem tra EXPO_PUBLIC_API_BASE_URL va backend co cho phep truy cap LAN.`,
                  0,
                  rawMessage,
                  url,
                  method,
            );
      }

      debugLog('request:response', {
            method,
            url,
            status: response.status,
            ok: response.ok,
      });

      if (config.rawResponse) {
            return response;
      }

      const json = (await response.json().catch(() => null)) as ApiEnvelope<T> | null;

      if (!response.ok) {
            const message =
                  (json && typeof json.message === 'string' && json.message) ||
                  `Request failed with status ${response.status} (${method} ${url})`;
            const details = json?.message;

            debugLog('request:http_error', {
                  method,
                  url,
                  status: response.status,
                  details,
            });

            throw new ApiRequestError(message, response.status, details, url, method);
      }

      if (json && typeof json === 'object' && 'data' in json) {
            return json.data;
      }

      return json as T;
}

export const mobileApi = {
      baseUrl: API_BASE_URL,

      getAiSessions(accessToken: string, conversationId: string, featureType = 'ASK') {
            return apiRequest<any>(
                  `/api/v1/ai/sessions?conversationId=${conversationId}&featureType=${featureType}&activeOnly=true`,
                  { method: 'GET' },
                  accessToken,
            );
      },

      getAiSession(accessToken: string, sessionId: string) {
            return apiRequest<any>(`/api/v1/ai/sessions/${sessionId}`, { method: 'GET' }, accessToken);
      },

      deleteAiSession(accessToken: string, sessionId: string) {
            return apiRequest<void>(`/api/v1/ai/sessions/${sessionId}`, { method: 'DELETE' }, accessToken);
      },

      streamAiRequest(
            accessToken: string,
            path: '/api/v1/ai/ask' | '/api/v1/ai/summary' | '/api/v1/ai/agent',
            body: Record<string, unknown>,
      ) {
            return apiRequest(
                  path,
                  {
                        method: 'POST',
                        body: JSON.stringify(body),
                  },
                  accessToken,
                  { rawResponse: true },
            );
      },

      cancelAiRequest(accessToken: string, requestId: string, conversationId?: string) {
            return apiRequest<void>(
                  '/api/v1/ai/cancel',
                  {
                        method: 'POST',
                        body: JSON.stringify({ requestId, conversationId }),
                  },
                  accessToken,
            );
      },

      translateMessage(
            accessToken: string,
            payload: { conversationId: string; messageId: string; targetLang: string },
      ) {
            return apiRequest<{ translatedText: string } | { data?: { translatedText?: string } }>(
                  '/api/v1/ai/translate',
                  {
                        method: 'POST',
                        body: JSON.stringify({
                              type: 'translate',
                              ...payload,
                        }),
                  },
                  accessToken,
            );
      },

      login(payload: LoginPayload) {
            return apiRequest<AuthResponse | TwoFactorRequiredResponse>('/api/v1/auth/login', {
                  method: 'POST',
                  body: JSON.stringify(payload),
            });
      },

      verify2fa(payload: VerifyTwoFactorRequest) {
            return apiRequest<AuthResponse>('/api/v1/auth/2fa/verify', {
                  method: 'POST',
                  body: JSON.stringify(payload),
            });
      },

      sendSmsChallenge(pendingToken: string) {
            return apiRequest<{ maskedPhone: string }>('/api/v1/auth/2fa/challenge/sms', {
                  method: 'POST',
                  body: JSON.stringify({ pendingToken }),
            });
      },

      sendEmailChallenge(pendingToken: string) {
            return apiRequest<{ maskedEmail: string }>('/api/v1/auth/2fa/challenge/email', {
                  method: 'POST',
                  body: JSON.stringify({ pendingToken }),
            });
      },

      sendTotpChallenge(pendingToken: string) {
            return apiRequest<void>('/api/v1/auth/2fa/challenge/totp', {
                  method: 'POST',
                  body: JSON.stringify({ pendingToken }),
            });
      },

      sendPushChallenge(pendingToken: string) {
            return apiRequest<void>('/api/v1/auth/2fa/challenge/push', {
                  method: 'POST',
                  body: JSON.stringify({ pendingToken }),
            });
      },

      acknowledgePush(pendingToken: string, approved: boolean, accessToken?: string, signature?: string) {
            return apiRequest<void>(
                  '/api/v1/auth/2fa/acknowledge',
                  {
                        method: 'POST',
                        body: JSON.stringify({ pendingToken, approved, signature }),
                  },
                  accessToken,
            );
      },

      updateTwoFactorMethod(method: TwoFactorMethod, accessToken: string, password?: string) {
            return apiRequest<UserProfile>(
                  '/api/v1/auth/2fa/method',
                  {
                        method: 'PATCH',
                        body: JSON.stringify({ method, password }),
                  },
                  accessToken,
            );
      },

      init2faSetup(accessToken: string, password: string) {
            return apiRequest<TwoFactorSetupResponse>(
                  '/api/v1/auth/2fa/setup/init',
                  {
                        method: 'POST',
                        body: JSON.stringify({ password }),
                  },
                  accessToken,
            );
      },

      confirm2faSetup(accessToken: string, token: string) {
            return apiRequest<UserProfile>(
                  '/api/v1/auth/2fa/setup/confirm',
                  {
                        method: 'POST',
                        body: JSON.stringify({ token }),
                  },
                  accessToken,
            );
      },

      requestEmailChange(accessToken: string, payload: { password: string; newEmail: string }) {
            return apiRequest<void>(
                  '/api/v1/auth/2fa/email/change-request',
                  {
                        method: 'POST',
                        body: JSON.stringify(payload),
                  },
                  accessToken,
            );
      },

      confirmEmailChange(accessToken: string, otp: string) {
            return apiRequest<void>(
                  '/api/v1/auth/2fa/email/change-confirm',
                  {
                        method: 'POST',
                        body: JSON.stringify({ otp }),
                  },
                  accessToken,
            );
      },

      register(payload: RegisterPayload) {
            return apiRequest<UserProfile>('/api/v1/auth/register', {
                  method: 'POST',
                  body: JSON.stringify(payload),
            });
      },

      requestRegisterOtp(payload: RequestRegisterOtpPayload) {
            return apiRequest<void>('/api/v1/auth/register-otp/request', {
                  method: 'POST',
                  body: JSON.stringify(payload),
            });
      },

      verifyRegisterOtp(payload: VerifyRegisterOtpPayload) {
            return apiRequest<void>('/api/v1/auth/register-otp/verify', {
                  method: 'POST',
                  body: JSON.stringify(payload),
            });
      },

      getProfile(accessToken: string) {
            return apiRequest<UserProfile>('/api/v1/auth/me', { method: 'GET' }, accessToken);
      },

      updateUserProfile(id: string, payload: UpdateUserPayload, accessToken: string) {
            return apiRequest<UserProfile>(`/api/v1/users/${id}`, {
                  method: 'PATCH',
                  body: JSON.stringify(payload),
            }, accessToken);
      },

      changePassword(payload: ChangePasswordPayload, accessToken: string) {
            return apiRequest<any>('/api/v1/auth/change-password', {
                  method: 'POST',
                  body: JSON.stringify(payload),
            }, accessToken);
      },

      forgotPassword(payload: ForgotPasswordPayload) {
            return apiRequest<void | TwoFactorRequiredResponse>('/api/v1/auth/forgot-password', {
                  method: 'POST',
                  body: JSON.stringify(payload),
            });
      },

      resetPassword(payload: ResetPasswordPayload) {
            return apiRequest<void>('/api/v1/auth/reset-password', {
                  method: 'POST',
                  body: JSON.stringify(payload),
            });
      },

      getConversations(accessToken: string, params: { cursor?: string; limit?: number } = {}) {
            const query = new URLSearchParams();
            if (params.cursor) query.append('cursor', params.cursor);
            if (params.limit) query.append('limit', params.limit.toString());

            const queryString = query.toString();
            const path = `/api/v1/conversations${queryString ? `?${queryString}` : ''}`;

            return apiRequest<ConversationListResponse>(path, { method: 'GET' }, accessToken);
      },

      getConversation(id: string, accessToken: string) {
            return apiRequest<Conversation>(`/api/v1/conversations/${id}`, { method: 'GET' }, accessToken);
      },

      getConversationMembers(id: string, accessToken: string, limit?: number) {
            const query = limit ? `?limit=${limit}` : '';
            return apiRequest<ConversationSearchMember[]>(`/api/v1/conversations/${id}/members${query}`, { method: 'GET' }, accessToken);
      },

      getOrCreateDirectConversation(recipientId: string, accessToken: string) {
            return apiRequest<Conversation>(
                  '/api/v1/conversations/direct',
                  {
                        method: 'POST',
                        body: JSON.stringify({ recipientId }),
                  },
                  accessToken,
            );
      },

      requestJoinGroup(conversationId: string, accessToken: string, message?: string) {
            return apiRequest<JoinGroupResponse>(
                  `/api/v1/conversations/${conversationId}/join`,
                  {
                        method: 'POST',
                        body: JSON.stringify({ message }),
                  },
                  accessToken,
            );
      },

      getJoinGroupPreview(conversationId: string, accessToken: string) {
            return apiRequest<JoinGroupPreviewResponse>(
                  `/api/v1/conversations/${conversationId}/join-preview`,
                  { method: 'GET' },
                  accessToken,
            );
      },

      togglePin(conversationId: string, accessToken: string, isPinned: boolean) {
            const method = isPinned ? 'POST' : 'DELETE';
            return apiRequest<void>(`/api/v1/conversations/${conversationId}/pin`, { method }, accessToken);
      },

      toggleMute(conversationId: string, accessToken: string, isMuted: boolean) {
            return apiRequest<void>(`/api/v1/conversations/${conversationId}/mute`, {
                  method: 'PATCH',
                  body: JSON.stringify({ muted: isMuted }),
            }, accessToken);
      },

      getFriends(accessToken: string, params: { search?: string; cursor?: string; limit?: number; excludeIds?: string[]; conversationId?: string } = {}) {
            const query = new URLSearchParams();
            if (params.search) query.append('search', params.search);
            if (params.cursor) query.append('cursor', params.cursor);
            if (params.limit) query.append('limit', params.limit.toString());
            if (params.conversationId) query.append('conversationId', params.conversationId);
            if (params.excludeIds && params.excludeIds.length > 0) {
                  params.excludeIds.filter(Boolean).forEach(id => query.append('excludeIds', id));
            }

            const queryString = query.toString();
            return apiRequest<{ data: any[]; meta: { hasNextPage: boolean; nextCursor?: string } }>(
                  `/api/v1/friendships${queryString ? `?${queryString}` : ''}`,
                  { method: 'GET' },
                  accessToken,
            );
      },

      getCallHistory(accessToken: string, status?: string) {
            const url = status ? `/api/v1/calls/history?status=${status}` : '/api/v1/calls/history';
            return apiRequest<CursorPaginatedResult<CallHistoryItem>>(url, { method: 'GET' }, accessToken);
      },

      markMissedCallsAsViewed(accessToken: string) {
            return apiRequest<void>('/api/v1/calls/missed/view-all', { method: 'POST' }, accessToken);
      },

      getSessions(accessToken: string) {
            return apiRequest<{
                  currentDeviceId?: string;
                  sessions: DeviceSession[];
            }>('/api/v1/auth/sessions', { method: 'GET' }, accessToken);
      },

      generateAttestChallenge(accessToken: string) {
            return apiRequest<{ challenge: string }>('/api/v1/auth/devices/attest/challenge', { method: 'POST' }, accessToken);
      },

      verifyAttest(deviceId: string, payload: { challenge: string; signature: string }, accessToken: string) {
            return apiRequest<{ verified: boolean }>(`/api/v1/auth/devices/${deviceId}/attest/verify`, {
                  method: 'POST',
                  body: JSON.stringify(payload),
            }, accessToken);
      },

      revokeSession(deviceId: string, accessToken: string) {
            return apiRequest<void>(`/api/v1/auth/sessions/${deviceId}`, { method: 'DELETE' }, accessToken);
      },

      scanQr(qrSessionId: string, accessToken: string) {
            return apiRequest<QrScanResponse>(
                  '/api/v1/auth/qr/scan',
                  {
                        method: 'POST',
                        body: JSON.stringify({ qrSessionId }),
                  },
                  accessToken,
            );
      },

      confirmQr(qrSessionId: string, accessToken: string) {
            return apiRequest<void>(
                  '/api/v1/auth/qr/confirm',
                  {
                        method: 'POST',
                        body: JSON.stringify({ qrSessionId }),
                  },
                  accessToken,
            );
      },

      getQrStatus(qrSessionId: string) {
            return apiRequest<{ status: string; ticket?: string }>(`/api/v1/auth/qr/status/${qrSessionId}`, {
                  method: 'GET',
            });
      },

      cancelQr(qrSessionId: string, accessToken: string) {
            return apiRequest<void>(
                  '/api/v1/auth/qr/cancel',
                  {
                        method: 'POST',
                        body: JSON.stringify({ qrSessionId }),
                  },
                  accessToken,
            );
      },

      getMessages(conversationId: string, accessToken: string, cursor?: string, direction: 'older' | 'newer' = 'older', limit: number = 50) {
            return apiRequest<{ data: Message[]; meta: { nextCursor?: string; hasNextPage: boolean } }>(
                  `/api/v1/messages?conversationId=${conversationId}&limit=${limit}${cursor ? `&cursor=${cursor}` : ''}${direction ? `&direction=${direction}` : ''}`,
                  { method: 'GET' },
                  accessToken,
            );
      },

      getMessageContext(conversationId: string, accessToken: string, messageId: string, before: number = 25, after: number = 25) {
            return apiRequest<{ data: Message[]; hasOlderMessages: boolean; hasNewerMessages: boolean }>(
                  `/api/v1/messages/context?conversationId=${conversationId}&messageId=${messageId}&before=${before}&after=${after}`,
                  { method: 'GET' },
                  accessToken,
            );
      },


      sendMessage(data: { conversationId: string; content?: string; type: string; clientMessageId: string; mediaIds?: string[] }, accessToken: string) {
            return apiRequest<any>(
                  '/api/v1/messages',
                  {
                        method: 'POST',
                        body: JSON.stringify(data),
                  },
                  accessToken,
            );
      },

      forwardMessage(
            data: {
                  sourceMessageId: string;
                  targetConversationIds: string[];
                  clientRequestId: string;
                  includeCaption?: boolean;
            },
            accessToken: string,
      ) {
            return apiRequest<any[]>(
                  '/api/v1/messages/forward',
                  {
                        method: 'POST',
                        body: JSON.stringify(data),
                  },
                  accessToken,
            );
      },

      recallMessage(messageId: string, accessToken: string) {
            return apiRequest<void>(
                  `/api/v1/messages/${messageId}?deleteForEveryone=true`,
                  {
                        method: 'DELETE',
                  },
                  accessToken,
            );
      },

      deleteMessageForMe(messageId: string, accessToken: string) {
            return apiRequest<void>(
                  `/api/v1/messages/${messageId}`,
                  {
                        method: 'DELETE',
                  },
                  accessToken,
            );
      },

      updateConversation(id: string, accessToken: string, data: { name?: string; avatarUrl?: string; requireApproval?: boolean }) {
            return apiRequest<Conversation>(
                  `/api/v1/conversations/${id}`,
                  {
                        method: 'PATCH',
                        body: JSON.stringify(data),
                  },
                  accessToken,
            );
      },

      getBlockedList(accessToken: string, params: { cursor?: string; limit?: number; search?: string } = {}) {
            const query = new URLSearchParams();
            if (params.cursor) query.append('cursor', params.cursor);
            if (params.limit) query.append('limit', params.limit.toString());
            if (params.search) query.append('search', params.search);
            const queryString = query.toString();
            return apiRequest<BlockedListResponse>(
                  `/api/v1/block/blocked${queryString ? `?${queryString}` : ''}`,
                  { method: 'GET' },
                  accessToken
            );
      },

      addMembers(id: string, accessToken: string, memberIds: string[]) {
            return apiRequest<void>(
                  `/api/v1/conversations/${id}/members`,
                  {
                        method: 'POST',
                        body: JSON.stringify({ memberIds }),
                  },
                  accessToken,
            );
      },

      leaveGroup(id: string, accessToken: string) {
            return apiRequest<void>(
                  `/api/v1/conversations/${id}/leave`,
                  { method: 'POST' },
                  accessToken,
            );
      },

      dissolveGroup(id: string, accessToken: string) {
            return apiRequest<void>(
                  `/api/v1/conversations/${id}`,
                  { method: 'DELETE' },
                  accessToken,
            );
      },
      getReceivedFriendRequests(accessToken: string, params: { cursor?: string; limit?: number } = {}) {
            const query = new URLSearchParams();
            if (params.cursor) query.append('cursor', params.cursor);
            if (params.limit) query.append('limit', params.limit.toString());
            const queryString = query.toString();
            return apiRequest<{ data: any[]; meta: { hasNextPage: boolean; nextCursor?: string } }>(
                  `/api/v1/friend-requests/received${queryString ? `?${queryString}` : ''}`,
                  { method: 'GET' },
                  accessToken
            );
      },

      getSentFriendRequests(accessToken: string, params: { cursor?: string; limit?: number } = {}) {
            const query = new URLSearchParams();
            if (params.cursor) query.append('cursor', params.cursor);
            if (params.limit) query.append('limit', params.limit.toString());
            const queryString = query.toString();
            return apiRequest<{ data: any[]; meta: { hasNextPage: boolean; nextCursor?: string } }>(
                  `/api/v1/friend-requests/sent${queryString ? `?${queryString}` : ''}`,
                  { method: 'GET' },
                  accessToken
            );
      },

      sendFriendRequest(targetUserId: string, accessToken: string) {
            return apiRequest<{ id: string }>(
                  '/api/v1/friend-requests',
                  {
                        method: 'POST',
                        body: JSON.stringify({ targetUserId }),
                  },
                  accessToken,
            );
      },

      syncContacts(contacts: ContactItemDto[], accessToken: string) {
            return apiRequest<{ jobId: string }>(
                  '/api/v1/contacts/sync',
                  {
                        method: 'POST',
                        body: JSON.stringify({ contacts }),
                  },
                  accessToken
            );
      },

      checkSyncRateLimit(accessToken: string) {
            return apiRequest<{ canSync: boolean }>(
                  '/api/v1/contacts/sync/check',
                  { method: 'GET' },
                  accessToken
            );
      },

      acceptFriendRequest(requestId: string, accessToken: string) {
            return apiRequest<void>(`/api/v1/friend-requests/${requestId}/accept`, { method: 'PUT' }, accessToken);
      },

      declineFriendRequest(requestId: string, accessToken: string) {
            return apiRequest<void>(`/api/v1/friend-requests/${requestId}/decline`, { method: 'PUT' }, accessToken);
      },

      cancelFriendRequest(requestId: string, accessToken: string) {
            return apiRequest<void>(`/api/v1/friend-requests/${requestId}`, { method: 'DELETE' }, accessToken);
      },

      getGroups(accessToken: string, params: { cursor?: string; limit?: number; search?: string } = {}) {
            const query = new URLSearchParams();
            if (params.cursor) query.append('cursor', params.cursor);
            if (params.limit) query.append('limit', params.limit.toString());
            if (params.search) query.append('search', params.search);

            const queryString = query.toString();
            return apiRequest<ConversationListResponse>(`/api/v1/conversations/groups${queryString ? `?${queryString}` : ''}`, { method: 'GET' }, accessToken);
      },

      initiateUpload(payload: { fileName: string; mimeType: string; fileSize: number }, accessToken: string) {
            return apiRequest<{ uploadId: string; presignedUrl: string; expiresIn: number; s3Key: string }>(
                  '/api/v1/media/upload/initiate',
                  {
                        method: 'POST',
                        body: JSON.stringify(payload),
                  },
                  accessToken,
            );
      },

      initiateAvatarUpload(payload: { fileName: string; mimeType: string; fileSize: number; targetId?: string; targetType?: 'USER' | 'GROUP' }, accessToken: string) {
            return apiRequest<{ presignedUrl: string; fileUrl: string; expiresIn: number; s3Key: string }>(
                  '/api/v1/media/upload/avatar',
                  {
                        method: 'POST',
                        body: JSON.stringify(payload),
                  },
                  accessToken,
            );
      },

      async uploadToS3(presignedUrl: string, fileInfo: { uri: string; type: string; name: string }, onProgress?: (percent: number) => void): Promise<void> {
            const uploadWithXhr = (payload: { uri: string; type: string; name: string } | Blob): Promise<void> => {
                  return new Promise((resolve, reject) => {
                        const xhr = new XMLHttpRequest();
                        xhr.timeout = 120000;

                        xhr.upload.addEventListener('progress', (e) => {
                              if (e.lengthComputable && onProgress) {
                                    onProgress(Math.round((e.loaded / e.total) * 100));
                              }
                        });

                        xhr.addEventListener('load', () => {
                              if (xhr.status >= 200 && xhr.status < 300) {
                                    resolve();
                                    return;
                              }

                              const responsePreview = xhr.responseText?.slice(0, 120)?.trim();
                              const suffix = responsePreview ? `: ${responsePreview}` : '';
                              reject(new Error(`Upload failed with status ${xhr.status}${suffix}`));
                        });

                        xhr.addEventListener('timeout', () => {
                              reject(new Error('Upload timed out while sending asset to storage'));
                        });

                        xhr.addEventListener('error', () => reject(new Error('Network error during upload')));

                        xhr.open('PUT', presignedUrl);
                        xhr.setRequestHeader('Content-Type', fileInfo.type || 'application/octet-stream');
                        xhr.send(payload as any);
                  });
            };

            const shouldRetry = (error: unknown): boolean => {
                  const message = error instanceof Error ? error.message : String(error);
                  return /status\s(502|503|504)\b/i.test(message) || /timed out/i.test(message);
            };

            try {
                  // First attempt: React Native file descriptor object (works best with content:// URIs).
                  await uploadWithXhr(fileInfo);
                  onProgress?.(100);
                  return;
            } catch (firstError) {
                  if (!shouldRetry(firstError)) {
                        throw firstError;
                  }
            }

            await wait(400);

            // Fallback attempt: convert to Blob and re-upload.
            const localResponse = await fetch(fileInfo.uri);
            if (!localResponse.ok) {
                  throw new Error(`Cannot read local asset for retry (status ${localResponse.status})`);
            }

            const fileBlob = await localResponse.blob();
            await uploadWithXhr(fileBlob);
            onProgress?.(100);
      },

      confirmUpload(uploadId: string, accessToken: string) {
            return apiRequest<any>(
                  '/api/v1/media/upload/confirm',
                  {
                        method: 'POST',
                        body: JSON.stringify({ uploadId }),
                  },
                  accessToken,
            );
      },

      getReminders(accessToken: string, includeCompleted = false) {
            return apiRequest<ReminderItem[]>(
                  `/api/v1/reminders${includeCompleted ? '?includeCompleted=true' : ''}`,
                  { method: 'GET' },
                  accessToken,
            );
      },

      getConversationReminders(conversationId: string, accessToken: string) {
            return apiRequest<ReminderItem[]>(
                  `/api/v1/reminders/conversation/${conversationId}`,
                  { method: 'GET' },
                  accessToken,
            );
      },

      createReminder(params: CreateReminderParams, accessToken: string) {
            return apiRequest<ReminderItem>(
                  '/api/v1/reminders',
                  {
                        method: 'POST',
                        body: JSON.stringify(params),
                  },
                  accessToken,
            );
      },

      updateReminder(id: string, params: UpdateReminderParams, accessToken: string) {
            return apiRequest<ReminderItem>(
                  `/api/v1/reminders/${id}`,
                  {
                        method: 'PATCH',
                        body: JSON.stringify(params),
                  },
                  accessToken,
            );
      },

      deleteReminder(id: string, accessToken: string) {
            return apiRequest<void>(`/api/v1/reminders/${id}`, { method: 'DELETE' }, accessToken);
      },

      getUndelivered(accessToken: string) {
            return apiRequest<ReminderItem[]>('/api/v1/reminders/undelivered', { method: 'GET' }, accessToken);
      },

      getPinnedMessages(conversationId: string, accessToken: string) {
            return apiRequest<Message[]>(`/api/v1/conversations/${conversationId}/pinned-messages`, { method: 'GET' }, accessToken);
      },

      pinMessage(conversationId: string, messageId: string, accessToken: string) {
            return apiRequest<void>(`/api/v1/conversations/${conversationId}/pin-message/${messageId}`, { method: 'POST' }, accessToken);
      },

      unpinMessage(conversationId: string, messageId: string, accessToken: string) {
            return apiRequest<void>(`/api/v1/conversations/${conversationId}/unpin-message/${messageId}`, { method: 'DELETE' }, accessToken);
      },

      registerDeviceToken(payload: { deviceId: string; fcmToken: string; platform: 'ANDROID' | 'IOS' | 'WEB' }, accessToken: string) {
            return apiRequest<{ message: string }>('/api/v1/devices', {
                  method: 'POST',
                  body: JSON.stringify(payload),
            }, accessToken);
      },

      removeDeviceToken(deviceId: string, accessToken: string) {
            return apiRequest<void>(`/api/v1/devices/${deviceId}`, { method: 'DELETE' }, accessToken);
      },

      getRecentMedia(conversationId: string, accessToken: string, params: { types?: string; limit?: number; cursor?: string; keyword?: string } = {}) {
            const query = new URLSearchParams();
            if (params.types) query.append('types', params.types);
            if (params.limit) query.append('limit', params.limit.toString());
            if (params.cursor) query.append('cursor', params.cursor);
            if (params.keyword) query.append('keyword', params.keyword);

            const queryString = query.toString();
            const path = `/api/v1/messages/conversations/${conversationId}/media/recent${queryString ? `?${queryString}` : ''}`;

            return apiRequest<{ items: RecentMediaItemDto[]; meta: { nextCursor?: string; hasNextPage: boolean } }>(path, { method: 'GET' }, accessToken);
      },

      blockUser(targetUserId: string, accessToken: string, reason?: string) {
            return apiRequest<any>('/api/v1/block', {
                  method: 'POST',
                  body: JSON.stringify({ targetUserId, reason }),
            }, accessToken);
      },

      unblockUser(targetUserId: string, accessToken: string) {
            return apiRequest<void>(`/api/v1/block/${targetUserId}`, { method: 'DELETE' }, accessToken);
      },

      checkBlockStatus(targetUserId: string, accessToken: string) {
            return apiRequest<{ isBlocked: boolean }>(`/api/v1/block/check/${targetUserId}`, { method: 'GET' }, accessToken);
      },

      checkFriendshipStatus(targetUserId: string, accessToken: string) {
            return apiRequest<{ status: string | null }>(`/api/v1/friendships/check/${targetUserId}`, { method: 'GET' }, accessToken);
      },

      searchContacts(accessToken: string, params: { keyword: string; cursor?: string; limit?: number; excludeIds?: string[]; conversationId?: string }) {
            const query = new URLSearchParams();
            query.append('keyword', params.keyword);
            if (params.cursor) query.append('cursor', params.cursor);
            if (params.limit) query.append('limit', params.limit.toString());
            if (params.conversationId) query.append('conversationId', params.conversationId);
            if (params.excludeIds && params.excludeIds.length > 0) {
                  params.excludeIds.filter(Boolean).forEach(id => query.append('excludeIds', id));
            }

            const queryString = query.toString();
            return apiRequest<{ data: any[]; meta: { hasNextPage: boolean; nextCursor?: string } }>(
                  `/api/v1/search/contacts${queryString ? `?${queryString}` : ''}`,
                  { method: 'GET' },
                  accessToken
            );
      },

      updateAlias(accessToken: string, contactUserId: string, data: { aliasName: string | null }) {
            return apiRequest<void>(
                  `/api/v1/contacts/${contactUserId}/alias`,
                  {
                        method: 'PATCH',
                        body: JSON.stringify(data),
                  },
                  accessToken
            );
      },

      // --- Search Analytics ---
      getSearchHistory(accessToken: string, limit = 50) {
            return apiRequest<SearchHistoryItem[]>(`/api/v1/search/analytics/history?limit=${limit}`, { method: 'GET' }, accessToken);
      },

      getSuggestions(accessToken: string, prefix: string, limit = 10) {
            return apiRequest<SearchSuggestion[]>(`/api/v1/search/analytics/suggestions?prefix=${prefix}&limit=${limit}`, { method: 'GET' }, accessToken);
      },

      getTrendingKeywords(accessToken: string, limit = 50) {
            return apiRequest<TrendingKeyword[]>(`/api/v1/search/analytics/trending?limit=${limit}`, { method: 'GET' }, accessToken);
      },

      trackResultClick(accessToken: string, keyword: string, resultId: string) {
            return apiRequest<void>(
                  '/api/v1/search/analytics/track-click',
                  {
                        method: 'POST',
                        body: JSON.stringify({ keyword, resultId }),
                  },
                  accessToken,
            );
      },

      deleteSearchHistory(accessToken: string, historyId: string) {
            return apiRequest<void>(`/api/v1/search/analytics/history/${historyId}`, { method: 'DELETE' }, accessToken);
      },

      clearSearchHistory(accessToken: string) {
            return apiRequest<void>('/api/v1/search/analytics/history', { method: 'DELETE' }, accessToken);
      },

      // --- Privacy Settings ---
      getPrivacySettings(accessToken: string) {
            return apiRequest<PrivacySettings>('/api/v1/privacy', { method: 'GET' }, accessToken);
      },

      updatePrivacySettings(payload: UpdatePrivacySettingsPayload, accessToken: string) {
            return apiRequest<PrivacySettings>(
                  '/api/v1/privacy',
                  {
                        method: 'PATCH',
                        body: JSON.stringify(payload),
                  },
                  accessToken,
            );
      },

      getContactProfile(targetId: string, accessToken: string) {
            return apiRequest<ContactSearchResult>(`/api/v1/search/contacts/${targetId}`, { method: 'GET' }, accessToken);
      },

      getActiveCall(conversationId: string, accessToken: string) {
            return apiRequest<{ active: boolean; callId?: string; conversationId?: string; participantCount?: number; startedAt?: string; isJoined?: boolean; dailyRoomUrl?: string }>(
                  `/api/v1/calls/active/${conversationId}`,
                  { method: 'GET' },
                  accessToken,
            );
      },

      deactivateAccount(password: string, accessToken: string) {
            return apiRequest<void>(
                  '/api/v1/users/deactivate',
                  {
                        method: 'POST',
                        body: JSON.stringify({ password }),
                  },
                  accessToken,
            );
      },

      deleteAccount(userId: string, password: string, accessToken: string) {
            return apiRequest<void>(
                  `/api/v1/users/${userId}`,
                  {
                        method: 'DELETE',
                        body: JSON.stringify({ password }),
                  },
                  accessToken,
            );
      },

      getSyncedContacts(accessToken: string, params: { cursor?: string; limit?: number; search?: string; excludeFriends?: boolean } = {}) {
            const query = new URLSearchParams();
            if (params.cursor) query.append('cursor', params.cursor);
            if (params.limit) query.append('limit', params.limit.toString());
            if (params.search) query.append('search', params.search);
            if (params.excludeFriends) query.append('excludeFriends', 'true');

            const queryString = query.toString();
            return apiRequest<CursorPaginatedResult<ContactResponseDto>>(
                  `/api/v1/contacts${queryString ? `?${queryString}` : ''}`,
                  { method: 'GET' },
                  accessToken,
            );
      },

      removeSyncedContact(contactUserId: string, accessToken: string) {
            return apiRequest<void>(`/api/v1/contacts/${contactUserId}`, { method: 'DELETE' }, accessToken);
      },
};


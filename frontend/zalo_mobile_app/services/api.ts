import type {
      AuthResponse,
      DeviceSession,
      LoginPayload,
      QrScanResponse,
      RegisterPayload,
      UserProfile,
} from '@/types/auth';
import type { Conversation, ConversationListResponse } from '@/types/conversation';
import Constants from 'expo-constants';
import { NativeModules, Platform } from 'react-native';

const API_PORT = process.env.EXPO_PUBLIC_API_PORT ?? '8000';
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
            Constants.expoConfig?.name ||
            Constants.expoConfig?.slug ||
            (Platform.OS === 'ios' ? 'iOS App' : Platform.OS === 'android' ? 'Android App' : 'Web App')
      );
}

const DEVICE_HEADERS: Record<string, string> = {
      'X-Device-Type': resolveDeviceTypeHeader(),
      'X-Platform': resolvePlatformHeader(),
      'X-Device-Name': resolveDeviceNameHeader(),
};

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

async function apiRequest<T>(
      path: string,
      options: RequestInit = {},
      accessToken?: string,
): Promise<T> {
      const url = buildUrl(path);
      const method = options.method ?? 'GET';
      const headers: HeadersInit = {
            'Content-Type': 'application/json',
            ...DEVICE_HEADERS,
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

      login(payload: LoginPayload) {
            return apiRequest<AuthResponse>('/api/v1/auth/login', {
                  method: 'POST',
                  body: JSON.stringify(payload),
            });
      },

      register(payload: RegisterPayload) {
            return apiRequest<UserProfile>('/api/v1/auth/register', {
                  method: 'POST',
                  body: JSON.stringify(payload),
            });
      },

      getProfile(accessToken: string) {
            return apiRequest<UserProfile>('/api/v1/auth/me', { method: 'GET' }, accessToken);
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

      togglePin(conversationId: string, accessToken: string, isPinned: boolean) {
            const method = isPinned ? 'POST' : 'DELETE';
            return apiRequest<void>(`/api/v1/conversations/${conversationId}/pin`, { method }, accessToken);
      },

      toggleMute(conversationId: string, accessToken: string) {
            return apiRequest<void>(`/api/v1/conversations/${conversationId}/mute`, { method: 'PATCH' }, accessToken);
      },

      getFriends(accessToken: string) {
            return apiRequest<unknown>('/api/v1/friendships', { method: 'GET' }, accessToken);
      },

      getCallHistory(accessToken: string) {
            return apiRequest<unknown>('/api/v1/calls/history', { method: 'GET' }, accessToken);
      },

      getSessions(accessToken: string) {
            return apiRequest<DeviceSession[]>('/api/v1/auth/sessions', { method: 'GET' }, accessToken);
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

      getMessages(conversationId: string, accessToken: string, cursor?: string, limit: number = 20) {
            return apiRequest<{ data: any[]; nextCursor?: string; hasMore: boolean }>(
                  `/api/v1/messages?conversationId=${conversationId}&limit=${limit}${cursor ? `&cursor=${cursor}` : ''}`,
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

      updateConversation(id: string, accessToken: string, data: { name?: string; avatarUrl?: string }) {
            return apiRequest<Conversation>(
                  `/api/v1/conversations/${id}`,
                  {
                        method: 'PATCH',
                        body: JSON.stringify(data),
                  },
                  accessToken,
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
};

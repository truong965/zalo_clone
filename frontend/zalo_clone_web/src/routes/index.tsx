/**
 * Routes configuration
 */

import { lazy, Suspense } from 'react';
import { createBrowserRouter } from 'react-router-dom';
import { PrivateRoute } from '@/components/private-route';
import { ClientLayout } from '@/components/layout/client-layout';
import { AdminLayout } from '@/components/layout/admin-layout';
import { ErrorBoundary } from '@/components/shared/error-boundary';
import { PageSkeleton } from '@/components/shared/page-skeleton';

// Auth Pages (lazy)
const LoginPage = lazy(() => import('@/pages/login').then(m => ({ default: m.LoginPage })));
const RegisterPage = lazy(() => import('@/pages/register').then(m => ({ default: m.RegisterPage })));

// Client Pages (lazy)
const ChatPage = lazy(() => import('@/pages/chat').then(m => ({ default: m.ChatPage })));
const ContactsPage = lazy(() => import('@/pages/contacts').then(m => ({ default: m.ContactsPage })));
const CallsPage = lazy(() => import('@/pages/calls').then(m => ({ default: m.CallsPage })));
const ProfilePage = lazy(() => import('@/pages/profile').then(m => ({ default: m.ProfilePage })));
const SettingsPage = lazy(() => import('@/pages/settings').then(m => ({ default: m.SettingsPage })));
const CallScreen = lazy(() => import('@/features/call/components/CallScreen').then(m => ({ default: m.CallScreen })));

// Admin Pages (lazy)
const AdminDashboardPage = lazy(() => import('@/pages/admin/dashboard').then(m => ({ default: m.AdminDashboardPage })));
const AdminUsersPage = lazy(() => import('@/pages/admin/users').then(m => ({ default: m.AdminUsersPage })));
const AdminMessagesPage = lazy(() => import('@/pages/admin/messages').then(m => ({ default: m.AdminMessagesPage })));
const AdminCallsPage = lazy(() => import('@/pages/admin/calls').then(m => ({ default: m.AdminCallsPage })));
const AdminActivityPage = lazy(() => import('@/pages/admin/activity').then(m => ({ default: m.AdminActivityPage })));
const AdminSettingsPage = lazy(() => import('@/pages/admin/settings').then(m => ({ default: m.AdminSettingsPage })));

// Common Pages (lazy)
const NotFoundPage = lazy(() => import('@/pages/not-found').then(m => ({ default: m.NotFoundPage })));
const PermissionDeniedPage = lazy(() => import('@/pages/permission-denied').then(m => ({ default: m.PermissionDeniedPage })));

export const router = createBrowserRouter([
      // Auth Routes
      {
            path: '/login',
            element: (
                  <ErrorBoundary>
                        <Suspense fallback={<PageSkeleton />}>
                              <LoginPage />
                        </Suspense>
                  </ErrorBoundary>
            ),
      },
      {
            path: '/register',
            element: (
                  <ErrorBoundary>
                        <Suspense fallback={<PageSkeleton />}>
                              <RegisterPage />
                        </Suspense>
                  </ErrorBoundary>
            ),
      },

      // Client Routes
      {
            path: '/',
            element: (
                  <PrivateRoute>
                        <ClientLayout />
                  </PrivateRoute>
            ),
            children: [
                  {
                        path: 'chat',
                        element: (
                              <ErrorBoundary>
                                    <Suspense fallback={<PageSkeleton />}>
                                          <ChatPage />
                                    </Suspense>
                              </ErrorBoundary>
                        ),
                  },
                  {
                        path: 'chat/:conversationId',
                        element: (
                              <ErrorBoundary>
                                    <Suspense fallback={<PageSkeleton />}>
                                          <ChatPage />
                                    </Suspense>
                              </ErrorBoundary>
                        ),
                  },
                  {
                        path: 'chat/new',
                        element: (
                              <ErrorBoundary>
                                    <Suspense fallback={<PageSkeleton />}>
                                          <ChatPage />
                                    </Suspense>
                              </ErrorBoundary>
                        ),
                  },
                  {
                        path: 'contacts',
                        element: (
                              <ErrorBoundary>
                                    <Suspense fallback={<PageSkeleton />}>
                                          <ContactsPage />
                                    </Suspense>
                              </ErrorBoundary>
                        ),
                  },
                  {
                        path: 'calls',
                        element: (
                              <ErrorBoundary>
                                    <Suspense fallback={<PageSkeleton />}>
                                          <CallsPage />
                                    </Suspense>
                              </ErrorBoundary>
                        ),
                  },
                  {
                        path: 'calls/:callId',
                        element: (
                              <ErrorBoundary>
                                    <Suspense fallback={<PageSkeleton />}>
                                          <CallScreen />
                                    </Suspense>
                              </ErrorBoundary>
                        ),
                  },
                  {
                        path: 'profile',
                        element: (
                              <ErrorBoundary>
                                    <Suspense fallback={<PageSkeleton />}>
                                          <ProfilePage />
                                    </Suspense>
                              </ErrorBoundary>
                        ),
                  },
                  {
                        path: 'notifications',
                        element: <div className="p-4">Notifications Page (Coming soon)</div>,
                  },
                  {
                        path: 'settings',
                        element: (
                              <ErrorBoundary>
                                    <Suspense fallback={<PageSkeleton />}>
                                          <SettingsPage />
                                    </Suspense>
                              </ErrorBoundary>
                        ),
                  },
                  {
                        index: true,
                        element: (
                              <ErrorBoundary>
                                    <Suspense fallback={<PageSkeleton />}>
                                          <ChatPage />
                                    </Suspense>
                              </ErrorBoundary>
                        ),
                  },
            ],
      },

      // Admin Routes
      {
            path: '/admin',
            element: (
                  <PrivateRoute requireAdmin>
                        <AdminLayout />
                  </PrivateRoute>
            ),
            children: [
                  {
                        path: 'dashboard',
                        element: (
                              <Suspense fallback={<PageSkeleton />}>
                                    <AdminDashboardPage />
                              </Suspense>
                        ),
                  },
                  {
                        path: 'users',
                        element: (
                              <Suspense fallback={<PageSkeleton />}>
                                    <AdminUsersPage />
                              </Suspense>
                        ),
                  },
                  {
                        path: 'messages',
                        element: (
                              <Suspense fallback={<PageSkeleton />}>
                                    <AdminMessagesPage />
                              </Suspense>
                        ),
                  },
                  {
                        path: 'calls',
                        element: (
                              <Suspense fallback={<PageSkeleton />}>
                                    <AdminCallsPage />
                              </Suspense>
                        ),
                  },
                  {
                        path: 'activity',
                        element: (
                              <Suspense fallback={<PageSkeleton />}>
                                    <AdminActivityPage />
                              </Suspense>
                        ),
                  },
                  {
                        path: 'settings',
                        element: (
                              <Suspense fallback={<PageSkeleton />}>
                                    <AdminSettingsPage />
                              </Suspense>
                        ),
                  },
                  {
                        index: true,
                        element: (
                              <Suspense fallback={<PageSkeleton />}>
                                    <AdminDashboardPage />
                              </Suspense>
                        ),
                  },
            ],
      },

      // Error Routes
      {
            path: '/permission-denied',
            element: (
                  <Suspense fallback={<PageSkeleton />}>
                        <PermissionDeniedPage />
                  </Suspense>
            ),
      },
      {
            path: '*',
            element: (
                  <Suspense fallback={<PageSkeleton />}>
                        <NotFoundPage />
                  </Suspense>
            ),
      },
]);

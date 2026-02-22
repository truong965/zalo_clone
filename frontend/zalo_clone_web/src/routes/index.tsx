/**
 * Routes configuration
 */

import { createBrowserRouter } from 'react-router-dom';
import { PrivateRoute } from '@/components/private-route';
import { ClientLayout } from '@/components/layout/client-layout';
import { AdminLayout } from '@/components/layout/admin-layout';
import { ErrorBoundary } from '@/components/shared/error-boundary';

// Auth Pages
import { LoginPage } from '@/pages/login';
import { RegisterPage } from '@/pages/register';

// Client Pages
import { ChatPage } from '@/pages/chat';
import { ContactsPage } from '@/pages/contacts';
import { CallsPage } from '@/pages/calls';
import { ProfilePage } from '@/pages/profile';
import { SettingsPage } from '@/pages/settings';

// Admin Pages
import { AdminDashboardPage } from '@/pages/admin/dashboard';
import { AdminUsersPage } from '@/pages/admin/users';
import { AdminMessagesPage } from '@/pages/admin/messages';
import { AdminCallsPage } from '@/pages/admin/calls';
import { AdminReportsPage } from '@/pages/admin/reports';
import { AdminSettingsPage } from '@/pages/admin/settings';

// Common Pages
import { NotFoundPage } from '@/pages/not-found';
import { PermissionDeniedPage } from '@/pages/permission-denied';

export const router = createBrowserRouter([
      // Auth Routes
      {
            path: '/login',
            element: <ErrorBoundary><LoginPage /></ErrorBoundary>,
      },
      {
            path: '/register',
            element: <ErrorBoundary><RegisterPage /></ErrorBoundary>,
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
                        element: <ErrorBoundary><ChatPage /></ErrorBoundary>,
                  },
                  {
                        path: 'chat/:conversationId',
                        element: <ErrorBoundary><ChatPage /></ErrorBoundary>,
                  },
                  {
                        path: 'chat/new',
                        element: <ErrorBoundary><ChatPage /></ErrorBoundary>,
                  },
                  {
                        path: 'contacts',
                        element: <ErrorBoundary><ContactsPage /></ErrorBoundary>,
                  },
                  {
                        path: 'calls',
                        element: <ErrorBoundary><CallsPage /></ErrorBoundary>,
                  },
                  {
                        path: 'profile',
                        element: <ErrorBoundary><ProfilePage /></ErrorBoundary>,
                  },
                  {
                        path: 'notifications',
                        element: <div className="p-4">Notifications Page (Coming soon)</div>,
                  },
                  {
                        path: 'settings',
                        element: <ErrorBoundary><SettingsPage /></ErrorBoundary>,
                  },
                  {
                        index: true,
                        element: <ErrorBoundary><ChatPage /></ErrorBoundary>, // Default to chat
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
                        element: <AdminDashboardPage />,
                  },
                  {
                        path: 'users',
                        element: <AdminUsersPage />,
                  },
                  {
                        path: 'messages',
                        element: <AdminMessagesPage />,
                  },
                  {
                        path: 'calls',
                        element: <AdminCallsPage />,
                  },
                  {
                        path: 'reports',
                        element: <AdminReportsPage />,
                  },
                  {
                        path: 'settings',
                        element: <AdminSettingsPage />,
                  },
                  {
                        index: true,
                        element: <AdminDashboardPage />,
                  },
            ],
      },

      // Error Routes
      {
            path: '/permission-denied',
            element: <PermissionDeniedPage />,
      },
      {
            path: '*',
            element: <NotFoundPage />,
      },
]);

/**
 * Protected Route Component
 * Kiểm tra authentication trước khi cho access
 * Chuyển hướng đến login nếu chưa đăng nhập
 */

import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuthStore } from '@/features/auth/stores/auth.store'; // Dùng trực tiếp store
interface PrivateRouteProps {
  children: ReactNode;
  requireAdmin?: boolean;
}

export function PrivateRoute({ children, requireAdmin = false }: PrivateRouteProps) {
  const { isAuthenticated, isInitializing, user } = useAuthStore();
  // Show loading state

  if (isInitializing) {
    return <div className="flex items-center justify-center h-screen">Checking session...</div>;
  }

  // Redirect to login if not authenticated
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // Check if admin role is required
  if (requireAdmin && user?.role !== 'ADMIN') { // Giả sử user.role đã có từ API /me
    return <Navigate to="/permission-denied" replace />;
  }

  return <>{children}</>;
}

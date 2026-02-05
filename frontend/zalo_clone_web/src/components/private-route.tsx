/**
 * Protected Route Component
 * Kiểm tra authentication trước khi cho access
 */

import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks';

interface PrivateRouteProps {
  children: ReactNode;
  requireAdmin?: boolean;
}

export function PrivateRoute({ children, requireAdmin = false }: PrivateRouteProps) {
  const { isAuthenticated, user } = useAuth();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // Nếu yêu cầu admin role và user không phải admin
  // TODO: Thêm role checking từ user object
  if (requireAdmin) {
    // Khoảng trước khi có role field từ API
    // return <Navigate to="/permission-denied" replace />;
  }

  return <>{children}</>;
}

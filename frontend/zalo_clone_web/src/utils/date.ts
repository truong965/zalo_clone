/**
 * Utility functions - Date formatting
 */

import { formatDistanceToNow, format, isToday, isYesterday } from 'date-fns';
import { vi } from 'date-fns/locale';

/**
 * Format timestamp thành dạng người dùng thấy
 * VD: "2 hours ago", "Yesterday 10:30", "Jan 5, 2024"
 */
export function formatMessageTime(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;

  if (isToday(d)) {
    return format(d, 'HH:mm', { locale: vi });
  }

  if (isYesterday(d)) {
    return `Hôm qua ${format(d, 'HH:mm', { locale: vi })}`;
  }

  return format(d, 'dd/MM/yyyy HH:mm', { locale: vi });
}

/**
 * Format time ago
 */
export function formatTimeAgo(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return formatDistanceToNow(d, { addSuffix: true, locale: vi });
}

/**
 * Format full date
 */
export function formatFullDate(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return format(d, 'EEEE, dd MMMM yyyy', { locale: vi });
}

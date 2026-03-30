import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Dimensions } from 'react-native';
import { Portal } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import dayjs from 'dayjs';

import { ReminderAlert } from '../../stores/reminder.store';

interface ReminderAlertOverlayProps {
  alerts: ReminderAlert[];
  onDismiss: (alert: ReminderAlert) => void;
  onAcknowledge: (alert: ReminderAlert) => void;
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export function ReminderAlertOverlay({ alerts, onDismiss, onAcknowledge }: ReminderAlertOverlayProps) {
  if (alerts.length === 0) return null;

  // Show the most recent alert on top
  const currentAlert = alerts[alerts.length - 1];

  return (
    <Portal>
      <View style={styles.overlay}>
        <View style={styles.backdrop} />
        <View style={styles.card}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.iconContainer}>
              <Ionicons name="alarm" size={28} color="#fff" />
            </View>
            <Text style={styles.headerTitle}>Nhắc hẹn</Text>
            {alerts.length > 1 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{alerts.length}</Text>
              </View>
            )}
          </View>

          {/* Content */}
          <View style={styles.body}>
            <Text style={styles.contentText}>{currentAlert.content}</Text>
            {currentAlert.triggeredAt && (
              <Text style={styles.timeText}>
                {dayjs(currentAlert.triggeredAt).format('HH:mm - DD/MM/YYYY')}
              </Text>
            )}
          </View>

          {/* Actions */}
          <View style={styles.actions}>
            <TouchableOpacity
              style={styles.dismissBtn}
              onPress={() => onDismiss(currentAlert)}
              activeOpacity={0.7}
            >
              <Text style={styles.dismissBtnText}>Để sau</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.ackBtn}
              onPress={() => onAcknowledge(currentAlert)}
              activeOpacity={0.7}
            >
              <Text style={styles.ackBtnText}>Đã xem</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Portal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 9999,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  card: {
    width: SCREEN_WIDTH - 48,
    backgroundColor: '#1e293b',
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#0ea5e9',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 20,
    elevation: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 12,
    gap: 12,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#0ea5e9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#f1f5f9',
    flex: 1,
  },
  badge: {
    backgroundColor: '#ef4444',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 2,
    minWidth: 24,
    alignItems: 'center',
  },
  badgeText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  body: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  contentText: {
    fontSize: 16,
    color: '#e2e8f0',
    lineHeight: 24,
  },
  timeText: {
    fontSize: 13,
    color: '#94a3b8',
    marginTop: 8,
  },
  actions: {
    flexDirection: 'row',
    padding: 16,
    gap: 12,
  },
  dismissBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
  },
  dismissBtnText: {
    color: '#94a3b8',
    fontSize: 15,
    fontWeight: '600',
  },
  ackBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#0ea5e9',
    alignItems: 'center',
  },
  ackBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
});

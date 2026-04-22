import React, { useMemo } from 'react';
import { View } from 'react-native';
import { Button, Modal, Text, useTheme } from 'react-native-paper';
import QRCode from 'react-native-qrcode-svg';

import { buildGroupJoinQrPayload } from '@/features/qr/utils/group-join-qr';

interface GroupQrModalProps {
    visible: boolean;
    onDismiss: () => void;
    conversationId: string;
    groupName?: string | null;
    memberCount: number;
}

export function GroupQrModal({
    visible,
    onDismiss,
    conversationId,
    groupName,
    memberCount,
}: GroupQrModalProps) {
    const theme = useTheme();

    const qrValue = useMemo(() => {
        return buildGroupJoinQrPayload({
            conversationId,
            groupName,
            memberCount,
        });
    }, [conversationId, groupName, memberCount]);

    return (
        <Modal
            visible={visible}
            onDismiss={onDismiss}
            contentContainerStyle={{
                backgroundColor: 'white',
                margin: 20,
                borderRadius: 16,
                paddingHorizontal: 20,
                paddingVertical: 24,
            }}
        >
            <View className="items-center">
                <Text className="text-lg font-bold text-center">Mời vào nhóm bằng mã QR</Text>
                <Text
                    className="text-center mt-2"
                    style={{ color: theme.colors.onSurfaceVariant }}
                    numberOfLines={2}
                >
                    {(groupName || 'Nhóm') + ` • ${memberCount} thành viên`}
                </Text>

                <View className="mt-4 rounded-2xl border border-gray-200 p-4 bg-[#f8fbff]">
                    <QRCode
                        value={qrValue}
                        size={220}
                        ecl="H"
                        backgroundColor="white"
                        color="black"
                    />
                </View>

                <Text className="text-center mt-4 text-sm" style={{ color: theme.colors.onSurfaceVariant }}>
                    Mở Zalo trên điện thoại khác và quét mã để gửi yêu cầu hoặc tham gia ngay.
                </Text>

                <Button mode="outlined" onPress={onDismiss} className="mt-5 w-full" textColor={theme.colors.onSurface}>
                    Đóng
                </Button>
            </View>
        </Modal>
    );
}

import React from 'react';
import { View, TouchableOpacity, Modal, Text, FlatList, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export interface MenuOption {
  id: string;
  label: string;
  icon?: string;
  color?: string;
  onPress: () => void;
  disabled?: boolean;
  hidden?: boolean;
  divider?: boolean;
}

interface ActionSheetMenuProps {
  visible: boolean;
  options: (MenuOption | { divider: boolean })[];
  onClose: () => void;
}

const isMenuOption = (item: any): item is MenuOption => !item.divider;

export function ActionSheetMenu({ visible, options, onClose }: ActionSheetMenuProps) {
  const insets = useSafeAreaInsets();
  const visibleOptions = options.filter(
    (opt) => !isMenuOption(opt) || !opt.hidden
  );

  const renderItem = ({ item }: { item: MenuOption | { divider: boolean } }) => {
    if (!isMenuOption(item)) {
      return <View style={styles.divider} />;
    }

    if (item.disabled) {
      return (
        <View style={[styles.option, styles.disabledOption]}>
          <View style={styles.optionContent}>
            {item.icon && <Ionicons name={item.icon as any} size={20} color="#ccc" style={styles.icon} />}
            <Text style={[styles.optionLabel, styles.disabledLabel]}>{item.label}</Text>
          </View>
        </View>
      );
    }

    return (
      <TouchableOpacity
        style={styles.option}
        onPress={() => {
          item.onPress();
          onClose();
        }}
        activeOpacity={0.6}
      >
        <View style={styles.optionContent}>
          {item.icon && (
            <Ionicons
              name={item.icon as any}
              size={20}
              color={item.color || '#007AFF'}
              style={styles.icon}
            />
          )}
          <Text style={[styles.optionLabel, item.color && { color: item.color }]}>
            {item.label}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <TouchableOpacity
        style={styles.overlay}
        activeOpacity={1}
        onPress={onClose}
      >
        <View style={styles.container}>
          <View style={[styles.sheet, { marginBottom: Math.max(insets.bottom, 8) }]}>
            <FlatList
              data={visibleOptions}
              renderItem={renderItem}
              keyExtractor={(item, index) => (isMenuOption(item) ? item.id : `divider-${index}`)}
              scrollEnabled={visibleOptions.length > 8}
              nestedScrollEnabled
            />
          </View>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  container: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    maxHeight: '70%',
    paddingTop: 4,
  },
  option: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  optionContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  icon: {
    marginRight: 12,
  },
  optionLabel: {
    fontSize: 16,
    color: '#007AFF',
    flex: 1,
  },
  disabledOption: {
    opacity: 0.5,
  },
  disabledLabel: {
    color: '#ccc',
  },
  divider: {
    height: 1,
    backgroundColor: '#e0e0e0',
    marginVertical: 4,
  },
});

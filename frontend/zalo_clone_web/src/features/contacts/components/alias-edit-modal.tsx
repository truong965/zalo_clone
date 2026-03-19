/**
 * Contacts Feature — Alias Edit Modal
 *
 * A controlled modal for setting or clearing the alias name of a contact.
 *
 * `currentAlias` is optional — when omitted the modal lazily fetches the
 * current alias via `useContactCheck` on open. This lets callers that
 * already have contact data (e.g. ChatHeader) skip the extra round-trip,
 * while callers that don't (e.g. FriendItem, ContactList) remain simple.
 */

import { useEffect, useState } from 'react';
import { Button, Input, Modal, Space, Typography } from 'antd';
import { useUpdateAlias } from '../hooks/use-update-alias';
import { useContactCheck } from '../hooks/use-contact-check';
import { useTranslation } from 'react-i18next';

const { Text } = Typography;

// ============================================================================
// Types
// ============================================================================

interface AliasEditModalProps {
      open: boolean;
      contactUserId: string;
      /** Display name shown as subtitle (resolved server name or friend name) */
      contactDisplayName: string;
      /**
       * Current alias value.
       * - When provided: used directly (no extra fetch).
       * - When omitted (`undefined`): lazily fetched via useContactCheck on open.
       */
      currentAlias?: string | null;
      onClose: () => void;
}

// ============================================================================
// Component
// ============================================================================

export function AliasEditModal({
      open,
      contactUserId,
      contactDisplayName,
      currentAlias: currentAliasProp,
      onClose,
}: AliasEditModalProps) {
      const { t } = useTranslation();
      // Self-fetch only when caller didn't supply currentAlias
      const needsFetch = currentAliasProp === undefined;
      const { data: contactInfo } = useContactCheck(needsFetch && open ? contactUserId : null);

      const resolvedAlias =
            currentAliasProp !== undefined
                  ? currentAliasProp
                  : (contactInfo?.aliasName ?? null);

      const [inputValue, setInputValue] = useState(resolvedAlias ?? '');
      const { mutate: updateAlias, isPending } = useUpdateAlias();

      // Sync input whenever resolvedAlias changes (modal open + data loaded)
      useEffect(() => {
            if (open) {
                  setInputValue(resolvedAlias ?? '');
            }
      }, [open, resolvedAlias]);

      const isEdited = inputValue.trim() !== (resolvedAlias ?? '');

      function handleSave() {
            const trimmed = inputValue.trim();
            updateAlias(
                  { contactUserId, aliasName: trimmed || null },
                  { onSuccess: onClose },
            );
      }

      function handleReset() {
            updateAlias(
                  { contactUserId, aliasName: null },
                  { onSuccess: onClose },
            );
      }

      return (
            <Modal
                  open={open}
                  title={t('contacts.alias.modalTitle')}
                  onCancel={onClose}
                  destroyOnHidden
                  footer={
                        <Space>
                              {resolvedAlias && (
                                    <Button danger onClick={handleReset} loading={isPending} disabled={isPending}>
                                          {t('contacts.alias.deleteAlias')}
                                    </Button>
                              )}
                              <Button onClick={onClose} disabled={isPending}>
                                    {t('contacts.alias.cancel')}
                              </Button>
                              <Button
                                    type="primary"
                                    onClick={handleSave}
                                    loading={isPending}
                                    disabled={!isEdited || isPending}
                              >
                                    {t('contacts.alias.save')}
                              </Button>
                        </Space>
                  }
            >
                  <Space direction="vertical" className="w-full" size="small">
                        <Text type="secondary">
                              {t('contacts.alias.hint', { name: contactDisplayName })}
                        </Text>
                        <Input
                              autoFocus
                              maxLength={50}
                              placeholder={t('contacts.alias.placeholder', { name: contactDisplayName })}
                              value={inputValue}
                              onChange={(e) => setInputValue(e.target.value)}
                              onPressEnter={isEdited ? handleSave : undefined}
                        />
                  </Space>
            </Modal>
      );
}

/**
 * CreateGroupModal — Container component for group creation
 *
 * Layout: 2-column (left: search + list, right: selected members)
 * Uses Zustand store for state, socket for creation.
 * Confirms close when members are selected (U5).
 * Disables button during creation to prevent duplicates (B1).
 */

import { Modal, Button, Alert } from 'antd';
import { ExclamationCircleOutlined } from '@ant-design/icons';
import { ErrorBoundary } from '@/components/shared/error-boundary';
import {
      useCreateGroupStore,
      selectSelectedCount,
      selectCanCreate,
} from '../../stores/create-group.store';
import { useCreateGroup } from '../../hooks/use-create-group';
import { GroupInfoHeader } from './group-info-header';
import { MemberSearchBar } from './member-search-bar';
import { MemberList } from './member-list';
import { SelectedMembersPanel } from './selected-members-panel';

interface CreateGroupModalProps {
      /** Called after group is successfully created, with the new group/conversation ID */
      onCreated?: (conversationId: string) => void;
}

export function CreateGroupModal({ onCreated }: CreateGroupModalProps) {
      const isOpen = useCreateGroupStore((s) => s.isOpen);
      const error = useCreateGroupStore((s) => s.error);
      const selectedCount = useCreateGroupStore(selectSelectedCount);
      const canCreate = useCreateGroupStore(selectCanCreate);
      const close = useCreateGroupStore((s) => s.close);
      const groupName = useCreateGroupStore((s) => s.groupName);

      const { handleCreate, isCreating } = useCreateGroup();

      const handleClose = () => {
            // Confirm close if user has made selections (U5)
            if (selectedCount > 0 || groupName.trim().length > 0) {
                  Modal.confirm({
                        title: 'Hủy tạo nhóm?',
                        icon: <ExclamationCircleOutlined />,
                        content:
                              'Bạn đã chọn thành viên và nhập thông tin. Tất cả sẽ bị mất nếu đóng.',
                        okText: 'Đóng',
                        cancelText: 'Tiếp tục',
                        okButtonProps: { danger: true },
                        onOk: close,
                  });
                  return;
            }
            close();
      };

      const handleOk = async () => {
            const conversationId = await handleCreate();
            if (conversationId) {
                  onCreated?.(conversationId);
            }
      };

      return (
            <Modal
                  title="Tạo nhóm"
                  open={isOpen}
                  onCancel={handleClose}
                  width="min(96vw, 900px)"
                  destroyOnCldestroyOnHiddenose
                  maskClosable={false}
                  footer={
                        <div className="flex justify-end gap-2">
                              <Button onClick={handleClose} disabled={isCreating}>
                                    Hủy
                              </Button>
                              <Button
                                    type="primary"
                                    onClick={handleOk}
                                    disabled={!canCreate}
                                    loading={isCreating}
                              >
                                    Tạo nhóm
                                    {selectedCount > 0 ? ` (${selectedCount})` : ''}
                              </Button>
                        </div>
                  }
            >
                  {/* Error alert */}
                  {error ? (
                        <Alert
                              type="error"
                              message={error}
                              showIcon
                              closable
                              className="mb-3"
                        />
                  ) : null}

                  {/* Group info: avatar + name */}
                  <GroupInfoHeader />

                  {/* ErrorBoundary inside Modal — catches content errors without breaking the modal shell */}
                  <ErrorBoundary>
                        {/* Responsive layout: stack on mobile, split on desktop */}
                        <div
                              className="flex flex-col md:flex-row border-t border-gray-100"
                              style={{ minHeight: 360, maxHeight: 480 }}
                        >
                              {/* Left panel: search + member list */}
                              <div className="flex-1 flex flex-col md:border-r border-gray-100 overflow-hidden">
                                    <MemberSearchBar />
                                    <MemberList />
                              </div>

                              {/* Right panel: selected members */}
                              <div className="md:w-[220px] w-full flex-shrink-0 overflow-hidden md:border-l border-gray-100">
                                    <SelectedMembersPanel />
                              </div>
                        </div>
                  </ErrorBoundary>
            </Modal>
      );
}

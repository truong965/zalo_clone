/**
 * ChatInfoSidebar — Right sidebar showing conversation details.
 *
 * Routes between DirectInfoContent and GroupInfoContent based on
 * conversation type. Fetches conversation data via TanStack Query.
 *
 * @see CHAT-INFO-SIDEBAR-PLAN.md Phase A
 */
import { Typography, Spin } from 'antd';
import { useConversationById } from '@/features/conversation/hooks/use-conversation-queries';
import { DirectInfoContent } from './chat-info-sidebar/direct-info-content';
import { GroupInfoContent } from './chat-info-sidebar/group-info-content';

const { Title } = Typography;

interface ChatInfoSidebarProps {
      onClose: () => void;
      conversationId: string;
      currentUserId: string;
      /** Called when user leaves/gets kicked → navigate away from conversation */
      onLeaveGroup?: () => void;
}

export function ChatInfoSidebar({
      onClose,
      conversationId,
      currentUserId,
      onLeaveGroup,
}: ChatInfoSidebarProps) {
      const { data: conversation, isLoading } = useConversationById(conversationId);

      const isGroup = conversation?.type === 'GROUP';

      return (
            <div className="w-[340px] h-full border-l border-gray-200 bg-white flex flex-col overflow-y-auto">
                  {/* Header */}
                  <div className="flex-none h-14 flex items-center justify-center border-b border-gray-100">
                        <Title level={5} className="m-0 text-gray-700">
                              {isGroup ? 'Thông tin nhóm' : 'Thông tin hội thoại'}
                        </Title>
                  </div>

                  {/* Content */}
                  {isLoading || !conversation ? (
                        <div className="flex-1 flex items-center justify-center">
                              <Spin />
                        </div>
                  ) : isGroup ? (
                        <GroupInfoContent
                              conversation={conversation}
                              conversationId={conversationId}
                              currentUserId={currentUserId}
                              onClose={onClose}
                              onLeaveGroup={onLeaveGroup}
                        />
                  ) : (
                        <DirectInfoContent conversation={conversation} />
                  )}
            </div>
      );
}
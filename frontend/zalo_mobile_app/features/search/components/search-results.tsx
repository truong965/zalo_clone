import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import type { SearchTab, GlobalSearchResults, SearchStatus, ContactSearchResult, GroupSearchResult, RelationshipStatus, ConversationMessageGroup, MediaSearchResult } from '../types';
import { ContactResult } from './contact-result';
import { GroupResult } from './group-result';
import { ConversationSearchResult } from './conversation-search-result';
import { MediaResultGrid } from './media-result';

interface SearchResultsProps {
    activeTab: SearchTab;
    results: GlobalSearchResults | null;
    status: SearchStatus;
    keyword: string;
    executionTimeMs: number;
    errorMessage: string | null;
    pendingMatchCount: number;
    onTabChange: (tab: SearchTab) => void;
    onMergeNewMatches: () => void;
    onContactClick?: (
        result: ContactSearchResult,
        effectiveStatus: RelationshipStatus,
        effectiveDirection?: 'OUTGOING' | 'INCOMING' | null,
        effectivePendingId?: string | null,
    ) => void;
    onSendMessage?: (contactId: string) => void;
    onAddFriend?: (contactId: string) => void;
    onGroupClick?: (result: GroupSearchResult) => void;
    onAcceptRequest?: (requestId: string, contactId: string) => void;
    onCancelRequest?: (requestId: string, contactId: string) => void;
    onConversationMessageClick?: (data: ConversationMessageGroup) => void;
    onMediaClick?: (result: MediaSearchResult) => void;
    isActionLoading?: boolean;
}

const TABS: { key: SearchTab; label: string }[] = [
    { key: 'all', label: 'Tất cả' },
    { key: 'messages', label: 'Tin nhắn' },
    { key: 'contacts', label: 'Liên hệ' },
    { key: 'groups', label: 'Nhóm' },
    { key: 'media', label: 'Media' },
];

export function SearchResults({
    activeTab,
    results,
    status,
    keyword,
    executionTimeMs,
    errorMessage,
    pendingMatchCount,
    onTabChange,
    onMergeNewMatches,
    onContactClick,
    onSendMessage,
    onAddFriend,
    onGroupClick,
    onAcceptRequest,
    onCancelRequest,
    onConversationMessageClick,
    onMediaClick,
    isActionLoading,
}: SearchResultsProps) {
    const isLoading = status === 'loading';

    const hasResults =
        results !== null &&
        ((results.conversationMessages?.length ?? 0) > 0 ||
            results.contacts.length > 0 ||
            results.groups.length > 0 ||
            results.media.length > 0);

    const hasSearched = status === 'success' || status === 'error';

    return (
        <View className="flex-1 bg-white">
            {/* Custom Tab Bar */}
            <View className="border-b border-gray-200">
                <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row px-2">
                    {TABS.map((tab) => {
                        let label = tab.label;
                        if (results) {
                            if (tab.key === 'messages' && results.conversationMessages?.length) {
                                label += ` (${results.conversationMessages.length})`;
                            } else if (tab.key === 'contacts' && results.contacts.length) {
                                label += ` (${results.contacts.length})`;
                            } else if (tab.key === 'groups' && results.groups.length) {
                                label += ` (${results.groups.length})`;
                            } else if (tab.key === 'media' && results.media.length) {
                                label += ` (${results.media.length})`;
                            }
                        }

                        const isActive = activeTab === tab.key;
                        return (
                            <TouchableOpacity
                                key={tab.key}
                                onPress={() => onTabChange(tab.key)}
                                className={`px-4 py-3 border-b-2 transition-colors ${isActive ? 'border-[#1E88E5]' : 'border-transparent'}`}
                            >
                                <Text className={`text-sm ${isActive ? 'font-medium text-[#1E88E5]' : 'text-gray-500'}`}>
                                    {label}
                                </Text>
                            </TouchableOpacity>
                        );
                    })}
                </ScrollView>
            </View>

            {/* Content Area */}
            <ScrollView className="flex-1">
                {isLoading && !hasResults && (
                    <View className="p-4 items-center justify-center pt-8">
                        <ActivityIndicator size="large" color="#1E88E5" />
                    </View>
                )}

                {errorMessage && (
                    <View className="m-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                        <Text className="text-red-600 text-sm">{errorMessage}</Text>
                    </View>
                )}

                {hasSearched && !hasResults && !isLoading && !errorMessage && (
                    <View className="p-8 items-center justify-center">
                        <Text className="text-gray-500 text-base mb-2 font-medium">
                            Không tìm thấy kết quả
                        </Text>
                        <Text className="text-gray-400 text-sm text-center">
                            Thử tìm kiếm với từ khóa khác
                        </Text>
                    </View>
                )}

                {hasResults && (
                    <View className="pb-8">
                        {executionTimeMs > 0 && (
                            <View className="px-4 py-2 bg-gray-50 flex-row justify-between items-center">
                                <Text className="text-xs text-gray-400">
                                    {results!.totalCount} kết quả · {executionTimeMs}ms
                                </Text>
                                {pendingMatchCount > 0 && (
                                    <TouchableOpacity
                                        className="bg-blue-100 px-2 py-1 rounded-full"
                                        onPress={onMergeNewMatches}
                                    >
                                        <Text className="text-[10px] text-blue-700 font-medium px-1">Có {pendingMatchCount} kết quả mới</Text>
                                    </TouchableOpacity>
                                )}
                            </View>
                        )}

                        {/* Contacts Section */}
                        {(activeTab === 'all' || activeTab === 'contacts') && results!.contacts.length > 0 && (
                            <View>
                                {activeTab === 'all' && (
                                    <View className="px-4 py-2 mt-2">
                                        <Text className="text-sm font-semibold text-gray-700 uppercase">Liên hệ</Text>
                                    </View>
                                )}
                                {results!.contacts.slice(0, activeTab === 'all' ? 5 : undefined).map((c) => (
                                    <ContactResult
                                        key={c.id}
                                        data={c}
                                        onClick={onContactClick}
                                        onSendMessage={onSendMessage}
                                        onAddFriend={onAddFriend}
                                        onAcceptRequest={onAcceptRequest}
                                        onCancelRequest={onCancelRequest}
                                        isLoading={isActionLoading}
                                    />
                                ))}
                                {activeTab === 'all' && results!.contacts.length > 5 && (
                                    <TouchableOpacity
                                        className="py-3 items-center border-b border-gray-100"
                                        onPress={() => onTabChange('contacts')}
                                    >
                                        <Text className="text-[#1E88E5] font-medium">Xem thêm</Text>
                                    </TouchableOpacity>
                                )}
                            </View>
                        )}

                        {/* Groups Section */}
                        {(activeTab === 'all' || activeTab === 'groups') && results!.groups.length > 0 && (
                            <View>
                                {activeTab === 'all' && (
                                    <View className="px-4 py-2 mt-2">
                                        <Text className="text-sm font-semibold text-gray-700 uppercase">Nhóm</Text>
                                    </View>
                                )}
                                {results!.groups.slice(0, activeTab === 'all' ? 5 : undefined).map((g) => (
                                    <GroupResult key={g.id} data={g} onClick={onGroupClick} />
                                ))}
                                {activeTab === 'all' && results!.groups.length > 5 && (
                                    <TouchableOpacity
                                        className="py-3 items-center border-b border-gray-100"
                                        onPress={() => onTabChange('groups')}
                                    >
                                        <Text className="text-[#1E88E5] font-medium">Xem thêm</Text>
                                    </TouchableOpacity>
                                )}
                            </View>
                        )}

                        {/* Messages Section */}
                        {(activeTab === 'all' || activeTab === 'messages') && (results!.conversationMessages?.length ?? 0) > 0 && (
                            <View>
                                {activeTab === 'all' && (
                                    <View className="px-4 py-2 mt-2">
                                        <Text className="text-sm font-semibold text-gray-700 uppercase">Tin nhắn</Text>
                                    </View>
                                )}
                                {(results!.conversationMessages ?? []).slice(0, activeTab === 'all' ? 5 : undefined).map((m) => (
                                    <ConversationSearchResult
                                        key={m.conversationId}
                                        data={m}
                                        onClick={onConversationMessageClick}
                                    />
                                ))}
                                {activeTab === 'all' && (results!.conversationMessages?.length ?? 0) > 5 && (
                                    <TouchableOpacity
                                        className="py-3 items-center border-b border-gray-100"
                                        onPress={() => onTabChange('messages')}
                                    >
                                        <Text className="text-[#1E88E5] font-medium">Xem thêm</Text>
                                    </TouchableOpacity>
                                )}
                            </View>
                        )}

                        {/* Media Section */}
                        {(activeTab === 'all' || activeTab === 'media') && results!.media.length > 0 && (
                            <View>
                                {activeTab === 'all' && (
                                    <View className="px-4 py-2 mt-2">
                                        <Text className="text-sm font-semibold text-gray-700 uppercase">Ảnh, Video, File</Text>
                                    </View>
                                )}
                                <MediaResultGrid
                                    items={results!.media}
                                    onItemClick={onMediaClick}
                                    limit={activeTab === 'all' ? 5 : undefined}
                                />
                                {activeTab === 'all' && results!.media.length > 5 && (
                                    <TouchableOpacity
                                        className="py-3 items-center"
                                        onPress={() => onTabChange('media')}
                                    >
                                        <Text className="text-[#1E88E5] font-medium">Xem thêm</Text>
                                    </TouchableOpacity>
                                )}
                            </View>
                        )}
                    </View>
                )}
            </ScrollView>
        </View>
    );
}

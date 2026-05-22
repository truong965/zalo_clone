import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Input, message as antMessage } from 'antd';
import { useTranslation } from 'react-i18next';
import type { ChatMessage } from '@/features/chat/types';
import type { PollDetail } from '@/types/api';
import { PollOptionRow } from './poll-option-row';
import { PollDetailModal } from './poll-detail-modal';
import { usePollMutations } from '../hooks/use-poll-mutations';
import { useAuth } from '@/features/auth/hooks/use-auth';

interface PollMessageCardProps {
      msg: ChatMessage;
      onPollUpdated?: (messageId: string, poll: PollDetail) => void;
}

export function PollMessageCard({ msg, onPollUpdated }: PollMessageCardProps) {
      const poll = msg.poll;
      const { t } = useTranslation();
      const { user } = useAuth();
      const { votePoll, addPollOption, closePoll, isVoting, isAddingOption, isClosing } =
            usePollMutations();

      const [localPoll, setLocalPoll] = useState<PollDetail | null>(poll ?? null);
      const [pendingIds, setPendingIds] = useState<string[]>([]);
      const [newOptionText, setNewOptionText] = useState('');
      const [detailOpen, setDetailOpen] = useState(false);

      useEffect(() => {
            if (poll) {
                  setLocalPoll(poll);
                  setPendingIds(poll.myVotedOptionIds);
            }
      }, [poll]);

      const showResults = useMemo(() => {
            if (!localPoll) return false;
            return (
                  localPoll.isClosed ||
                  localPoll.totalVoters > 0 ||
                  localPoll.myVotedOptionIds.length > 0
            );
      }, [localPoll]);

      const applyPoll = useCallback(
            (updated: PollDetail) => {
                  setLocalPoll(updated);
                  setPendingIds(updated.myVotedOptionIds);
                  onPollUpdated?.(msg.id, updated);
            },
            [msg.id, onPollUpdated],
      );

      if (!localPoll) {
            return (
                  <div className="rounded-2xl bg-white border border-gray-100 px-4 py-3 text-gray-500 text-sm">
                        {t('poll.loading')}
                  </div>
            );
      }

      const handleOptionClick = async (optionId: string) => {
            if (localPoll.isClosed) return;

            const alreadyVoted = localPoll.myVotedOptionIds.includes(optionId);

            if (alreadyVoted) {
                  try {
                        const updated = await votePoll({
                              pollId: localPoll.id,
                              params: { toggleOptionId: optionId },
                        });
                        applyPoll(updated);
                  } catch {
                        antMessage.error(t('poll.errorUnvote'));
                  }
                  return;
            }

            if (!localPoll.isMultipleChoices) {
                  setPendingIds([optionId]);
                  return;
            }

            setPendingIds((prev) =>
                  prev.includes(optionId)
                        ? prev.filter((id) => id !== optionId)
                        : [...prev, optionId],
            );
      };

      const handleSubmitVote = async () => {
            if (localPoll.isClosed || pendingIds.length === 0) return;
            try {
                  const updated = await votePoll({
                        pollId: localPoll.id,
                        params: { optionIds: pendingIds },
                  });
                  applyPoll(updated);
            } catch {
                  antMessage.error(t('poll.errorVote'));
            }
      };

      const handleAddOption = async () => {
            const text = newOptionText.trim();
            if (!text) return;
            try {
                  const updated = await addPollOption({ pollId: localPoll.id, text });
                  setNewOptionText('');
                  applyPoll(updated);
            } catch {
                  antMessage.error(t('poll.errorAddOption'));
            }
      };

      const handleClose = async () => {
            try {
                  const updated = await closePoll(localPoll.id);
                  applyPoll(updated);
            } catch {
                  antMessage.error(t('poll.errorClose'));
            }
      };

      const canSubmit =
            !localPoll.isClosed &&
            pendingIds.length > 0 &&
            (localPoll.isMultipleChoices
                  ? JSON.stringify([...pendingIds].sort()) !==
                    JSON.stringify([...localPoll.myVotedOptionIds].sort())
                  : pendingIds[0] !== localPoll.myVotedOptionIds[0]);

      return (
            <>
                  <div className="rounded-2xl bg-white border border-gray-100 shadow-sm px-4 py-3 max-w-[360px] w-full">
                        <p className="font-semibold text-[15px] text-gray-900 mb-1">
                              {localPoll.question}
                        </p>
                        <p className="text-[12px] text-gray-400 mb-3">
                              {localPoll.isMultipleChoices
                                    ? t('poll.multipleChoice')
                                    : t('poll.singleChoice')}
                              {localPoll.isClosed ? ` · ${t('poll.closed')}` : ''}
                        </p>

                        <div className="space-y-2">
                              {localPoll.options.map((opt) => (
                                    <PollOptionRow
                                          key={opt.id}
                                          option={opt}
                                          isMultiple={localPoll.isMultipleChoices}
                                          isClosed={localPoll.isClosed}
                                          isSelected={
                                                localPoll.isClosed
                                                      ? localPoll.myVotedOptionIds.includes(opt.id)
                                                      : pendingIds.includes(opt.id)
                                          }
                                          hasVoted={localPoll.myVotedOptionIds.includes(opt.id)}
                                          onSelect={() => void handleOptionClick(opt.id)}
                                          showResults={showResults}
                                    />
                              ))}
                        </div>

                        {localPoll.allowAddOptions && !localPoll.isClosed && (
                              <div className="flex gap-2 mt-3">
                                    <Input
                                          size="small"
                                          placeholder={t('poll.addOptionModal.placeholder')}
                                          value={newOptionText}
                                          onChange={(e) => setNewOptionText(e.target.value)}
                                          onPressEnter={() => void handleAddOption()}
                                    />
                                    <Button
                                          size="small"
                                          loading={isAddingOption}
                                          onClick={() => void handleAddOption()}
                                    >
                                          {t('poll.addOptionModal.confirm')}
                                    </Button>
                              </div>
                        )}

                        <div className="flex items-center justify-between mt-3 pt-2 border-t border-gray-50">
                              <button
                                    type="button"
                                    className="text-[13px] text-blue-600 hover:underline"
                                    onClick={() => setDetailOpen(true)}
                              >
                                    {t('poll.viewDetail')}
                              </button>
                              <div className="flex gap-2">
                                    {!localPoll.isClosed && (
                                          <Button
                                                type="primary"
                                                size="small"
                                                loading={isVoting}
                                                disabled={!canSubmit}
                                                onClick={() => void handleSubmitVote()}
                                          >
                                                {t('poll.vote')}
                                          </Button>
                                    )}
                              </div>
                        </div>

                        {!localPoll.isClosed && user?.id === localPoll.creatorId && (
                              <button
                                    type="button"
                                    className="text-[12px] text-gray-400 hover:text-gray-600 mt-2"
                                    disabled={isClosing}
                                    onClick={() => void handleClose()}
                              >
                                    {t('poll.closePoll')}
                              </button>
                        )}
                  </div>

                  <PollDetailModal
                        open={detailOpen}
                        onClose={() => setDetailOpen(false)}
                        poll={localPoll}
                  />
            </>
      );
}

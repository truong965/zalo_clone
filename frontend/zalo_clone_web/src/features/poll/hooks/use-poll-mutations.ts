import { useMutation } from '@tanstack/react-query';
import { pollApi } from '../api/poll.api';
import type { CreatePollParams, VotePollParams } from '@/types/api';

export function usePollMutations() {
      const createMutation = useMutation({
            mutationFn: (params: CreatePollParams) => pollApi.createPoll(params),
      });

      const voteMutation = useMutation({
            mutationFn: ({ pollId, params }: { pollId: string; params: VotePollParams }) =>
                  pollApi.votePoll(pollId, params),
      });

      const addOptionMutation = useMutation({
            mutationFn: ({ pollId, text }: { pollId: string; text: string }) =>
                  pollApi.addPollOption(pollId, text),
      });

      const closeMutation = useMutation({
            mutationFn: (pollId: string) => pollApi.closePoll(pollId),
      });

      return {
            createPoll: createMutation.mutateAsync,
            votePoll: voteMutation.mutateAsync,
            addPollOption: addOptionMutation.mutateAsync,
            closePoll: closeMutation.mutateAsync,
            isCreating: createMutation.isPending,
            isVoting: voteMutation.isPending,
            isAddingOption: addOptionMutation.isPending,
            isClosing: closeMutation.isPending,
      };
}

import { API_ENDPOINTS } from '@/constants/api-endpoints';
import apiClient from '@/lib/axios';
import type {
      ApiResponse,
      CreatePollParams,
      CreatePollResponse,
      PollDetail,
      VotePollParams,
} from '@/types/api';

async function createPoll(params: CreatePollParams): Promise<CreatePollResponse> {
      const response = await apiClient.post<ApiResponse<CreatePollResponse>>(
            API_ENDPOINTS.POLLS.BASE,
            params,
      );
      return response.data.data;
}

async function getPollById(id: string): Promise<PollDetail> {
      const response = await apiClient.get<ApiResponse<PollDetail>>(
            API_ENDPOINTS.POLLS.BY_ID(id),
      );
      return response.data.data;
}

async function votePoll(id: string, params: VotePollParams): Promise<PollDetail> {
      const body =
            params.toggleOptionId != null
                  ? { toggleOptionId: params.toggleOptionId }
                  : { optionIds: params.optionIds ?? [] };
      const response = await apiClient.post<ApiResponse<PollDetail>>(
            API_ENDPOINTS.POLLS.VOTE(id),
            body,
      );
      return response.data.data;
}

async function addPollOption(id: string, text: string): Promise<PollDetail> {
      const response = await apiClient.post<ApiResponse<PollDetail>>(
            API_ENDPOINTS.POLLS.OPTIONS(id),
            { text },
      );
      return response.data.data;
}

async function closePoll(id: string): Promise<PollDetail> {
      const response = await apiClient.patch<ApiResponse<PollDetail>>(
            API_ENDPOINTS.POLLS.CLOSE(id),
      );
      return response.data.data;
}

export const pollApi = {
      createPoll,
      getPollById,
      votePoll,
      addPollOption,
      closePoll,
};

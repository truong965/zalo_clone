import { create } from 'zustand';

export interface LoginRequestData {
  pendingToken: string;
  deviceName: string;
  location?: string;
  ipAddress?: string;
  timestamp: string;
}

interface LoginApprovalState {
  activeRequest: LoginRequestData | null;
  isOpen: boolean;
  
  // Actions
  showRequest: (data: LoginRequestData) => void;
  dismissRequest: () => void;
}

export const useLoginApprovalStore = create<LoginApprovalState>((set) => ({
  activeRequest: null,
  isOpen: false,

  showRequest: (data) => set({ activeRequest: data, isOpen: true }),
  dismissRequest: () => set({ activeRequest: null, isOpen: false }),
}));

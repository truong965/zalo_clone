import { create } from 'zustand';

export type SyncStatus = 'idle' | 'confirming' | 'syncing' | 'processing' | 'success' | 'error' | 'ratelimited';

interface ContactSyncState {
  status: SyncStatus;
  isVisible: boolean;
  totalContacts: number;
  processedContacts: number;
  error: string | null;
  isBackgroundProcessing: boolean;
  
  // Actions
  showConfirm: () => void;
  startSync: () => void;
  setProcessing: () => void; // Transition to server-side processing
  setBackgroundProcessing: (processing: boolean) => void;
  setProgress: (processed: number, total: number) => void;
  setSuccess: () => void;
  setError: (message: string) => void;
  setRateLimited: (message?: string) => void;
  hideModal: () => void;
  showModal: () => void;
  reset: () => void;
}

export const useContactSyncStore = create<ContactSyncState>((set) => ({
  status: 'idle',
  isVisible: false,
  totalContacts: 0,
  processedContacts: 0,
  error: null,
  isBackgroundProcessing: false,

  showConfirm: () => set({ status: 'confirming', isVisible: true, error: null }),
  
  startSync: () => set({ 
    status: 'syncing', 
    isVisible: true,
    processedContacts: 0, 
    totalContacts: 0, 
    error: null 
  }),

  setProcessing: () => set((state) => {
    // SECURITY: If we already reached SUCCESS (race condition), do NOT revert to processing
    if (state.status === 'success') return {};
    return {
      status: 'processing',
      isBackgroundProcessing: true
    };
  }),

  setBackgroundProcessing: (processing) => set({ isBackgroundProcessing: processing }),
  
  setProgress: (processed, total) => set({ 
    processedContacts: processed, 
    totalContacts: total 
  }),
  
  setSuccess: () => {
    set((state) => {
      // If already success, or we're in a middle of another manual sync (shouldn't happen but safe)
      if (state.status === 'success') return {};
      return { status: 'success', isBackgroundProcessing: false, isVisible: true };
    });
    
    // Auto hide after 3 seconds if it was just a success notification
    setTimeout(() => {
      set((state) => (state.status === 'success' ? { isVisible: false, status: 'idle' } : {}));
    }, 3000);
  },
  
  setError: (message) => set({ status: 'error', error: message, isVisible: true, isBackgroundProcessing: false }),
  
  setRateLimited: (message) => set({ 
    status: 'ratelimited', 
    error: message || 'Bạn đã thực hiện đồng bộ hôm nay. Vui lòng quay lại sau 24 giờ.', 
    isVisible: true 
  }),
  
  hideModal: () => set({ isVisible: false }),
  
  showModal: () => set({ isVisible: true }),

  reset: () => set({ 
    status: 'idle', 
    isVisible: false,
    error: null, 
    totalContacts: 0, 
    processedContacts: 0,
    isBackgroundProcessing: false 
  }),
}));

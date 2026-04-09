import * as Contacts from 'expo-contacts';
import * as Crypto from 'expo-crypto';
import { isValidPhoneNumber, parsePhoneNumber } from 'libphonenumber-js';
import { useState } from 'react';
import { Alert, Linking } from 'react-native';
import Toast from 'react-native-toast-message';
import { mobileApi } from '@/services/api';
import { ContactItemDto } from '@/types/contact';
import { useAuth } from '@/providers/auth-provider';

import { useContactSyncStore } from '../stores/contact-sync.store';

export const useSyncContacts = () => {
  const { accessToken } = useAuth();
  
  const { 
    showConfirm, 
    startSync, 
    setProcessing,
    setBackgroundProcessing,
    setProgress, 
    setSuccess, 
    setError, 
    setRateLimited,
    hideModal,
    status: syncStatus 
  } = useContactSyncStore();


  const normalizeAndHash = async (phoneNumber: string): Promise<string | null> => {
    try {
      if (!isValidPhoneNumber(phoneNumber, 'VN')) return null;
      const parsed = parsePhoneNumber(phoneNumber, { defaultCountry: 'VN' });
      const e164 = parsed.format('E.164');
      const hash = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, e164);
      return hash.toLowerCase();
    } catch (error) {
      return null;
    }
  };

  /**
   * Action triggered from UI button - shows confirmation dialog first
   */
  const performSync = () => {
    showConfirm();
  };

  /**
   * Internal action triggered after user confirms in the modal
   */
  const performSyncSync = async () => {
    if (!accessToken) return;
    
    startSync();
    try {
      // 1. FAST FAIL: Check rate limit on backend BEFORE local processing
      try {
        await mobileApi.checkSyncRateLimit(accessToken);
      } catch (err: any) {
        if (err.status === 429) {
          setRateLimited(err.message || 'Bạn đã thực hiện đồng bộ hôm nay. Vui lòng quay lại sau.');
          return;
        }
        throw err;
      }

      // 2. Permissions check
      const { status: currentStatus, canAskAgain } = await Contacts.getPermissionsAsync();
      let finalStatus = currentStatus;

      if (currentStatus !== 'granted') {
        if (canAskAgain) {
          const { status: requestedStatus } = await Contacts.requestPermissionsAsync();
          finalStatus = requestedStatus;
        } else {
          setError('Vui lòng cấp quyền truy cập danh bạ trong Cài đặt để tiếp tục.');
          return;
        }
      }

      if (finalStatus !== 'granted') {
        setError('Ứng dụng không có quyền truy cập danh bạ.');
        return;
      }

      // 3. Fetch contacts
      const { data } = await Contacts.getContactsAsync({
        fields: [Contacts.Fields.PhoneNumbers, Contacts.Fields.FirstName, Contacts.Fields.LastName],
      });

      if (data.length === 0) {
        setError('Danh bạ của bạn hiện đang trống.');
        return;
      }

      setProgress(0, data.length);

      const syncItems: ContactItemDto[] = [];
      let processed = 0;

      // 4. Process batches (Local normalization is still fast)
      for (const contact of data) {
        processed++;
        if (processed % 20 === 0) {
          setProgress(processed, data.length);
        }

        if (!contact.phoneNumbers || contact.phoneNumbers.length === 0) continue;
        const name = [contact.firstName, contact.lastName].filter(Boolean).join(' ');

        for (const phoneItem of contact.phoneNumbers) {
          if (!phoneItem.number) continue;
          const hash = await normalizeAndHash(phoneItem.number);
          if (hash) {
            syncItems.push({
              phoneHash: hash,
              phoneBookName: name || undefined,
            });
          }
        }
      }

      if (syncItems.length > 0) {
        const limitedItems = syncItems.slice(0, 1000);
        try {
          // 5. Send to backend (Asynchronous Job)
          setProcessing(); // Set processing state early
          await mobileApi.syncContacts(limitedItems, accessToken);
          
          // 6. Hide modal (Processing banner remains)
          hideModal();
          
          // Check if it's already done (fast-tracked by socket/fcm listener)
          const currentStatus = useContactSyncStore.getState().status;
          if (currentStatus !== 'success' && currentStatus !== 'idle') {
            Toast.show({
              type: 'info',
              text1: 'Đang xử lý ngầm',
              text2: 'Danh bạ của bạn đang được đồng bộ ngầm. Bạn có thể tiếp tục sử dụng ứng dụng.',
            });
          }
        } catch (apiError: any) {
          if (apiError.status === 429) {
            setRateLimited(apiError.message);
          } else {
            throw apiError;
          }
        }
      } else {
        hideModal(); // No contacts to sync
      }
    } catch (error: any) {
      console.error('Contact sync error:', error);
      setError(error.message || 'Đã có lỗi xảy ra khi đồng bộ danh bạ. Vui lòng thử lại sau.');
    }
  };

  return {
    isSyncing: syncStatus === 'syncing',
    performSync,
    performSyncSync,
  };
};

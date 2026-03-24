import { useState, useEffect } from 'react';
import { getFullUrl } from '@/utils/url-helpers';
import { MessageMediaAttachmentItem } from '@/types/message';

export type MediaErrorType = 'FAILED' | 'RESOURCE_ERROR' | 'NONE';

export interface UseMediaResourceOptions {
  onResourceError?: () => void;
  useFullRes?: boolean; // If true, prefers cdnUrl/optimizedUrl over thumbnailUrl
}

export function useMediaResource(
  attachment: MessageMediaAttachmentItem | any,
  options?: UseMediaResourceOptions
) {
  const [isResourceError, setIsResourceError] = useState(false);

  const processingStatus = attachment.processingStatus;
  const isProcessing = ['PENDING', 'UPLOADED', 'CONFIRMED', 'PROCESSING'].includes(processingStatus);
  const isFailedInDB = processingStatus === 'FAILED' || processingStatus === 'EXPIRED' || !!attachment.deletedAt;
  
  const useFullRes = options?.useFullRes ?? false;
  
  const rawSrc = useFullRes
    ? (attachment.optimizedUrl || attachment.cdnUrl || attachment.thumbnailUrl || attachment._localUrl)
    : (attachment.thumbnailUrl || attachment.optimizedUrl || attachment.cdnUrl || attachment._localUrl);
    
  const src = getFullUrl(rawSrc);

  const isError = isFailedInDB || isResourceError;
  const errorType: MediaErrorType = isFailedInDB ? 'FAILED' : isResourceError ? 'RESOURCE_ERROR' : 'NONE';

  // For Type 2 error detection (403/404)
  // Non-image components can call this manually or we can trigger it optionally
  const checkResource = async () => {
    if (!src || isFailedInDB) return;
    
    try {
      const response = await fetch(src, { method: 'HEAD' });
      if (response.status === 403 || response.status === 404) {
        setIsResourceError(true);
        options?.onResourceError?.();
      }
    } catch (err) {
      // Network error or other, might not be a 404
      console.warn('Resource check failed:', err);
    }
  };

  const setResourceError = (value: boolean) => {
    setIsResourceError(true);
    if (value) options?.onResourceError?.();
  };

  return {
    isProcessing,
    isError,
    errorType,
    src,
    checkResource,
    setResourceError,
  };
}

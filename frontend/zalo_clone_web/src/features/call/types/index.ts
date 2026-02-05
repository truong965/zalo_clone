/**
 * Types cho Call module
 */

import type { Call } from '@/types';

export type { Call };

export interface CallState {
  activeCall: Call | null;
  incomingCall: Call | null;
  isRinging: boolean;
  isMuted: boolean;
  isVideoEnabled: boolean;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  error: string | null;
}

export interface InitiateCallRequest {
  receiverId: string;
  type: 'audio' | 'video';
}

export interface WebRTCOffer {
  from: string;
  offer: RTCSessionDescription;
}

export interface WebRTCAnswer {
  from: string;
  answer: RTCSessionDescription;
}

export interface WebRTCIceCandidate {
  from: string;
  candidate: RTCIceCandidate;
}

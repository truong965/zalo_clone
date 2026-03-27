import { IsBoolean, IsUUID } from 'class-validator';

/**
 * DTO for relaying camera/mute state between call participants.
 * Used to sync media state cross-platform (web ↔ mobile) where
 * WebRTC track.muted/unmute events are unreliable.
 */
export class CallMediaStateDto {
  @IsUUID()
  callId: string;

  @IsBoolean()
  cameraOff: boolean;

  @IsBoolean()
  muted: boolean;
}

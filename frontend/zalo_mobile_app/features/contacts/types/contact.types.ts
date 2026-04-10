export enum ContactSource {
  MANUAL = 'MANUAL',
  PHONE_SYNC = 'PHONE_SYNC',
}

export interface ContactItemDto {
  phoneHash: string;
  phoneBookName?: string;
}

export interface SyncContactsDto {
  contacts: ContactItemDto[];
}

export interface ContactResponseDto {
  id: string; // UserContact ID
  contactUserId: string;
  displayName: string; // Resolved name: Alias > PhoneBookName > DisplayName
  avatarUrl?: string;
  aliasName?: string;
  phoneBookName?: string;
  source: ContactSource;
  isFriend: boolean;
  isMutual: boolean; // Computed field: both have each other's number
  lastSeenAt?: string;
}

// ─── Source of a contact entry ───────────────────────────────────────────────
export type ContactSource = 'PHONE_SYNC' | 'MANUAL';

// ─── GET /contacts/check/:targetUserId ───────────────────────────────────────
export interface ContactCheckResult {
      isContact: boolean;
      contactUserId: string;
      /** Custom name the owner gave this contact */
      aliasName: string | null;
      /** Name as saved in the phone book (from sync) */
      phoneBookName: string | null;
      source: ContactSource | null;
}

// ─── Contact list item (GET /contacts) ───────────────────────────────────────
export interface ContactResponseDto {
      id: string;
      contactUserId: string;
      /** Resolved display name: aliasName ?? phoneBookName ?? displayName */
      displayName: string;
      aliasName: string | null;
      phoneBookName: string | null;
      source: ContactSource;
      avatarUrl: string | null;
      isFriend: boolean;
      lastSeenAt: string | null;
}

// ─── PATCH /contacts/:contactUserId/alias ────────────────────────────────────
export interface UpdateAliasBody {
      /** Pass null to clear the alias */
      aliasName: string | null;
}

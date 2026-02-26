/**
 * Calls Page — now delegates to CallHistoryList.
 */

import { CallHistoryList } from '@/features/call/components/CallHistoryList';

export function CallsPage() {
      return (
            <div className="h-full overflow-hidden">
                  <CallHistoryList />
            </div>
      );
}

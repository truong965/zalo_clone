/**
 * SearchLoading — Skeleton loading state for search results
 */

import { Skeleton } from 'antd';

interface SearchLoadingProps {
      /** Number of skeleton items to show */
      count?: number;
}

export function SearchLoading({ count = 5 }: SearchLoadingProps) {
      return (
            <div className="flex flex-col gap-1 p-2">
                  {Array.from({ length: count }).map((_, i) => (
                        <div key={i} className="flex items-center gap-3 px-3 py-3">
                              <Skeleton.Avatar active size={40} />
                              <div className="flex-1 min-w-0">
                                    <Skeleton.Input active size="small" block style={{ height: 16, marginBottom: 6 }} />
                                    <Skeleton.Input active size="small" block style={{ height: 12, width: '70%' }} />
                              </div>
                        </div>
                  ))}
            </div>
      );
}

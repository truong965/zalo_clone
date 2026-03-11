import { Spin } from 'antd';

export function PageSkeleton() {
      return (
            <div className="flex items-center justify-center h-full min-h-[200px]">
                  <Spin size="large" />
            </div>
      );
}

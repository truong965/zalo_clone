/**
 * Permission Denied Page
 */

import { Result, Button } from 'antd';
import { useNavigate } from 'react-router-dom';

export function PermissionDeniedPage() {
  const navigate = useNavigate();

  return (
    <div className="h-screen flex items-center justify-center">
      <Result
        status="403"
        title="403"
        subTitle="You don't have permission to access this page."
        extra={
          <Button type="primary" onClick={() => navigate('/chat')}>
            Back to Home
          </Button>
        }
      />
    </div>
  );
}

/**
 * Not Found Page
 */

import { Result, Button } from 'antd';
import { useNavigate } from 'react-router-dom';

export function NotFoundPage() {
      const navigate = useNavigate();

      return (
            <div className="h-screen flex items-center justify-center">
                  <Result
                        status="404"
                        title="404"
                        subTitle="Sorry, the page you are looking for does not exist."
                        extra={
                              <Button type="primary" onClick={() => navigate('/chat')}>
                                    Back to Home
                              </Button>
                        }
                  />
            </div>
      );
}

/**
 * Not Found Page
 */

import { Result, Button } from 'antd';
import { useNavigate } from 'react-router-dom';
import { ROUTES } from '@/config/routes';

export function NotFoundPage() {
      const navigate = useNavigate();

      return (
            <div className="h-screen flex items-center justify-center">
                  <Result
                        status="404"
                        title="404"
                        subTitle="Sorry, the page you are looking for does not exist."
                        extra={
                              <Button type="primary" onClick={() => navigate(ROUTES.CHAT)}>
                                    Back to Home
                              </Button>
                        }
                  />
            </div>
      );
}

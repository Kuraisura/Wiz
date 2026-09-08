import { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';

export default function PageNotFound() {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated } = useAuth();
  const pageName = location.pathname.substring(1);

  useEffect(() => {
    // If the path looks like an OAuth error, redirect to login immediately
    if (pageName.includes("error=") || pageName.includes("access_denied")) {
      navigate("/login", { replace: true });
      return;
    }
  }, [pageName, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background">
      <div className="max-w-md w-full">
        <div className="text-center space-y-6">
          <div className="space-y-2">
            <h1 className="text-7xl font-light text-muted-foreground/40">404</h1>
            <div className="h-0.5 w-16 bg-border mx-auto"></div>
          </div>
          <div className="space-y-3">
            <h2 className="text-2xl font-medium text-foreground">
              Page Not Found
            </h2>
            <p className="text-muted-foreground leading-relaxed">
              The page you're looking for doesn't exist.
            </p>
          </div>
          <div className="pt-6">
            <button
              onClick={() => {
                if (isAuthenticated) {
                  navigate("/");
                } else {
                  navigate("/login");
                }
              }}
              className="inline-flex items-center px-4 py-2 text-sm font-medium text-foreground bg-secondary border border-border rounded-lg hover:bg-secondary/80 transition-colors duration-200"
            >
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
              </svg>
              {isAuthenticated ? "Go Home" : "Back to Sign In"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

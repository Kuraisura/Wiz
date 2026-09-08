import { Toaster } from "@/components/ui/sonner"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { HashRouter as Router, Route, Routes, useLocation, Navigate } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import ScrollToTop from './components/ScrollToTop';
import ProtectedRoute from '@/components/ProtectedRoute';
import Login from '@/pages/Login';
import Register from '@/pages/Register';
import ForgotPassword from '@/pages/ForgotPassword';
import ResetPassword from '@/pages/ResetPassword';
import AppLayout from '@/components/wiz/AppLayout';
import Create from '@/pages/Create';
import Quizzes from '@/pages/Quizzes';
import Flashcards from '@/pages/Flashcards';
import Library from '@/pages/Library';
import Profile from '@/pages/Profile';
import Subscription from '@/pages/Subscription';
import QuizSession from '@/pages/quiz/QuizSession';
import HelpCenter from '@/pages/HelpCenter';
import Feedback from '@/pages/Feedback';
import ScanToQuiz from '@/pages/ScanToQuiz';
import React, { useEffect, Component } from 'react';
import OfflineBanner from './components/OfflineBanner';

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error) {
    console.warn('[ErrorBoundary] Caught:', error.message);
  }
  render() {
    if (this.state.hasError) {
      return this.props.fallback || null;
    }
    return this.props.children;
  }
}

function AnimatedRoutes() {
  const location = useLocation();

  return (
    <Routes location={location}>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route element={<ProtectedRoute unauthenticatedElement={<Navigate to="/login" replace />} />}>
        <Route element={<AppLayout />}>
          <Route path="/" element={<Create />} />
          <Route path="/quizzes" element={<Quizzes />} />
          <Route path="/quiz/:id" element={<QuizSession />} />
          <Route path="/flashcards" element={<Flashcards />} />
          <Route path="/library" element={<Library />} />
        </Route>
        <Route path="/profile" element={<Profile />} />
        <Route path="/subscription" element={<Subscription />} />
        <Route path="/scan" element={<ScanToQuiz />} />
        <Route path="/help-center" element={<HelpCenter />} />
        <Route path="/feedback" element={<Feedback />} />
      </Route>
      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
}

const AuthenticatedApp = () => {
  const { isLoadingAuth, authError, user, profile } = useAuth();

  useEffect(() => {
    const theme = profile?.theme || 'system';
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else if (theme === 'light') {
      document.documentElement.classList.remove('dark');
    } else {
      if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    }
  }, [profile?.theme]);

  if (isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
      </div>
    );
  }

  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    }
  }

  return (
    <ErrorBoundary fallback={<div className="flex justify-center pt-24 text-muted-foreground">Something went wrong. Please try again.</div>}>
      <AnimatedRoutes />
    </ErrorBoundary>
  );
};

function App() {
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <ScrollToTop />
          <OfflineBanner />
          <AuthenticatedApp />
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App

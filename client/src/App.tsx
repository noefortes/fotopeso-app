import { Switch, Route, useLocation, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";
import { useTranslation } from "@/hooks/useTranslation";
import { useEffect } from "react";
import { MarketProvider } from "@/contexts/MarketProvider";
import Auth from "@/pages/auth";
import SignupPage from "@/pages/signup";
import NotFound from "@/pages/not-found";
import Landing from "@/pages/landing";

import Home from "@/pages/home";
import Analytics from "@/pages/analytics";
import AnalyticsUpgrade from "@/pages/analytics-upgrade";
import Profile from "@/pages/profile";
import Settings from "@/pages/settings";
import Admin from "@/pages/admin";
import Privacy from "@/pages/privacy";
import Terms from "@/pages/terms";
import DataDeletion from "@/pages/data-deletion";
import VerifyEmail from "@/pages/verify-email";
import ResetPasswordPage from "@/pages/reset-password";
import SubscriptionSuccess from "@/pages/subscription-success";
import SubscriptionCancel from "@/pages/subscription-cancel";
import EmailVerificationWrapper from "@/components/EmailVerificationWrapper";


function Router() {
  const { isAuthenticated, isLoading, user } = useAuth();
  const [location] = useLocation();


  // Show loading state during authentication check
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  // If not authenticated, show landing, auth page, or admin (admin doesn't require auth)
  if (!isAuthenticated) {
    return (
      <Switch>
        <Route path="/" component={Landing} />
        <Route path="/auth" component={Auth} />
        <Route path="/signup" component={SignupPage} />
        <Route path="/verify-email" component={VerifyEmail} />
        <Route path="/admin" component={Admin} />
        <Route path="/privacy" component={Privacy} />
        <Route path="/terms" component={Terms} />
        <Route path="/data-deletion" component={DataDeletion} />
        <Route path="/reset-password/:token" component={ResetPasswordPage} />
        <Route path="/reset-password" component={ResetPasswordPage} />
        <Route component={Landing} />
      </Switch>
    );
  }

  // Authenticated routing with email verification wrapper
  return (
    <EmailVerificationWrapper>
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/history"><Redirect to="/settings" /></Route>
        <Route path="/analytics" component={Analytics} />
        <Route path="/analytics-upgrade" component={AnalyticsUpgrade} />
        <Route path="/subscription/success" component={SubscriptionSuccess} />
        <Route path="/subscription/cancel" component={SubscriptionCancel} />
        <Route path="/profile" component={Profile} />
        <Route path="/settings" component={Settings} />
        <Route path="/verify-email" component={VerifyEmail} />
        <Route path="/admin" component={Admin} />
        <Route path="/privacy" component={Privacy} />
        <Route path="/terms" component={Terms} />
        <Route path="/data-deletion" component={DataDeletion} />
        <Route component={NotFound} />
      </Switch>
    </EmailVerificationWrapper>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <MarketProvider>
        <AppTitleUpdater />
        <TooltipProvider>
          <Toaster />

          <Router />
        </TooltipProvider>
      </MarketProvider>
    </QueryClientProvider>
  );
}

function AppTitleUpdater() {
  const { t } = useTranslation();
  
  useEffect(() => {
    document.title = `${t('brand.name')} - ${t('brand.browserTabTagline')}`;
  }, [t]);
  
  return null;
}

export default App;

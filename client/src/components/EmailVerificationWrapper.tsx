import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useLocation } from "wouter";

interface EmailVerificationWrapperProps {
  children: React.ReactNode;
}

export default function EmailVerificationWrapper({ children }: EmailVerificationWrapperProps) {
  const { user } = useAuth();
  const [location, navigate] = useLocation();
  const [isLoading, setIsLoading] = useState(true);
  
  // Check if user has skipped verification (stored in localStorage)
  const hasSkippedVerification = () => {
    try {
      return localStorage.getItem('email-verification-skipped') === 'true';
    } catch {
      return false;
    }
  };
  
  // Routes that require email verification even if user has skipped
  const premiumRoutes = [
    '/analytics',
    '/analytics-upgrade'
  ];
  
  // Check if current route requires verification
  const requiresVerification = premiumRoutes.some(route => location.startsWith(route));

  // Check if user needs email verification
  const { data: verificationStatus, isError } = useQuery<{ needsVerification: boolean }>({
    queryKey: ["/api/email-verification/status"],
    enabled: !!user,
    retry: false,
  });

  useEffect(() => {
    // Set loading to false once we have verification status, user is not authenticated, or query errors
    if (!user || verificationStatus !== undefined || isError) {
      setIsLoading(false);
    }
  }, [user, verificationStatus, isError]);

  useEffect(() => {
    if (!user || location === "/verify-email") {
      return;
    }
    
    // Always allow these pages regardless of verification status
    const alwaysAllowedPages = ["/admin", "/privacy", "/terms", "/data-deletion"];
    if (alwaysAllowedPages.some(page => location.startsWith(page))) {
      return;
    }
    
    // CRITICAL SECURITY: Block premium routes on API error
    if (isError && requiresVerification) {
      const params = new URLSearchParams();
      params.set('reason', 'error');
      params.set('from', location);
      navigate(`/verify-email?${params.toString()}`);
      return;
    }
    
    // If we have verification status and user needs verification
    if (verificationStatus?.needsVerification) {
      // If user hasn't skipped OR is trying to access premium features, redirect to verification
      if (!hasSkippedVerification() || requiresVerification) {
        // Add helpful context for the redirect
        const params = new URLSearchParams();
        if (requiresVerification) {
          params.set('reason', 'premium');
          params.set('from', location);
        }
        const redirectUrl = params.toString() ? `/verify-email?${params.toString()}` : '/verify-email';
        navigate(redirectUrl);
      }
    }
  }, [user, verificationStatus, location, navigate, requiresVerification, isError]);

  // Show loading state while checking verification status (but not on verify-email page)
  if (isLoading && user && location !== "/verify-email") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
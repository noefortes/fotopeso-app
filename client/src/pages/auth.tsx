import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Eye, EyeOff, TrendingDown } from "lucide-react";
import { FaGoogle, FaApple, FaFacebook } from "react-icons/fa";
import { FaXTwitter } from "react-icons/fa6";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { useTranslation } from "@/hooks/useTranslation";

export default function Auth() {
  const [isSignUp, setIsSignUp] = useState(false);
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [resetEmailSent, setResetEmailSent] = useState(false);
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const { t } = useTranslation();
  
  // Check for return URL parameter (for redirecting after login)
  const urlParams = new URLSearchParams(window.location.search);
  const returnUrl = urlParams.get('returnUrl');
  
  // Get the redirect destination after login
  const getRedirectUrl = () => {
    if (returnUrl) {
      try {
        return decodeURIComponent(returnUrl);
      } catch {
        return "/";
      }
    }
    return "/";
  };

  const loginMutation = useMutation({
    mutationFn: async (data: { email: string; password: string }) => {
      const response = await apiRequest("POST", "/api/auth/login", data);
      return response.json();
    },
    onSuccess: async (userData) => {
      // Set user data immediately in cache to prevent auth state delays
      queryClient.setQueryData(["/api/auth/user"], userData);
      // Also invalidate to ensure fresh data
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      navigate(getRedirectUrl());
    },
    onError: (error: any) => {
      toast({
        title: t('auth.loginFailed'),
        description: t('auth.invalidCredentials'),
        variant: "destructive",
      });
    },
  });

  const registerMutation = useMutation({
    mutationFn: async (data: { email: string; password: string; firstName?: string; lastName?: string }) => {
      const response = await apiRequest("POST", "/api/auth/register", data);
      return response.json();
    },
    onSuccess: async (userData) => {
      // Set user data immediately in cache to prevent auth state delays
      queryClient.setQueryData(["/api/auth/user"], userData);
      // Also invalidate to ensure fresh data
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      navigate(getRedirectUrl());
      toast({
        title: t('auth.welcome'),
        description: t('auth.accountCreatedSuccess'),
      });
    },
    onError: (error: any) => {
      toast({
        title: t('auth.registrationFailed'),
        description: t('auth.couldNotCreateAccount'),
        variant: "destructive",
      });
    },
  });

  const forgotPasswordMutation = useMutation({
    mutationFn: async (data: { email: string }) => {
      // Include the current domain so the backend knows which reset link to generate
      const originDomain = window.location.hostname;
      const response = await apiRequest("POST", "/api/auth/forgot-password", {
        ...data,
        originDomain,
      });
      return response.json();
    },
    onSuccess: () => {
      setResetEmailSent(true);
      toast({
        title: t('auth.resetLinkSent'),
        description: t('auth.checkEmailForReset'),
      });
    },
    onError: (error: any) => {
      toast({
        title: t('auth.error'),
        description: error.message || t('auth.failedToSendReset'),
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (isForgotPassword) {
      if (!email) {
        toast({
          title: t('auth.missingInformation'),
          description: t('auth.enterEmail'),
          variant: "destructive",
        });
        return;
      }
      forgotPasswordMutation.mutate({ email });
      return;
    }

    if (!email || !password) {
      toast({
        title: t('auth.missingInformation'),
        description: t('auth.enterEmailPassword'),
        variant: "destructive",
      });
      return;
    }

    if (isSignUp) {
      registerMutation.mutate({ email, password, firstName, lastName });
    } else {
      loginMutation.mutate({ email, password });
    }
  };

  const handleSocialLogin = (provider: string) => {
    if (provider === "Google") {
      window.location.href = "/api/auth/google";
    } else if (provider === "Apple") {
      window.location.href = "/api/auth/apple";
    } else if (provider === "Facebook") {
      window.location.href = "/api/auth/facebook";
    } else if (provider === "X") {
      window.location.href = "/api/auth/twitter";
    } else {
      // For other providers, show coming soon message
      toast({
        title: t('auth.comingSoon'),
        description: t('auth.providerSoon', { provider }),
      });
    }
  };

  const isLoading = loginMutation.isPending || registerMutation.isPending || forgotPasswordMutation.isPending;

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white flex items-center justify-center p-4">
      <Card className="w-full max-w-sm border-0 shadow-xl">
        <CardContent className="p-6">
          {/* Logo */}
          <div className="flex items-center justify-center space-x-3 mb-8">
            <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center">
              <TrendingDown className="w-6 h-6 text-white" />
            </div>
            <h1 className="text-xl font-bold text-slate-900">{t('brand.name')}</h1>
          </div>

          {/* Forgot Password Form */}
          {isForgotPassword ? (
            <div className="space-y-4">
              {resetEmailSent ? (
                <div className="text-center space-y-4">
                  <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                    <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-semibold text-slate-900">{t('auth.checkYourEmail')}</h3>
                  <p className="text-sm text-slate-600">{t('auth.resetLinkSentTo')} <strong>{email}</strong></p>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={() => {
                      setIsForgotPassword(false);
                      setResetEmailSent(false);
                      setEmail("");
                    }}
                  >
                    {t('auth.backToLogin')}
                  </Button>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="text-center mb-4">
                    <h3 className="text-lg font-semibold text-slate-900">{t('auth.forgotPassword')}</h3>
                    <p className="text-sm text-slate-600 mt-1">{t('auth.enterEmailToReset')}</p>
                  </div>
                  
                  <div>
                    <Label htmlFor="email" className="sr-only">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder={t('auth.email')}
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      disabled={isLoading}
                      required
                      autoComplete="email"
                    />
                  </div>

                  <Button
                    type="submit"
                    className="w-full bg-primary hover:bg-primary/90"
                    disabled={isLoading}
                  >
                    {isLoading ? t('auth.pleaseWait') : t('auth.sendResetLink')}
                  </Button>

                  <Button
                    type="button"
                    variant="ghost"
                    className="w-full"
                    onClick={() => {
                      setIsForgotPassword(false);
                      setEmail("");
                    }}
                    disabled={isLoading}
                  >
                    {t('auth.backToLogin')}
                  </Button>
                </form>
              )}
            </div>
          ) : (
            <>
              {/* Email/Password Form */}
              <form onSubmit={handleSubmit} className="space-y-4">
                {isSignUp && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label htmlFor="firstName" className="sr-only">First Name</Label>
                      <Input
                        id="firstName"
                        type="text"
                        placeholder={t('auth.firstName') || "Nome"}
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                        disabled={isLoading}
                      />
                    </div>
                    <div>
                      <Label htmlFor="lastName" className="sr-only">Last Name</Label>
                      <Input
                        id="lastName"
                        type="text"
                        placeholder={t('auth.lastName') || "Sobrenome"}
                        value={lastName}
                        onChange={(e) => setLastName(e.target.value)}
                        disabled={isLoading}
                      />
                    </div>
                  </div>
                )}

                <div>
                  <Label htmlFor="email" className="sr-only">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder={t('auth.email')}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={isLoading}
                    required
                    autoComplete="email"
                  />
                </div>

                <div className="relative">
                  <Label htmlFor="password" className="sr-only">Password</Label>
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder={t('auth.password')}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={isLoading}
                    required
                    autoComplete={isSignUp ? "new-password" : "current-password"}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-700"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>

                {/* Forgot Password Link - only show on login */}
                {!isSignUp && (
                  <div className="text-right">
                    <button
                      type="button"
                      onClick={() => setIsForgotPassword(true)}
                      className="text-sm text-primary hover:text-primary/80"
                      disabled={isLoading}
                    >
                      {t('auth.forgotPassword')}
                    </button>
                  </div>
                )}

                <Button
                  type="submit"
                  className="w-full bg-primary hover:bg-primary/90"
                  disabled={isLoading}
                >
                  {isLoading ? t('auth.pleaseWait') : (isSignUp ? t('auth.signUp') : t('auth.logIn'))}
                </Button>
              </form>

              {/* Toggle between Sign In and Sign Up */}
              <div className="mt-4 text-center">
                <button
                  onClick={() => setIsSignUp(!isSignUp)}
                  className="text-sm text-slate-600 hover:text-primary"
                  disabled={isLoading}
                >
                  {isSignUp ? t('auth.alreadyHaveAccountLogIn') : t('auth.dontHaveAccountSignUp')}
                </button>
              </div>

              {/* Separator */}
              <div className="relative my-6">
                <Separator />
                <span className="absolute left-1/2 -translate-x-1/2 -top-3 bg-white px-2 text-xs text-slate-500">
                  {t('auth.orContinueWith')}
                </span>
              </div>

              {/* Social Login Buttons */}
              <div className="space-y-3">
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={() => handleSocialLogin("Google")}
                  disabled={isLoading}
                >
                  <FaGoogle className="mr-2 h-4 w-4 text-red-500" />
                  {t('auth.continueWithGoogle')}
                </Button>

                {/* Temporarily disabled due to Apple Developer Console bug preventing Service ID configuration
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={() => handleSocialLogin("Apple")}
                  disabled={isLoading}
                >
                  <FaApple className="mr-2 h-4 w-4" />
                  Continue with Apple
                </Button>
                */}

                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={() => handleSocialLogin("Facebook")}
                  disabled={isLoading}
                >
                  <FaFacebook className="mr-2 h-4 w-4 text-blue-600" />
                  {t('auth.continueWithFacebook')}
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={() => handleSocialLogin("X")}
                  disabled={isLoading}
                >
                  <FaXTwitter className="mr-2 h-4 w-4 text-black" />
                  {t('auth.continueWithX')}
                </Button>
              </div>
            </>
          )}

        </CardContent>
      </Card>
    </div>
  );
}
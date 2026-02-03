import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Mail, Shield, Check, ArrowLeft } from "lucide-react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useLocation } from "wouter";
import { useTranslation } from "@/hooks/useTranslation";
import { useMarketContext } from "@/contexts/MarketProvider";

export default function VerifyEmail() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const { t } = useTranslation();
  const { market } = useMarketContext();
  
  // Parse URL parameters for helpful messaging and direct code entry
  const urlParams = new URLSearchParams(window.location.search);
  const redirectReason = urlParams.get('reason');
  const fromRoute = urlParams.get('from');
  const urlEmail = urlParams.get('email');
  const urlStep = urlParams.get('step');
  
  // Initialize step and email from URL parameters (for email button deep link)
  const [step, setStep] = useState<"email" | "code">(urlStep === 'code' && urlEmail ? "code" : "email");
  const [email, setEmail] = useState(urlEmail ? decodeURIComponent(urlEmail) : "");
  const [code, setCode] = useState("");
  const [countdown, setCountdown] = useState(urlStep === 'code' ? 60 : 0);
  
  // Generate helpful message based on redirect reason
  const getHelpfulMessage = () => {
    if (redirectReason === 'premium' && fromRoute) {
      const routeName = fromRoute.replace('/', '').replace('-', ' ');
      return t('verifyEmail.redirectMessages.premium', { feature: routeName });
    }
    if (redirectReason === 'error') {
      return t('verifyEmail.redirectMessages.error');
    }
    return null;
  };

  // Redirect to login if user is not authenticated
  useEffect(() => {
    if (user === null) {
      // Build return URL with current parameters so user comes back after login
      const currentParams = window.location.search;
      const returnUrl = encodeURIComponent(`/verify-email${currentParams}`);
      navigate(`/auth?returnUrl=${returnUrl}`);
    }
  }, [user, navigate]);

  // Check if user needs verification
  const { data: verificationStatus } = useQuery<{ needsVerification: boolean }>({
    queryKey: ["/api/email-verification/status"],
    enabled: !!user,
  });

  // Redirect if user doesn't need verification
  useEffect(() => {
    if (verificationStatus && !verificationStatus.needsVerification) {
      navigate("/");
    }
  }, [verificationStatus, navigate]);

  // Countdown timer for resend button
  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  const sendCodeMutation = useMutation({
    mutationFn: async (emailAddress: string) => {
      const originDomain = window.location.hostname;
      const response = await apiRequest("POST", "/api/email-verification/send", { 
        email: emailAddress,
        originDomain,
      });
      return response.json();
    },
    onSuccess: () => {
      setStep("code");
      setCountdown(60); // 1 minute cooldown
      toast({
        title: t('verifyEmail.messages.codeSent'),
        description: t('verifyEmail.messages.checkEmail'),
      });
    },
    onError: (error: any) => {
      toast({
        title: t('verifyEmail.messages.failedToSend'),
        description: error.message || t('common.tryAgain'),
        variant: "destructive",
      });
    },
  });

  const verifyCodeMutation = useMutation({
    mutationFn: async (verificationCode: string) => {
      const response = await apiRequest("POST", "/api/email-verification/verify", { 
        code: verificationCode 
      });
      return response.json();
    },
    onSuccess: () => {
      // Invalidate user data to get updated email
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      queryClient.invalidateQueries({ queryKey: ["/api/email-verification/status"] });
      
      toast({
        title: t('verifyEmail.messages.emailVerified'),
        description: t('verifyEmail.messages.emailVerifiedSuccess'),
      });
      
      // Clear skip flag on successful verification
      try {
        localStorage.removeItem('email-verification-skipped');
      } catch (error) {
        console.warn('Could not clear skip preference:', error);
      }
      
      // Navigate to home after successful verification
      setTimeout(() => navigate("/"), 1500);
    },
    onError: (error: any) => {
      toast({
        title: t('verifyEmail.messages.verificationFailed'),
        description: error.message || t('verifyEmail.messages.invalidOrExpired'),
        variant: "destructive",
      });
    },
  });

  const handleSendCode = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email) {
      toast({
        title: t('verifyEmail.messages.emailRequired'),
        description: t('verifyEmail.messages.enterEmailAddress'),
        variant: "destructive",
      });
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      toast({
        title: t('verifyEmail.messages.invalidEmail'),
        description: t('verifyEmail.messages.enterValidEmail'),
        variant: "destructive",
      });
      return;
    }

    sendCodeMutation.mutate(email);
  };

  const handleVerifyCode = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!code || code.length !== 6) {
      toast({
        title: t('verifyEmail.messages.invalidCode'),
        description: t('verifyEmail.messages.enterSixDigitCode'),
        variant: "destructive",
      });
      return;
    }

    verifyCodeMutation.mutate(code);
  };

  const handleResendCode = () => {
    if (countdown > 0) return;
    sendCodeMutation.mutate(email);
  };

  const isLoading = sendCodeMutation.isPending || verifyCodeMutation.isPending;

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white flex items-center justify-center p-4">
      <Card className="w-full max-w-sm border-0 shadow-xl">
        <CardHeader className="text-center pb-4">
          <div className="flex items-center justify-center space-x-3 mb-4">
            <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center">
              <Shield className="w-6 h-6 text-white" />
            </div>
            <CardTitle className="text-xl font-bold text-slate-900">{t('verifyEmail.title')}</CardTitle>
          </div>
          
          {/* Show helpful context message if redirected from premium feature */}
          {getHelpfulMessage() && (
            <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-sm text-blue-800" data-testid="text-redirect-reason">
                {getHelpfulMessage()}
              </p>
            </div>
          )}
          
          {step === "email" ? (
            <div className="space-y-2">
              <p className="text-slate-600 text-sm">
                {t('verifyEmail.enterEmailPrompt')}
              </p>
              <div className="text-xs text-slate-500 space-y-1">
                <div>• {t('verifyEmail.features.notifications')}</div>
                <div>• {t('verifyEmail.features.receipts')}</div>
                <div>• {t('verifyEmail.features.support')}</div>
                <div>• {t('verifyEmail.features.premium')}</div>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-slate-600 text-sm">
                {t('verifyEmail.codeSentTo')}
              </p>
              <p className="font-medium text-slate-900 break-all">{email}</p>
              <p className="text-xs text-slate-500">
                {t('verifyEmail.enterCode')}
              </p>
            </div>
          )}
        </CardHeader>

        <CardContent className="pt-0">
          {step === "email" ? (
            <form onSubmit={handleSendCode} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-sm font-medium">
                  {t('verifyEmail.emailAddressLabel')}
                </Label>
                <Input
                  id="email"
                  type="email"
                  placeholder={t('verifyEmail.emailPlaceholder')}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={isLoading}
                  data-testid="input-email"
                  className="text-base"
                />
              </div>

              <Button 
                type="submit" 
                className="w-full" 
                disabled={isLoading}
                data-testid="button-send-code"
              >
                {isLoading ? (
                  <div className="flex items-center space-x-2">
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    <span>{t('verifyEmail.sending')}</span>
                  </div>
                ) : (
                  <div className="flex items-center space-x-2">
                    <Mail className="w-4 h-4" />
                    <span>{t('verifyEmail.sendVerificationCode')}</span>
                  </div>
                )}
              </Button>
            </form>
          ) : (
            <form onSubmit={handleVerifyCode} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="code" className="text-sm font-medium">
                  {t('verifyEmail.verificationCodeLabel')}
                </Label>
                <Input
                  id="code"
                  type="text"
                  placeholder={t('verifyEmail.codePlaceholder')}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  disabled={isLoading}
                  data-testid="input-verification-code"
                  className="text-center text-lg tracking-wider font-mono"
                  maxLength={6}
                />
                <p className="text-xs text-slate-500 text-center">
                  {t('verifyEmail.codeExpires')}
                </p>
              </div>

              <Button 
                type="submit" 
                className="w-full" 
                disabled={isLoading || code.length !== 6}
                data-testid="button-verify-code"
              >
                {isLoading ? (
                  <div className="flex items-center space-x-2">
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    <span>{t('verifyEmail.verifying')}</span>
                  </div>
                ) : (
                  <div className="flex items-center space-x-2">
                    <Check className="w-4 h-4" />
                    <span>{t('verifyEmail.verifyEmailButton')}</span>
                  </div>
                )}
              </Button>

              <Separator />

              <div className="flex items-center justify-between">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setStep("email")}
                  disabled={isLoading}
                  data-testid="button-back"
                  className="flex items-center space-x-1"
                >
                  <ArrowLeft className="w-3 h-3" />
                  <span>{t('verifyEmail.back')}</span>
                </Button>

                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleResendCode}
                  disabled={isLoading || countdown > 0}
                  data-testid="button-resend"
                  className="text-primary hover:text-primary"
                >
                  {countdown > 0 ? t('verifyEmail.resendCountdown', { seconds: countdown }) : t('verifyEmail.resendCode')}
                </Button>
              </div>
            </form>
          )}

          {/* Skip option for non-essential verification */}
          <div className="mt-6 pt-4 border-t border-slate-100">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                // Set skip flag in localStorage
                try {
                  localStorage.setItem('email-verification-skipped', 'true');
                } catch (error) {
                  console.warn('Could not save skip preference:', error);
                }
                navigate("/");
              }}
              disabled={isLoading}
              data-testid="button-skip"
              className="w-full text-slate-500 hover:text-slate-700"
            >
              {t('verifyEmail.skipForNow')}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
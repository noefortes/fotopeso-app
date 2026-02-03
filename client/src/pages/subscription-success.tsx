import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { CheckCircle, ArrowLeft, Crown, Zap, Loader2, AlertCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useTranslation } from "@/hooks/useTranslation";

export default function SubscriptionSuccess() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { t } = useTranslation();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(true);
  const [verified, setVerified] = useState(false);
  const [tier, setTier] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  const [isPix, setIsPix] = useState(false);

  useEffect(() => {
    // Extract session_id and pix flag from URL
    const urlParams = new URLSearchParams(window.location.search);
    const id = urlParams.get('session_id');
    const pixFlag = urlParams.get('pix') === 'true';
    setSessionId(id);
    setIsPix(pixFlag);

    if (id) {
      // Verify the session and activate subscription
      verifySession(id, pixFlag);
    } else {
      setVerifying(false);
      setError('No session ID provided');
    }
  }, []);
  
  const verifySession = async (sessionId: string, isPixPayment: boolean = false) => {
    try {
      setVerifying(true);
      setError(null);
      
      // Use different endpoint for Pix payments
      const endpoint = isPixPayment 
        ? '/api/subscription/verify-pix' 
        : '/api/subscription/verify-session';
      
      const response = await apiRequest('POST', endpoint, {
        sessionId
      });
      
      const data = await response.json();
      
      if (data.success) {
        setVerified(true);
        setTier(data.tier);
        
        // Invalidate relevant queries to refresh user data
        await queryClient.invalidateQueries({ queryKey: ['/api/auth/user'] });
        await queryClient.invalidateQueries({ queryKey: ['/api/subscription/status'] });
        
        toast({
          title: t('subscription.paymentSuccess'),
          description: t('subscription.thankYou'),
          duration: 5000,
        });
      } else {
        setError(data.error || 'Verification failed');
      }
    } catch (err: any) {
      console.error('Session verification error:', err);
      setError(err.message || 'Failed to verify payment');
    } finally {
      setVerifying(false);
    }
  };

  // Show loading state while verifying
  if (verifying) {
    return (
      <div className="max-w-sm mx-auto bg-white min-h-screen shadow-xl">
        <div className="flex flex-col items-center justify-center min-h-screen p-6 text-center">
          <Loader2 className="w-16 h-16 text-primary animate-spin mb-6" />
          <h1 className="text-xl font-semibold text-gray-900 mb-2">
            {t('subscription.verifyingPayment')}
          </h1>
          <p className="text-gray-600">
            {t('subscription.pleaseWait')}
          </p>
        </div>
      </div>
    );
  }

  // Show error state if verification failed
  if (error) {
    return (
      <div className="max-w-sm mx-auto bg-white min-h-screen shadow-xl">
        <div className="flex flex-col items-center justify-center min-h-screen p-6 text-center">
          <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mb-6">
            <AlertCircle className="w-12 h-12 text-red-600" />
          </div>
          <h1 className="text-xl font-semibold text-gray-900 mb-2">
            {t('subscription.verificationFailed')}
          </h1>
          <p className="text-gray-600 mb-6">{error}</p>
          {sessionId && (
            <Button 
              onClick={() => verifySession(sessionId, isPix)}
              className="mb-4"
              data-testid="button-retry-verification"
            >
              {t('subscription.tryAgain')}
            </Button>
          )}
          <Button 
            variant="outline"
            onClick={() => setLocation("/settings")}
            data-testid="button-go-settings"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            {t('subscription.goToSettings')}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-sm mx-auto bg-white min-h-screen shadow-xl">
      <div className="flex flex-col items-center justify-center min-h-screen p-6 text-center">
        {/* Success Icon */}
        <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mb-6">
          <CheckCircle className="w-12 h-12 text-green-600" />
        </div>

        {/* Success Message */}
        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          {t('subscription.paymentSuccess')}
        </h1>
        
        <p className="text-gray-600 mb-6">
          {t('subscription.accessFeatures')}
        </p>

        {/* Session ID (for testing) */}
        {sessionId && (
          <Card className="w-full mb-6 bg-gray-50">
            <CardContent className="p-4">
              <p className="text-xs text-gray-500 mb-1">Session ID:</p>
              <p className="text-xs font-mono text-gray-700 break-all">
                {sessionId}
              </p>
            </CardContent>
          </Card>
        )}

        {/* Features Preview - tier-specific */}
        <Card className="w-full mb-6">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Crown className="w-5 h-5 text-amber-500" />
              {t('subscription.featuresUnlocked', { tier: tier ? tier.charAt(0).toUpperCase() + tier.slice(1) : '' })}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {tier === 'starter' && (
              <>
                <div className="flex items-center gap-3">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  <span className="text-sm">{t('subscription.features.unlimitedScans')}</span>
                </div>
                <div className="flex items-center gap-3">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  <span className="text-sm">{t('subscription.features.basicCharts')}</span>
                </div>
                <div className="flex items-center gap-3">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  <span className="text-sm">{t('subscription.features.emailSupport')}</span>
                </div>
              </>
            )}
            {tier === 'premium' && (
              <>
                <div className="flex items-center gap-3">
                  <Zap className="w-4 h-4 text-blue-500" />
                  <span className="text-sm">{t('subscription.features.advancedAnalytics')}</span>
                </div>
                <div className="flex items-center gap-3">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  <span className="text-sm">{t('subscription.features.unlimitedHistory')}</span>
                </div>
                <div className="flex items-center gap-3">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  <span className="text-sm">{t('subscription.features.goalTracking')}</span>
                </div>
                <div className="flex items-center gap-3">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  <span className="text-sm">{t('subscription.features.dataExport')}</span>
                </div>
              </>
            )}
            {tier === 'pro' && (
              <>
                <div className="flex items-center gap-3">
                  <Zap className="w-4 h-4 text-blue-500" />
                  <span className="text-sm">{t('subscription.features.aiInsights')}</span>
                </div>
                <div className="flex items-center gap-3">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  <span className="text-sm">{t('subscription.features.socialSharing')}</span>
                </div>
                <div className="flex items-center gap-3">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  <span className="text-sm">{t('subscription.features.customImages')}</span>
                </div>
                <div className="flex items-center gap-3">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  <span className="text-sm">{t('subscription.features.prioritySupport247')}</span>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Action Buttons */}
        <div className="w-full space-y-3">
          <Button 
            onClick={() => setLocation("/analytics")}
            className="w-full"
            data-testid="button-explore-analytics"
          >
            <Zap className="w-4 h-4 mr-2" />
            {t('subscription.exploreAnalytics')}
          </Button>
          
          <Button 
            variant="outline" 
            onClick={() => setLocation("/")}
            className="w-full"
            data-testid="button-back-home"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            {t('common.backToHome')}
          </Button>
        </div>

        {/* Footer Note */}
        <p className="text-xs text-gray-500 mt-6">
          {t('subscription.manageInSettings')}
        </p>
      </div>
    </div>
  );
}
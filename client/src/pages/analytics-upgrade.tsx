import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  BarChart3, 
  Zap,
  CheckCircle,
  ArrowLeft,
  Star,
  Crown
} from "lucide-react";
import BottomNavigation from "@/components/bottom-navigation";
import { useLocation } from "wouter";
import PlanBadge from "@/components/plan-badge";
import { useTranslation } from "@/hooks/useTranslation";
import { useMarketContext } from "@/contexts/MarketProvider";

type BillingInterval = "month" | "semiannual" | "year";

const featureKeyMap: Record<string, string> = {
  "Unlimited weight scans": "unlimitedScans",
  "30-day history": "thirtyDayHistory",
  "Basic progress charts": "basicCharts",
  "Email support": "emailSupport",
  "Everything in Starter": "everythingInStarter",
  "Unlimited history": "unlimitedHistory",
  "Advanced analytics": "advancedAnalytics",
  "Goal tracking & trends": "goalTracking",
  "Data export (CSV/PDF)": "dataExport",
  "Priority support": "prioritySupport",
  "Everything in Premium": "everythingInPremium",
  "AI insights & recommendations": "aiInsights",
  "Social sharing features": "socialSharing",
  "Custom progress images": "customImages",
  "Advanced integrations": "advancedIntegrations",
  "24/7 priority support": "twentyFourSevenSupport",
};

export default function AnalyticsUpgrade() {
  const { user, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const { t } = useTranslation();
  const { market, formatCurrency } = useMarketContext();
  const [selectedInterval, setSelectedInterval] = useState<BillingInterval>("month");
  
  const userTier = (user as any)?.subscriptionTier || "free";

  useEffect(() => {
    if (!authLoading && !user) {
      toast({
        title: t('profile.unauthorized'),
        description: t('profile.loggedOut'),
        variant: "destructive",
      });
      setTimeout(() => {
        window.location.href = "/auth";
      }, 500);
      return;
    }
  }, [user, authLoading, toast]);

  if (authLoading || !user) {
    return (
      <div className="max-w-sm mx-auto bg-white min-h-screen shadow-xl flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-600">{t('common.loading')}</p>
        </div>
      </div>
    );
  }

  const { data: plansData, isLoading: plansLoading, error: plansError } = useQuery({
    queryKey: ['/api/plans'],
    enabled: !!user
  });

  const { data: subscriptionData, isLoading: subscriptionLoading } = useQuery({
    queryKey: ['/api/subscription/status'],
    enabled: !!user
  });

  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [isPixCheckingOut, setIsPixCheckingOut] = useState(false);
  
  // Standard card checkout mutation (recurring subscription)
  const checkoutMutation = useMutation({
    mutationFn: async (planId: string) => {
      const response = await apiRequest('POST', '/api/subscription/checkout', {
        planId,
        successUrl: `${window.location.origin}/subscription/success`,
        cancelUrl: `${window.location.origin}/analytics-upgrade?m=${market.id}`
      });
      return response.json();
    },
    onSuccess: (data) => {
      if (data.url) {
        window.location.href = data.url;
      } else {
        toast({
          title: t('subscription.error'),
          description: t('subscription.checkoutFailed'),
          variant: "destructive",
        });
      }
    },
    onError: (error: any) => {
      console.error('Checkout error:', error);
      
      let userMessage = t('subscription.genericError');
      
      if (error.message) {
        if (error.message.includes("RevenueCat") || error.message.includes("native app store")) {
          userMessage = t('subscription.setupInProgress');
        } else if (error.message.includes("network") || error.message.includes("connection")) {
          userMessage = t('subscription.networkError');
        } else if (error.message.includes("validation")) {
          userMessage = t('subscription.validationError');
        }
      }
      
      toast({
        title: t('subscription.temporarilyUnavailable'),
        description: userMessage,
        variant: "destructive",
      });
      setIsCheckingOut(false);
    }
  });

  // Pix checkout mutation (one-time prepaid payment for Brazil)
  const pixCheckoutMutation = useMutation({
    mutationFn: async ({ tier, interval }: { tier: string; interval: string }) => {
      const response = await apiRequest('POST', '/api/subscription/pix-checkout', {
        tier,
        interval,
        successUrl: `${window.location.origin}/subscription/success`,
        cancelUrl: `${window.location.origin}/analytics-upgrade?m=${market.id}`
      });
      return response.json();
    },
    onSuccess: (data) => {
      if (data.url) {
        window.location.href = data.url;
      } else {
        toast({
          title: t('subscription.error'),
          description: t('subscription.checkoutFailed'),
          variant: "destructive",
        });
      }
    },
    onError: (error: any) => {
      console.error('Pix checkout error:', error);
      toast({
        title: t('subscription.error'),
        description: t('subscription.pixCheckoutFailed'),
        variant: "destructive",
      });
      setIsPixCheckingOut(false);
    }
  });

  const handleUpgrade = async (planId: string) => {
    if (isCheckingOut) return;
    
    setIsCheckingOut(true);
    
    try {
      await checkoutMutation.mutateAsync(planId);
    } catch (error) {
      // Error handling done in onError above
    }
  };

  const handlePixUpgrade = async (tier: string, interval: string) => {
    if (isPixCheckingOut) return;
    
    setIsPixCheckingOut(true);
    
    try {
      await pixCheckoutMutation.mutateAsync({ tier, interval });
    } catch (error) {
      // Error handling done in onError above
    }
  };

  // Check if Pix is available (only for Brazilian market)
  // NOTE: Pix is temporarily disabled by Stripe for Brazilian accounts (December 2025)
  // Set this to true when Stripe re-enables Pix payments
  const PIX_ENABLED = false;
  const isPixAvailable = PIX_ENABLED && market.currency === 'BRL';

  // Get all plans from API
  const allPlans = Array.isArray(plansData) ? plansData : (plansData as any)?.plans || [];
  
  // Filter by market currency - use market.currency directly
  const marketCurrency = market.currency;
  const marketPlans = allPlans.filter((plan: any) => plan.currency === marketCurrency);
  
  // Filter by selected interval - show all 3 tiers
  const intervalPlans = marketPlans.filter((plan: any) => plan.interval === selectedInterval);
  
  // Sort by tier hierarchy
  const tierHierarchy = ['free', 'starter', 'premium', 'pro'];
  const currentTierIndex = tierHierarchy.indexOf(userTier);
  const availablePlans = intervalPlans.sort((a: any, b: any) => {
    return tierHierarchy.indexOf(a.tier) - tierHierarchy.indexOf(b.tier);
  });
  
  // Check if plan is available for upgrade (above current tier)
  const canUpgrade = (planTier: string) => {
    const planTierIndex = tierHierarchy.indexOf(planTier);
    return planTierIndex > currentTierIndex;
  };

  // Get monthly price for savings calculation
  const getMonthlyPrice = (tier: string) => {
    const monthlyPlan = marketPlans.find((p: any) => p.tier === tier && p.interval === 'month');
    return monthlyPlan?.amount || 0;
  };

  // Calculate savings percentage
  const getSavingsPercentage = (plan: any) => {
    const monthlyPrice = getMonthlyPrice(plan.tier);
    if (monthlyPrice === 0) return 0;
    
    const months = plan.interval === 'semiannual' ? 6 : plan.interval === 'year' ? 12 : 1;
    const expectedPrice = monthlyPrice * months;
    const actualPrice = plan.amount;
    const savings = ((expectedPrice - actualPrice) / expectedPrice) * 100;
    return Math.round(savings);
  };

  // Get savings badge for interval toggle
  const getIntervalSavings = (interval: BillingInterval) => {
    if (interval === 'month') return null;
    // Use starter tier as reference for the savings badge
    const starterMonthly = marketPlans.find((p: any) => p.tier === 'starter' && p.interval === 'month');
    const starterInterval = marketPlans.find((p: any) => p.tier === 'starter' && p.interval === interval);
    if (!starterMonthly || !starterInterval) return null;
    
    const months = interval === 'semiannual' ? 6 : 12;
    const expectedPrice = starterMonthly.amount * months;
    const actualPrice = starterInterval.amount;
    const savings = ((expectedPrice - actualPrice) / expectedPrice) * 100;
    return Math.round(savings);
  };

  // Only show intervals that have at least one plan available
  const allIntervals: { key: BillingInterval; label: string }[] = [
    { key: 'month', label: t('subscription.interval.monthly') },
    { key: 'semiannual', label: t('subscription.interval.semiannualLabel') },
    { key: 'year', label: t('subscription.interval.yearly') }
  ];
  
  const intervals = allIntervals.filter(interval => 
    marketPlans.some((plan: any) => plan.interval === interval.key)
  );

  return (
    <div className="max-w-sm mx-auto bg-gradient-to-br from-indigo-50 to-purple-50 min-h-screen shadow-xl">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-50">
        <div className="flex items-center justify-between p-4">
          <button 
            onClick={() => setLocation("/")}
            className="flex items-center space-x-2 text-slate-600 hover:text-slate-900"
            data-testid="button-back"
          >
            <ArrowLeft className="w-5 h-5" />
            <span className="text-sm">{t('common.back')}</span>
          </button>
          <PlanBadge tier={userTier} size="sm" />
        </div>
      </header>

      {/* Main Content */}
      <main className="pb-20 p-4">
        {/* Hero Section */}
        <div className="text-center mb-6 pt-4">
          <div className="w-16 h-16 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-3">
            <BarChart3 className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-xl font-bold text-slate-900 mb-1">{t('subscription.analyticsUpgrade.title')}</h1>
          <p className="text-slate-600 text-sm">
            {t('subscription.analyticsUpgrade.subtitle')}
          </p>
        </div>

        {/* Interval Toggle */}
        <div className="bg-white rounded-full p-1 flex mb-6 shadow-sm border border-slate-200">
          {intervals.map((interval) => {
            const savings = getIntervalSavings(interval.key);
            const isSelected = selectedInterval === interval.key;
            
            return (
              <button
                key={interval.key}
                onClick={() => setSelectedInterval(interval.key)}
                data-testid={`toggle-interval-${interval.key}`}
                className={`flex-1 relative py-2 px-2 rounded-full text-sm font-medium transition-all ${
                  isSelected
                    ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-md'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {interval.label}
                {savings !== null && savings > 0 ? (
                  <span 
                    className={`absolute -top-2 -right-1 text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                      isSelected 
                        ? 'bg-green-400 text-green-900' 
                        : 'bg-green-100 text-green-700'
                    }`}
                  >
                    -{savings}%
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>

        {/* Subscription Plans */}
        {plansLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="border-0 bg-white/70 backdrop-blur-sm animate-pulse">
                <CardContent className="p-4">
                  <div className="h-4 bg-slate-200 rounded mb-2 w-24"></div>
                  <div className="h-8 bg-slate-200 rounded mb-2 w-32"></div>
                  <div className="h-10 bg-slate-200 rounded"></div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : plansError ? (
          <Card className="border-0 bg-red-50 backdrop-blur-sm">
            <CardContent className="p-4 text-center">
              <p className="text-red-600 text-sm">{t('subscription.analyticsUpgrade.failedLoad')}</p>
              <Button 
                variant="outline" 
                size="sm" 
                className="mt-2"
                onClick={() => queryClient.invalidateQueries({ queryKey: ['/api/plans'] })}
                data-testid="button-retry"
              >
                {t('common.tryAgain')}
              </Button>
            </CardContent>
          </Card>
        ) : availablePlans.length > 0 ? (
          <div className="space-y-3">
            {availablePlans.map((plan: any) => {
              const isRecommended = plan.tier === 'premium' && canUpgrade(plan.tier);
              const isCurrentPlan = plan.tier === userTier;
              const isUpgradable = canUpgrade(plan.tier);
              const priceDisplay = formatCurrency(plan.amount / 100);
              const savings = getSavingsPercentage(plan);
              const monthlyEquivalent = plan.interval !== 'month' 
                ? formatCurrency((plan.amount / (plan.interval === 'semiannual' ? 6 : 12)) / 100)
                : null;
              
              return (
                <Card 
                  key={plan.id} 
                  data-testid={`card-plan-${plan.tier}`}
                  className={`border-0 backdrop-blur-sm relative overflow-hidden ${
                    isCurrentPlan 
                      ? 'bg-green-50 ring-2 ring-green-300'
                      : isRecommended 
                        ? 'bg-gradient-to-br from-purple-50 to-indigo-50 ring-2 ring-purple-300' 
                        : 'bg-white/80'
                  } ${!isUpgradable && !isCurrentPlan ? 'opacity-60' : ''}`}
                >
                  {isCurrentPlan ? (
                    <div className="absolute top-0 right-0">
                      <Badge className="rounded-none rounded-bl-lg bg-green-600 text-white text-xs">
                        <CheckCircle className="w-3 h-3 mr-1" />
                        {t('subscription.currentPlan')}
                      </Badge>
                    </div>
                  ) : isRecommended && (
                    <div className="absolute top-0 right-0">
                      <Badge className="rounded-none rounded-bl-lg bg-gradient-to-r from-purple-600 to-indigo-600 text-white text-xs">
                        <Star className="w-3 h-3 mr-1" />
                        {t('subscription.recommended')}
                      </Badge>
                    </div>
                  )}
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <h3 className="font-bold text-slate-900 text-lg">{plan.name}</h3>
                        {savings > 0 && (
                          <span className="text-xs text-green-600 font-semibold">
                            {t('subscription.save', { percent: savings })}
                          </span>
                        )}
                      </div>
                      <div className="text-right">
                        <div className="text-2xl font-bold text-slate-900">{priceDisplay}</div>
                        <div className="text-xs text-slate-500">
                          {t(`subscription.interval.per_${plan.interval}`)}
                        </div>
                        {monthlyEquivalent && (
                          <div className="text-xs text-slate-400">
                            {t('subscription.monthlyEquivalent', { price: monthlyEquivalent })}
                          </div>
                        )}
                      </div>
                    </div>
                    
                    <ul className="text-sm text-slate-600 mb-3 space-y-1">
                      {plan.features.slice(0, 4).map((feature: string, index: number) => {
                        const featureKey = featureKeyMap[feature];
                        const translatedFeature = featureKey 
                          ? t(`planFeatures.${featureKey}`) 
                          : feature;
                        return (
                          <li key={index} className="flex items-center">
                            <CheckCircle className="w-4 h-4 text-green-500 mr-2 flex-shrink-0" />
                            <span className="text-xs">{translatedFeature}</span>
                          </li>
                        );
                      })}
                    </ul>
                    
                    {isCurrentPlan ? (
                      <Button 
                        data-testid={`button-current-${plan.tier}`}
                        className="w-full bg-green-600 text-white font-semibold cursor-default"
                        disabled
                      >
                        <CheckCircle className="w-4 h-4 mr-2" />
                        {t('subscription.currentPlan')}
                      </Button>
                    ) : isUpgradable ? (
                      <div className="space-y-2">
                        {/* Card payment button (recurring subscription) */}
                        <Button 
                          data-testid={`button-upgrade-${plan.tier}`}
                          className={`w-full ${
                            isRecommended 
                              ? 'bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700' 
                              : 'bg-slate-800 hover:bg-slate-900'
                          } text-white font-semibold`}
                          onClick={() => handleUpgrade(plan.id)}
                          disabled={isCheckingOut || isPixCheckingOut}
                        >
                          {isCheckingOut ? (
                            <>
                              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
                              {t('subscription.processing')}
                            </>
                          ) : (
                            <>
                              <Zap className="w-4 h-4 mr-2" />
                              {isPixAvailable ? t('subscription.payWithCard') : t('subscription.selectPlan')}
                            </>
                          )}
                        </Button>
                        
                        {/* Pix payment button (one-time prepaid - Brazil only) */}
                        {isPixAvailable && (
                          <Button 
                            data-testid={`button-pix-${plan.tier}`}
                            variant="outline"
                            className="w-full border-2 border-green-500 text-green-700 hover:bg-green-50 font-semibold"
                            onClick={() => handlePixUpgrade(plan.tier, plan.interval)}
                            disabled={isCheckingOut || isPixCheckingOut}
                          >
                            {isPixCheckingOut ? (
                              <>
                                <div className="w-4 h-4 border-2 border-green-600 border-t-transparent rounded-full animate-spin mr-2"></div>
                                {t('subscription.processing')}
                              </>
                            ) : (
                              <>
                                <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24" fill="currentColor">
                                  <path d="M13.5 3.5L12 2L10.5 3.5L12 5L13.5 3.5ZM19.07 4.93L17.66 6.34L16.24 4.93L17.66 3.52L19.07 4.93ZM4.93 4.93L6.34 6.34L4.93 7.76L3.52 6.34L4.93 4.93ZM12 6C8.69 6 6 8.69 6 12C6 15.31 8.69 18 12 18C15.31 18 18 15.31 18 12C18 8.69 15.31 6 12 6ZM3.5 10.5L2 12L3.5 13.5L5 12L3.5 10.5ZM20.5 10.5L19 12L20.5 13.5L22 12L20.5 10.5ZM4.93 19.07L3.52 17.66L4.93 16.24L6.34 17.66L4.93 19.07ZM19.07 19.07L17.66 17.66L19.07 16.24L20.49 17.66L19.07 19.07ZM10.5 20.5L12 22L13.5 20.5L12 19L10.5 20.5Z"/>
                                </svg>
                                {t('subscription.payWithPix')}
                              </>
                            )}
                          </Button>
                        )}
                      </div>
                    ) : (
                      <Button 
                        data-testid={`button-included-${plan.tier}`}
                        variant="outline"
                        className="w-full text-slate-400 font-semibold cursor-default"
                        disabled
                      >
                        {t('subscription.includedInPlan')}
                      </Button>
                    )}
                  </CardContent>
                </Card>
              );
            })}
            
            <p className="text-center text-xs text-slate-500 mt-4">
              {t('subscription.cancelAnytime')}
            </p>
          </div>
        ) : (
          <Card className="border-0 bg-white/70 backdrop-blur-sm">
            <CardContent className="p-4 text-center">
              <Crown className="w-8 h-8 text-amber-500 mx-auto mb-2" />
              <p className="text-slate-600 font-medium">{t('subscription.highestTier')}</p>
              <p className="text-sm text-slate-500">{t('subscription.enjoyFeatures')}</p>
            </CardContent>
          </Card>
        )}
      </main>

      {/* Bottom Navigation */}
      <BottomNavigation />
    </div>
  );
}

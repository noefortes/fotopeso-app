import { useState, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { isUnauthorizedError } from "@/lib/authUtils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import PlanBadge from "@/components/plan-badge";
import { Settings, Scale, Target, User, Crown, Globe, Smartphone, CheckCircle2, XCircle, Clock, Sparkles, History, TrendingDown, Share2, Trash2, ChevronDown, ChevronUp } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Link } from "wouter";
import BottomNavigation from "@/components/bottom-navigation";
import { getWeightUnitName, getEffectiveWeightUnit, type WeightUnit } from "@shared/utils";
import { availableLocales } from "@shared/i18n";
import { useTranslation } from "@/hooks/useTranslation";
import { useMarketContext } from "@/contexts/MarketProvider";
import { formatDistanceToNow } from "date-fns";
import type { ActivityLog } from "@shared/schema";

export default function SettingsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { t } = useTranslation();
  const { market } = useMarketContext();
  
  // For Brazilian market, always use kg regardless of user preference
  const isUnitLocked = market.id === 'br';
  const effectiveWeightUnit = getEffectiveWeightUnit(market.id, ((user as any)?.weightUnit as WeightUnit));
  
  const [goalWeight, setGoalWeight] = useState((user as any)?.goalWeight || "");
  const [weightUnit, setWeightUnit] = useState<WeightUnit>(((user as any)?.weightUnit || "lbs") as WeightUnit);
  const [locale, setLocale] = useState((user as any)?.locale || "en");
  const [showWhatsAppModal, setShowWhatsAppModal] = useState(false);
  const [whatsappPhone, setWhatsappPhone] = useState("");
  const [historyExpanded, setHistoryExpanded] = useState(false);

  // Get user's preferred weight unit for history display
  const userWeightUnit = (user as any)?.weightUnit || 'lbs';

  // Fetch activity history
  const { data: activities = [], isLoading: activitiesLoading } = useQuery<ActivityLog[]>({
    queryKey: ["/api/activity"],
    enabled: !!user,
  });

  // Fetch WhatsApp status
  const { data: whatsappStatus, isLoading: whatsappLoading } = useQuery({
    queryKey: ['/api/whatsapp/status'],
    enabled: !!user,
  });

  // Sync preferences when user data changes (only on initial load)
  useEffect(() => {
    if (user) {
      setLocale((user as any)?.locale || "en");
    }
  }, [(user as any)?.id]); // Only sync when user ID changes (initial load)

  // Profile update mutation
  const updateProfileMutation = useMutation({
    mutationFn: async (updates: any) => {
      return await apiRequest("PATCH", "/api/profile", updates);
    },
    onSuccess: () => {
      toast({
        title: t('settings.updated'),
        description: t('settings.savedSuccessfully'),
      });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
    },
    onError: (error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: t('settings.unauthorized'),
          description: t('settings.sessionExpired'),
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/auth";
        }, 500);
        return;
      }
      toast({
        title: t('settings.updateFailed'),
        description: error instanceof Error ? error.message : "Failed to update settings",
        variant: "destructive",
      });
    },
  });

  const handleWeightUnitChange = (newUnit: string) => {
    const unit = newUnit as WeightUnit;
    setWeightUnit(unit);
    updateProfileMutation.mutate({ weightUnit: unit });
  };

  const handleLanguageChange = (newLocale: string) => {
    setLocale(newLocale);
    updateProfileMutation.mutate({ locale: newLocale });
  };

  // Language display names
  const getLanguageDisplayName = (locale: string) => {
    const languageNames: Record<string, string> = {
      'en': 'English',
      'pt-BR': 'Português (Brasil)',
    };
    return languageNames[locale] || locale;
  };

  const handleGoalWeightUpdate = () => {
    const goalNum = parseFloat(goalWeight);
    if (isNaN(goalNum) || goalNum <= 0) {
      toast({
        title: t('settings.invalidGoalWeight'),
        description: t('settings.enterValidGoal'),
        variant: "destructive",
      });
      return;
    }
    
    updateProfileMutation.mutate({ goalWeight: goalNum });
  };

  // WhatsApp connection mutation
  const connectWhatsAppMutation = useMutation({
    mutationFn: async (phoneNumber: string) => {
      const response = await apiRequest("POST", "/api/whatsapp/connect", { phoneNumber });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/whatsapp/status'] });
      setShowWhatsAppModal(false);
      setWhatsappPhone("");
      toast({
        title: "WhatsApp Connected",
        description: "WhatsApp integration enabled successfully!",
      });
    },
    onError: (error) => {
      toast({
        title: "Connection Failed",
        description: error instanceof Error ? error.message : "Failed to connect WhatsApp",
        variant: "destructive",
      });
    },
  });

  // WhatsApp disconnection mutation
  const disconnectWhatsAppMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("DELETE", "/api/whatsapp/disconnect");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/whatsapp/status'] });
      toast({
        title: "WhatsApp Disconnected",
        description: "WhatsApp integration has been disabled.",
      });
    },
    onError: (error) => {
      toast({
        title: "Disconnection Failed",
        description: error instanceof Error ? error.message : "Failed to disconnect WhatsApp",
        variant: "destructive",
      });
    },
  });

  const handleConnectWhatsApp = () => {
    if (!whatsappPhone) {
      toast({
        title: "Phone Number Required",
        description: "Please enter your WhatsApp phone number",
        variant: "destructive",
      });
      return;
    }
    connectWhatsAppMutation.mutate(whatsappPhone);
  };

  if (!user) {
    return (
      <div className="max-w-sm mx-auto bg-white min-h-screen shadow-xl flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-600">Loading...</p>
        </div>
      </div>
    );
  }

  const subscriptionTier = (user as any)?.subscriptionTier || "free";

  return (
    <div className="max-w-sm mx-auto bg-white min-h-screen shadow-xl">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-50">
        <div className="flex items-center justify-between p-4">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
              <Settings className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-lg font-semibold text-slate-900">{t('settings.title')}</h1>
          </div>
          <PlanBadge tier={subscriptionTier} size="sm" />
        </div>
      </header>

      {/* Main Content */}
      <main className="pb-20 p-4 space-y-6">

        {/* Weight Preferences - Hidden for Brazilian market (kg-only) */}
        {!isUnitLocked && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Scale className="w-5 h-5" />
                <span>{t('settings.units')}</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="weightUnit">{t('settings.displayWeight')}:</Label>
                <Select 
                  value={weightUnit} 
                  onValueChange={handleWeightUnitChange}
                  disabled={updateProfileMutation.isPending}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="lbs">Pounds (lbs)</SelectItem>
                    <SelectItem value="kg">Kilograms (kg)</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-slate-500">
                  {t('settings.allWeightsDisplayed', { unit: getWeightUnitName(weightUnit).toLowerCase() })}
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Goal Weight */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Target className="w-5 h-5" />
              <span>{t('settings.goalSection')}</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="goalWeight">{t('settings.goalQuestion')}</Label>
              <div className="flex space-x-2">
                <Input
                  id="goalWeight"
                  type="number"
                  value={goalWeight}
                  onChange={(e) => setGoalWeight(e.target.value)}
                  placeholder={t('settings.enterGoal', {unit: weightUnit})}
                  min="1"
                  max="1000"
                  step="0.1"
                />
                <Button 
                  onClick={handleGoalWeightUpdate}
                  disabled={updateProfileMutation.isPending}
                >
                  {updateProfileMutation.isPending ? t('common.saving') : t('settings.setGoal')}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* WhatsApp Integration */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Smartphone className="w-5 h-5 text-green-600" />
              <span>WhatsApp Integration</span>
              {whatsappStatus?.includedInPlan && (
                <Badge variant="secondary" className="text-xs bg-green-100 text-green-800">
                  Included
                </Badge>
              )}
              {!whatsappStatus?.includedInPlan && whatsappStatus?.subscriptionTier === "free" && (
                <Badge variant="secondary" className="text-xs bg-amber-100 text-amber-800">
                  30-Day Trial
                </Badge>
              )}
            </CardTitle>
            <p className="text-sm text-slate-600 mt-1">
              Track your weight without opening the app
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Status Display */}
            {whatsappStatus?.enabled ? (
              <div className="space-y-4">
                {/* Connected Status */}
                <div className="flex items-center justify-between p-3 bg-green-50 border border-green-200 rounded-lg">
                  <div className="flex items-center space-x-3">
                    <CheckCircle2 className="w-5 h-5 text-green-600" />
                    <div>
                      <p className="text-sm font-medium text-green-900">Connected</p>
                      <p className="text-xs text-green-700">{whatsappStatus.phone}</p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => disconnectWhatsAppMutation.mutate()}
                    disabled={disconnectWhatsAppMutation.isPending}
                    data-testid="button-disconnect-whatsapp"
                  >
                    Disconnect
                  </Button>
                </div>

                {/* Trial Status for Free Users */}
                {whatsappStatus.status === "trialing" && whatsappStatus.trialDaysRemaining !== undefined && (
                  <div className="flex items-center justify-between p-3 bg-amber-50 border border-amber-200 rounded-lg">
                    <div className="flex items-center space-x-3">
                      <Clock className="w-5 h-5 text-amber-600" />
                      <div>
                        <p className="text-sm font-medium text-amber-900">
                          Trial: {whatsappStatus.trialDaysRemaining} days left
                        </p>
                        <p className="text-xs text-amber-700">
                          Upgrade to continue after trial
                        </p>
                      </div>
                    </div>
                    <Link href="/subscribe">
                      <Button size="sm" variant="default" data-testid="button-upgrade-whatsapp">
                        Upgrade
                      </Button>
                    </Link>
                  </div>
                )}

                {/* Expired Status */}
                {whatsappStatus.status === "expired" && (
                  <div className="flex items-center justify-between p-3 bg-red-50 border border-red-200 rounded-lg">
                    <div className="flex items-center space-x-3">
                      <XCircle className="w-5 h-5 text-red-600" />
                      <div>
                        <p className="text-sm font-medium text-red-900">Trial Expired</p>
                        <p className="text-xs text-red-700">Upgrade to re-enable WhatsApp</p>
                      </div>
                    </div>
                    <Link href="/subscribe">
                      <Button size="sm" variant="default" data-testid="button-reactivate-whatsapp">
                        Upgrade Now
                      </Button>
                    </Link>
                  </div>
                )}

                {/* Active Paid Status */}
                {whatsappStatus.status === "active" && whatsappStatus.includedInPlan && (
                  <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                    <div className="flex items-start space-x-2">
                      <Sparkles className="w-4 h-4 text-blue-600 mt-0.5" />
                      <div className="text-xs text-blue-800">
                        <p className="font-medium">Premium Feature Active</p>
                        <p className="mt-1">
                          WhatsApp integration is included with your {whatsappStatus.subscriptionTier} plan
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                {/* Not Connected - Show Features */}
                <div className="space-y-2">
                  <p className="text-sm font-medium text-slate-900">Features:</p>
                  <ul className="space-y-2 text-sm text-slate-600">
                    <li className="flex items-start space-x-2">
                      <CheckCircle2 className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                      <span>Daily weight reminders in WhatsApp</span>
                    </li>
                    <li className="flex items-start space-x-2">
                      <CheckCircle2 className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                      <span>Send scale photos for instant AI detection</span>
                    </li>
                    <li className="flex items-start space-x-2">
                      <CheckCircle2 className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                      <span>Receive progress charts automatically</span>
                    </li>
                    <li className="flex items-start space-x-2">
                      <CheckCircle2 className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                      <span>Private 1-on-1 conversation</span>
                    </li>
                  </ul>
                </div>

                {/* Pricing Info */}
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                  <p className="text-sm text-slate-700">
                    {whatsappStatus?.includedInPlan ? (
                      <span className="font-medium text-green-700">
                        ✓ Included with your {whatsappStatus.subscriptionTier} plan
                      </span>
                    ) : (
                      <span>
                        <span className="font-medium">Free 30-day trial</span>
                        <br />
                        <span className="text-xs">Then R$9.99/month or upgrade to any paid plan</span>
                      </span>
                    )}
                  </p>
                </div>

                {/* Connection Form */}
                <div className="space-y-3">
                  <Label htmlFor="whatsappPhone" className="text-sm font-medium">
                    WhatsApp Phone Number
                  </Label>
                  <Input
                    id="whatsappPhone"
                    type="tel"
                    placeholder="+55 11 99999-9999"
                    value={whatsappPhone}
                    onChange={(e) => setWhatsappPhone(e.target.value)}
                    className="text-sm"
                    data-testid="input-whatsapp-phone"
                  />
                  <p className="text-xs text-slate-600">
                    Use international format (e.g., +55 11 99999-9999)
                  </p>
                  <Button
                    onClick={handleConnectWhatsApp}
                    disabled={connectWhatsAppMutation.isPending}
                    className="w-full"
                    data-testid="button-connect-whatsapp"
                  >
                    {connectWhatsAppMutation.isPending ? "Connecting..." : "Connect WhatsApp"}
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Activity History Accordion */}
        <Card>
          <CardHeader 
            className="cursor-pointer select-none"
            onClick={() => setHistoryExpanded(!historyExpanded)}
            data-testid="accordion-history-header"
          >
            <CardTitle className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <History className="w-5 h-5" />
                <span>{t('settings.activityHistory')}</span>
              </div>
              {historyExpanded ? (
                <ChevronUp className="w-5 h-5 text-slate-400" />
              ) : (
                <ChevronDown className="w-5 h-5 text-slate-400" />
              )}
            </CardTitle>
            <p className="text-sm text-slate-600 mt-1">
              {t('settings.activityHistoryDescription')}
            </p>
          </CardHeader>
          {historyExpanded && (
            <CardContent className="space-y-3 pt-0">
              {activitiesLoading ? (
                <div className="text-center py-4">
                  <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
                  <p className="text-slate-500 text-sm">{t('settings.loadingHistory')}</p>
                </div>
              ) : activities.length === 0 ? (
                <div className="text-center py-4">
                  <p className="text-slate-500 text-sm">{t('settings.noHistoryYet')}</p>
                </div>
              ) : (
                <div className="space-y-3 max-h-80 overflow-y-auto">
                  {activities.map((activity) => (
                    <div key={activity.id} className="border border-slate-200 rounded-lg p-3">
                      <div className="flex items-center space-x-3">
                        <div className="w-8 h-8 bg-secondary/10 rounded-lg flex items-center justify-center flex-shrink-0">
                          {activity.type === "weight_recorded" ? (
                            <TrendingDown className="w-4 h-4 text-secondary" />
                          ) : activity.type === "shared_progress" ? (
                            <Share2 className="w-4 h-4 text-blue-600" />
                          ) : (
                            <Trash2 className="w-4 h-4 text-secondary" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-900 truncate">
                            {activity.description}
                          </p>
                          <p className="text-xs text-slate-500">
                            {activity.createdAt ? formatDistanceToNow(new Date(activity.createdAt), { addSuffix: true }) : t('common.unknown')}
                          </p>
                        </div>
                        {(activity as any).metadata?.change && (
                          <span className={`text-xs font-medium flex-shrink-0 ${
                            (activity as any).metadata.change < 0 ? 'text-secondary' : 'text-blue-600'
                          }`}>
                            {(activity as any).metadata.change > 0 ? '+' : ''}{(activity as any).metadata.change.toFixed(1)} {userWeightUnit}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          )}
        </Card>

      </main>

      {/* Bottom Navigation */}
      <BottomNavigation />
    </div>
  );
}
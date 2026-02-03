import { useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "@/hooks/useTranslation";
import { useMarketContext } from "@/contexts/MarketProvider";
import { isUnauthorizedError } from "@/lib/authUtils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { User, Target, Crown, LogOut, Settings, Star, Zap, Shield, Lock, Heart } from "lucide-react";
import { Link } from "wouter";
import BottomNavigation from "@/components/bottom-navigation";
import PlanBadge from "@/components/plan-badge";
import type { WeightEntry } from "@shared/schema";
import { getUserTier, canAccessFeature } from "@shared/subscriptionUtils";
import { formatWeight, convertWeight, getBMICategory, type WeightUnit } from "@shared/utils";

export default function Profile() {
  const { user, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const { t } = useTranslation();
  const { market } = useMarketContext();
  const [goalWeight, setGoalWeight] = useState("");

  // Redirect if not authenticated
  useEffect(() => {
    if (!authLoading && !user) {
      toast({
        title: "Unauthorized",
        description: "You are logged out. Logging in again...",
        variant: "destructive",
      });
      setTimeout(() => {
        window.location.href = "/auth";
      }, 500);
      return;
    }
  }, [user, authLoading, toast]);

  // Set initial goal weight
  useEffect(() => {
    if ((user as any)?.goalWeight) {
      setGoalWeight((user as any).goalWeight);
    }
  }, [user]);

  // Fetch latest weight and stats
  const { data: latestWeight } = useQuery<WeightEntry>({
    queryKey: ["/api/weight-entries/latest"],
    enabled: !!user,
  });

  const { data: stats } = useQuery<{
    totalLost: number;
    avgPerWeek: number;
    totalRecordings: number;
    progressPercentage: number;
  }>({
    queryKey: ["/api/stats"],
    enabled: !!user,
  });

  // Update profile mutation
  const updateProfileMutation = useMutation({
    mutationFn: async (data: { goalWeight?: string }) => {
      await apiRequest("PATCH", "/api/profile", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      toast({
        title: "Profile Updated",
        description: "Your goal weight has been updated successfully.",
      });
    },
    onError: (error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "Unauthorized",
          description: "You are logged out. Logging in again...",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/auth";
        }, 500);
        return;
      }
      toast({
        title: "Error",
        description: "Failed to update profile. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleSaveGoal = () => {
    const weight = parseFloat(goalWeight);
    if (isNaN(weight) || weight <= 0) {
      toast({
        title: "Invalid Goal",
        description: "Please enter a valid goal weight.",
        variant: "destructive",
      });
      return;
    }

    updateProfileMutation.mutate({ goalWeight: weight.toString() });
  };

  if (authLoading || !user) {
    return (
      <div className="max-w-sm mx-auto bg-white min-h-screen shadow-xl flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-600">Loading...</p>
        </div>
      </div>
    );
  }

  const isFreeTier = (user as any)?.subscriptionTier === "free";
  const userWeightUnit = ((user as any)?.weightUnit || "lbs") as WeightUnit;
  
  // Convert current weight from stored unit to user's preferred unit
  const currentWeight = latestWeight ? 
    convertWeight(
      parseFloat(latestWeight.weight),
      (latestWeight.unit as WeightUnit) || "lbs",
      userWeightUnit
    ) : 0;
  
  const userGoalWeight = (user as any)?.goalWeight ? parseFloat((user as any).goalWeight) : 0;
  const tier = user ? getUserTier(user as any) : null;
  const canSetGoals = user && canAccessFeature(user as any, "goalSetting");

  return (
    <div className="max-w-sm mx-auto bg-white min-h-screen shadow-xl">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-50">
        <div className="flex items-center justify-between p-4">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
              <User className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-lg font-semibold text-slate-900">{t('profile.title')}</h1>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="pb-20">
        <div className="p-4 space-y-6">
          {/* User Info Card */}
          <Card className="border-slate-200">
            <CardContent className="p-6">
              <div className="flex items-center space-x-4 mb-4">
                <img
                  src={(user as any)?.profileImageUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(((user as any)?.firstName || '') + ' ' + ((user as any)?.lastName || ''))}&background=4F46E5&color=fff`}
                  alt="Profile"
                  className="w-16 h-16 rounded-full object-cover"
                />
                <div className="flex-1">
                  <h2 className="text-lg font-semibold text-slate-900">
                    {(user as any)?.firstName || (user as any)?.lastName ? 
                      `${(user as any)?.firstName || ''} ${(user as any)?.lastName || ''}`.trim() :
                      'User'
                    }
                  </h2>
                  <p className="text-slate-600">
                    {(user as any)?.email?.includes('@scanmyscale.temp') 
                      ? 'Connected via Facebook' 
                      : (user as any)?.email}
                  </p>
                  <div className="flex items-center space-x-2 mt-2">
                    <PlanBadge tier={(user as any)?.subscriptionTier || "free"} size="sm" />
                  </div>
                </div>
              </div>

              {/* Quick Stats */}
              {stats && currentWeight > 0 && (
                <div className="grid grid-cols-3 gap-4 pt-4 border-t border-slate-100">
                  <div className="text-center">
                    <p className="text-lg font-semibold text-slate-900">
                      {formatWeight(currentWeight, userWeightUnit)}
                    </p>
                    <p className="text-xs text-slate-500">{t('profile.currentWeight')}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-lg font-semibold text-secondary">
                      {formatWeight(stats.totalLost, userWeightUnit)}
                    </p>
                    <p className="text-xs text-slate-500">{t('profile.totalLost')}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-lg font-semibold text-slate-900">
                      {stats.totalRecordings}
                    </p>
                    <p className="text-xs text-slate-500">{t('analytics.totalRecordings')}</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>


          {/* Subscription */}
          <Card className={`border-slate-200 ${isFreeTier ? 'bg-amber-50 border-amber-200' : 'bg-gradient-to-r from-primary/5 to-indigo-50'}`}>
            <CardHeader>
              <CardTitle className="text-base flex items-center space-x-2">
                {isFreeTier ? (
                  <User className="w-4 h-4 text-amber-600" />
                ) : (
                  <Crown className="w-4 h-4 text-accent" />
                )}
                <span>{t('profile.yourCurrentPlan')}</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isFreeTier ? (
                <div>
                  <p className="text-slate-700 mb-3">
                    {t('profile.freePlanIncludes')}
                  </p>
                  <div className="space-y-2 text-sm text-slate-600 mb-4">
                    <div>• {t('profile.freePlanFeatures.oneWeeklyRecord')}</div>
                    <div>• {t('profile.freePlanFeatures.basicHistory')}</div>
                    <div>• {t('profile.freePlanFeatures.simpleTracking')}</div>
                  </div>
                  <Button 
                    className="w-full bg-accent text-white hover:bg-amber-600" 
                    data-testid="button-upgrade-plans"
                    onClick={() => window.location.href = `/analytics-upgrade?m=${market.id}`}
                  >
                    {t('profile.upgradePlans')}
                  </Button>
                </div>
              ) : (
                <div>
                  {(() => {
                    const userTier = getUserTier(user as any);
                    const tierName = userTier.displayName;
                    
                    return (
                      <>
                        <p className="text-slate-700 mb-3">
                          {t('profile.paidPlanIncludes', { tierName })}
                        </p>
                        <div className="space-y-2 text-sm text-slate-600 mb-4">
                          <div>✓ {t('profile.paidPlanFeatures.dailyRecordings')}</div>
                          <div>✓ {t('profile.paidPlanFeatures.socialSharing')}</div>
                          {userTier.imageUpload && <div>✓ {t('profile.paidPlanFeatures.photoUploads')}</div>}
                          {userTier.goalSetting && <div>✓ {t('profile.paidPlanFeatures.goalSetting')}</div>}
                          {userTier.deleteLastReading && <div>✓ {t('profile.paidPlanFeatures.deleteReadings')}</div>}
                          {userTier.analyticsAccess && <div>✓ {t('profile.paidPlanFeatures.advancedAnalytics')}</div>}
                        </div>
                        {tierName !== "Pro" && (
                          <Button 
                            variant="outline" 
                            className="w-full"
                            data-testid="button-upgrade-current"
                            onClick={() => window.location.href = `/analytics-upgrade?m=${market.id}`}
                          >
                            {t('profile.upgradePlan')}
                          </Button>
                        )}
                      </>
                    );
                  })()}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Actions */}
          <div className="space-y-3">

            <Button
              variant="outline"
              className="w-full justify-start text-red-600 hover:text-red-700 hover:bg-red-50"
              onClick={() => {
                // Use direct navigation to the logout endpoint which will handle redirect
                window.location.replace("/api/logout");
              }}
            >
              <LogOut className="w-4 h-4 mr-2" />
              {t('profile.signOut')}
            </Button>
          </div>

          {/* Our Story & Mission */}
          <Card className="border-slate-200 bg-gradient-to-r from-blue-50 to-indigo-50 overflow-hidden">
            <CardHeader>
              <CardTitle className="text-base flex items-center space-x-2">
                <Heart className="w-4 h-4 text-blue-600" />
                <span>{t('profile.ourStoryMission')}</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="overflow-hidden">
              <Dialog>
                <DialogTrigger asChild>
                  <Button variant="ghost" className="w-full text-left justify-start p-0 h-auto font-normal text-slate-700 hover:text-blue-700 hover:bg-transparent overflow-hidden">
                    <div className="text-sm leading-relaxed break-words whitespace-normal overflow-wrap-anywhere max-w-full pr-2">
                      <span dangerouslySetInnerHTML={{ __html: t('profile.doctorVisionStory') }} />
                    </div>
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle className="text-lg font-semibold text-slate-900">
                      {t('profile.storyTitle')}
                    </DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 text-sm text-slate-700 leading-relaxed">
                    <p>
                      {t('profile.storyContent.p1')}
                    </p>
                    <p>
                      {t('profile.storyContent.p2')}
                    </p>
                    <p>
                      {t('profile.storyContent.p3')}
                    </p>
                    <p>
                      {t('profile.storyContent.p4')}
                    </p>
                    <p>
                      {t('profile.storyContent.p5')}
                    </p>
                    <p className="font-medium">
                      {t('profile.storyContent.thankYou') || 'Thank you for being a part of our story.'}
                    </p>
                    <p className="text-xs text-slate-500 italic">
                      {t('profile.storyContent.signature') || '— Noe II, Founder, Physician and Loving Son'}
                    </p>
                    
                    <Dialog>
                      <DialogTrigger asChild>
                        <Button variant="link" className="p-0 h-auto text-blue-600 hover:text-blue-800 text-sm">
                          Read the full story
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
                        <DialogHeader>
                          <DialogTitle className="text-lg font-semibold text-slate-900">
                            Our Story: More Than an App, A Legacy of Care
                          </DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4 text-sm text-slate-700 leading-relaxed">
                          <p>
                            My name is Noe, and I'm a second-generation medical doctor. But the idea for this app wasn't mine. It belonged to my father, a beloved physician who saw a future he couldn't yet build.
                          </p>
                          <p>
                            During his long career, he cared for thousands of patients. He understood that the most meaningful changes in health don't happen in the few minutes a patient is in his office, but in the small, daily choices they make at home.
                          </p>
                          <p>
                            He once told me something that I never forgot:
                          </p>
                          <blockquote className="border-l-4 border-blue-200 pl-4 italic text-slate-600">
                            "Noe, if I had the ability to collect the daily weight reading of each one of my clients, you have no idea how much good I could do for each one of them."
                          </blockquote>
                          <p>
                            That was his dream: a simple, effortless way to gain the daily insight needed to provide continuous, compassionate care.
                          </p>
                          <p>
                            Twenty years ago, I studied information systems before following him into medicine. I carried his words with me, waiting for technology to catch up to his vision. Today, it finally has.
                          </p>
                          <p>
                            I built ScanMyScale to be everything he imagined. It's a tool designed not just to track data, but to build a bridge of understanding between you and your health journey. It's simple, it's effortless, and it's built on a foundation of a doctor's lifelong commitment to his patients.
                          </p>
                          <p className="font-medium">
                            Your journey is his legacy. Thank you for helping us fulfill it.
                          </p>
                        </div>
                      </DialogContent>
                    </Dialog>
                  </div>
                </DialogContent>
              </Dialog>
            </CardContent>
          </Card>
        </div>
      </main>

      {/* Bottom Navigation */}
      <BottomNavigation />
    </div>
  );
}

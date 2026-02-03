import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "@/hooks/useTranslation";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingDown, TrendingUp, Target, Calendar, BarChart3, Lock, Trophy, Star, Zap, Shield, Crown } from "lucide-react";
import WeightChart from "@/components/weight-chart";
import BottomNavigation from "@/components/bottom-navigation";
import PlanBadge from "@/components/plan-badge";
import type { WeightEntry } from "@shared/schema";
import { 
  calculateGoalProgress, 
  estimateTimeToGoal, 
  formatWeight, 
  convertWeight,
  getBMICategoryInfo,
  type WeightUnit 
} from "@shared/utils";
import { canAccessFeature, getUserTier } from "@shared/subscriptionUtils";

export default function Analytics() {
  const { user, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const { t } = useTranslation();
  const [, setLocation] = useLocation();

  // Redirect if not authenticated
  useEffect(() => {
    if (!authLoading && !user) {
      toast({
        title: t('analytics.unauthorized'),
        description: t('analytics.loggedOut'),
        variant: "destructive",
      });
      setTimeout(() => {
        window.location.href = "/auth";
      }, 500);
      return;
    }
  }, [user, authLoading, toast]);

  // Redirect free users to upgrade page
  useEffect(() => {
    if (!authLoading && user && !canAccessFeature(user as any, "analyticsAccess")) {
      setLocation("/analytics-upgrade");
      return;
    }
  }, [user, authLoading, setLocation]);

  // Fetch weight statistics
  const { data: stats, isLoading: statsLoading } = useQuery<{
    totalLost: number;
    avgPerWeek: number;
    totalRecordings: number;
    progressPercentage: number;
  }>({
    queryKey: ["/api/stats"],
    enabled: !!user,
  });

  // Fetch weight entries for calculations
  const { data: weightEntries = [] } = useQuery<WeightEntry[]>({
    queryKey: ["/api/weight-entries"],
    enabled: !!user,
  });

  if (authLoading || !user) {
    return (
      <div className="max-w-sm mx-auto bg-white min-h-screen shadow-xl flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-600">{t('analytics.loading')}</p>
        </div>
      </div>
    );
  }

  const userTier = (user as any)?.subscriptionTier || "free";
  const isFreeTier = userTier === "free";
  const hasData = weightEntries.length > 0;
  const userWeightUnit = ((user as any)?.weightUnit || "lbs") as WeightUnit;
  const goalWeight = (user as any)?.goalWeight ? parseFloat((user as any).goalWeight) : null;
  

  // Calculate additional analytics
  const getWeeklyAverage = () => {
    if (weightEntries.length < 2) return 0;
    
    const last30Days = weightEntries.filter((entry) => {
      const entryDate = new Date(entry.createdAt!);
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      return entryDate >= thirtyDaysAgo;
    });
    
    if (last30Days.length < 2) return 0;
    
    const weights = last30Days.map((entry) => parseFloat(entry.weight));
    const total = weights.reduce((sum: number, weight: number) => sum + weight, 0);
    return total / weights.length;
  };

  const getBestWeek = () => {
    if (weightEntries.length < 2) return null;
    
    let bestLoss = 0;
    let bestWeekStart = null;
    
    for (let i = 0; i < weightEntries.length - 1; i++) {
      const current = parseFloat(weightEntries[i].weight);
      const previous = parseFloat(weightEntries[i + 1].weight);
      const loss = previous - current;
      
      if (loss > bestLoss) {
        bestLoss = loss;
        bestWeekStart = new Date(weightEntries[i + 1].createdAt!);
      }
    }
    
    return bestLoss > 0 ? { loss: bestLoss, date: bestWeekStart } : null;
  };

  const weeklyAverage = getWeeklyAverage();
  const bestWeek = getBestWeek();
  
  // Calculate goal progress if goal is set
  let goalProgress = null;
  let timeToGoal = null;
  
  if (goalWeight && weightEntries.length > 0) {
    const currentWeight = convertWeight(
      parseFloat(weightEntries[0].weight),
      (weightEntries[0].unit as WeightUnit) || "lbs",
      userWeightUnit
    );
    const startWeight = convertWeight(
      parseFloat(weightEntries[weightEntries.length - 1].weight),
      (weightEntries[weightEntries.length - 1].unit as WeightUnit) || "lbs",
      userWeightUnit
    );
    
    goalProgress = calculateGoalProgress(currentWeight, goalWeight, startWeight);
    
    if (stats?.avgPerWeek) {
      timeToGoal = estimateTimeToGoal(
        goalProgress.remainingWeight,
        Math.abs(stats.avgPerWeek),
        goalProgress.isGainGoal
      );
    }
  }

  return (
    <div className="max-w-sm mx-auto bg-white min-h-screen shadow-xl">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-50">
        <div className="flex items-center justify-between p-4">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
              <BarChart3 className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-lg font-semibold text-slate-900">Analytics</h1>
          </div>
          <PlanBadge tier={userTier} size="sm" />
        </div>
      </header>

      {/* Main Content */}
      <main className="pb-20">
        {!hasData ? (
          <div className="p-4">
            <Card>
              <CardContent className="p-8 text-center">
                <BarChart3 className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-slate-900 mb-2">No Data Yet</h3>
                <p className="text-slate-600 mb-4">
                  Start recording your weight to see detailed analytics and insights.
                </p>
                <button
                  onClick={() => window.location.href = "/"}
                  className="text-primary font-medium hover:underline"
                >
                  Record Your First Weight
                </button>
              </CardContent>
            </Card>
          </div>
        ) : (
          <div className="p-4 space-y-6">
            {/* Weight Chart */}
            <div>
              <h2 className="text-lg font-semibold text-slate-900 mb-4">{t('analytics.weightTrend')}</h2>
              <WeightChart />
            </div>

            {/* Key Statistics */}
            <div>
              <h2 className="text-lg font-semibold text-slate-900 mb-4">Key Statistics</h2>
              <div className="grid grid-cols-2 gap-3">
                <Card className="border-slate-200">
                  <CardContent className="p-4 text-center">
                    <div className="w-8 h-8 bg-secondary/10 rounded-lg flex items-center justify-center mx-auto mb-2">
                      <TrendingDown className="w-4 h-4 text-secondary" />
                    </div>
                    <p className="text-2xl font-bold text-slate-900">
                      {stats?.totalLost ? formatWeight(stats.totalLost, userWeightUnit) : `0.0 ${userWeightUnit}`}
                    </p>
                    <p className="text-xs text-slate-500">Total Lost</p>
                  </CardContent>
                </Card>

                <Card className="border-slate-200">
                  <CardContent className="p-4 text-center">
                    <div className="w-8 h-8 bg-blue-50 rounded-lg flex items-center justify-center mx-auto mb-2">
                      <Calendar className="w-4 h-4 text-blue-600" />
                    </div>
                    <p className="text-2xl font-bold text-slate-900">
                      {stats?.avgPerWeek ? formatWeight(Math.abs(stats.avgPerWeek), userWeightUnit) : `0.0 ${userWeightUnit}`}
                    </p>
                    <p className="text-xs text-slate-500">Avg/Week</p>
                  </CardContent>
                </Card>

                <Card className="border-slate-200">
                  <CardContent className="p-4 text-center">
                    <div className="w-8 h-8 bg-purple-50 rounded-lg flex items-center justify-center mx-auto mb-2">
                      <BarChart3 className="w-4 h-4 text-purple-600" />
                    </div>
                    <p className="text-2xl font-bold text-slate-900">
                      {stats?.totalRecordings || 0}
                    </p>
                    <p className="text-xs text-slate-500">Total Entries</p>
                  </CardContent>
                </Card>

                {/* BMI Card */}
                {(user as any)?.bmi && (() => {
                  const bmiInfo = getBMICategoryInfo(parseFloat((user as any).bmi));
                  return (
                    <Card className={`border-2 ${bmiInfo.colorClass} ${bmiInfo.bgClass}`}>
                      <CardContent className="p-4 text-center">
                        <div className={`w-8 h-8 ${bmiInfo.bgClass} rounded-lg flex items-center justify-center mx-auto mb-2 border ${bmiInfo.colorClass}`}>
                          <span className={`text-xs font-bold ${bmiInfo.textClass}`}>BMI</span>
                        </div>
                        <p className={`text-2xl font-bold ${bmiInfo.textClass}`}>
                          {parseFloat((user as any).bmi).toFixed(1)}
                        </p>
                        <p className={`text-xs font-medium ${bmiInfo.textClass}`}>
                          {bmiInfo.label}
                        </p>
                      </CardContent>
                    </Card>
                  );
                })()}
                
                {goalProgress && (
                  <Card className="border-slate-200">
                    <CardContent className="p-4 text-center">
                      <div className="w-8 h-8 bg-amber-50 rounded-lg flex items-center justify-center mx-auto mb-2">
                        <Target className="w-4 h-4 text-amber-600" />
                      </div>
                      <p className="text-2xl font-bold text-slate-900">
                        {goalProgress.progressPercentage.toFixed(0)}%
                      </p>
                      <p className="text-xs text-slate-500">Goal Progress</p>
                    </CardContent>
                  </Card>
                )}


              </div>
            </div>

            {/* Advanced Analytics - Pro Feature */}
            {isFreeTier ? (
              <Card className="bg-amber-50 border-amber-200">
                <CardContent className="p-6 text-center">
                  <Lock className="w-12 h-12 text-amber-500 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-slate-900 mb-2">Advanced Analytics</h3>
                  <p className="text-slate-600 mb-4">
                    Unlock detailed insights, trends analysis, and personalized recommendations with Pro.
                  </p>
                  <div className="grid grid-cols-2 gap-2 mb-4 text-sm text-slate-600">
                    <div>• Weekly trend analysis</div>
                    <div>• BMI tracking</div>
                    <div>• Goal predictions</div>
                    <div>• Export data</div>
                  </div>
                  <button
                    onClick={() => {
                      toast({
                        title: "Coming Soon",
                        description: "Pro subscription will be available soon!",
                      });
                    }}
                    className="bg-accent text-white px-4 py-2 rounded-lg font-medium hover:bg-amber-600 transition-colors"
                  >
                    Upgrade to Pro
                  </button>
                </CardContent>
              </Card>
            ) : (
              /* Pro Analytics */
              <div>
                <h2 className="text-lg font-semibold text-slate-900 mb-4">Advanced Insights</h2>
                <div className="space-y-4">
                  <Card className="border-slate-200">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium flex items-center space-x-2">
                        <TrendingDown className="w-4 h-4 text-secondary" />
                        <span>30-Day Average</span>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <p className="text-2xl font-bold text-slate-900">
                        {formatWeight(weeklyAverage, userWeightUnit)}
                      </p>
                      <p className="text-xs text-slate-500">Based on recent entries</p>
                    </CardContent>
                  </Card>

                  {bestWeek && (
                    <Card className="border-slate-200">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium flex items-center space-x-2">
                          <Trophy className="w-4 h-4 text-secondary" />
                          <span>Best Week</span>
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="pt-0">
                        <p className="text-2xl font-bold text-secondary">
                          -{formatWeight(bestWeek.loss, userWeightUnit)}
                        </p>
                        <p className="text-xs text-slate-500">
                          Week of {bestWeek.date?.toLocaleDateString()}
                        </p>
                      </CardContent>
                    </Card>
                  )}

                  {/* Goal Analytics - Pro Feature */}
                  {goalProgress && timeToGoal && (
                    <Card className="border-slate-200">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium flex items-center space-x-2">
                          <Target className="w-4 h-4 text-primary" />
                          <span>Goal Analysis</span>
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="pt-0 space-y-3">
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-slate-600">Progress Direction</span>
                          <Badge 
                            variant={goalProgress.progressDirection === "achieved" ? "default" : 
                                    goalProgress.progressDirection === "toward" ? "secondary" : "destructive"}
                            className="text-xs"
                          >
                            {goalProgress.progressDirection === "achieved" ? "Achieved!" : 
                             goalProgress.progressDirection === "toward" ? "On Track" : "Off Track"}
                          </Badge>
                        </div>
                        
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-slate-600">Remaining</span>
                          <span className="text-sm font-semibold">
                            {formatWeight(goalProgress.remainingWeight, userWeightUnit)}
                          </span>
                        </div>
                        
                        {timeToGoal.achievable && (
                          <div className="flex justify-between items-center">
                            <span className="text-sm text-slate-600">Time to Goal</span>
                            <span className="text-sm font-semibold">
                              {timeToGoal.weeks > 0 ? `${timeToGoal.weeks} weeks` : `${timeToGoal.days} days`}
                            </span>
                          </div>
                        )}
                        
                        <div className="bg-slate-50 rounded-lg p-3 mt-3">
                          <p className="text-xs text-slate-500 mb-1">Goal Type</p>
                          <p className="text-sm font-medium">
                            {goalProgress.isGainGoal ? "Weight Gain Goal" : "Weight Loss Goal"}
                          </p>
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Bottom Navigation */}
      <BottomNavigation />
    </div>
  );
}

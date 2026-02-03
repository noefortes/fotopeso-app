import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "@/hooks/useTranslation";
import { Card, CardContent } from "@/components/ui/card";
import { TrendingDown, Share2, Trash2 } from "lucide-react";
import BottomNavigation from "@/components/bottom-navigation";
import { formatDistanceToNow } from "date-fns";
import type { ActivityLog } from "@shared/schema";

export default function History() {
  const { user, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const { t } = useTranslation();

  // Get user's preferred weight unit
  const userWeightUnit = (user as any)?.weightUnit || 'lbs';

  // Redirect if not authenticated
  useEffect(() => {
    if (!authLoading && !user) {
      toast({
        title: t('history.sessionExpired'),
        description: t('history.sessionEnded'),
        variant: "destructive",
      });
      setTimeout(() => {
        window.location.href = "/auth";
      }, 500);
      return;
    }
  }, [user, authLoading, toast]);

  // Fetch recent activity
  const { data: activities = [], isLoading } = useQuery<ActivityLog[]>({
    queryKey: ["/api/activity"],
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

  return (
    <div className="max-w-sm mx-auto bg-white min-h-screen shadow-xl">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-50">
        <div className="flex items-center justify-between p-4">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
              <TrendingDown className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-lg font-semibold text-slate-900">{t('history.title')}</h1>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="pb-20">
        <div className="p-4">
          <div className="space-y-3">
            {isLoading ? (
              <Card className="border-slate-200">
                <CardContent className="p-4 text-center">
                  <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
                  <p className="text-slate-500">{t('history.loadingTimeline')}</p>
                </CardContent>
              </Card>
            ) : activities.length === 0 ? (
              <Card className="border-slate-200">
                <CardContent className="p-4 text-center">
                  <p className="text-slate-500">{t('history.getStarted')}</p>
                </CardContent>
              </Card>
            ) : (
              activities.map((activity) => (
                <Card key={activity.id} className="border-slate-200">
                  <CardContent className="p-4">
                    <div className="flex items-center space-x-3">
                      <div className="w-10 h-10 bg-secondary/10 rounded-lg flex items-center justify-center">
                        {activity.type === "weight_recorded" ? (
                          <TrendingDown className="w-5 h-5 text-secondary" />
                        ) : activity.type === "shared_progress" ? (
                          <Share2 className="w-5 h-5 text-blue-600" />
                        ) : (
                          <Trash2 className="w-5 h-5 text-secondary" />
                        )}
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-slate-900">
                          {activity.description}
                        </p>
                        <p className="text-xs text-slate-500">
                          {activity.createdAt ? formatDistanceToNow(new Date(activity.createdAt), { addSuffix: true }) : 'Unknown'}
                        </p>
                      </div>
                      {(activity as any).metadata?.change && (
                        <span className={`text-xs font-medium ${
                          (activity as any).metadata.change < 0 ? 'text-secondary' : 'text-blue-600'
                        }`}>
                          {(activity as any).metadata.change > 0 ? '+' : ''}{(activity as any).metadata.change.toFixed(1)} {userWeightUnit}
                        </span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </div>
      </main>

      {/* Bottom Navigation */}
      <BottomNavigation />
    </div>
  );
}

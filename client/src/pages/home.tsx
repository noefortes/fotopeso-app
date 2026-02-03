import { useEffect, useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { isUnauthorizedError } from "@/lib/authUtils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Camera, Share2, TrendingDown, TrendingUp, Lock, Upload, Target } from "lucide-react";
import { Link } from "wouter";

import ShareModal from "@/components/share-modal";
import WeightChart from "@/components/weight-chart";
import BottomNavigation from "@/components/bottom-navigation";
import DeleteWeightButton from "@/components/delete-weight-button";
import PlanBadge from "@/components/plan-badge";
import ProfileCompletion from "@/components/profile-completion-fixed";
import WeighInReminder from "@/components/weigh-in-reminder";
import CameraModal from "@/components/camera-modal";
import WeightConfirmationModal from "@/components/weight-confirmation-modal";
import { WeightDisplay, WeightChangeDisplay } from "@/components/weight-display";
import { AIProcessingOverlay } from "@/components/ai-processing-overlay";
import { format, formatDistanceToNow, addDays, differenceInDays } from "date-fns";
import type { WeightEntry } from "@shared/schema";
import { 
  convertWeight, 
  type WeightUnit, 
  calculateGoalProgress, 
  estimateTimeToGoal,
  formatWeight
} from "@shared/utils";
import { canAccessFeature, getUserTier } from "@shared/subscriptionUtils";
import { useTranslation } from "@/hooks/useTranslation";
import { useMarketContext } from "@/contexts/MarketProvider";

export default function Home() {
  const { user, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const { t } = useTranslation();
  const { market } = useMarketContext();
  const [showShareModal, setShowShareModal] = useState(false);
  const [showCameraModal, setShowCameraModal] = useState(false);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Redirect if not authenticated
  useEffect(() => {
    if (!authLoading && !user) {
      toast({
        title: t('home.unauthorized'),
        description: t('home.loggedOut'),
        variant: "destructive",
      });
      setTimeout(() => {
        window.location.href = "/auth";
      }, 500);
      return;
    }
  }, [user, authLoading, toast]);

  // Fetch latest weight entry
  const { data: latestWeight } = useQuery<WeightEntry>({
    queryKey: ["/api/weight-entries/latest"],
    enabled: !!user,
  });

  // Fetch weight statistics
  const { data: stats } = useQuery<{
    totalLost: number;
    avgPerWeek: number;
    totalRecordings: number;
    progressPercentage: number;
  }>({
    queryKey: ["/api/stats"],
    enabled: !!user,
  });



  // Check if user can record weight
  const { data: canRecordData } = useQuery<{ canRecord: boolean }>({
    queryKey: ["/api/weight-entries/can-record"],
    enabled: !!user,
  });

  if (authLoading || !user) {
    return (
      <div className="max-w-sm mx-auto bg-white min-h-screen shadow-xl flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-600">{t('home.loading')}</p>
        </div>
      </div>
    );
  }

  const userWeightUnit = ((user as any)?.weightUnit || "lbs") as WeightUnit;
  const currentWeight = latestWeight ? parseFloat(latestWeight.weight) : 0;
  const canRecord = canRecordData?.canRecord ?? true;
  const userTier = (user as any)?.subscriptionTier || "free";
  const isFreeTier = userTier === "free";
  const canUploadImages = user && canAccessFeature(user as any, "imageUpload");
  const goalWeight = (user as any)?.goalWeight ? parseFloat((user as any).goalWeight) : null;
  
  // Calculate days until next entry for free users
  const calculateDaysUntilNextEntry = () => {
    if (userTier !== 'free' || !latestWeight?.createdAt) return 0;
    const lastRecordingDate = new Date(latestWeight.createdAt);
    const nextAvailableDate = addDays(lastRecordingDate, 7);
    const daysLeft = differenceInDays(nextAvailableDate, new Date());
    return Math.max(0, daysLeft);
  };
  
  const daysUntilNext = calculateDaysUntilNextEntry();
  
  // Debug: Remove these logs in production
  // console.log("User tier:", userTier, "Can record:", canRecord);
  
  // Calculate weight change from previous entry
  const { data: weightEntries = [] } = useQuery<WeightEntry[]>({
    queryKey: ["/api/weight-entries"],
    enabled: !!user,
  });
  
  // Check if user has any weight entries
  const hasWeightEntries = weightEntries.length > 0;
  
  let weightChange = 0;
  let goalProgress = null;
  let timeToGoal = null;
  
  if (weightEntries.length > 1) {
    const current = convertWeight(
      parseFloat(weightEntries[0].weight), 
      (weightEntries[0].unit as WeightUnit) || "lbs", 
      userWeightUnit
    );
    const previous = convertWeight(
      parseFloat(weightEntries[1].weight), 
      (weightEntries[1].unit as WeightUnit) || "lbs", 
      userWeightUnit
    );
    weightChange = current - previous;
  }
  
  // Calculate goal progress if goal is set
  if (goalWeight && weightEntries.length > 0 && currentWeight > 0) {
    const startWeight = convertWeight(
      parseFloat(weightEntries[weightEntries.length - 1].weight),
      (weightEntries[weightEntries.length - 1].unit as WeightUnit) || "lbs",
      userWeightUnit
    );
    
    const currentWeightConverted = convertWeight(
      currentWeight,
      (latestWeight?.unit as WeightUnit) || "lbs",
      userWeightUnit
    );
    
    goalProgress = calculateGoalProgress(currentWeightConverted, goalWeight, startWeight);
    
    if (stats?.avgPerWeek) {
      timeToGoal = estimateTimeToGoal(
        goalProgress.remainingWeight,
        Math.abs(stats.avgPerWeek),
        goalProgress.isGainGoal
      );
    }
  }

  // States for weight confirmation workflow
  const [showWeightConfirmation, setShowWeightConfirmation] = useState(false);
  const [detectedWeight, setDetectedWeight] = useState<{
    weight: number;
    unit: string;
    confidence: number;
    capturedImage?: string;
  } | null>(null);

  // Weight detection mutation (no auto-save)
  const detectWeightMutation = useMutation({
    mutationFn: async (formData: FormData) => {
      const response = await apiRequest("POST", "/api/detect-weight", formData);
      return response.json();
    },
    onSuccess: (data, variables) => {
      // Extract image data for confirmation modal
      const imageFile = variables.get('photo') as File;
      if (imageFile) {
        const reader = new FileReader();
        reader.onload = (e) => {
          setDetectedWeight({
            weight: data.weight,
            unit: data.unit,
            confidence: data.confidence,
            capturedImage: e.target?.result as string
          });
          setShowWeightConfirmation(true);
        };
        reader.readAsDataURL(imageFile);
      }
    },
    onError: (error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: t('home.unauthorized'),
          description: t('home.loggedOut'),
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/auth";
        }, 500);
        return;
      }
      
      toast({
        title: t('home.errorDetecting'),
        description: error instanceof Error ? error.message : t('home.failedProcess'),
        variant: "destructive",
      });
    },
  });

  // Weight entry creation mutation (only called after confirmation)
  const createWeightEntryMutation = useMutation({
    mutationFn: async (data: { weight: number; unit: string; notes?: string }) => {
      const response = await apiRequest("POST", "/api/weight-entries", {
        weight: data.weight,
        unit: data.unit,
        notes: data.notes,
      });
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/weight-entries"] });
      queryClient.invalidateQueries({ queryKey: ["/api/weight-entries/latest"] });
      queryClient.invalidateQueries({ queryKey: ["/api/weight-entries/can-record"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/activity"] });
      
      toast({
        title: t('home.weightRecorded'),
        description: `Recorded: ${data.weight} ${data.unit}${data.weightChange ? ` (${data.weightChange > 0 ? '+' : ''}${data.weightChange.toFixed(1)} change)` : ''}`,
      });
      
      setShowWeightConfirmation(false);
      setDetectedWeight(null);
    },
    onError: (error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: t('home.unauthorized'),
          description: t('home.loggedOut'),
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/auth";
        }, 500);
        return;
      }
      
      // Handle subscription tier errors with user-friendly messages  
      let title = t('home.errorRecording');
      let description = t('home.failedRecord');
      
      if (error instanceof Error) {
        // Use the cleaned error message from central error handler
        description = error.message;
        // If it's a rate limit or subscription error, use more specific title
        if (error.message.toLowerCase().includes('limit') || error.message.toLowerCase().includes('upgrade')) {
          title = t('home.recordingLimit');
        }
      }
      
      toast({
        title,
        description,
        variant: "destructive",
      });
    },
  });

  // Camera and gallery handlers - now use detection workflow
  const handleCameraCapture = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      console.log('Camera capture:', file.name, file.type, file.size);
      
      // Validate file type
      if (!file.type.startsWith('image/')) {
        toast({
          title: t('home.invalidFileType'),
          description: t('home.selectImageFile'),
          variant: "destructive",
        });
        return;
      }
      
      const formData = new FormData();
      formData.append('photo', file);
      detectWeightMutation.mutate(formData);
    }
    
    // Clear the input so the same file can be selected again
    event.target.value = '';
  };

  const handleGalleryUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      console.log('Gallery upload:', file.name, file.type, file.size);
      
      // Validate file type
      if (!file.type.startsWith('image/')) {
        toast({
          title: t('home.invalidFileType'),
          description: t('home.selectImageFile'),
          variant: "destructive",
        });
        return;
      }
      
      // Validate file size (max 10MB)
      if (file.size > 10 * 1024 * 1024) {
        toast({
          title: t('home.fileTooLarge'),
          description: t('home.selectSmaller'),
          variant: "destructive",
        });
        return;
      }
      
      const formData = new FormData();
      formData.append('photo', file);
      detectWeightMutation.mutate(formData);
    }
    
    // Clear the input so the same file can be selected again
    event.target.value = '';
  };

  const handleWeightConfirm = (data: { weight: number; unit: string; notes?: string }) => {
    createWeightEntryMutation.mutate(data);
  };

  return (
    <div className="max-w-sm mx-auto bg-white min-h-screen shadow-xl">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-50">
        <div className="flex items-center justify-between p-4">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
              <TrendingDown className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-lg font-semibold text-slate-900">{t('brand.name')}</h1>
          </div>
          <button 
            className="p-2 rounded-lg hover:bg-slate-100"
            onClick={() => window.location.href = "/profile"}
          >
            <img 
              src={(user as any)?.profileImageUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(((user as any)?.firstName || '') + ' ' + ((user as any)?.lastName || ''))}&background=4F46E5&color=fff`}
              alt="Profile" 
              className="w-8 h-8 rounded-full object-cover" 
            />
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="pb-20">
        {/* Profile Completion Banner */}
        <ProfileCompletion user={user as any} />
        
        {/* In-App Reminder */}
        <div className="px-4">
          <WeighInReminder />
        </div>
        
        {/* Current Weight Card - Only show if user has weight entries */}
        {hasWeightEntries && (
          <div className="p-4">
            <div className="bg-gradient-to-r from-primary to-indigo-600 rounded-2xl p-6 text-white">
            <div className="flex justify-between items-start mb-4">
              <div>
                <p className="text-indigo-100 text-sm">{t('home.currentWeight')}</p>
                <p className="text-3xl font-bold">
                  {currentWeight > 0 ? (
                    <WeightDisplay 
                      weight={currentWeight}
                      originalUnit={(latestWeight?.unit as WeightUnit) || "lbs"}
                      displayUnit={userWeightUnit}
                    />
                  ) : '--'}
                </p>
                {weightChange !== 0 && (
                  <p className="text-indigo-100 text-sm">
                    <span className={weightChange < 0 ? "text-secondary" : "text-red-300"}>
                      {weightChange > 0 ? '+' : ''}{weightChange.toFixed(1)} {userWeightUnit}
                    </span> {t('home.sinceLastEntry')}
                  </p>
                )}
              </div>
              <div className="bg-white/20 rounded-lg p-2">
                {weightChange < 0 ? (
                  <TrendingDown className="w-6 h-6" />
                ) : (
                  <TrendingUp className="w-6 h-6" />
                )}
              </div>
            </div>
            
            {/* Progress Bar */}
            {stats && stats.progressPercentage > 0 && (
              <>
                <Progress value={stats.progressPercentage} className="h-2 mb-2" />
                <p className="text-indigo-100 text-xs">
                  {Math.round(stats.progressPercentage)}{t('home.toGoalWeight')}
                </p>
              </>
            )}
          </div>
          
          {/* Goal Progress Card */}
          {goalProgress && (
            <div className="mt-4 bg-white rounded-2xl border border-slate-200 p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center space-x-2">
                  <Target className="w-5 h-5 text-primary" />
                  <h3 className="font-semibold text-slate-900 text-sm">
                    {goalWeight ? t('home.yourJourneyTo', { goalWeight: formatWeight(goalWeight, userWeightUnit) }) : t('home.goalProgress')}
                  </h3>
                </div>
                <Badge 
                  variant={goalProgress.progressDirection === "achieved" ? "default" : 
                          goalProgress.progressDirection === "toward" ? "secondary" : "destructive"}
                >
                  {goalProgress.progressDirection === "achieved" ? t('home.goalReached') : 
                   goalProgress.progressDirection === "toward" ? t('home.keepGoing') : t('home.letsFocus')}
                </Badge>
              </div>
              
              <div className="space-y-3">
                <div>
                  <div className="flex justify-between text-sm text-slate-600 mb-1">
                    <span>{t('home.progress')}</span>
                    <span>{goalProgress.progressPercentage.toFixed(1)}%</span>
                  </div>
                  <Progress value={Math.min(goalProgress.progressPercentage, 100)} className="h-2" />
                </div>
                
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-slate-500">{t('home.goalWeight')}</p>
                    <p className="font-semibold">{formatWeight(goalWeight!, userWeightUnit)}</p>
                  </div>
                  <div>
                    <p className="text-slate-500">{t('home.toGo')}</p>
                    <p className="font-semibold">
                      {formatWeight(goalProgress.remainingWeight, userWeightUnit)}
                    </p>
                  </div>
                </div>
                
                {timeToGoal && timeToGoal.achievable && (
                  <div className="bg-slate-50 rounded-lg p-3">
                    <p className="text-xs text-slate-500 mb-1">{t('home.estimatedTime')}</p>
                    <p className="text-sm font-medium text-slate-700">
                      {timeToGoal.weeks > 0 ? `${timeToGoal.weeks} weeks` : `${timeToGoal.days} days`}
                      {timeToGoal.weeks > 8 && ` (${Math.ceil(timeToGoal.weeks / 4)} months)`}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
          </div>
        )}

        {/* Weight History Chart - Only show if user has weight entries */}
        {hasWeightEntries && (
          <div className="px-4 mb-6">
            <WeightChart />
          </div>
        )}

        {/* Quick Actions - Only show if user has weight entries */}
        {hasWeightEntries && (
          <div className="px-4 mb-6">
          {/* Delete Weight Button for Pro Users - Now first */}
          <DeleteWeightButton 
            latestWeight={latestWeight as any} 
            className="w-full mb-3"
          />
          
          <div className="grid grid-cols-3 gap-2">
            <Button
              variant="outline"
              className="h-auto p-3 flex flex-col items-center space-y-2 hover:shadow-md transition-shadow"
              onClick={() => canRecord ? cameraInputRef.current?.click() : null}
              disabled={!canRecord || detectWeightMutation.isPending}
            >
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                canRecord ? 'bg-primary/10' : 'bg-slate-100'
              }`}>
                {canRecord ? (
                  <Camera className="w-5 h-5 text-primary" />
                ) : (
                  <Lock className="w-5 h-5 text-slate-400" />
                )}
              </div>
              <span className={`text-xs font-medium ${
                canRecord ? 'text-slate-700' : 'text-slate-400'
              }`}>{t('home.scanWeight')}</span>
            </Button>
            
            <Button
              variant="outline"
              className="h-auto p-3 flex flex-col items-center space-y-2 hover:shadow-md transition-shadow"
              onClick={() => {
                if (!canUploadImages) {
                  toast({
                    title: t('home.featureNotAvailable'),
                    description: t('home.imageUploadRequires'),
                    variant: "destructive",
                  });
                } else {
                  fileInputRef.current?.click();
                }
              }}
              disabled={!canRecord || detectWeightMutation.isPending}
            >
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                canRecord && canUploadImages ? 'bg-green-100' : 'bg-slate-100'
              }`}>
                {canRecord && canUploadImages ? (
                  <Upload className="w-5 h-5 text-green-600" />
                ) : (
                  <Lock className="w-5 h-5 text-slate-400" />
                )}
              </div>
              <span className={`text-xs font-medium ${
                canRecord && canUploadImages ? 'text-slate-700' : 'text-slate-400'
              }`}>
                {t('home.uploadPhoto')}
              </span>
            </Button>

            <Button
              variant="outline"
              className="h-auto p-2 flex flex-col items-center space-y-1 hover:shadow-md transition-shadow min-h-[75px] w-full"
              onClick={() => setShowShareModal(true)}
              disabled={!latestWeight}
            >
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                latestWeight ? 'bg-blue-100' : 'bg-slate-100'
              }`}>
                <Share2 className={`w-5 h-5 ${latestWeight ? 'text-blue-600' : 'text-slate-400'}`} />
              </div>
              <span className={`text-[10px] font-medium text-center leading-tight break-words hyphens-auto px-1 ${
                latestWeight ? 'text-slate-700' : 'text-slate-400'
              }`} style={{ 
                wordBreak: 'break-word', 
                overflowWrap: 'break-word',
                hyphens: 'auto',
                lineHeight: '1.2'
              }}>{t('home.shareProgress')}</span>
            </Button>
          </div>
          
          {/* Hidden camera input */}
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleCameraCapture}
            className="hidden"
          />
          
          {/* Hidden file input for gallery selection */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleGalleryUpload}
            className="hidden"
          />
          </div>
        )}

        {/* Subscription Status Card (Non-Pro Users) */}
        {userTier !== 'pro' && userTier !== 'admin' && (
          <div className="px-4 mb-6">
            <Card className="bg-amber-50 border-amber-200">
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-2 mb-2">
                      <div className="bg-amber-100 border border-amber-200 rounded-lg p-2 flex flex-col items-center">
                        <span className="text-xs text-amber-700 font-medium mb-1">{t('home.yourPlan')}</span>
                        <PlanBadge tier={userTier} size="sm" />
                      </div>
                      <span className="text-xs text-amber-700">
                        {userTier === 'free' 
                          ? (canRecord ? t('home.weeklyAvailable') : t('home.nextAvailable', { days: daysUntilNext }))
                          : userTier === 'starter'
                          ? t('home.starterInsight')
                          : t('home.premiumInsight')
                        }
                      </span>
                    </div>
                    <p className="text-sm text-amber-800 mb-3">
                      {userTier === 'free' 
                        ? t('settings.readyToTrack')
                        : userTier === 'starter'
                        ? t('home.starterUpgradeText')
                        : t('home.premiumUpgradeText')
                      }
                    </p>
                    <Button 
                      className="bg-accent text-white hover:bg-amber-600 w-full"
                      data-testid="button-home-upgrade"
                      onClick={() => window.location.href = `/analytics-upgrade?m=${market.id}`}
                    >
                      {userTier === 'free' 
                        ? t('settings.viewPlans')
                        : userTier === 'starter'
                        ? t('home.upgradeNow')
                        : t('home.goPro')
                      }
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </main>

      {/* Modals */}

      <ShareModal 
        isOpen={showShareModal} 
        onClose={() => setShowShareModal(false)} 
      />

      {/* Camera Modal */}
      <CameraModal 
        isOpen={showCameraModal}
        onClose={() => setShowCameraModal(false)}
      />

      {/* Weight Confirmation Modal */}
      {showWeightConfirmation && detectedWeight && (
        <WeightConfirmationModal
          isOpen={showWeightConfirmation}
          onClose={() => {
            setShowWeightConfirmation(false);
            setDetectedWeight(null);
          }}
          onConfirm={handleWeightConfirm}
          detectedWeight={detectedWeight.weight}
          detectedUnit={detectedWeight.unit}
          userPreferredUnit={(user as any)?.weightUnit || 'lbs'}
          capturedImage={detectedWeight.capturedImage}
        />
      )}

      {/* AI Processing Overlay */}
      <AIProcessingOverlay isVisible={detectWeightMutation.isPending} />

      {/* Bottom Navigation */}
      <BottomNavigation />
    </div>
  );
}

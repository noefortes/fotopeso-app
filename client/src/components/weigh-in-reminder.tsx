import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Bell, Scale, TrendingUp, Calendar } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "@/hooks/useTranslation";
import { isUnauthorizedError } from "@/lib/authUtils";
import { canAccessFeature } from "@shared/subscriptionUtils";
import { useRef, useState } from "react";
import WeightConfirmationModal from "@/components/weight-confirmation-modal";
import { AIProcessingOverlay } from "@/components/ai-processing-overlay";

interface ReminderData {
  shouldShow: boolean;
  daysSinceLastWeighIn: number;
  lastWeighInDate?: string;
}

export default function WeighInReminder() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { t } = useTranslation();
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [showWeightConfirmation, setShowWeightConfirmation] = useState(false);
  const [detectedWeight, setDetectedWeight] = useState<{
    weight: number;
    unit: string;
    confidence: number;
    capturedImage?: string;
  } | null>(null);

  const { data: reminderData, isLoading } = useQuery<ReminderData>({
    queryKey: ['/api/reminder-status'],
    refetchInterval: 60000, // Check every minute
  });

  // Check if user can record weight (includes free users' weekly allowance)
  const { data: canRecordData } = useQuery<{ canRecord: boolean }>({
    queryKey: ["/api/weight-entries/can-record"],
    enabled: !!user,
  });

  // Check if user can upload images (Premium/Pro feature)
  const canUploadImages = user && canAccessFeature(user as any, "imageUpload");
  const canRecord = canRecordData?.canRecord ?? true;

  // Weight detection mutation
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
          title: t('weightRecord.unauthorizedTitle'),
          description: t('weightRecord.unauthorizedDesc'),
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/auth";
        }, 500);
        return;
      }
      
      toast({
        title: t('weightRecord.errorDetectingWeight'),
        description: error instanceof Error ? error.message : t('weightRecord.failedToProcess'),
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
      queryClient.invalidateQueries({ queryKey: ["/api/reminder-status"] });
      
      toast({
        title: t('weightRecord.weightRecordedSuccess'),
        description: `${t('weightRecord.recorded')}: ${data.weight} ${data.unit}${data.weightChange ? ` (${data.weightChange > 0 ? '+' : ''}${data.weightChange.toFixed(1)} ${t('weightRecord.change')})` : ''}`,
      });
      
      setShowWeightConfirmation(false);
      setDetectedWeight(null);
    },
    onError: (error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: t('weightRecord.unauthorizedTitle'),
          description: t('weightRecord.unauthorizedDesc'),
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/auth";
        }, 500);
        return;
      }
      
      toast({
        title: t('weightRecord.errorRecordingWeight'),
        description: error instanceof Error ? error.message : t('weightRecord.failedToRecord'),
        variant: "destructive",
      });
    },
  });

  // Camera capture handler
  const handleCameraCapture = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      // Validate file type
      if (!file.type.startsWith('image/')) {
        toast({
          title: "Invalid File Type",
          description: "Please select an image file.",
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

  // Handle weight confirmation
  const handleWeightConfirm = (confirmedWeight: { weight: number; unit: string; notes?: string }) => {
    createWeightEntryMutation.mutate(confirmedWeight);
  };

  if (isLoading || !reminderData?.shouldShow) {
    return null;
  }

  const { daysSinceLastWeighIn, lastWeighInDate } = reminderData;

  // Different messaging based on how long it's been
  const getReminderMessage = () => {
    if (daysSinceLastWeighIn === 1) {
      return {
        title: t('weighInReminder.gentle.title'),
        message: t('weighInReminder.gentle.message'),
        icon: <Scale className="w-5 h-5 text-purple-600" />,
        urgency: "gentle"
      };
    } else if (daysSinceLastWeighIn === 2) {
      return {
        title: t('weighInReminder.moderate.title'),
        message: t('weighInReminder.moderate.message'),
        icon: <Bell className="w-5 h-5 text-orange-500" />,
        urgency: "moderate"
      };
    } else if (daysSinceLastWeighIn <= 7) {
      return {
        title: t('weighInReminder.urgent.title'),
        message: t('weighInReminder.urgent.message', { days: daysSinceLastWeighIn }),
        icon: <TrendingUp className="w-5 h-5 text-red-500" />,
        urgency: "urgent"
      };
    } else {
      return {
        title: t('weighInReminder.comeback.title'),
        message: t('weighInReminder.comeback.message'),
        icon: <Calendar className="w-5 h-5 text-blue-500" />,
        urgency: "comeback"
      };
    }
  };

  const reminder = getReminderMessage();

  const getBorderColor = () => {
    switch (reminder.urgency) {
      case "gentle": return "border-purple-200 bg-purple-50";
      case "moderate": return "border-orange-200 bg-orange-50";
      case "urgent": return "border-red-200 bg-red-50";
      case "comeback": return "border-blue-200 bg-blue-50";
      default: return "border-purple-200 bg-purple-50";
    }
  };

  return (
    <Card className={`mb-4 ${getBorderColor()}`}>
      <CardContent className="p-4">
        <div className="flex items-start space-x-3">
          <div className="flex-shrink-0 mt-0.5">
            {reminder.icon}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-slate-800 mb-1">
              {reminder.title}
            </h3>
            <p className="text-xs text-slate-600 mb-3">
              {reminder.message}
            </p>
            <div className="flex items-center justify-between">
              <p className="text-xs text-slate-500">
                {lastWeighInDate && `${t('settings.lastWeighIn')}: ${new Date(lastWeighInDate).toLocaleDateString()}`}
              </p>
              <Button 
                size="sm" 
                className="text-xs h-8"
                onClick={() => {
                  if (!canRecord) {
                    const userTier = (user as any)?.subscriptionTier || "free";
                    if (userTier === "free") {
                      toast({
                        title: t('settings.weeklyLimitReached'),
                        description: t('settings.freeUserLimitMessage'),
                        variant: "destructive",
                      });
                    } else {
                      toast({
                        title: t('settings.recordingUnavailable'),
                        description: t('settings.cannotRecordMessage'),
                        variant: "destructive",
                      });
                    }
                    return;
                  }

                  if (canUploadImages) {
                    // Premium/Pro users: Use camera with AI detection
                    cameraInputRef.current?.click();
                  } else {
                    // Free users: Still allow camera but inform about manual entry
                    cameraInputRef.current?.click();
                  }
                }}
                disabled={!canRecord || detectWeightMutation.isPending}
                data-testid="button-weigh-in-now"
              >
                {detectWeightMutation.isPending ? t('settings.processing') : t('settings.weighInNow')}
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
          </div>
        </div>
      </CardContent>
      
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
    </Card>
  );
}
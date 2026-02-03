import { useState, useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "@/hooks/useTranslation";
import { isUnauthorizedError } from "@/lib/authUtils";
import { useAuth } from "@/hooks/useAuth";
import { canAccessFeature } from "@shared/subscriptionUtils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { X, Camera, Zap, Upload, Lock } from "lucide-react";
import WeightConfirmationModal from "./weight-confirmation-modal";
import { AIProcessingOverlay } from "./ai-processing-overlay";
import { isNativeApp, takePhotoNative } from "@/lib/capacitor";

interface CameraModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function CameraModal({ isOpen, onClose }: CameraModalProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { user } = useAuth();
  
  // Check if user can upload images (Premium/Pro feature)
  const canUploadImages = user && canAccessFeature(user as any, "imageUpload");
  const [isCapturing, setIsCapturing] = useState(false);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [aiResult, setAiResult] = useState<{
    weight: number;
    unit: string;
    confidence: number;
  } | null>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  // AI weight detection mutation
  const detectWeightMutation = useMutation({
    mutationFn: async (formData: FormData) => {
      const response = await apiRequest("POST", "/api/detect-weight", formData);
      return response.json();
    },
    onSuccess: (data) => {
      setAiResult({
        weight: data.weight,
        unit: data.unit,
        confidence: data.confidence
      });
      setShowConfirmation(true);
      setIsCapturing(false);
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
      setIsCapturing(false);
    },
  });

  // Weight entry creation mutation
  const createWeightEntryMutation = useMutation({
    mutationFn: async (data: { weight: number; unit: string; notes?: string }) => {
      const response = await apiRequest("POST", "/api/weight-entries", {
        weight: data.weight,
        unit: data.unit,
        notes: data.notes,
        photo: capturedImage, // Include the captured image
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
        title: t('weightRecord.weightRecordedSuccess'),
        description: `${t('weightRecord.recorded')}: ${data.weight} ${data.unit}${data.weightChange ? ` (${data.weightChange > 0 ? '+' : ''}${data.weightChange.toFixed(1)} kg ${t('weightRecord.change')})` : ''}`,
      });
      
      // Reset and close
      handleClose();
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
      
      // Handle error messages (now cleaned by central error handler)
      let title = t('weightRecord.errorRecordingWeight');
      let description = t('weightRecord.failedToSave');
      
      if (error instanceof Error) {
        description = error.message;
        // If it's a rate limit or subscription error, use more specific title
        if (error.message.toLowerCase().includes('limit') || error.message.toLowerCase().includes('upgrade')) {
          title = t('weightRecord.recordingLimitReached');
        }
      }
      
      toast({
        title,
        description,
        variant: "destructive",
      });
    },
  });

  const handleClose = () => {
    setCapturedImage(null);
    setShowConfirmation(false);
    setAiResult(null);
    setIsCapturing(false);
    onClose();
  };

  const handleCameraCapture = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (import.meta.env.DEV) {
        console.log('Camera capture:', file.name, file.type, file.size);
      }
      
      // Validate file type
      if (!file.type.startsWith('image/')) {
        toast({
          title: "Invalid File Type",
          description: "Please select an image file.",
          variant: "destructive",
        });
        return;
      }
      
      // Validate file size (max 10MB)
      if (file.size > 10 * 1024 * 1024) {
        toast({
          title: "File Too Large",
          description: "Please select an image smaller than 10MB.",
          variant: "destructive",
        });
        return;
      }
      
      const reader = new FileReader();
      reader.onload = (e) => {
        setCapturedImage(e.target?.result as string);
        
        // Submit for AI detection
        const formData = new FormData();
        formData.append('photo', file);
        
        setIsCapturing(true);
        detectWeightMutation.mutate(formData);
      };
      reader.onerror = () => {
        toast({
          title: "File Read Error",
          description: "Failed to read the selected file. Please try again.",
          variant: "destructive",
        });
      };
      reader.readAsDataURL(file);
    }
    
    // Clear the input so the same file can be selected again
    event.target.value = '';
  };

  const handleGalleryUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (import.meta.env.DEV) {
        console.log('Gallery upload:', file.name, file.type, file.size);
      }
      
      // Validate file type
      if (!file.type.startsWith('image/')) {
        toast({
          title: "Invalid File Type",
          description: "Please select an image file.",
          variant: "destructive",
        });
        return;
      }
      
      // Validate file size (max 10MB)
      if (file.size > 10 * 1024 * 1024) {
        toast({
          title: "File Too Large",
          description: "Please select an image smaller than 10MB.",
          variant: "destructive",
        });
        return;
      }
      
      const reader = new FileReader();
      reader.onload = (e) => {
        setCapturedImage(e.target?.result as string);
        
        // Submit for AI detection
        const formData = new FormData();
        formData.append('photo', file);
        
        setIsCapturing(true);
        detectWeightMutation.mutate(formData);
      };
      reader.onerror = () => {
        toast({
          title: "File Read Error",
          description: "Failed to read the selected file. Please try again.",
          variant: "destructive",
        });
      };
      reader.readAsDataURL(file);
    }
    
    // Clear the input so the same file can be selected again
    event.target.value = '';
  };

  const handleWeightConfirm = (data: { weight: number; unit: string; notes?: string }) => {
    setShowConfirmation(false);
    createWeightEntryMutation.mutate(data);
  };

  const handleNativeCapture = async (source: 'camera' | 'gallery') => {
    try {
      const result = await takePhotoNative(source);
      if (result) {
        setCapturedImage(result.dataUrl);
        
        if (result.file) {
          const formData = new FormData();
          formData.append('photo', result.file);
          setIsCapturing(true);
          detectWeightMutation.mutate(formData);
        }
      }
    } catch (error: any) {
      console.error('Native camera error:', error);
      
      if (error?.message?.includes('permission')) {
        toast({
          title: t('weightRecord.permissionDenied') || 'Permission Denied',
          description: t('weightRecord.cameraPermissionNeeded') || 'Please enable camera access in your device settings.',
          variant: "destructive",
        });
      } else if (error?.message?.includes('cancelled') || error?.message?.includes('canceled')) {
        return;
      } else {
        if (source === 'camera') {
          cameraInputRef.current?.click();
        } else {
          galleryInputRef.current?.click();
        }
      }
    }
  };

  const handleCameraClick = () => {
    if (isNativeApp()) {
      handleNativeCapture('camera');
    } else {
      cameraInputRef.current?.click();
    }
  };

  const handleGalleryClick = () => {
    if (isNativeApp()) {
      handleNativeCapture('gallery');
    } else {
      galleryInputRef.current?.click();
    }
  };

  // Remove stream-based camera initialization
  // Modal now uses direct file inputs for camera and gallery access

  if (!isOpen) return null;

  // If user doesn't have image upload permission, show upgrade prompt
  if (!canUploadImages) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center">
        <div className="bg-white rounded-lg p-6 max-w-sm mx-4">
          <div className="text-center">
            <Lock className="w-12 h-12 text-amber-500 mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">Premium Feature</h3>
            <p className="text-slate-600 mb-4">
              Image upload and AI weight detection is available for Premium and Pro subscribers.
            </p>
            <div className="flex space-x-3">
              <Button variant="outline" onClick={onClose} className="flex-1">
                Close
              </Button>
              <Button 
                onClick={() => window.location.href = '/analytics-upgrade'}
                className="flex-1 bg-amber-600 hover:bg-amber-700"
                data-testid="button-camera-upgrade"
              >
                Upgrade Plan
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black">
        {capturedImage ? (
          /* Review captured image */
          <div className="relative h-full">
            <img 
              src={capturedImage} 
              alt="Captured scale" 
              className="w-full h-full object-cover"
            />
            
            <div className="absolute top-4 left-4 right-4 flex justify-between">
              <Button
                variant="secondary"
                size="icon"
                onClick={() => setCapturedImage(null)}
                className="bg-black/50 text-white hover:bg-black/70"
              >
                <X className="w-5 h-5" />
              </Button>
              
              <Button
                variant="secondary"
                size="icon"
                onClick={handleClose}
                className="bg-black/50 text-white hover:bg-black/70"
              >
                <X className="w-5 h-5" />
              </Button>
            </div>

            <div className="absolute bottom-0 left-0 right-0 p-6">
              <Card className="bg-white/95 backdrop-blur">
                <CardContent className="p-4">
                  <div className="text-center mb-4">
                    <h3 className="text-lg font-semibold text-slate-900 mb-2">
                      Process Scale Reading
                    </h3>
                    <p className="text-sm text-slate-600">
                      AI will analyze this image to detect the weight reading
                    </p>
                  </div>
                  
                  <div className="flex space-x-3">
                    <Button
                      variant="outline"
                      onClick={() => setCapturedImage(null)}
                      className="flex-1"
                    >
                      Retake
                    </Button>
                    <div className="text-center text-slate-600">
                      {isCapturing ? (
                        <div className="flex items-center justify-center">
                          <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin mr-2" />
                          Analyzing with AI...
                        </div>
                      ) : (
                        <p className="text-sm">AI analysis will start automatically</p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        ) : (
          /* Camera interface */
          <div className="relative h-full">
            <div className="w-full h-full bg-gray-900 flex items-center justify-center">
              <div className="text-center text-white px-4">
                <Camera className="w-16 h-16 mx-auto mb-4 text-gray-400" />
                <p className="text-lg mb-2">Take a Photo</p>
                <p className="text-sm text-gray-400">
                  Use the capture button to take a photo with your camera
                </p>
              </div>
            </div>
            
            {/* Scale detection overlay guide */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-80 h-48 border-2 border-white/50 rounded-lg">
                <div className="w-full h-full border border-white/30 rounded-lg flex items-center justify-center">
                  <div className="text-center text-white">
                    <p className="text-sm mb-1">Position scale display here</p>
                    <p className="text-xs text-gray-300">Make sure numbers are clearly visible</p>
                  </div>
                </div>
              </div>
            </div>
            
            {/* Camera controls */}
            <div className="absolute bottom-0 left-0 right-0 p-6">
              <div className="flex items-center justify-between mb-4">
                <Button
                  variant="secondary"
                  size="icon"
                  onClick={handleClose}
                  className="bg-black/30 text-white hover:bg-black/50"
                >
                  <X className="w-6 h-6" />
                </Button>
                
                <Button
                  size="lg"
                  onClick={handleCameraClick}
                  className="w-16 h-16 bg-white rounded-full hover:bg-gray-100 p-0"
                >
                  <div className="w-12 h-12 bg-gray-300 rounded-full"></div>
                </Button>
                
                <Button
                  variant="secondary"
                  size="icon"
                  onClick={handleGalleryClick}
                  className="bg-black/30 text-white hover:bg-black/50"
                >
                  <Upload className="w-6 h-6" />
                </Button>
              </div>
              
              <div className="text-center">
                <p className="text-white text-sm mb-1">Align scale display with the frame above</p>
                <p className="text-gray-300 text-xs">AI will automatically read the weight</p>
              </div>
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
            
            {/* Hidden gallery input */}
            <input
              ref={galleryInputRef}
              type="file"
              accept="image/*"
              onChange={handleGalleryUpload}
              className="hidden"
            />
          </div>
        )}
      </div>

      {/* Weight Confirmation Modal */}
      {showConfirmation && aiResult && (
        <WeightConfirmationModal
          isOpen={showConfirmation}
          onClose={() => {
            setShowConfirmation(false);
            setAiResult(null);
          }}
          onConfirm={handleWeightConfirm}
          detectedWeight={aiResult.weight}
          detectedUnit={aiResult.unit}
          userPreferredUnit={(user as any)?.weightUnit || 'lbs'}
          capturedImage={capturedImage || undefined}
        />
      )}

      {/* AI Processing Overlay */}
      <AIProcessingOverlay isVisible={detectWeightMutation.isPending} />
    </div>
  );
}

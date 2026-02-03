import { useEffect, useState } from 'react';
import { useTranslation } from '@/hooks/useTranslation';
import { Loader2, Zap } from 'lucide-react';

interface AIProcessingOverlayProps {
  isVisible: boolean;
}

export function AIProcessingOverlay({ isVisible }: AIProcessingOverlayProps) {
  const { t } = useTranslation();
  const [currentStep, setCurrentStep] = useState(0);
  const [progress, setProgress] = useState(0);


  // Dynamic step progression
  const steps = [
    t('aiProcessing.step1'), // "Analyzing image quality..."
    t('aiProcessing.step2'), // "Detecting scale display..."
    t('aiProcessing.step3'), // "Reading weight numbers..."
    t('aiProcessing.step4'), // "Processing final result..."
  ];

  useEffect(() => {
    if (!isVisible) {
      setCurrentStep(0);
      setProgress(0);
      return;
    }

    // Simulate processing steps with realistic timing
    const stepTimings = [
      { step: 0, delay: 0 },      // Start immediately
      { step: 1, delay: 3000 },   // After 3 seconds
      { step: 2, delay: 7000 },   // After 7 seconds  
      { step: 3, delay: 11000 },  // After 11 seconds
    ];

    const stepTimeouts: NodeJS.Timeout[] = [];

    stepTimings.forEach(({ step, delay }) => {
      const timeout = setTimeout(() => {
        setCurrentStep(step);
      }, delay);
      stepTimeouts.push(timeout);
    });

    // Progress bar animation
    const progressInterval = setInterval(() => {
      setProgress(prev => {
        const newProgress = prev + 0.5; // Increment every 100ms
        return newProgress >= 100 ? 100 : newProgress;
      });
    }, 100);

    return () => {
      stepTimeouts.forEach(clearTimeout);
      clearInterval(progressInterval);
    };
  }, [isVisible]);

  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 z-[9999] bg-background/95 backdrop-blur-sm">
      <div className="flex h-full items-center justify-center p-6">
        <div className="w-full max-w-md space-y-8 text-center">
          {/* AI Icon with pulse animation */}
          <div className="relative mx-auto">
            <div className="absolute -inset-4 rounded-full bg-primary/20 animate-pulse" />
            <div className="relative flex h-24 w-24 items-center justify-center rounded-full bg-primary mx-auto">
              <Zap className="h-12 w-12 text-primary-foreground animate-pulse" />
            </div>
          </div>

          {/* Title */}
          <div className="space-y-2">
            <h2 className="text-2xl font-bold text-foreground">
              {t('aiProcessing.title')}
            </h2>
            <p className="text-muted-foreground">
              {t('aiProcessing.subtitle')}
            </p>
          </div>

          {/* Progress bar */}
          <div className="space-y-2">
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div 
                className="h-full bg-primary transition-all duration-300 ease-out rounded-full"
                style={{ width: `${Math.min(progress, 100)}%` }}
              />
            </div>
            <p className="text-sm text-muted-foreground">
              {Math.min(Math.round(progress), 100)}%
            </p>
          </div>

          {/* Current step */}
          <div className="space-y-4">
            <div className="flex items-center justify-center space-x-2">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
              <span className="text-foreground font-medium">
                {steps[currentStep]}
              </span>
            </div>

            {/* Additional context message */}
            <p className="text-sm text-muted-foreground">
              {currentStep >= 3 ? t('aiProcessing.almostDone') : t('aiProcessing.pleaseWait')}
            </p>
          </div>

          {/* Visual indicator dots */}
          <div className="flex justify-center space-x-2">
            {steps.map((_, index) => (
              <div
                key={index}
                className={`h-2 w-2 rounded-full transition-all duration-300 ${
                  index === currentStep
                    ? 'bg-primary scale-125'
                    : index < currentStep
                    ? 'bg-primary/50'
                    : 'bg-muted'
                }`}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
import { useState, useRef } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { isUnauthorizedError } from "@/lib/authUtils";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { 
  X, 
  Download, 
  Lock, 
  TrendingDown,
  Flame,
  Target,
  Info
} from "lucide-react";
import { toCanvas } from "html-to-image";
import type { WeightEntry } from "@shared/schema";
import { useTranslation } from "@/hooks/useTranslation";
import { useMarketContext } from "@/contexts/MarketProvider";
import { formatWeight, convertWeight, type WeightUnit } from "@shared/utils";
import { canAccessFeature } from "@shared/subscriptionUtils";

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface StickerSettings {
  showName: boolean;
  showActualWeight: boolean;
  showGoalWeight: boolean;
  showGraph: boolean;
  showStreak: boolean;
  showEntries: boolean;
}

export default function ShareModal({ isOpen, onClose }: ShareModalProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const { t } = useTranslation();
  const { market } = useMarketContext();
  const stickerRef = useRef<HTMLDivElement>(null);
  
  const [generatingImage, setGeneratingImage] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);
  const [settings, setSettings] = useState<StickerSettings>({
    showName: true,
    showActualWeight: true,
    showGoalWeight: true,
    showGraph: true,
    showStreak: true,
    showEntries: true,
  });

  const userWeightUnit = ((user as any)?.weightUnit || "kg") as WeightUnit;
  const canShare = canAccessFeature(user as any, "socialSharing");

  const { data: latestWeight } = useQuery<WeightEntry>({
    queryKey: ["/api/weight-entries/latest"],
    enabled: !!user && isOpen,
  });

  const { data: weightEntries = [] } = useQuery<WeightEntry[]>({
    queryKey: ["/api/weight-entries"],
    enabled: !!user && isOpen,
  });

  const { data: stats } = useQuery<{
    totalLost: number;
    avgPerWeek: number;
    totalRecordings: number;
    progressPercentage: number;
  }>({
    queryKey: ["/api/stats"],
    enabled: !!user && isOpen,
  });

  const logShareMutation = useMutation({
    mutationFn: async (platform: string) => {
      await apiRequest("POST", "/api/share/log", { platform });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/activity"] });
    },
    onError: (error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: t('share.unauthorized'),
          description: t('share.loggedOut'),
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/auth";
        }, 500);
      }
    },
  });

  const calculateStreak = () => {
    const entriesWithDates = weightEntries.filter(e => e.createdAt);
    if (entriesWithDates.length < 2) return 0;
    
    let streak = 1;
    const sortedEntries = [...entriesWithDates].sort((a, b) => 
      new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime()
    );
    
    for (let i = 0; i < sortedEntries.length - 1; i++) {
      const current = new Date(sortedEntries[i].createdAt!);
      const previous = new Date(sortedEntries[i + 1].createdAt!);
      const diffDays = Math.floor((current.getTime() - previous.getTime()) / (1000 * 60 * 60 * 24));
      
      if (diffDays <= 7) {
        streak++;
      } else {
        break;
      }
    }
    return streak;
  };

  const generateSticker = async () => {
    if (!stickerRef.current || !canShare) return null;
    
    try {
      const pixelRatio = 3;
      const node = stickerRef.current;
      
      // Use toCanvas to render HTML directly to canvas
      const sourceCanvas = await toCanvas(node, {
        pixelRatio: pixelRatio,
        backgroundColor: undefined,
      });
      
      // Create a fresh export canvas for proper alpha handling on iOS
      const exportCanvas = document.createElement('canvas');
      exportCanvas.width = sourceCanvas.width;
      exportCanvas.height = sourceCanvas.height;
      
      const ctx = exportCanvas.getContext('2d');
      if (!ctx) throw new Error('Failed to get canvas context');
      
      // Clear canvas to ensure transparency
      ctx.clearRect(0, 0, exportCanvas.width, exportCanvas.height);
      
      // Use 'copy' compositing to preserve alpha channel on iOS/Safari
      ctx.globalCompositeOperation = 'copy';
      ctx.drawImage(sourceCanvas, 0, 0, exportCanvas.width, exportCanvas.height);
      
      // Convert to PNG data URL
      const dataUrl = exportCanvas.toDataURL('image/png');
      return dataUrl;
    } catch (error) {
      console.error("Error generating sticker:", error);
      throw error;
    }
  };

  const handleDownload = async () => {
    if (!canShare) return;
    
    try {
      setGeneratingImage(true);
      const imageData = await generateSticker();
      if (!imageData) return;
      
      const link = document.createElement("a");
      link.href = imageData;
      link.download = `weight-sticker.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      logShareMutation.mutate("sticker-download");
      
      setShowInstructions(true);
      
      toast({
        title: t('share.downloaded'),
        description: t('share.stickerSaved'),
      });
    } catch (error) {
      toast({
        title: t('share.error'),
        description: t('share.errorDesc'),
        variant: "destructive",
      });
    } finally {
      setGeneratingImage(false);
    }
  };

  if (!isOpen) return null;

  const currentWeight = latestWeight ? parseFloat(latestWeight.weight) : 0;
  const displayWeight = formatWeight(currentWeight, userWeightUnit);
  const totalLost = stats?.totalLost || 0;
  const streak = calculateStreak();
  const goalWeight = (user as any)?.goalWeight ? parseFloat((user as any).goalWeight) : null;
  const goalWeightDisplay = goalWeight ? formatWeight(goalWeight, userWeightUnit) : null;
  const brandName = market.id === 'br' ? 'FotoPeso' : 'ScanMyScale';

  const userName = settings.showName 
    ? ((user as any)?.firstName || (user as any)?.lastName 
      ? `${(user as any).firstName || ''} ${(user as any).lastName || ''}`.trim() 
      : null)
    : null;

  // Prepare graph data
  const getGraphData = () => {
    const entriesWithDates = weightEntries.filter(e => e.createdAt);
    if (entriesWithDates.length < 2) return null;
    
    const sortedEntries = [...entriesWithDates]
      .sort((a, b) => new Date(a.createdAt!).getTime() - new Date(b.createdAt!).getTime())
      .slice(-14); // Last 14 entries max
    
    const weights = sortedEntries.map(e => parseFloat(e.weight));
    const minWeight = Math.min(...weights, goalWeight || Infinity);
    const maxWeight = Math.max(...weights);
    const range = maxWeight - minWeight || 1;
    
    return {
      weights,
      minWeight,
      maxWeight,
      range,
      goalWeight: goalWeight,
    };
  };

  const graphData = getGraphData();

  // Generate SVG sparkline path
  const generateSparklinePath = () => {
    if (!graphData || graphData.weights.length < 2) return null;
    
    const { weights, minWeight, range } = graphData;
    const width = 200;
    const height = 60;
    const padding = 5;
    
    const pointCoords: { x: number; y: number }[] = weights.map((weight, i) => {
      const x = padding + (i / (weights.length - 1)) * (width - padding * 2);
      const y = height - padding - ((weight - minWeight) / range) * (height - padding * 2);
      return { x, y };
    });
    
    const linePath = `M ${pointCoords.map(p => `${p.x},${p.y}`).join(' L ')}`;
    
    // Get the endpoint (last point on the line)
    const endpoint = pointCoords[pointCoords.length - 1];
    
    // Goal line Y position - always compute if goal exists, rendering is controlled separately
    let goalLineY = null;
    if (graphData.goalWeight) {
      goalLineY = height - padding - ((graphData.goalWeight - minWeight) / range) * (height - padding * 2);
    }
    
    return { linePath, goalLineY, width, height, endpoint };
  };

  const sparkline = generateSparklinePath();

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-white rounded-2xl overflow-hidden max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b p-4 flex items-center justify-between z-10">
          <h3 className="text-lg font-semibold text-gray-900">{t('share.createSticker')}</h3>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="text-slate-500 hover:text-slate-700"
            data-testid="button-close-share"
          >
            <X className="w-5 h-5" />
          </Button>
        </div>
        
        <div className="p-4 space-y-4">
          {!canShare && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-start gap-3">
              <Lock className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-amber-800">{t('share.premiumFeature')}</p>
                <p className="text-xs text-amber-600 mt-1">{t('share.upgradeToShare')}</p>
                <Button 
                  size="sm" 
                  className="mt-2 bg-amber-600 hover:bg-amber-700"
                  onClick={() => window.location.href = '/analytics-upgrade'}
                  data-testid="button-upgrade-share"
                >
                  {t('share.upgrade')}
                </Button>
              </div>
            </div>
          )}

          {/* Transparent preview with checkered background */}
          <div className="flex justify-center">
            <div 
              className="rounded-xl p-2"
              style={{
                background: `repeating-conic-gradient(#e5e7eb 0% 25%, #f3f4f6 0% 50%) 50% / 16px 16px`
              }}
            >
              {/* The actual sticker (transparent background) */}
              <div 
                ref={stickerRef}
                className="p-4 text-white"
                style={{ 
                  width: 240,
                  minHeight: 180,
                  background: 'transparent',
                }}
              >
                {/* Content with text shadows for visibility on any background */}
                <div className="space-y-3" style={{ textShadow: '0 2px 8px rgba(0,0,0,0.8), 0 1px 3px rgba(0,0,0,0.9)' }}>
                  {/* Name */}
                  {userName && (
                    <div className="text-sm font-medium opacity-90">
                      {userName}
                    </div>
                  )}

                  {/* Main stat - weight lost */}
                  {totalLost > 0 && (
                    <div className="flex items-center gap-2">
                      <TrendingDown className="w-5 h-5" />
                      <span className="text-3xl font-bold">
                        {settings.showActualWeight 
                          ? `-${formatWeight(totalLost, userWeightUnit)}`
                          : t('share.lostWeight')
                        }
                      </span>
                    </div>
                  )}

                  {/* Current weight */}
                  {settings.showActualWeight && currentWeight > 0 && (
                    <div className="text-sm opacity-90">
                      {t('share.currentWeight')}: {displayWeight}
                    </div>
                  )}

                  {/* Goal weight - always show text when toggle is on */}
                  {settings.showGoalWeight && goalWeightDisplay && (
                    <div className="text-sm opacity-90 flex items-center gap-1">
                      <Target className="w-4 h-4 text-green-400" />
                      <span>{t('share.goal')}: {goalWeightDisplay}</span>
                    </div>
                  )}

                  {/* Weight Graph */}
                  {settings.showGraph && sparkline && (
                    <div className="py-2">
                      <svg 
                        width={sparkline.width} 
                        height={sparkline.height}
                        className="overflow-visible"
                      >
                        {/* Goal line */}
                        {sparkline.goalLineY !== null && settings.showGoalWeight && (
                          <>
                            <line
                              x1="0"
                              y1={sparkline.goalLineY}
                              x2={sparkline.width}
                              y2={sparkline.goalLineY}
                              stroke="rgba(34, 197, 94, 0.8)"
                              strokeWidth="2"
                              strokeDasharray="6,4"
                            />
                            <text
                              x={sparkline.width - 2}
                              y={sparkline.goalLineY - 4}
                              fill="rgba(34, 197, 94, 1)"
                              fontSize="9"
                              textAnchor="end"
                            >
                              {t('share.goal')}
                            </text>
                          </>
                        )}
                        {/* Weight line */}
                        <path
                          d={sparkline.linePath}
                          fill="none"
                          stroke="white"
                          strokeWidth="3"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                        {/* End point */}
                        <circle
                          cx={sparkline.endpoint.x}
                          cy={sparkline.endpoint.y}
                          r="4"
                          fill="white"
                        />
                      </svg>
                    </div>
                  )}

                  {/* Stats row */}
                  {(settings.showStreak || settings.showEntries) && (
                    <div className="flex gap-4 text-sm">
                      {settings.showStreak && streak > 0 && (
                        <div className="flex items-center gap-1">
                          <Flame className="w-4 h-4 text-orange-400" />
                          <span className="font-semibold">{streak}</span>
                          <span className="opacity-80">{t('share.streak')}</span>
                        </div>
                      )}
                      {settings.showEntries && (
                        <div>
                          <span className="font-semibold">{stats?.totalRecordings || 0}</span>
                          <span className="opacity-80 ml-1">{t('share.weighIns')}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Brand */}
                  <div className="text-xs font-medium opacity-70 pt-1">
                    {brandName}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Toggle settings */}
          <div className="space-y-2 bg-slate-50 rounded-lg p-3">
            <Label className="text-xs font-medium text-slate-500 uppercase tracking-wide block mb-2">
              {t('share.customize')}
            </Label>
            
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="showName" className="text-sm">{t('share.showName')}</Label>
                <Switch
                  id="showName"
                  checked={settings.showName}
                  onCheckedChange={(checked) => setSettings(s => ({ ...s, showName: checked }))}
                  data-testid="switch-show-name"
                />
              </div>
              
              <div className="flex items-center justify-between">
                <Label htmlFor="showWeight" className="text-sm">{t('share.showWeight')}</Label>
                <Switch
                  id="showWeight"
                  checked={settings.showActualWeight}
                  onCheckedChange={(checked) => setSettings(s => ({ ...s, showActualWeight: checked }))}
                  data-testid="switch-show-weight"
                />
              </div>
              
              <div className="flex items-center justify-between">
                <Label htmlFor="showGoal" className="text-sm">{t('share.showGoal')}</Label>
                <Switch
                  id="showGoal"
                  checked={settings.showGoalWeight}
                  onCheckedChange={(checked) => setSettings(s => ({ ...s, showGoalWeight: checked }))}
                  disabled={!goalWeight}
                  data-testid="switch-show-goal"
                />
              </div>
              
              <div className="flex items-center justify-between">
                <Label htmlFor="showGraph" className="text-sm">{t('share.showGraph')}</Label>
                <Switch
                  id="showGraph"
                  checked={settings.showGraph}
                  onCheckedChange={(checked) => setSettings(s => ({ ...s, showGraph: checked }))}
                  disabled={!graphData}
                  data-testid="switch-show-graph"
                />
              </div>
              
              <div className="flex items-center justify-between">
                <Label htmlFor="showStreak" className="text-sm">{t('share.showStreak')}</Label>
                <Switch
                  id="showStreak"
                  checked={settings.showStreak}
                  onCheckedChange={(checked) => setSettings(s => ({ ...s, showStreak: checked }))}
                  data-testid="switch-show-streak"
                />
              </div>
              
              <div className="flex items-center justify-between">
                <Label htmlFor="showEntries" className="text-sm">{t('share.showEntries')}</Label>
                <Switch
                  id="showEntries"
                  checked={settings.showEntries}
                  onCheckedChange={(checked) => setSettings(s => ({ ...s, showEntries: checked }))}
                  data-testid="switch-show-entries"
                />
              </div>
            </div>
          </div>

          {/* Download button */}
          <Button
            onClick={handleDownload}
            disabled={generatingImage || !canShare}
            className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-purple-600 to-indigo-600 h-12"
            data-testid="button-download-sticker"
          >
            {generatingImage ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <Download className="w-5 h-5" />
            )}
            {t('share.downloadSticker')}
          </Button>

          {/* Instructions after download */}
          {showInstructions && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <div className="flex items-start gap-2">
                <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-blue-800">
                  <p className="font-medium mb-1">{t('share.howToUse')}</p>
                  <ol className="list-decimal list-inside space-y-1 text-xs">
                    <li>{t('share.step1')}</li>
                    <li>{t('share.step2')}</li>
                    <li>{t('share.step3')}</li>
                  </ol>
                  <p className="text-xs mt-2 text-blue-600 italic">{t('share.iosNote')}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

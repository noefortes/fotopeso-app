import { useState } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { X, Check, Edit } from "lucide-react";
import { convertWeight } from "@shared/utils";
import type { WeightUnit } from "@shared/utils";

interface WeightConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (data: { weight: number; unit: string }) => void;
  detectedWeight: number;
  detectedUnit: string;
  userPreferredUnit: string;
  capturedImage?: string;
}

export default function WeightConfirmationModal({
  isOpen,
  onClose,
  onConfirm,
  detectedWeight,
  detectedUnit,
  userPreferredUnit,
  capturedImage
}: WeightConfirmationModalProps) {
  // Initialize with user's preferred unit for better UX
  const [editedWeight, setEditedWeight] = useState(() => {
    const converted = convertWeight(detectedWeight, detectedUnit as WeightUnit, userPreferredUnit as WeightUnit);
    return converted.toFixed(1);
  });
  const [editedUnit, setEditedUnit] = useState(userPreferredUnit);

  // Convert detected weight to user's preferred unit for display
  const displayWeight = convertWeight(detectedWeight, detectedUnit as WeightUnit, userPreferredUnit as WeightUnit);
  const displayUnit = userPreferredUnit;

  const handleConfirm = () => {
    const finalWeight = parseFloat(editedWeight);
    if (finalWeight && finalWeight > 0) {
      onConfirm({
        weight: finalWeight,
        unit: editedUnit
      });
    }
  };

  const { t } = useTranslation();

  if (!isOpen) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md mx-auto w-[90vw] sm:w-full">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Check className="w-5 h-5 text-green-600" />
            {t('weightConfirmation.title')}
          </DialogTitle>
          <DialogDescription>
            {t('weightConfirmation.description')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* AI Detection Result */}
          <div className="bg-green-50 border border-green-200 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-2 h-2 bg-green-500 rounded-full"></div>
              <span className="text-sm font-medium text-green-800">{t('weightConfirmation.scaleReading')}</span>
            </div>
            <div className="text-2xl font-bold text-green-900">
              {displayWeight.toFixed(1)} {displayUnit}
            </div>
            {detectedUnit !== userPreferredUnit && (
              <div className="text-xs text-green-700 mt-1">
                {t('weightConfirmation.originallyDetected')}: {detectedWeight} {detectedUnit}
              </div>
            )}
          </div>

          {/* Edit Weight */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 mb-2">
              <Edit className="w-4 h-4 text-slate-600" />
              <Label className="text-sm font-medium">{t('weightConfirmation.adjustHere')}</Label>
            </div>
            
            <div className="flex gap-3">
              <div className="flex-1">
                <Input
                  type="number"
                  step="0.1"
                  value={editedWeight}
                  onChange={(e) => setEditedWeight(e.target.value)}
                  placeholder={t('weightConfirmation.weight')}
                  className="text-center text-lg font-semibold"
                />
              </div>
              <Select value={editedUnit} onValueChange={setEditedUnit}>
                <SelectTrigger className="w-24 shrink-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="lbs">lbs</SelectItem>
                  <SelectItem value="kg">kg</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

        </div>

        <DialogFooter className="flex flex-col sm:flex-row gap-2 sm:gap-2">
          <Button variant="outline" onClick={onClose} className="flex-1 order-2 sm:order-1">
            <X className="w-4 h-4 mr-2" />
            {t('weightConfirmation.cancel')}
          </Button>
          <Button 
            onClick={handleConfirm} 
            className="flex-1 bg-green-600 hover:bg-green-700 order-1 sm:order-2"
            disabled={!editedWeight || parseFloat(editedWeight) <= 0}
          >
            <Check className="w-4 h-4 mr-2" />
            {t('weightConfirmation.saveWeight')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
import { convertWeight, formatWeight, type WeightUnit } from "@shared/utils";
import { useTranslation } from "@/hooks/useTranslation";

interface WeightDisplayProps {
  weight: number;
  originalUnit: WeightUnit;
  displayUnit: WeightUnit;
  showUnit?: boolean;
  className?: string;
}

export function WeightDisplay({ 
  weight, 
  originalUnit, 
  displayUnit, 
  showUnit = true,
  className = ""
}: WeightDisplayProps) {
  const convertedWeight = convertWeight(weight, originalUnit, displayUnit);
  const formattedWeight = formatWeight(convertedWeight, displayUnit, showUnit);
  
  return <span className={className}>{formattedWeight}</span>;
}

interface WeightChangeDisplayProps {
  currentWeight: number;
  previousWeight: number;
  originalUnit: WeightUnit;
  displayUnit: WeightUnit;
  className?: string;
}

export function WeightChangeDisplay({
  currentWeight,
  previousWeight,
  originalUnit,
  displayUnit,
  className = ""
}: WeightChangeDisplayProps) {
  const { t } = useTranslation();
  const convertedCurrent = convertWeight(currentWeight, originalUnit, displayUnit);
  const convertedPrevious = convertWeight(previousWeight, originalUnit, displayUnit);
  const change = convertedCurrent - convertedPrevious;
  
  const formattedChange = formatWeight(Math.abs(change), displayUnit, true);
  const direction = change > 0 ? "+" : change < 0 ? "-" : "";
  
  if (change === 0) {
    return <span className={className}>{t('chart.noChange')}</span>;
  }
  
  return (
    <span className={className}>
      {direction}{formattedChange}
    </span>
  );
}
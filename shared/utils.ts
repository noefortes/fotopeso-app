// Weight and height conversion utilities

export type WeightUnit = 'lbs' | 'kg';
export type HeightUnit = 'inches' | 'cm';

/**
 * Get effective weight unit for a user based on their market
 * For Brazilian market (fotopeso.com.br), always returns 'kg' regardless of user preference
 * For other markets, respects user preference or market default
 * @param marketId The market ID ('us', 'br', etc.)
 * @param userPreferredUnit Optional user's preferred unit
 * @returns The effective weight unit to use
 */
export function getEffectiveWeightUnit(marketId: string, userPreferredUnit?: WeightUnit): WeightUnit {
  // Brazilian market (fotopeso.com.br) is kg-only
  if (marketId === 'br') {
    return 'kg';
  }
  
  // For other markets, respect user preference or default to lbs
  return userPreferredUnit || 'lbs';
}

/**
 * Convert weight between units
 * @param weight The weight value to convert
 * @param fromUnit The unit to convert from
 * @param toUnit The unit to convert to
 * @returns The converted weight value
 */
export function convertWeight(weight: number, fromUnit: WeightUnit, toUnit: WeightUnit): number {
  if (fromUnit === toUnit) {
    return weight;
  }
  
  if (fromUnit === 'kg' && toUnit === 'lbs') {
    return weight * 2.20462;
  }
  
  if (fromUnit === 'lbs' && toUnit === 'kg') {
    return weight * 0.453592;
  }
  
  return weight;
}

/**
 * Format weight with appropriate unit
 * @param weight The weight value
 * @param unit The unit to display
 * @param showUnit Whether to show the unit suffix
 * @returns Formatted weight string
 */
export function formatWeight(weight: number, unit: WeightUnit, showUnit: boolean = true): string {
  const formatted = unit === 'lbs' ? weight.toFixed(1) : weight.toFixed(2);
  return showUnit ? `${formatted} ${unit}` : formatted;
}

/**
 * Convert weight entry to user's preferred unit
 * @param weight The weight value from database
 * @param entryUnit The unit the weight was recorded in
 * @param userPreferredUnit The user's preferred display unit
 * @returns Object with converted weight and display unit
 */
export function convertWeightForDisplay(
  weight: number, 
  entryUnit: WeightUnit, 
  userPreferredUnit: WeightUnit
): { weight: number; unit: WeightUnit } {
  return {
    weight: convertWeight(weight, entryUnit, userPreferredUnit),
    unit: userPreferredUnit
  };
}

/**
 * Get weight unit display name
 * @param unit The weight unit
 * @returns Display name for the unit
 */
export function getWeightUnitName(unit: WeightUnit): string {
  return unit === 'lbs' ? 'Pounds' : 'Kilograms';
}

// Height conversion utilities

/**
 * Convert height between units
 * @param height The height value to convert
 * @param fromUnit The unit to convert from
 * @param toUnit The unit to convert to
 * @returns The converted height value
 */
export function convertHeight(height: number, fromUnit: HeightUnit, toUnit: HeightUnit): number {
  if (fromUnit === toUnit) {
    return height;
  }
  
  if (fromUnit === 'inches' && toUnit === 'cm') {
    return height * 2.54;
  }
  
  if (fromUnit === 'cm' && toUnit === 'inches') {
    return height / 2.54;
  }
  
  return height;
}

/**
 * Format height with appropriate unit
 * @param height The height value
 * @param unit The unit to display
 * @param showUnit Whether to show the unit suffix
 * @returns Formatted height string
 */
export function formatHeight(height: number, unit: HeightUnit, showUnit: boolean = true): string {
  const formatted = unit === 'inches' ? height.toFixed(1) : height.toFixed(1);
  return showUnit ? `${formatted} ${unit}` : formatted;
}

/**
 * Get height unit display name
 * @param unit The height unit
 * @returns Display name for the unit
 */
export function getHeightUnitName(unit: HeightUnit): string {
  return unit === 'inches' ? 'Inches' : 'Centimeters';
}

// BMI calculation utilities

/**
 * Calculate BMI from weight and height
 * @param weightValue The weight value
 * @param weightUnit The weight unit
 * @param heightValue The height value
 * @param heightUnit The height unit
 * @returns BMI value
 */
export function calculateBMI(
  weightValue: number,
  weightUnit: WeightUnit,
  heightValue: number,
  heightUnit: HeightUnit
): number {
  // Convert weight to kg
  const weightInKg = weightUnit === 'kg' ? weightValue : convertWeight(weightValue, 'lbs', 'kg');
  
  // Convert height to meters
  const heightInCm = heightUnit === 'cm' ? heightValue : convertHeight(heightValue, 'inches', 'cm');
  const heightInM = heightInCm / 100;
  
  // BMI = weight (kg) / height (m)^2
  const bmi = weightInKg / (heightInM * heightInM);
  
  return Math.round(bmi * 10) / 10; // Round to 1 decimal place
}

/**
 * BMI category information with color coding
 */
export interface BMICategoryInfo {
  label: string;
  colorClass: string;
  bgClass: string;
  textClass: string;
}

/**
 * Get BMI category description
 * @param bmi The BMI value
 * @returns BMI category
 */
export function getBMICategory(bmi: number): string {
  if (bmi < 18.5) return 'Under Weight';
  if (bmi < 25) return 'Normal';
  if (bmi < 30) return 'Overweight';
  if (bmi < 35) return 'Obese';
  return 'Extremely Obese';
}

/**
 * Get BMI category information with color coding
 * @param bmi The BMI value
 * @returns BMI category info with colors
 */
export function getBMICategoryInfo(bmi: number): BMICategoryInfo {
  if (bmi < 18.5) {
    return {
      label: 'Under Weight',
      colorClass: 'border-blue-300',
      bgClass: 'bg-blue-50',
      textClass: 'text-blue-700'
    };
  }
  if (bmi < 25) {
    return {
      label: 'Normal',
      colorClass: 'border-green-300', 
      bgClass: 'bg-green-50',
      textClass: 'text-green-700'
    };
  }
  if (bmi < 30) {
    return {
      label: 'Overweight',
      colorClass: 'border-orange-300',
      bgClass: 'bg-orange-50', 
      textClass: 'text-orange-700'
    };
  }
  if (bmi < 35) {
    return {
      label: 'Obese',
      colorClass: 'border-red-300',
      bgClass: 'bg-red-50',
      textClass: 'text-red-600'
    };
  }
  return {
    label: 'Extremely Obese', 
    colorClass: 'border-red-500',
    bgClass: 'bg-red-100',
    textClass: 'text-red-800'
  };
}

// Goal-related calculations
export interface GoalProgress {
  currentWeight: number;
  goalWeight: number;
  startWeight: number;
  progressPercentage: number;
  remainingWeight: number;
  isGainGoal: boolean;
  progressDirection: "toward" | "away" | "achieved";
}

export function calculateGoalProgress(
  currentWeight: number,
  goalWeight: number,
  startWeight: number
): GoalProgress {
  const isGainGoal = goalWeight > startWeight;
  const totalGoalDistance = Math.abs(goalWeight - startWeight);
  const currentProgress = Math.abs(currentWeight - startWeight);
  
  let progressPercentage = 0;
  if (totalGoalDistance > 0) {
    progressPercentage = Math.min((currentProgress / totalGoalDistance) * 100, 100);
  }
  
  const remainingWeight = Math.abs(goalWeight - currentWeight);
  
  // Determine if moving toward or away from goal
  let progressDirection: "toward" | "away" | "achieved" = "toward";
  
  if (Math.abs(currentWeight - goalWeight) < 0.1) {
    progressDirection = "achieved";
  } else if (isGainGoal) {
    // For weight gain goals
    if (currentWeight < startWeight) {
      progressDirection = "away"; // Lost weight when trying to gain
    } else if (currentWeight > goalWeight) {
      progressDirection = "away"; // Gained too much
    }
  } else {
    // For weight loss goals
    if (currentWeight > startWeight) {
      progressDirection = "away"; // Gained weight when trying to lose
    } else if (currentWeight < goalWeight) {
      progressDirection = "away"; // Lost too much
    }
  }
  
  return {
    currentWeight,
    goalWeight,
    startWeight,
    progressPercentage,
    remainingWeight,
    isGainGoal,
    progressDirection
  };
}

export function estimateTimeToGoal(
  remainingWeight: number,
  avgWeightChangePerWeek: number,
  isGainGoal: boolean
): { weeks: number; days: number; achievable: boolean } {
  if (avgWeightChangePerWeek === 0 || remainingWeight === 0) {
    return { weeks: 0, days: 0, achievable: false };
  }
  
  // Ensure we're looking at progress in the right direction
  const effectiveWeightChangePerWeek = isGainGoal 
    ? Math.abs(avgWeightChangePerWeek) 
    : Math.abs(avgWeightChangePerWeek);
  
  if (effectiveWeightChangePerWeek === 0) {
    return { weeks: 0, days: 0, achievable: false };
  }
  
  const weeksToGoal = remainingWeight / effectiveWeightChangePerWeek;
  const daysToGoal = Math.ceil(weeksToGoal * 7);
  
  // Consider achievable if within reasonable timeframe (under 2 years)
  const achievable = weeksToGoal <= 104;
  
  return {
    weeks: Math.ceil(weeksToGoal),
    days: daysToGoal,
    achievable
  };
}
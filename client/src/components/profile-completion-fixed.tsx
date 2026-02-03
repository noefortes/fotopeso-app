import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "@/hooks/useTranslation";
import { useMarketContext } from "@/contexts/MarketProvider";
import { isUnauthorizedError } from "@/lib/authUtils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { UserCheck, Calendar, Ruler, Scale } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { User } from "@shared/schema";
import { type HeightUnit, getHeightUnitName } from "@shared/utils";

interface ProfileCompletionProps {
  user: User;
  onComplete?: () => void;
}

export default function ProfileCompletion({ user, onComplete }: ProfileCompletionProps) {
  // ✅ ALL HOOKS MUST BE AT THE TOP - NO EARLY RETURNS BEFORE HOOKS!
  const { toast } = useToast();
  const { t } = useTranslation();
  const { market } = useMarketContext();
  const isBrazilianMarket = market.id === 'br';
  
  const [isExpanded, setIsExpanded] = useState(false);
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    height: "",
    heightUnit: isBrazilianMarket ? "cm" : "inches", // Brazilian market defaults to cm
    dateOfBirth: "",
    sex: "",
    weightUnit: isBrazilianMarket ? "kg" : "lbs", // Brazilian market defaults to kg
  });

  // ✅ useMutation MUST be called on every render
  const updateProfileMutation = useMutation({
    mutationFn: async (updates: any) => {
      try {
        const response = await apiRequest("PATCH", "/api/profile", updates);
        return response;
      } catch (error: any) {
        if (error.message.includes("401")) {
          // If unauthorized, refresh to trigger re-auth
          setTimeout(() => {
            window.location.reload();
          }, 2000);
        }
        throw error;
      }
    },
    onSuccess: async (response) => {
      
      try {
        // Check if response has content
        const responseText = await response.text();
        
        if (responseText && responseText.length > 0) {
          try {
            const updatedUser = JSON.parse(responseText);
            
            // Update the cache directly with the new user data
            queryClient.setQueryData(["/api/auth/user"], updatedUser);
          } catch (jsonError) {
            console.error("🔧 PROFILE UPDATE - JSON parse error:", jsonError);
            console.error("🔧 PROFILE UPDATE - Trying to parse:", responseText);
          }
        } else {
        }
      } catch (parseError) {
        console.error("🔧 PROFILE UPDATE - Response parsing error:", parseError);
      }
      
      // Always invalidate cache to trigger fresh fetch
      await queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      
      toast({
        title: t('profile.profileUpdated'), 
        description: t('profile.profileSavedSuccess'),
      });
      
      setIsExpanded(false);
      
      if (onComplete) {
        onComplete();
      }
    },
    onError: (error) => {
      console.error("🔧 PROFILE UPDATE ERROR:", error);
      console.error("🔧 PROFILE UPDATE ERROR - Error details:", {
        message: error.message,
        status: (error as any).status || 'unknown',
        type: typeof error
      });
      
      if (isUnauthorizedError(error)) {
        toast({
          title: "Session Issue Detected",
          description: "Refreshing page to restore your session...",
          variant: "destructive",
        });
        // Auto-refresh to restore session
        setTimeout(() => {
          window.location.reload();
        }, 2000);
        return;
      }
      
      toast({
        title: "Update Failed",
        description: error instanceof Error ? error.message : "Failed to update profile",
        variant: "destructive",
      });
    },
  });

  // ✅ Calculate fields AFTER hooks but before early returns
  const fields = user ? {
    firstName: !!(user as any)?.firstName && (user as any).firstName.trim() !== "",
    lastName: !!(user as any)?.lastName && (user as any).lastName.trim() !== "",
    height: !!(user as any)?.height,
    heightUnit: !!(user as any)?.heightUnit,
    dateOfBirth: !!(user as any)?.dateOfBirth,
    sex: !!(user as any)?.sex,
    weightUnit: !!(user as any)?.weightUnit,
  } : { firstName: false, lastName: false, height: false, heightUnit: false, dateOfBirth: false, sex: false, weightUnit: false };
  
  const completedFields = Object.values(fields).filter(Boolean).length;
  const totalFields = Object.keys(fields).length;
  const completionPercentage = Math.round((completedFields / totalFields) * 100);

  // Debug logging to understand why fields aren't showing


  // ✅ Now safe to have early returns AFTER all hooks are called
  if (!user) {
    return null;
  }

  // If profile is complete, don't show the component
  if (completionPercentage === 100) {
    return null;
  }

  const handleSubmit = () => {
    const updates: any = {};
    
    // Only update fields that are missing and filled in the form
    if (!fields.firstName && formData.firstName.trim()) {
      updates.firstName = formData.firstName.trim();
    }
    
    if (!fields.lastName && formData.lastName.trim()) {
      updates.lastName = formData.lastName.trim();
    }
    
    if (!fields.weightUnit && formData.weightUnit) {
      updates.weightUnit = formData.weightUnit;
    }
    
    if (!fields.heightUnit && formData.heightUnit) {
      updates.heightUnit = formData.heightUnit;
    }
    
    if (!fields.height && formData.height) {
      const heightNum = parseFloat(formData.height);
      
      // Smart height unit detection and conversion
      let finalHeight = heightNum;
      let finalUnit = formData.heightUnit;
      
      // Auto-detect if user entered wrong unit
      if (formData.heightUnit === "inches" && heightNum > 80) {
        // User likely entered cm but selected inches
        console.log(`Height ${heightNum} seems too large for inches, treating as cm`);
        finalUnit = "cm";
        toast({
          title: "Height Unit Auto-Corrected",
          description: `${heightNum} seems too large for inches. Saving as ${heightNum} cm instead.`,
        });
      } else if (formData.heightUnit === "cm" && heightNum < 80) {
        // User likely entered inches but selected cm
        console.log(`Height ${heightNum} seems too small for cm, treating as inches`);
        finalUnit = "inches";
        toast({
          title: "Height Unit Auto-Corrected", 
          description: `${heightNum} seems too small for cm. Saving as ${heightNum} inches instead.`,
        });
      }
      
      // Validate final height
      const minHeight = finalUnit === "inches" ? 36 : 90;
      const maxHeight = finalUnit === "inches" ? 96 : 240;
      
      if (finalHeight >= minHeight && finalHeight <= maxHeight) {
        // CRITICAL FIX: Convert height to centimeters for database storage
        // Database always stores height in centimeters regardless of user's preferred unit
        const heightForDatabase = finalUnit === "inches" 
          ? finalHeight * 2.54  // Convert inches to cm
          : finalHeight;        // Already in cm
          
        console.log(`Storing height: ${finalHeight} ${finalUnit} → ${heightForDatabase.toFixed(2)} cm in database`);
        
        updates.height = heightForDatabase; // Store in cm in database
        updates.heightUnit = finalUnit; // Keep user's preferred unit for display
      } else {
        toast({
          title: "Invalid Height",
          description: `Please enter a valid height between ${minHeight}-${maxHeight} ${finalUnit}.`,
          variant: "destructive",
        });
        return;
      }
    }
    
    if (!fields.dateOfBirth && formData.dateOfBirth) {
      const birthDate = new Date(formData.dateOfBirth);
      const today = new Date();
      const age = today.getFullYear() - birthDate.getFullYear();
      
      if (age < 10 || age > 120) {
        toast({
          title: "Invalid Date of Birth",
          description: "Please enter a valid date of birth.",
          variant: "destructive",
        });
        return;
      }
      updates.dateOfBirth = formData.dateOfBirth;
    }
    
    if (!fields.sex && formData.sex) {
      updates.sex = formData.sex;
    }
    
    if (Object.keys(updates).length === 0) {
      toast({
        title: "No Changes",
        description: "Please fill in at least one missing field.",
        variant: "destructive",
      });
      return;
    }
    
    updateProfileMutation.mutate(updates);
  };

  const getMissingFields = () => {
    const missing = [];
    if (!fields.firstName) missing.push(t('profile.fields.firstName'));
    if (!fields.lastName) missing.push(t('profile.fields.lastName'));
    if (!fields.height || !fields.heightUnit) missing.push(t('profile.fields.height'));
    if (!fields.dateOfBirth) missing.push(t('profile.fields.dateOfBirth'));
    if (!fields.sex) missing.push(t('profile.fields.sex'));
    if (!fields.weightUnit) missing.push(t('profile.fields.weightUnit'));
    return missing;
  };

  const missingFields = getMissingFields();

  return (
    <div className="mx-4 mb-4">
      <Card className="border-2 border-blue-200 bg-gradient-to-r from-blue-50 to-indigo-50">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-blue-100 rounded-full">
                <UserCheck className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <CardTitle className="text-lg text-blue-900">{t('profile.completeProfile')}</CardTitle>
                <CardDescription className="text-blue-700">
                  {t('profile.addYourInfo')} {
                    missingFields.length > 2 
                      ? missingFields.slice(0, -1).join(", ") + t('profile.connectors.commaAnd') + missingFields.slice(-1)[0]
                      : missingFields.length === 2
                        ? missingFields.join(t('profile.connectors.and'))
                        : missingFields[0] || ""
                  } {t('profile.unlockFeatures')}
                </CardDescription>
              </div>
            </div>
            <Button
              variant={isExpanded ? "outline" : "default"}
              size="sm"
              onClick={() => setIsExpanded(!isExpanded)}
              className="shrink-0"
            >
              {isExpanded ? t('profile.cancel') : t('profile.complete')}
            </Button>
          </div>
          
          <div className="mt-4">
            <div className="flex justify-between text-sm text-blue-700 mb-2">
              <span>{t('profile.profileCompletion')}</span>
              <span>{completionPercentage}%</span>
            </div>
            <Progress value={completionPercentage} className="h-2 bg-blue-100" />
          </div>
        </CardHeader>

        {isExpanded && (
          <CardContent className="pt-0">
            <div className="space-y-4">
              {!fields.firstName && (
                <div className="space-y-2">
                  <Label htmlFor="firstName" className="flex items-center space-x-2 text-blue-900">
                    <UserCheck className="h-4 w-4" />
                    <span>{t('profile.firstName')}</span>
                  </Label>
                  <Input
                    id="firstName"
                    type="text"
                    value={formData.firstName}
                    onChange={(e) => setFormData(prev => ({ ...prev, firstName: e.target.value }))}
                    placeholder={t('profile.enterFirstName')}
                    className="border-blue-200 focus:border-blue-400"
                  />
                </div>
              )}

              {!fields.lastName && (
                <div className="space-y-2">
                  <Label htmlFor="lastName" className="flex items-center space-x-2 text-blue-900">
                    <UserCheck className="h-4 w-4" />
                    <span>{t('profile.lastName')}</span>
                  </Label>
                  <Input
                    id="lastName"
                    type="text"
                    value={formData.lastName}
                    onChange={(e) => setFormData(prev => ({ ...prev, lastName: e.target.value }))}
                    placeholder={t('profile.enterLastName')}
                    className="border-blue-200 focus:border-blue-400"
                  />
                </div>
              )}

              {(!fields.height || !fields.heightUnit) && (
                <div className="space-y-2">
                  <Label className="flex items-center space-x-2 text-blue-900">
                    <Ruler className="h-4 w-4" />
                    <span>{t('profile.heightLabel')}</span>
                  </Label>
                  <div className="flex gap-2">
                    <Input
                      type="number"
                      value={formData.height}
                      onChange={(e) => setFormData(prev => ({ ...prev, height: e.target.value }))}
                      placeholder={formData.heightUnit === "inches" ? "70" : "180"}
                      min={formData.heightUnit === "inches" ? "36" : "90"}
                      max={formData.heightUnit === "inches" ? "96" : "240"}
                      className="border-blue-200 focus:border-blue-400 flex-1"
                    />
                    {!isBrazilianMarket && (
                      <Select
                        value={formData.heightUnit}
                        onValueChange={(value: HeightUnit) => setFormData(prev => ({ ...prev, heightUnit: value }))}
                      >
                        <SelectTrigger className="border-blue-200 focus:border-blue-400 w-32">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="inches">{t('profile.inches')}</SelectItem>
                          <SelectItem value="cm">{t('profile.centimeters')}</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                    {isBrazilianMarket && (
                      <div className="w-24 flex items-center justify-center border border-blue-200 bg-slate-50 rounded-md px-3 text-sm text-slate-600">
                        cm
                      </div>
                    )}
                  </div>
                </div>
              )}
              
              {!fields.dateOfBirth && (
                <div className="space-y-2">
                  <Label htmlFor="dateOfBirth" className="flex items-center space-x-2 text-blue-900">
                    <Calendar className="h-4 w-4" />
                    <span>{t('profile.dateOfBirth')}</span>
                  </Label>
                  <Input
                    id="dateOfBirth"
                    type="date"
                    value={formData.dateOfBirth}
                    onChange={(e) => setFormData(prev => ({ ...prev, dateOfBirth: e.target.value }))}
                    className="border-blue-200 focus:border-blue-400"
                  />
                </div>
              )}

              {!fields.sex && (
                <div className="space-y-2">
                  <Label htmlFor="sex" className="flex items-center space-x-2 text-blue-900">
                    <UserCheck className="h-4 w-4" />
                    <span>{t('profile.sexLabel')}</span>
                  </Label>
                  <Select
                    value={formData.sex}
                    onValueChange={(value: string) => setFormData(prev => ({ ...prev, sex: value }))}
                  >
                    <SelectTrigger className="border-blue-200 focus:border-blue-400">
                      <SelectValue placeholder={t('profile.selectSex')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="male">{t('profile.male')}</SelectItem>
                      <SelectItem value="female">{t('profile.female')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              {!fields.weightUnit && !isBrazilianMarket && (
                <div className="space-y-2">
                  <Label htmlFor="weightUnit" className="flex items-center space-x-2 text-blue-900">
                    <Scale className="h-4 w-4" />
                    <span>{t('profile.preferredWeightUnit')}</span>
                  </Label>
                  <Select
                    value={formData.weightUnit}
                    onValueChange={(value: string) => setFormData(prev => ({ ...prev, weightUnit: value }))}
                  >
                    <SelectTrigger className="border-blue-200 focus:border-blue-400">
                      <SelectValue placeholder={t('profile.chooseUnit')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="lbs">Pounds (lbs)</SelectItem>
                      <SelectItem value="kg">Kilograms (kg)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
              
              <div className="flex gap-2 pt-2">
                <Button 
                  onClick={handleSubmit}
                  disabled={updateProfileMutation.isPending}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  {updateProfileMutation.isPending ? t('profile.saving') : t('profile.saveProfile')}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setIsExpanded(false)}
                  className="border-blue-200 text-blue-700 hover:bg-blue-50"
                >
                  {t('profile.later')}
                </Button>
              </div>
            </div>
          </CardContent>
        )}
      </Card>
    </div>
  );
}
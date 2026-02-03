import type { User } from "./schema";
import type { PaymentProvider } from "./payment/types";

/**
 * Helper functions for provider-agnostic subscription data access
 * These functions provide provider-agnostic subscription data access
 */

/**
 * Get the payment provider for a user
 * Returns the user's payment provider or null if not set
 */
export function getUserPaymentProvider(user: User): PaymentProvider | null {
  if (user.paymentProvider) {
    return user.paymentProvider as PaymentProvider;
  }
  return null;
}

/**
 * Get the provider-specific customer ID for a user
 */
export function getUserProviderCustomerId(user: User): string | null {
  return user.providerCustomerId || null;
}

/**
 * Get the provider-specific subscription ID for a user
 */
export function getUserProviderSubscriptionId(user: User): string | null {
  return user.providerSubscriptionId || null;
}

/**
 * Check if user has any payment provider data
 */
export function hasPaymentProviderData(user: User): boolean {
  return !!(
    user.paymentProvider ||
    user.providerCustomerId ||
    user.providerSubscriptionId
  );
}

export interface SubscriptionTier {
  name: "free" | "starter" | "premium" | "pro" | "admin";
  displayName: string;
  recordingFrequency: "weekly" | "daily" | "unlimited";
  analyticsAccess: boolean;
  socialSharing: boolean;
  imageUpload: boolean;
  goalSetting: boolean;
  deleteLastReading: boolean;
  maxPhotos: number | null; // null = unlimited
  priority: number; // Higher = better tier
  price?: number; // Price in cents
  priceDisplay?: string;
}

export const SUBSCRIPTION_TIERS: Record<string, SubscriptionTier> = {
  free: {
    name: "free",
    displayName: "Free",
    recordingFrequency: "weekly",
    analyticsAccess: false,
    socialSharing: false,
    imageUpload: false,
    goalSetting: false,
    deleteLastReading: false,
    maxPhotos: 0,
    priority: 1,
  },
  starter: {
    name: "starter",
    displayName: "Starter",
    recordingFrequency: "daily",
    analyticsAccess: false,
    socialSharing: true,
    imageUpload: false, // Starter users only get daily recording, no image upload
    goalSetting: false,
    deleteLastReading: false,
    maxPhotos: 0, // No photo upload for starter users
    priority: 2,
    price: 199, // $1.99
    priceDisplay: "$1.99/month",
  },
  premium: {
    name: "premium",
    displayName: "Premium",
    recordingFrequency: "daily",
    analyticsAccess: false,
    socialSharing: true,
    imageUpload: true,
    goalSetting: true,
    deleteLastReading: true,
    maxPhotos: null,
    priority: 3,
    price: 299, // $2.99
    priceDisplay: "$2.99/month",
  },
  pro: {
    name: "pro",
    displayName: "Pro",
    recordingFrequency: "daily",
    analyticsAccess: true,
    socialSharing: true,
    imageUpload: true,
    goalSetting: true,
    deleteLastReading: true,
    maxPhotos: null,
    priority: 4,
    price: 399, // $3.99
    priceDisplay: "$3.99/month",
  },
  admin: {
    name: "admin",
    displayName: "Admin",
    recordingFrequency: "unlimited",
    analyticsAccess: true,
    socialSharing: true,
    imageUpload: true,
    goalSetting: true,
    deleteLastReading: true,
    maxPhotos: null,
    priority: 5,
  },
};

export function getUserTier(user: User): SubscriptionTier {
  const tierName = user.subscriptionTier || "free";
  return SUBSCRIPTION_TIERS[tierName] || SUBSCRIPTION_TIERS.free;
}

export function canAccessFeature(user: User, feature: keyof SubscriptionTier): boolean {
  const tier = getUserTier(user);
  const featureValue = tier[feature];
  
  if (typeof featureValue === "boolean") {
    return featureValue;
  }
  
  return true; // For non-boolean features, assume access is granted
}

export function isActiveSubscription(user: User): boolean {
  if (user.subscriptionTier === "admin") return true;
  if (user.subscriptionTier === "free") return true;
  
  // For paid subscriptions, check if subscription is active and not expired
  const paidTiers = ["starter", "premium", "pro"];
  if (paidTiers.includes(user.subscriptionTier || "")) {
    if (user.subscriptionStatus === "active") {
      // Check if subscription hasn't expired
      if (user.subscriptionEndsAt) {
        return new Date() < new Date(user.subscriptionEndsAt);
      }
      return true;
    }
    
    // Check if user is in trial period
    if (user.trialEndsAt) {
      return new Date() < new Date(user.trialEndsAt);
    }
    
    return false;
  }
  
  return false;
}

export function getSubscriptionStatus(user: User): {
  isActive: boolean;
  tier: SubscriptionTier;
  daysUntilExpiry: number | null;
  isInTrial: boolean;
  trialDaysLeft: number | null;
} {
  const tier = getUserTier(user);
  const isActive = isActiveSubscription(user);
  
  let daysUntilExpiry: number | null = null;
  if (user.subscriptionEndsAt) {
    const daysLeft = Math.ceil(
      (new Date(user.subscriptionEndsAt).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
    );
    daysUntilExpiry = Math.max(0, daysLeft);
  }
  
  let isInTrial = false;
  let trialDaysLeft: number | null = null;
  if (user.trialEndsAt) {
    const trialDays = Math.ceil(
      (new Date(user.trialEndsAt).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
    );
    isInTrial = trialDays > 0;
    trialDaysLeft = Math.max(0, trialDays);
  }
  
  return {
    isActive,
    tier,
    daysUntilExpiry,
    isInTrial,
    trialDaysLeft,
  };
}

export function canRecordWeight(user: User, lastRecordingDate?: Date): boolean {
  const tier = getUserTier(user);
  
  if (tier.recordingFrequency === "unlimited") {
    return true;
  }
  
  if (!lastRecordingDate) {
    return true; // First recording is always allowed
  }
  
  const now = new Date();
  const lastRecording = new Date(lastRecordingDate);
  
  if (tier.recordingFrequency === "daily") {
    // Allow one recording per day
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const lastRecordingDay = new Date(lastRecording.getFullYear(), lastRecording.getMonth(), lastRecording.getDate());
    return today.getTime() > lastRecordingDay.getTime();
  }
  
  if (tier.recordingFrequency === "weekly") {
    // Allow one recording per week (7 days)
    const daysDifference = (now.getTime() - lastRecording.getTime()) / (1000 * 60 * 60 * 24);
    return daysDifference >= 7;
  }
  
  return false;
}

export function getNextRecordingTime(user: User, lastRecordingDate?: Date): Date | null {
  if (!lastRecordingDate) {
    return null; // Can record immediately
  }
  
  const tier = getUserTier(user);
  
  if (tier.recordingFrequency === "unlimited") {
    return null; // Can always record
  }
  
  const lastRecording = new Date(lastRecordingDate);
  
  if (tier.recordingFrequency === "daily") {
    const nextDay = new Date(lastRecording);
    nextDay.setDate(nextDay.getDate() + 1);
    nextDay.setHours(0, 0, 0, 0); // Start of next day
    return nextDay;
  }
  
  if (tier.recordingFrequency === "weekly") {
    const nextWeek = new Date(lastRecording);
    nextWeek.setDate(nextWeek.getDate() + 7);
    return nextWeek;
  }
  
  return null;
}


import type { User } from "@shared/schema";

/**
 * WhatsApp Access Control
 * Determines if a user can access WhatsApp features based on subscription tier and trial status
 */

export interface WhatsAppAccessResult {
  canAccess: boolean;
  reason?: string;
  status?: "active" | "trialing" | "expired" | "not_enabled" | "pending_verification";
  trialDaysRemaining?: number;
}

/**
 * Check if WhatsApp is included in the user's subscription plan
 */
export function isWhatsAppIncludedInPlan(subscriptionTier: string): boolean {
  // WhatsApp is auto-included with Starter, Premium, Pro, and Admin plans
  // Free tier users must use trial first
  return ["starter", "premium", "pro", "admin"].includes(subscriptionTier);
}

/**
 * Calculate remaining days in WhatsApp trial
 */
export function getWhatsAppTrialDaysRemaining(trialEndsAt: Date | string | null): number {
  if (!trialEndsAt) return 0;
  
  const endDate = new Date(trialEndsAt);
  const now = new Date();
  const diffTime = endDate.getTime() - now.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  return Math.max(0, diffDays);
}

/**
 * Main access control function
 * Checks if user can access WhatsApp features
 */
export async function canAccessWhatsApp(user: User): Promise<WhatsAppAccessResult> {
  // Check if WhatsApp is enabled for this user
  if (!(user as any).whatsappEnabled) {
    return {
      canAccess: false,
      reason: "WhatsApp not connected",
      status: "not_enabled"
    };
  }

  const whatsappStatus = (user as any).whatsappStatus;

  // Active subscription - full access
  if (whatsappStatus === "active") {
    return {
      canAccess: true,
      status: "active"
    };
  }

  // Pending verification - user hasn't completed phone verification
  if (whatsappStatus === "pending_verification") {
    return {
      canAccess: false,
      reason: "Phone verification pending",
      status: "pending_verification"
    };
  }

  // Trial period - check if expired
  if (whatsappStatus === "trialing") {
    const trialEndsAt = (user as any).whatsappTrialEndsAt;
    
    if (!trialEndsAt) {
      // Trial enabled but no end date - should not happen, but allow access
      return {
        canAccess: true,
        status: "trialing",
        trialDaysRemaining: 30 // Default
      };
    }

    const daysRemaining = getWhatsAppTrialDaysRemaining(trialEndsAt);
    
    if (daysRemaining > 0) {
      // Trial still valid
      return {
        canAccess: true,
        status: "trialing",
        trialDaysRemaining: daysRemaining
      };
    } else {
      // Trial expired
      return {
        canAccess: false,
        reason: "Trial period ended. Upgrade to continue using WhatsApp.",
        status: "expired",
        trialDaysRemaining: 0
      };
    }
  }

  // Expired status
  if (whatsappStatus === "expired") {
    return {
      canAccess: false,
      reason: "WhatsApp access expired. Upgrade to re-enable.",
      status: "expired"
    };
  }

  // Unknown status - deny access by default
  return {
    canAccess: false,
    reason: "Unknown WhatsApp status",
    status: "not_enabled"
  };
}

/**
 * Determine WhatsApp status for a new connection request
 * Returns the appropriate status based on user's subscription tier
 */
export function getInitialWhatsAppStatus(subscriptionTier: string): "active" | "trialing" | "pending_verification" {
  // Paid plans get immediate active status
  if (isWhatsAppIncludedInPlan(subscriptionTier)) {
    return "active";
  }
  
  // Free users start with pending verification (will become trialing after phone verification)
  return "pending_verification";
}

/**
 * Calculate trial end date for free users
 * Returns date 30 days from now
 */
export function calculateWhatsAppTrialEndDate(): Date {
  const now = new Date();
  const trialEnd = new Date(now);
  trialEnd.setDate(trialEnd.getDate() + 30); // 30-day trial
  return trialEnd;
}

/**
 * Should we send trial warning notifications?
 * Returns true if trial ends in 7 days or 1 day
 */
export function shouldSendTrialWarning(trialEndsAt: Date | string | null): "7days" | "1day" | null {
  if (!trialEndsAt) return null;
  
  const daysRemaining = getWhatsAppTrialDaysRemaining(trialEndsAt);
  
  if (daysRemaining === 7) return "7days";
  if (daysRemaining === 1) return "1day";
  
  return null;
}

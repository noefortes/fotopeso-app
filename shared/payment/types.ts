export type PaymentProvider = "revenuecat" | "mercadopago" | "pagarme" | "pagseguro" | "stripe";

export type SubscriptionStatus = "active" | "inactive" | "canceled" | "past_due" | "pending" | "trialing" | "paused";

export type PaymentCurrency = "USD" | "BRL" | "EUR" | "GBP";

export interface PaymentCustomer {
  id: string;
  email: string;
  name?: string;
  providerId: string; // Provider-specific customer ID
  provider: PaymentProvider;
  metadata?: Record<string, any>;
}

export interface PaymentSubscription {
  id: string;
  customerId: string;
  providerSubscriptionId: string; // Provider-specific subscription ID
  provider: PaymentProvider;
  status: SubscriptionStatus;
  planId: string;
  currency: PaymentCurrency;
  amount: number; // Amount in cents
  interval: "month" | "semiannual" | "year";
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
  trialEnd?: Date;
  metadata?: Record<string, any>;
}

export interface PaymentPlan {
  id: string;
  provider: PaymentProvider;
  providerPlanId: string; // Provider-specific plan ID
  name: string;
  tier: "starter" | "premium" | "pro"; // Maps to our internal tiers
  currency: PaymentCurrency;
  amount: number; // Amount in cents
  interval: "month" | "semiannual" | "year";
  features: string[];
  isActive: boolean;
}

export interface CheckoutSessionData {
  id: string;
  url: string;
  provider: PaymentProvider;
  expiresAt?: Date;
  metadata?: Record<string, any>;
}

export interface WebhookEvent {
  id: string;
  provider: PaymentProvider;
  type: string;
  data: any;
  timestamp: Date;
  signature?: string;
}

export interface PaymentResult<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
}
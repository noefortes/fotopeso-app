import type {
  PaymentProvider,
  PaymentCustomer,
  PaymentSubscription,
  PaymentPlan,
  CheckoutSessionData,
  WebhookEvent,
  PaymentResult
} from "./types";

/**
 * Abstract interface for payment providers.
 * All payment providers (RevenueCat, Mercado Pago, etc.) must implement this interface.
 */
export interface IPaymentProvider {
  readonly name: PaymentProvider;
  readonly supportedCurrencies: string[];
  readonly supportedCountries: string[];

  /**
   * Initialize the provider with configuration
   */
  initialize(config: PaymentProviderConfig): Promise<void>;

  /**
   * Customer Management
   */
  createCustomer(data: CreateCustomerData): Promise<PaymentResult<PaymentCustomer>>;
  getCustomer(customerId: string): Promise<PaymentResult<PaymentCustomer>>;
  updateCustomer(customerId: string, data: Partial<CreateCustomerData>): Promise<PaymentResult<PaymentCustomer>>;

  /**
   * Subscription Management
   */
  createCheckoutSession(data: CreateCheckoutData): Promise<PaymentResult<CheckoutSessionData>>;
  getSubscription(subscriptionId: string): Promise<PaymentResult<PaymentSubscription>>;
  cancelSubscription(subscriptionId: string, immediate?: boolean): Promise<PaymentResult<PaymentSubscription>>;
  resumeSubscription(subscriptionId: string): Promise<PaymentResult<PaymentSubscription>>;
  changeSubscriptionPlan(subscriptionId: string, newPlanId: string): Promise<PaymentResult<PaymentSubscription>>;

  /**
   * Plans & Pricing
   */
  getPlans(): Promise<PaymentResult<PaymentPlan[]>>;
  getPlan(planId: string): Promise<PaymentResult<PaymentPlan>>;

  /**
   * Webhook Processing
   */
  verifyWebhook(payload: string, signature: string, secret: string): boolean;
  processWebhook(event: WebhookEvent): Promise<PaymentResult<WebhookProcessingResult>>;

  /**
   * Utility Methods
   */
  getCustomerPortalUrl?(customerId: string): Promise<PaymentResult<string>>;
  isWebhookEvent(payload: any): boolean;
}

export interface PaymentProviderConfig {
  apiKey: string;
  secretKey?: string;
  webhookSecret?: string;
  environment: "sandbox" | "production";
  metadata?: Record<string, any>;
}

export interface CreateCustomerData {
  email: string;
  name?: string;
  userId: string; // Our internal user ID
  metadata?: Record<string, any>;
}

export interface CreateCheckoutData {
  customerId: string;
  planId: string;
  priceId: string;
  userId: string;
  tier?: string;
  successUrl: string;
  cancelUrl: string;
  trialDays?: number;
  locale?: string;
  metadata?: Record<string, any>;
}

export interface WebhookProcessingResult {
  type: "subscription_created" | "subscription_updated" | "subscription_canceled" | "payment_succeeded" | "payment_failed" | "customer_updated";
  subscription?: PaymentSubscription;
  customer?: PaymentCustomer;
  changes?: Record<string, any>;
}
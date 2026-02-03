import type { IPaymentProvider, PaymentProviderConfig, CreateCustomerData, CreateCheckoutData, WebhookProcessingResult } from "../IPaymentProvider";
import type { PaymentResult, PaymentCustomer, PaymentSubscription, PaymentPlan, CheckoutSessionData, WebhookEvent, PaymentCurrency } from "../types";
import { createHmac, timingSafeEqual } from 'crypto';

interface RevenueCatCustomer {
  request_date: string;
  request_date_ms: number;
  subscriber: {
    original_app_user_id: string;
    original_application_version: string;
    first_seen: string;
    last_seen: string;
    management_url: string;
    non_subscriptions: Record<string, any[]>;
    subscriptions: Record<string, RevenueCatSubscription>;
    entitlements: Record<string, RevenueCatEntitlement>;
  };
}

interface RevenueCatSubscription {
  expires_date: string;
  purchase_date: string;
  original_purchase_date: string;
  period_type: string;
  product_identifier: string;
  is_sandbox: boolean;
  store: string;
  unsubscribe_detected_at?: string;
  billing_issues_detected_at?: string;
}

interface RevenueCatEntitlement {
  expires_date: string;
  purchase_date: string;
  product_identifier: string;
}

export class RevenueCatProvider implements IPaymentProvider {
  readonly name = "revenuecat" as const;
  readonly supportedCurrencies = ["USD"];
  readonly supportedCountries = ["US"];
  
  private apiKey: string = "";
  private webhookSecret: string = "";
  private projectId: string = "";
  private baseUrl = "https://api.revenuecat.com";
  private environment: "sandbox" | "production" = "sandbox";
  
  async initialize(config: PaymentProviderConfig): Promise<void> {
    this.apiKey = config.apiKey;
    this.webhookSecret = config.webhookSecret || "";
    this.environment = config.environment as "sandbox" | "production";
    
    // Extract project ID from API key or use default for MVP
    this.projectId = this.extractProjectId(config.apiKey) || "default-project";
    
    if (!this.webhookSecret) {
      console.warn(`[RevenueCat] No webhook secret provided - webhook verification will fail`);
    }
    
    console.log(`[RevenueCat] Provider initialized for ${this.environment} environment`);
  }
  
  private extractProjectId(apiKey: string): string | null {
    // RevenueCat API keys often contain project info, but for MVP we'll use a default
    // In production, this would be configured separately
    return null;
  }
  
  private async makeRequest(endpoint: string, options: RequestInit = {}, retryCount = 0): Promise<any> {
    const maxRetries = 3;
    const timeout = 30000; // 30 seconds
    const url = `${this.baseUrl}${endpoint}`;
    
    const headers = {
      'Authorization': `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
      'User-Agent': 'ScanMyScale-RevenueCat-Provider/1.0',
      ...options.headers,
    };

    // Create AbortController for timeout handling
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const startTime = Date.now();
      
      const response = await fetch(url, {
        ...options,
        headers,
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      const duration = Date.now() - startTime;
      
      // Log request for debugging
      console.log(`[RevenueCat] ${options.method || 'GET'} ${endpoint} - ${response.status} (${duration}ms)`);

      if (!response.ok) {
        const errorText = await response.text();
        let errorData: any = null;
        
        try {
          errorData = JSON.parse(errorText);
        } catch {
          // Response is not JSON
        }

        // Handle rate limiting with exponential backoff
        if (response.status === 429 && retryCount < maxRetries) {
          const retryAfter = response.headers.get('Retry-After');
          const delay = retryAfter ? parseInt(retryAfter) * 1000 : Math.pow(2, retryCount) * 1000;
          
          console.warn(`[RevenueCat] Rate limited, retrying after ${delay}ms (attempt ${retryCount + 1}/${maxRetries})`);
          await new Promise(resolve => setTimeout(resolve, delay));
          return this.makeRequest(endpoint, options, retryCount + 1);
        }

        // Handle server errors with retry
        if (response.status >= 500 && response.status < 600 && retryCount < maxRetries) {
          const delay = Math.pow(2, retryCount) * 1000; // Exponential backoff
          console.warn(`[RevenueCat] Server error ${response.status}, retrying after ${delay}ms (attempt ${retryCount + 1}/${maxRetries})`);
          await new Promise(resolve => setTimeout(resolve, delay));
          return this.makeRequest(endpoint, options, retryCount + 1);
        }

        // Construct detailed error message
        const errorMessage = errorData?.message || errorData?.error || response.statusText || 'Unknown error';
        const errorCode = errorData?.code || `HTTP_${response.status}`;
        
        const error = new Error(`RevenueCat API error (${response.status}): ${errorMessage}`);
        (error as any).statusCode = response.status;
        (error as any).errorCode = errorCode;
        (error as any).errorData = errorData;
        (error as any).responseText = errorText;
        
        throw error;
      }

      // Parse JSON response
      const responseText = await response.text();
      if (!responseText) {
        return null; // Empty response
      }
      
      try {
        return JSON.parse(responseText);
      } catch (parseError) {
        console.error(`[RevenueCat] Failed to parse JSON response from ${endpoint}:`, responseText);
        throw new Error(`Invalid JSON response from RevenueCat API: ${parseError}`);
      }
      
    } catch (error) {
      clearTimeout(timeoutId);
      
      // Handle timeout errors
      if (error instanceof Error && error.name === 'AbortError') {
        if (retryCount < maxRetries) {
          const delay = Math.pow(2, retryCount) * 1000;
          console.warn(`[RevenueCat] Request timeout, retrying after ${delay}ms (attempt ${retryCount + 1}/${maxRetries})`);
          await new Promise(resolve => setTimeout(resolve, delay));
          return this.makeRequest(endpoint, options, retryCount + 1);
        }
        throw new Error(`RevenueCat API request timeout after ${timeout}ms`);
      }
      
      // Handle network errors with retry
      if (error instanceof TypeError && error.message.includes('fetch') && retryCount < maxRetries) {
        const delay = Math.pow(2, retryCount) * 1000;
        console.warn(`[RevenueCat] Network error, retrying after ${delay}ms (attempt ${retryCount + 1}/${maxRetries}):`, error.message);
        await new Promise(resolve => setTimeout(resolve, delay));
        return this.makeRequest(endpoint, options, retryCount + 1);
      }
      
      // Re-throw other errors
      throw error;
    }
  }

  async createCustomer(data: CreateCustomerData): Promise<PaymentResult<PaymentCustomer>> {
    try {
      // RevenueCat doesn't have explicit customer creation - customers are created implicitly
      // when they make their first purchase. We use userId as app_user_id to avoid PII exposure
      const customer: PaymentCustomer = {
        id: data.userId, // Use our internal userId as the customer ID
        providerId: data.userId, // RevenueCat app_user_id should be our userId, not email
        provider: "revenuecat",
        email: data.email,
        name: data.name || "",
        metadata: {
          originalUserId: data.userId,
          createdAt: new Date().toISOString()
        }
      };

      return { success: true, data: customer };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to create customer",
        code: "CUSTOMER_CREATION_FAILED"
      };
    }
  }

  async getCustomer(customerId: string): Promise<PaymentResult<PaymentCustomer>> {
    try {
      // Use RevenueCat v1 API for customer subscription info
      // customerId is our internal userId, which maps to RevenueCat's app_user_id
      const data = await this.makeRequest(`/v1/subscribers/${encodeURIComponent(customerId)}`);
      
      const rcCustomer = data as RevenueCatCustomer;
      const subscriber = rcCustomer.subscriber;

      // Validate that the returned app_user_id matches our expected customerId
      if (subscriber.original_app_user_id !== customerId) {
        return {
          success: false,
          error: `Customer ID mismatch: expected ${customerId}, got ${subscriber.original_app_user_id}`,
          code: "CUSTOMER_ID_MISMATCH"
        };
      }

      const customer: PaymentCustomer = {
        id: customerId, // Our internal user ID
        providerId: subscriber.original_app_user_id, // RevenueCat's app_user_id
        provider: "revenuecat",
        email: "", // We don't store email in RevenueCat app_user_id anymore for security
        name: "", // Not provided by RevenueCat API
        metadata: {
          first_seen: subscriber.first_seen,
          last_seen: subscriber.last_seen,
          management_url: subscriber.management_url,
          original_application_version: subscriber.original_application_version
        }
      };

      return { success: true, data: customer };
    } catch (error) {
      if (error instanceof Error && error.message.includes('404')) {
        return {
          success: false,
          error: `Customer not found: ${customerId}`,
          code: "CUSTOMER_NOT_FOUND"
        };
      }
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to get customer",
        code: "CUSTOMER_FETCH_FAILED"
      };
    }
  }

  private mapRevenueCatStatus(subscription: RevenueCatSubscription): PaymentSubscription['status'] {
    const now = new Date();
    const expiresDate = new Date(subscription.expires_date);
    
    // Check for billing issues first
    if (subscription.billing_issues_detected_at) {
      return 'past_due';
    }
    
    // If unsubscribed, check if still in grace period
    if (subscription.unsubscribe_detected_at) {
      return expiresDate > now ? 'active' : 'canceled';
    }
    
    // Check expiration status
    if (expiresDate <= now) {
      return 'canceled';
    }
    
    return 'active';
  }

  private mapProductIdentifierToPlan(productIdentifier: string): string {
    // Map RevenueCat product identifiers to our internal plan IDs (USD-only)
    const productToPlanMap: Record<string, string> = {
      // USD Starter plans
      'starter_monthly_usd': 'scanmyscale_starter_monthly_usd',
      'starter_yearly_usd': 'scanmyscale_starter_yearly_usd',
      
      // USD Premium plans
      'premium_monthly_usd': 'scanmyscale_premium_monthly_usd',
      'premium_yearly_usd': 'scanmyscale_premium_yearly_usd',
      
      // USD Pro plans
      'pro_monthly_usd': 'scanmyscale_pro_monthly_usd',
      'pro_yearly_usd': 'scanmyscale_pro_yearly_usd',
      
      // Legacy/simplified mappings for backwards compatibility (default to USD)
      'starter_monthly': 'scanmyscale_starter_monthly_usd',
      'premium_monthly': 'scanmyscale_premium_monthly_usd',
      'pro_monthly': 'scanmyscale_pro_monthly_usd',
      'starter_yearly': 'scanmyscale_starter_yearly_usd',
      'premium_yearly': 'scanmyscale_premium_yearly_usd',
      'pro_yearly': 'scanmyscale_pro_yearly_usd'
    };
    
    const mappedPlan = productToPlanMap[productIdentifier];
    if (!mappedPlan) {
      console.warn(`[RevenueCat] Unknown product identifier: ${productIdentifier}, using as-is`);
    }
    
    return mappedPlan || productIdentifier;
  }

  private mapPeriodTypeToInterval(periodType: string): "month" | "year" {
    // DEPRECATED: This method is incorrect as RevenueCat's period_type doesn't indicate duration
    // period_type values: "normal", "intro", "trial" - these don't indicate monthly vs yearly
    // Use getIntervalFromProductId() instead to properly extract interval from product identifier
    console.warn('[RevenueCat] mapPeriodTypeToInterval() is deprecated, use getIntervalFromProductId() instead');
    return "month"; // Default fallback
  }
  
  private getCurrencyFromProductId(productIdentifier: string): PaymentCurrency {
    // Always return USD since we only support USD pricing
    return 'USD';
  }
  
  private getIntervalFromProductId(productIdentifier: string): "month" | "year" {
    // Extract interval from product identifier
    if (productIdentifier.includes('yearly')) return 'year';
    if (productIdentifier.includes('monthly')) return 'month';
    
    // Default to monthly
    return 'month';
  }

  async updateCustomer(customerId: string, data: Partial<CreateCustomerData>): Promise<PaymentResult<PaymentCustomer>> {
    return {
      success: false,
      error: "Customer updates not supported by RevenueCat - customer data is managed through app store accounts",
      code: "NOT_SUPPORTED_BY_PROVIDER"
    };
  }

  async createCheckoutSession(data: CreateCheckoutData): Promise<PaymentResult<CheckoutSessionData>> {
    return {
      success: false,
      error: "Checkout sessions not supported by RevenueCat - purchases are handled through native app store flows (iOS App Store, Google Play, etc.)",
      code: "NOT_SUPPORTED_BY_PROVIDER"
    };
  }

  async getSubscription(subscriptionId: string): Promise<PaymentResult<PaymentSubscription>> {
    try {
      // For RevenueCat, we need to get customer data to find subscription details
      // subscriptionId could be either a customer ID or a specific subscription identifier
      const data = await this.makeRequest(`/v1/subscribers/${encodeURIComponent(subscriptionId)}`);
      
      const rcCustomer = data as RevenueCatCustomer;
      const subscriber = rcCustomer.subscriber;

      // Find the active subscription from the subscriber data
      const subscriptions = Object.entries(subscriber.subscriptions);
      if (subscriptions.length === 0) {
        return {
          success: false,
          error: "No subscriptions found for customer",
          code: "NO_SUBSCRIPTIONS_FOUND"
        };
      }

      // Get the most recent active subscription or the most recently expired one
      let activeSubscription: [string, RevenueCatSubscription] | null = null;
      let latestSubscription: [string, RevenueCatSubscription] | null = null;

      for (const [subId, sub] of subscriptions) {
        if (!latestSubscription || new Date(sub.purchase_date) > new Date(latestSubscription[1].purchase_date)) {
          latestSubscription = [subId, sub];
        }
        
        const status = this.mapRevenueCatStatus(sub);
        if (status === 'active' && !activeSubscription) {
          activeSubscription = [subId, sub];
        }
      }

      // Use active subscription if available, otherwise use the latest one
      const [subId, rcSubscription] = activeSubscription || latestSubscription!;
      
      // Map RevenueCat product_identifier to our internal plan ID
      const planId = this.mapProductIdentifierToPlan(rcSubscription.product_identifier);
      const status = this.mapRevenueCatStatus(rcSubscription);
      
      // Get plan details to extract pricing information
      const planResult = await this.getPlan(planId);
      const planData = planResult.success ? planResult.data : null;

      const subscription: PaymentSubscription = {
        id: subId,
        customerId: subscriber.original_app_user_id,
        providerSubscriptionId: subId,
        provider: "revenuecat",
        status,
        planId,
        currency: planData?.currency || "USD", // Default to USD if plan not found
        amount: planData?.amount || 0, // Use plan amount or 0
        interval: this.getIntervalFromProductId(rcSubscription.product_identifier),
        currentPeriodStart: new Date(rcSubscription.purchase_date),
        currentPeriodEnd: new Date(rcSubscription.expires_date),
        cancelAtPeriodEnd: !!rcSubscription.unsubscribe_detected_at,
        trialEnd: undefined, // RevenueCat doesn't directly provide trial end date in this response
        metadata: {
          environment: this.environment,
          store: rcSubscription.store,
          is_sandbox: rcSubscription.is_sandbox,
          original_purchase_date: rcSubscription.original_purchase_date,
          product_identifier: rcSubscription.product_identifier,
          unsubscribe_detected_at: rcSubscription.unsubscribe_detected_at,
          billing_issues_detected_at: rcSubscription.billing_issues_detected_at
        }
      };

      return { success: true, data: subscription };
    } catch (error) {
      if (error instanceof Error && error.message.includes('404')) {
        return {
          success: false,
          error: `Subscription not found: ${subscriptionId}`,
          code: "SUBSCRIPTION_NOT_FOUND"
        };
      }
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to get subscription",
        code: "SUBSCRIPTION_FETCH_FAILED"
      };
    }
  }

  async cancelSubscription(subscriptionId: string, immediate?: boolean): Promise<PaymentResult<PaymentSubscription>> {
    return {
      success: false,
      error: "Subscription cancellation not supported by RevenueCat API - users must cancel through their app store account (iOS Settings > Subscriptions or Google Play Store)",
      code: "NOT_SUPPORTED_BY_PROVIDER"
    };
  }

  async resumeSubscription(subscriptionId: string): Promise<PaymentResult<PaymentSubscription>> {
    return {
      success: false,
      error: "Subscription resumption not supported by RevenueCat API - users must resubscribe through the app using native purchase flows",
      code: "NOT_SUPPORTED_BY_PROVIDER"
    };
  }

  async changeSubscriptionPlan(subscriptionId: string, newPlanId: string): Promise<PaymentResult<PaymentSubscription>> {
    return {
      success: false,
      error: "Direct plan changes not supported by RevenueCat API - use RevenueCat's promotional offers, upgrades/downgrades through app store, or implement in-app plan selection",
      code: "NOT_SUPPORTED_BY_PROVIDER"
    };
  }

  async getPlans(): Promise<PaymentResult<PaymentPlan[]>> {
    try {
      // Define our standard ScanMyScale subscription tiers for RevenueCat (USD-only)
      // These reflect actual US app store pricing tiers
      const plans: PaymentPlan[] = [
        // Starter Monthly Plan
        {
          id: "scanmyscale_starter_monthly_usd",
          provider: "revenuecat",
          providerPlanId: "starter_monthly_usd",
          name: "ScanMyScale Starter",
          tier: "starter",
          currency: "USD",
          amount: 199, // $1.99 in cents
          interval: "month",
          features: [
            "Unlimited weight scans",
            "30-day history",
            "Basic progress charts",
            "Email support"
          ],
          isActive: true
        },
        
        // Starter Yearly Plan (with discount)
        {
          id: "scanmyscale_starter_yearly_usd",
          provider: "revenuecat",
          providerPlanId: "starter_yearly_usd",
          name: "ScanMyScale Starter (Annual)",
          tier: "starter",
          currency: "USD",
          amount: 1999, // $19.99 yearly (17% discount)
          interval: "year",
          features: [
            "Unlimited weight scans",
            "30-day history",
            "Basic progress charts",
            "Email support",
            "Save 17% vs monthly"
          ],
          isActive: true
        },
        
        // Premium Monthly Plan
        {
          id: "scanmyscale_premium_monthly_usd",
          provider: "revenuecat",
          providerPlanId: "premium_monthly_usd",
          name: "ScanMyScale Premium",
          tier: "premium",
          currency: "USD",
          amount: 299, // $2.99 in cents
          interval: "month",
          features: [
            "Everything in Starter",
            "Unlimited history",
            "Advanced analytics",
            "Goal tracking & trends",
            "Data export (CSV/PDF)",
            "Priority support"
          ],
          isActive: true
        },
        
        // Premium Yearly Plan
        {
          id: "scanmyscale_premium_yearly_usd",
          provider: "revenuecat",
          providerPlanId: "premium_yearly_usd",
          name: "ScanMyScale Premium (Annual)",
          tier: "premium",
          currency: "USD",
          amount: 2999, // $29.99 yearly (17% discount)
          interval: "year",
          features: [
            "Everything in Starter",
            "Unlimited history",
            "Advanced analytics",
            "Goal tracking & trends",
            "Data export (CSV/PDF)",
            "Priority support",
            "Save 17% vs monthly"
          ],
          isActive: true
        },
        
        // Pro Monthly Plan
        {
          id: "scanmyscale_pro_monthly_usd",
          provider: "revenuecat",
          providerPlanId: "pro_monthly_usd",
          name: "ScanMyScale Pro",
          tier: "pro",
          currency: "USD",
          amount: 399, // $3.99 in cents
          interval: "month",
          features: [
            "Everything in Premium",
            "AI insights & recommendations",
            "Social sharing features",
            "Custom progress images",
            "Advanced integrations",
            "24/7 priority support"
          ],
          isActive: true
        },
        
        // Pro Yearly Plan
        {
          id: "scanmyscale_pro_yearly_usd",
          provider: "revenuecat",
          providerPlanId: "pro_yearly_usd",
          name: "ScanMyScale Pro (Annual)",
          tier: "pro",
          currency: "USD",
          amount: 3999, // $39.99 yearly (17% discount)
          interval: "year",
          features: [
            "Everything in Premium",
            "AI insights & recommendations",
            "Social sharing features",
            "Custom progress images",
            "Advanced integrations",
            "24/7 priority support",
            "Save 17% vs monthly"
          ],
          isActive: true
        }
      ];

      return { success: true, data: plans };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to get plans",
        code: "PLANS_FETCH_FAILED"
      };
    }
  }

  async getPlan(planId: string): Promise<PaymentResult<PaymentPlan>> {
    try {
      const plansResult = await this.getPlans();
      if (!plansResult.success || !plansResult.data) {
        return { success: false, error: "Failed to load plans" };
      }

      const plan = plansResult.data.find(p => p.id === planId || p.providerPlanId === planId);
      if (!plan) {
        return { success: false, error: `Plan not found: ${planId}` };
      }

      return { success: true, data: plan };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to get plan"
      };
    }
  }

  verifyWebhook(payload: string, authorizationHeader: string, secret: string): boolean {
    try {
      if (!secret) {
        console.error('[RevenueCat] Missing webhook secret (authorization token)');
        return false;
      }

      if (!authorizationHeader) {
        console.error('[RevenueCat] Missing Authorization header');
        return false;
      }

      // RevenueCat uses simple Authorization header authentication
      // The secret is the expected authorization value configured in RevenueCat dashboard
      
      // Support both "Bearer <token>" and direct token formats
      let providedToken = authorizationHeader;
      if (authorizationHeader.startsWith('Bearer ')) {
        providedToken = authorizationHeader.slice(7);
      }
      
      // Use timing-safe comparison to prevent timing attacks
      const expectedBuffer = Buffer.from(secret, 'utf8');
      const providedBuffer = Buffer.from(providedToken, 'utf8');

      if (expectedBuffer.length !== providedBuffer.length) {
        console.error('[RevenueCat] Authorization token length mismatch');
        return false;
      }

      const isValid = timingSafeEqual(expectedBuffer, providedBuffer);
      
      if (!isValid) {
        console.error('[RevenueCat] Authorization token verification failed');
      }
      
      return isValid;
    } catch (error) {
      console.error('[RevenueCat] Webhook verification failed:', error);
      return false;
    }
  }

  async processWebhook(event: WebhookEvent): Promise<PaymentResult<WebhookProcessingResult>> {
    try {
      const { data: rcEvent } = event;
      
      if (!this.isWebhookEvent(rcEvent)) {
        return {
          success: false,
          error: "Invalid RevenueCat webhook event format",
          code: "INVALID_WEBHOOK_FORMAT"
        };
      }

      const { type, app_user_id, product_id, entitlements } = rcEvent.event;
      
      // Map RevenueCat event types to our internal types
      const eventTypeMap: Record<string, WebhookProcessingResult['type']> = {
        'INITIAL_PURCHASE': 'subscription_created',
        'RENEWAL': 'payment_succeeded',
        'CANCELLATION': 'subscription_canceled',
        'UNCANCELLATION': 'subscription_updated',
        'NON_RENEWING_PURCHASE': 'payment_succeeded',
        'RESUBSCRIPTION': 'subscription_created',
        'EXPIRATION': 'subscription_canceled',
        'BILLING_ISSUE': 'payment_failed',
        'SUBSCRIBER_ALIAS': 'customer_updated'
      };

      const mappedType = eventTypeMap[type];
      if (!mappedType) {
        return {
          success: false,
          error: `Unsupported RevenueCat event type: ${type}`,
          code: "UNSUPPORTED_EVENT_TYPE"
        };
      }

      // For subscription events, try to get the updated subscription data
      let subscription: PaymentSubscription | undefined;
      if (['subscription_created', 'subscription_updated', 'subscription_canceled'].includes(mappedType)) {
        const subResult = await this.getSubscription(app_user_id);
        if (subResult.success) {
          subscription = subResult.data;
        }
      }

      const result: WebhookProcessingResult = {
        type: mappedType,
        subscription,
        changes: {
          product_id,
          entitlements,
          original_event_type: type,
          timestamp: event.timestamp
        }
      };

      return { success: true, data: result };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to process webhook",
        code: "WEBHOOK_PROCESSING_FAILED"
      };
    }
  }

  async getCustomerPortalUrl?(customerId: string): Promise<PaymentResult<string>> {
    return {
      success: false,
      error: "Customer portal URLs not available in RevenueCat - users manage subscriptions through app store settings (iOS: Settings > Apple ID > Subscriptions, Android: Google Play Store > Account > Subscriptions)",
      code: "NOT_SUPPORTED_BY_PROVIDER"
    };
  }

  isWebhookEvent(payload: any): boolean {
    try {
      // RevenueCat webhook events have specific structure
      return (
        typeof payload === 'object' &&
        payload !== null &&
        typeof payload.event === 'object' &&
        typeof payload.event.type === 'string' &&
        typeof payload.event.app_user_id === 'string' &&
        typeof payload.event.product_id === 'string' &&
        Array.isArray(payload.event.entitlements)
      );
    } catch (error) {
      console.error('[RevenueCat] Error detecting webhook event:', error);
      return false;
    }
  }
}
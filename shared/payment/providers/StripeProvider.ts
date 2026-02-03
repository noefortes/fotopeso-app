import type { IPaymentProvider, PaymentProviderConfig, CreateCustomerData, CreateCheckoutData, WebhookProcessingResult } from "../IPaymentProvider";
import type { PaymentResult, PaymentCustomer, PaymentSubscription, PaymentPlan, CheckoutSessionData, WebhookEvent, PaymentCurrency } from "../types";
import Stripe from "stripe";

export class StripeProvider implements IPaymentProvider {
  readonly name = "stripe" as const;
  readonly supportedCurrencies = ["USD", "BRL"];
  readonly supportedCountries = ["US", "CA", "GB", "AU", "EU", "BR"];
  
  private stripe!: Stripe;
  private webhookSecret: string = "";
  private environment: "sandbox" | "production" = "sandbox";
  
  async initialize(config: PaymentProviderConfig): Promise<void> {
    if (!config.apiKey) {
      throw new Error('Stripe API key is required');
    }
    
    this.stripe = new Stripe(config.apiKey);
    
    this.webhookSecret = config.webhookSecret || "";
    this.environment = config.environment as "sandbox" | "production";
    
    console.log(`[Stripe] Provider initialized for ${this.environment} environment`);
  }

  async createCustomer(data: CreateCustomerData): Promise<PaymentResult<PaymentCustomer>> {
    try {
      const customer = await this.stripe.customers.create({
        email: data.email,
        name: data.name || undefined,
        metadata: {
          userId: data.userId,
          source: "ScanMyScale"
        }
      });

      const paymentCustomer: PaymentCustomer = {
        id: data.userId,
        providerId: customer.id,
        provider: "stripe",
        email: data.email,
        name: data.name || "",
        metadata: {
          stripeCustomerId: customer.id,
          createdAt: new Date().toISOString()
        }
      };

      return { success: true, data: paymentCustomer };
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
      // customerId could be our internal userId or Stripe customer ID
      let stripeCustomerId = customerId;
      
      // If it looks like our UUID format, try to find the Stripe customer
      if (customerId.includes('-')) {
        const customers = await this.stripe.customers.list({
          limit: 100
        });
        
        const found = customers.data.find(c => c.metadata.userId === customerId);
        if (!found) {
          return {
            success: false,
            error: `Customer not found: ${customerId}`,
            code: "CUSTOMER_NOT_FOUND"
          };
        }
        stripeCustomerId = found.id;
      }

      const customer = await this.stripe.customers.retrieve(stripeCustomerId, {
        expand: ['subscriptions']
      });

      if (customer.deleted) {
        return {
          success: false,
          error: `Customer deleted: ${customerId}`,
          code: "CUSTOMER_DELETED"
        };
      }

      const paymentCustomer: PaymentCustomer = {
        id: customer.metadata.userId || customerId,
        providerId: customer.id,
        provider: "stripe",
        email: customer.email || "",
        name: customer.name || "",
        metadata: {
          stripeCustomerId: customer.id
        }
      };

      return { success: true, data: paymentCustomer };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to get customer",
        code: "CUSTOMER_FETCH_FAILED"
      };
    }
  }

  async updateCustomer(customerId: string, data: Partial<CreateCustomerData>): Promise<PaymentResult<PaymentCustomer>> {
    try {
      const customer = await this.stripe.customers.update(customerId, {
        email: data.email,
        name: data.name || undefined
      });

      const paymentCustomer: PaymentCustomer = {
        id: customer.metadata.userId || customerId,
        providerId: customer.id,
        provider: "stripe",
        email: customer.email || "",
        name: customer.name || "",
        metadata: {
          stripeCustomerId: customer.id
        }
      };

      return { success: true, data: paymentCustomer };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to update customer",
        code: "CUSTOMER_UPDATE_FAILED"
      };
    }
  }

  async createCheckoutSession(data: CreateCheckoutData): Promise<PaymentResult<CheckoutSessionData>> {
    try {
      // Map locale to Stripe-supported locale codes
      const stripeLocale = this.mapToStripeLocale(data.locale);
      
      const session = await this.stripe.checkout.sessions.create({
        customer: data.customerId,
        mode: 'subscription',
        locale: stripeLocale,
        line_items: [
          {
            price: data.priceId,
            quantity: 1,
          },
        ],
        success_url: data.successUrl + '?session_id={CHECKOUT_SESSION_ID}',
        cancel_url: data.cancelUrl,
        metadata: {
          userId: data.userId,
          tier: data.tier || "starter"
        },
        subscription_data: {
          metadata: {
            userId: data.userId,
            tier: data.tier || "starter"
          }
        },
        allow_promotion_codes: true,
        billing_address_collection: 'auto',
      });

      return {
        success: true,
        data: {
          id: session.id,
          url: session.url || "",
          provider: "stripe"
        }
      };
    } catch (error) {
      // Handle specific case where customer exists in different mode (live vs test)
      if (error instanceof Error && error.message.includes('similar object exists in live mode')) {
        return {
          success: false,
          error: error.message,
          code: "CUSTOMER_MODE_MISMATCH"
        };
      }
      if (error instanceof Error && error.message.includes('similar object exists in test mode')) {
        return {
          success: false,
          error: error.message,
          code: "CUSTOMER_MODE_MISMATCH"
        };
      }
      
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to create checkout session",
        code: "CHECKOUT_SESSION_FAILED"
      };
    }
  }

  async getSubscription(subscriptionId: string): Promise<PaymentResult<PaymentSubscription>> {
    try {
      const subscription = await this.stripe.subscriptions.retrieve(subscriptionId, {
        expand: ['customer', 'items.data.price.product']
      });

      const customer = subscription.customer as Stripe.Customer;
      const priceItem = subscription.items.data[0];
      const price = priceItem.price;
      const product = price.product as Stripe.Product;

      // Map tier from product metadata or price lookup key
      const tier = product.metadata.tier || this.extractTierFromLookupKey(price.lookup_key || "") || "starter";

      const paymentSubscription: PaymentSubscription = {
        id: subscription.id,
        customerId: customer.metadata?.userId || customer.id,
        providerSubscriptionId: subscription.id,
        provider: "stripe",
        status: this.mapStripeStatus(subscription.status),
        planId: price.id,
        currency: price.currency.toUpperCase() as PaymentCurrency,
        amount: price.unit_amount || 0,
        interval: price.recurring?.interval === "year" ? "year" : "month",
        currentPeriodStart: new Date((subscription as any).current_period_start * 1000),
        currentPeriodEnd: new Date((subscription as any).current_period_end * 1000),
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
        trialEnd: subscription.trial_end ? new Date(subscription.trial_end * 1000) : undefined,
        metadata: {
          stripeSubscriptionId: subscription.id,
          stripeCustomerId: customer.id,
          tier,
          priceId: price.id,
          productId: typeof product === 'string' ? product : product.id
        }
      };

      return { success: true, data: paymentSubscription };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to get subscription",
        code: "SUBSCRIPTION_FETCH_FAILED"
      };
    }
  }

  private mapStripeStatus(status: Stripe.Subscription.Status): PaymentSubscription['status'] {
    switch (status) {
      case 'active':
        return 'active';
      case 'trialing':
        return 'trialing';
      case 'past_due':
        return 'past_due';
      case 'canceled':
      case 'canceled':
        return 'canceled';
      case 'incomplete':
      case 'incomplete_expired':
        return 'pending';
      case 'paused':
        return 'paused';
      case 'unpaid':
        return 'past_due';
      default:
        return 'pending';
    }
  }

  private extractTierFromLookupKey(lookupKey: string): string {
    if (lookupKey.includes('starter')) return 'starter';
    if (lookupKey.includes('premium')) return 'premium';
    if (lookupKey.includes('pro')) return 'pro';
    return 'starter';
  }

  private mapToStripeLocale(locale?: string): Stripe.Checkout.SessionCreateParams.Locale {
    // Map our app locales to Stripe-supported locales
    const localeMap: Record<string, Stripe.Checkout.SessionCreateParams.Locale> = {
      'pt-BR': 'pt-BR',
      'pt': 'pt-BR',
      'en': 'en',
      'en-US': 'en',
    };
    return localeMap[locale || 'en'] || 'auto';
  }

  async cancelSubscription(subscriptionId: string, immediate?: boolean): Promise<PaymentResult<PaymentSubscription>> {
    try {
      let subscription: Stripe.Subscription;
      
      if (immediate) {
        subscription = await this.stripe.subscriptions.cancel(subscriptionId);
      } else {
        subscription = await this.stripe.subscriptions.update(subscriptionId, {
          cancel_at_period_end: true
        });
      }

      const result = await this.getSubscription(subscriptionId);
      return result;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to cancel subscription",
        code: "SUBSCRIPTION_CANCEL_FAILED"
      };
    }
  }

  async resumeSubscription(subscriptionId: string): Promise<PaymentResult<PaymentSubscription>> {
    try {
      const subscription = await this.stripe.subscriptions.update(subscriptionId, {
        cancel_at_period_end: false
      });

      const result = await this.getSubscription(subscriptionId);
      return result;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to resume subscription",
        code: "SUBSCRIPTION_RESUME_FAILED"
      };
    }
  }

  async changeSubscriptionPlan(subscriptionId: string, newPriceId: string): Promise<PaymentResult<PaymentSubscription>> {
    try {
      const subscription = await this.stripe.subscriptions.retrieve(subscriptionId);
      
      await this.stripe.subscriptions.update(subscriptionId, {
        items: [
          {
            id: subscription.items.data[0].id,
            price: newPriceId,
          },
        ],
        proration_behavior: 'create_prorations',
      });

      const result = await this.getSubscription(subscriptionId);
      return result;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to change subscription plan",
        code: "SUBSCRIPTION_CHANGE_FAILED"
      };
    }
  }

  async getPlans(): Promise<PaymentResult<PaymentPlan[]>> {
    try {
      const starterFeatures = [
        "Unlimited weight scans",
        "30-day history",
        "Basic progress charts",
        "Email support"
      ];
      const premiumFeatures = [
        "Everything in Starter",
        "Unlimited history",
        "Advanced analytics",
        "Goal tracking & trends",
        "Data export (CSV/PDF)",
        "Priority support"
      ];
      const proFeatures = [
        "Everything in Premium",
        "AI insights & recommendations",
        "Social sharing features",
        "Custom progress images",
        "Advanced integrations",
        "24/7 priority support"
      ];

      // Define plan configurations with their environment variable keys
      const planConfigs = [
        // USD Plans
        { envKey: 'STRIPE_PRICE_STARTER', tier: 'starter', currency: 'USD' as const, interval: 'month' as const, name: 'ScanMyScale Starter', features: starterFeatures },
        { envKey: 'STRIPE_PRICE_STARTER_SEMESTR', tier: 'starter', currency: 'USD' as const, interval: 'semiannual' as const, name: 'ScanMyScale Starter', features: starterFeatures },
        { envKey: 'STRIPE_PRICE_STARTER_ANUAL', tier: 'starter', currency: 'USD' as const, interval: 'year' as const, name: 'ScanMyScale Starter', features: starterFeatures },
        { envKey: 'STRIPE_PRICE_PREMIUM', tier: 'premium', currency: 'USD' as const, interval: 'month' as const, name: 'ScanMyScale Premium', features: premiumFeatures },
        { envKey: 'STRIPE_PRICE_PREMIUM_SEMESTR', tier: 'premium', currency: 'USD' as const, interval: 'semiannual' as const, name: 'ScanMyScale Premium', features: premiumFeatures },
        { envKey: 'STRIPE_PRICE_PREMIUM_ANUAL', tier: 'premium', currency: 'USD' as const, interval: 'year' as const, name: 'ScanMyScale Premium', features: premiumFeatures },
        { envKey: 'STRIPE_PRICE_PRO', tier: 'pro', currency: 'USD' as const, interval: 'month' as const, name: 'ScanMyScale Pro', features: proFeatures },
        { envKey: 'STRIPE_PRICE_PRO_SEMESTR', tier: 'pro', currency: 'USD' as const, interval: 'semiannual' as const, name: 'ScanMyScale Pro', features: proFeatures },
        { envKey: 'STRIPE_PRICE_PRO_ANUAL', tier: 'pro', currency: 'USD' as const, interval: 'year' as const, name: 'ScanMyScale Pro', features: proFeatures },
        // BRL Plans
        { envKey: 'STRIPE_PRICE_STARTER_BRL', tier: 'starter', currency: 'BRL' as const, interval: 'month' as const, name: 'FotoPeso Básico', features: starterFeatures },
        { envKey: 'STRIPE_PRICE_STARTER_BRL_SEMESTR', tier: 'starter', currency: 'BRL' as const, interval: 'semiannual' as const, name: 'FotoPeso Básico', features: starterFeatures },
        { envKey: 'STRIPE_PRICE_STARTER_BRL_ANUAL', tier: 'starter', currency: 'BRL' as const, interval: 'year' as const, name: 'FotoPeso Básico', features: starterFeatures },
        { envKey: 'STRIPE_PRICE_PREMIUM_BRL', tier: 'premium', currency: 'BRL' as const, interval: 'month' as const, name: 'FotoPeso Premium', features: premiumFeatures },
        { envKey: 'STRIPE_PRICE_PREMIUM_BRL_SEMESTR', tier: 'premium', currency: 'BRL' as const, interval: 'semiannual' as const, name: 'FotoPeso Premium', features: premiumFeatures },
        { envKey: 'STRIPE_PRICE_PREMIUM_BRL_ANUAL', tier: 'premium', currency: 'BRL' as const, interval: 'year' as const, name: 'FotoPeso Premium', features: premiumFeatures },
        { envKey: 'STRIPE_PRICE_PRO_BRL', tier: 'pro', currency: 'BRL' as const, interval: 'month' as const, name: 'FotoPeso Pro', features: proFeatures },
        { envKey: 'STRIPE_PRICE_PRO_BRL_SEMESTR', tier: 'pro', currency: 'BRL' as const, interval: 'semiannual' as const, name: 'FotoPeso Pro', features: proFeatures },
        { envKey: 'STRIPE_PRICE_PRO_BRL_ANUAL', tier: 'pro', currency: 'BRL' as const, interval: 'year' as const, name: 'FotoPeso Pro', features: proFeatures },
      ];

      // Fetch prices from Stripe API in parallel
      const pricePromises = planConfigs.map(async (config) => {
        const priceId = process.env[config.envKey];
        console.log(`[Stripe] ${config.envKey} = ${priceId ? priceId.substring(0, 20) + '...' : 'NOT SET'}`);
        if (!priceId) {
          console.log(`[Stripe] Missing price ID for ${config.envKey}`);
          return null;
        }

        try {
          const price = await this.stripe.prices.retrieve(priceId, {
            expand: ['product']
          });
          
          const product = price.product as Stripe.Product;
          
          // Use actual currency from Stripe, not config (validates correct price ID)
          const actualCurrency = price.currency.toUpperCase() as PaymentCurrency;
          
          console.log(`[Stripe] ${config.envKey}: fetched price ${priceId}, currency=${actualCurrency}, amount=${price.unit_amount}, product=${product.name}`);
          
          // Log if there's a currency mismatch (wrong price ID configured)
          if (actualCurrency !== config.currency) {
            console.warn(`[Stripe] ⚠️ CURRENCY MISMATCH for ${config.envKey}: expected ${config.currency}, got ${actualCurrency}. Check your Stripe price ID configuration.`);
          }
          
          return {
            id: `${config.tier}_${config.interval}_${actualCurrency.toLowerCase()}`,
            provider: "stripe" as const,
            providerPlanId: priceId,
            name: product.name || config.name,
            tier: config.tier,
            currency: actualCurrency,
            amount: price.unit_amount || 0,
            interval: config.interval,
            features: config.features,
            isActive: price.active && product.active
          } as PaymentPlan;
        } catch (error) {
          console.error(`[Stripe] Failed to fetch price ${priceId}:`, error);
          return null;
        }
      });

      const results = await Promise.all(pricePromises);
      const plans = results.filter((plan): plan is PaymentPlan => plan !== null && plan.isActive);

      console.log(`[Stripe] Fetched ${plans.length} active plans from Stripe`);
      
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
        return { success: false, error: "Failed to load plans", code: "PLANS_FETCH_FAILED" };
      }

      const plan = plansResult.data.find(p => p.id === planId || p.providerPlanId === planId);
      if (!plan) {
        return { success: false, error: `Plan not found: ${planId}`, code: "PLAN_NOT_FOUND" };
      }

      return { success: true, data: plan };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to get plan",
        code: "PLAN_FETCH_FAILED"
      };
    }
  }

  verifyWebhook(payload: string | Buffer, signature: string, secret: string): boolean {
    try {
      // Stripe.constructEvent works with both Buffer and string
      this.stripe.webhooks.constructEvent(payload, signature, secret);
      return true;
    } catch (err) {
      console.error('[Stripe] Webhook verification failed:', err);
      return false;
    }
  }

  isWebhookEvent(payload: any): boolean {
    return !!(payload && payload.type && payload.data);
  }

  async processWebhook(event: WebhookEvent): Promise<PaymentResult<WebhookProcessingResult>> {
    try {
      console.log(`[Stripe] Processing webhook: ${event.type} (${event.id})`);

      // Map Stripe events to our webhook processing result types
      let resultType: WebhookProcessingResult['type'];
      switch (event.type) {
        case 'checkout.session.completed':
        case 'customer.subscription.created':
          resultType = 'subscription_created';
          break;
        case 'customer.subscription.updated':
          resultType = 'subscription_updated';
          break;
        case 'customer.subscription.deleted':
          resultType = 'subscription_canceled';
          break;
        case 'invoice.payment_succeeded':
          resultType = 'payment_succeeded';
          break;
        case 'invoice.payment_failed':
          resultType = 'payment_failed';
          break;
        case 'customer.updated':
          resultType = 'customer_updated';
          break;
        default:
          resultType = 'subscription_updated';
      }

      const result: WebhookProcessingResult = {
        type: resultType,
        changes: {
          eventId: event.id,
          eventType: event.type,
          timestamp: event.timestamp
        }
      };

      return { success: true, data: result };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Webhook processing failed",
        code: "WEBHOOK_PROCESSING_FAILED"
      };
    }
  }

  async createBillingPortalSession(customerId: string, returnUrl: string): Promise<PaymentResult<{ url: string }>> {
    try {
      const session = await this.stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: returnUrl,
      });

      return {
        success: true,
        data: { url: session.url }
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to create billing portal session",
        code: "BILLING_PORTAL_FAILED"
      };
    }
  }

  /**
   * Create a Pix checkout session for one-time payments (Brazil only)
   * Pix doesn't support recurring subscriptions, so this creates a one-time payment
   * that grants access for a specific period (month, semiannual, year)
   */
  async createPixCheckout(data: {
    customerId: string;
    userId: string;
    amount: number; // Amount in cents (BRL)
    tier: string; // "starter", "premium", "pro"
    interval: string; // "month", "semiannual", "year"
    successUrl: string;
    cancelUrl: string;
    locale?: string;
  }): Promise<PaymentResult<{
    id: string;
    url: string;
    paymentIntentId: string;
    expiresAt: Date;
  }>> {
    try {
      // Map locale to Stripe-supported locale codes
      const stripeLocale = this.mapToStripeLocale(data.locale);
      
      // Calculate access expiration based on interval
      const now = new Date();
      let accessExpiresAt: Date;
      switch (data.interval) {
        case 'year':
          accessExpiresAt = new Date(now.getFullYear() + 1, now.getMonth(), now.getDate());
          break;
        case 'semiannual':
          accessExpiresAt = new Date(now.getFullYear(), now.getMonth() + 6, now.getDate());
          break;
        case 'month':
        default:
          accessExpiresAt = new Date(now.getFullYear(), now.getMonth() + 1, now.getDate());
          break;
      }

      // Create a Checkout Session with Pix payment method for one-time payment
      const session = await this.stripe.checkout.sessions.create({
        customer: data.customerId,
        mode: 'payment', // One-time payment (not subscription)
        locale: stripeLocale,
        payment_method_types: ['pix'],
        line_items: [
          {
            price_data: {
              currency: 'brl',
              product_data: {
                name: `FotoPeso ${data.tier.charAt(0).toUpperCase() + data.tier.slice(1)}`,
                description: this.getIntervalDescription(data.interval),
              },
              unit_amount: data.amount,
            },
            quantity: 1,
          },
        ],
        success_url: data.successUrl + '?session_id={CHECKOUT_SESSION_ID}&pix=true',
        cancel_url: data.cancelUrl,
        metadata: {
          userId: data.userId,
          tier: data.tier,
          interval: data.interval,
          paymentMethod: 'pix',
          accessExpiresAt: accessExpiresAt.toISOString(),
        },
        payment_intent_data: {
          metadata: {
            userId: data.userId,
            tier: data.tier,
            interval: data.interval,
            paymentMethod: 'pix',
            accessExpiresAt: accessExpiresAt.toISOString(),
          },
        },
        // Pix payment expires after 24 hours by default
        expires_at: Math.floor(Date.now() / 1000) + (24 * 60 * 60),
      });

      // Extract payment intent ID from the session
      const paymentIntentId = typeof session.payment_intent === 'string' 
        ? session.payment_intent 
        : session.payment_intent?.id || '';

      return {
        success: true,
        data: {
          id: session.id,
          url: session.url || '',
          paymentIntentId,
          expiresAt: accessExpiresAt,
        }
      };
    } catch (error) {
      console.error('[Stripe] Failed to create Pix checkout:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to create Pix checkout session",
        code: "PIX_CHECKOUT_FAILED"
      };
    }
  }

  private getIntervalDescription(interval: string): string {
    switch (interval) {
      case 'year':
        return 'Acesso por 12 meses';
      case 'semiannual':
        return 'Acesso por 6 meses';
      case 'month':
      default:
        return 'Acesso por 1 mês';
    }
  }

  /**
   * Verify a Pix payment session and return the payment details
   */
  async verifyPixPayment(sessionId: string): Promise<PaymentResult<{
    status: string;
    paymentIntentId: string;
    tier: string;
    interval: string;
    accessExpiresAt: Date;
    userId: string;
    amount: number;
  }>> {
    try {
      const session = await this.stripe.checkout.sessions.retrieve(sessionId, {
        expand: ['payment_intent']
      });

      if (session.payment_status !== 'paid') {
        return {
          success: false,
          error: `Payment not completed. Status: ${session.payment_status}`,
          code: "PAYMENT_NOT_COMPLETED"
        };
      }

      const metadata = session.metadata || {};
      const paymentIntent = session.payment_intent as Stripe.PaymentIntent;

      return {
        success: true,
        data: {
          status: session.payment_status,
          paymentIntentId: paymentIntent?.id || '',
          tier: metadata.tier || 'starter',
          interval: metadata.interval || 'month',
          accessExpiresAt: new Date(metadata.accessExpiresAt || Date.now()),
          userId: metadata.userId || '',
          amount: session.amount_total || 0,
        }
      };
    } catch (error) {
      console.error('[Stripe] Failed to verify Pix payment:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to verify Pix payment",
        code: "PIX_VERIFICATION_FAILED"
      };
    }
  }
}
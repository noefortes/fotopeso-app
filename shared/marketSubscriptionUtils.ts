import type { User } from "./schema";
import type { PaymentProvider } from "./payment/types";
import type { MarketConfig } from "./config/markets";
import { paymentProviderManager } from "./payment/PaymentProviderManager";
import { getUserPaymentProvider, getUserProviderCustomerId, getUserProviderSubscriptionId } from "./subscriptionUtils";

/**
 * Market-aware subscription utilities that work with multi-provider architecture
 */

/**
 * Get the appropriate payment provider for a user's market
 */
export async function getProviderForUser(user: User, market: MarketConfig): Promise<PaymentProvider | null> {
  // First check if user already has a provider set
  const userProvider = getUserPaymentProvider(user);
  if (userProvider) {
    return userProvider;
  }
  
  // Otherwise, use the market's default provider
  return market.paymentProvider;
}

/**
 * Get subscription management provider instance for a user's market
 * Respects user's existing provider before falling back to market default
 */
export async function getSubscriptionProvider(user: User, market: MarketConfig) {
  // Get the appropriate provider for this user (respects existing provider)
  const providerType = await getProviderForUser(user, market);
  
  
  if (!providerType) {
    throw new Error("No payment provider available for user");
  }
  
  // Create a temporary market config with the user's provider
  const userMarket = { ...market, paymentProvider: providerType };
  const result = paymentProviderManager.getProviderForMarket(userMarket);
  
  if (!result.success) {
    throw new Error(`Payment provider not available: ${result.error}`);
  }
  return result.data;
}

/**
 * Create a checkout session for a user in their market
 */
export async function createMarketCheckoutSession(
  user: User, 
  market: MarketConfig, 
  planId: string,
  successUrl: string,
  cancelUrl: string
) {
  const provider = await getSubscriptionProvider(user, market);
  if (!provider) {
    throw new Error("Failed to get payment provider for user");
  }
  
  // Get or create customer ID
  let customerId = getUserProviderCustomerId(user);
  if (!customerId) {
    const customerResult = await provider.createCustomer({
      email: user.email!,
      name: `${user.firstName || ''} ${user.lastName || ''}`.trim() || undefined,
      userId: user.id,
      metadata: {
        market: market.id,
        locale: user.locale || market.locale
      }
    });
    
    if (!customerResult.success) {
      throw new Error(`Failed to create customer: ${customerResult.error}`);
    }
    
    customerId = customerResult.data!.providerId;
    
    // Persist the customer data to the database
    const { storage } = await import('../server/storage');
    const providerType = await getProviderForUser(user, market);
    await storage.updateUserProviderInfo(user.id, providerType as string, customerId, null);
  }
  
  // Create checkout session
  const sessionResult = await provider.createCheckoutSession({
    customerId,
    planId,
    successUrl,
    cancelUrl,
    metadata: {
      userId: user.id,
      market: market.id
    }
  });
  
  if (!sessionResult.success) {
    throw new Error(`Failed to create checkout session: ${sessionResult.error}`);
  }
  
  return sessionResult.data!;
}

/**
 * Get subscription details for a user using their provider
 */
export async function getUserSubscriptionDetails(user: User, market: MarketConfig) {
  const subscriptionId = getUserProviderSubscriptionId(user);
  if (!subscriptionId) {
    return null;
  }
  
  const provider = await getSubscriptionProvider(user, market);
  const result = await provider!.getSubscription(subscriptionId);
  
  if (!result.success) {
    return null;
  }
  
  return result.data!;
}

/**
 * Cancel a user's subscription using their provider
 */
export async function cancelUserSubscription(user: User, market: MarketConfig, immediate: boolean = false) {
  const subscriptionId = getUserProviderSubscriptionId(user);
  if (!subscriptionId) {
    throw new Error("No active subscription found");
  }
  
  const provider = await getSubscriptionProvider(user, market);
  const result = await provider!.cancelSubscription(subscriptionId, immediate);
  
  if (!result.success) {
    throw new Error(`Failed to cancel subscription: ${result.error}`);
  }
  
  return result.data!;
}

/**
 * Get available plans for a market
 */
export async function getMarketPlans(market: MarketConfig) {
  const result = paymentProviderManager.getProviderForMarket(market);
  if (!result.success) {
    throw new Error(`Payment provider not available: ${result.error}`);
  }
  
  if (!result.data) {
    throw new Error("Payment provider data is missing");
  }
  
  const plansResult = await result.data.getPlans();
  if (!plansResult.success) {
    throw new Error(`Failed to get plans: ${plansResult.error}`);
  }
  
  return plansResult.data!;
}
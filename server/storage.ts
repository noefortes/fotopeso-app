import {
  users,
  weightEntries,
  activityLog,
  adminSettings,
  emailVerificationCodes,
  passwordResetTokens,
  whatsappInteractions,
  type User,
  type UpsertUser,
  type WeightEntry,
  type InsertWeightEntry,
  type ActivityLog,
  type InsertActivityLog,
  type AdminSettings,
  type InsertAdminSettings,
  type EmailVerificationCode,
  type InsertEmailVerificationCode,
  type PasswordResetToken,
  type InsertPasswordResetToken,
  type WhatsappInteraction,
  type InsertWhatsappInteraction,
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, gte, sql } from "drizzle-orm";
import { cacheService } from "./cache-service";

// Interface for storage operations
export interface IStorage {
  // User operations
  // (IMPORTANT) these user operations are mandatory for Replit Auth.
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserByFacebookId(facebookId: string): Promise<User | undefined>;
  getUserByTwitterId(twitterId: string): Promise<User | undefined>;
  linkFacebookId(userId: string, facebookId: string): Promise<User>;
  updateUserEmailVerified(userId: string, email: string, verified: boolean): Promise<User>;
  upsertUser(user: UpsertUser): Promise<User>;
  createUser(user: any): Promise<User>;
  
  // Weight entry operations
  createWeightEntry(entry: InsertWeightEntry): Promise<WeightEntry>;
  getUserWeightEntries(userId: string, limit?: number): Promise<WeightEntry[]>;
  getWeightEntriesInRange(userId: string, startDate: Date, endDate: Date): Promise<WeightEntry[]>;
  getLatestWeightEntry(userId: string): Promise<WeightEntry | undefined>;
  canRecordWeight(userId: string): Promise<boolean>;
  deleteWeightEntry(userId: string, entryId: string): Promise<void>;
  
  // Activity log operations
  createActivityLog(activity: InsertActivityLog): Promise<ActivityLog>;
  getUserActivityLog(userId: string, limit?: number): Promise<ActivityLog[]>;

  // Language preference operations
  updateUserLocale(userId: string, locale: string): Promise<User>;
  
  // Admin operations
  getUserCount(): Promise<number>;
  getUserCountByTier(tier: 'free' | 'starter' | 'premium' | 'pro' | 'admin'): Promise<number>;
  getActiveUsersToday(): Promise<number>;
  getTotalWeightEntries(): Promise<number>;
  getAllUsersWithStats(): Promise<any[]>;
  updateUserSubscription(userId: string, updates: any): Promise<any>;
  updateUserByAdmin(userId: string, updates: any): Promise<User>;
  deleteUserCompletely(userId: string): Promise<void>;
  

  // Provider-agnostic subscription operations
  updateUserPaymentProvider(userId: string, subscriptionData: {
    subscriptionTier?: string;
    paymentProvider?: string;
    providerCustomerId?: string;
    providerSubscriptionId?: string;
    providerMetadata?: any;
    subscriptionStatus?: string;
    subscriptionEndsAt?: Date;
    trialEndsAt?: Date;
  }): Promise<User>;

  updateUserProviderInfo(userId: string, paymentProvider: string, customerId: string, subscriptionId: string | null, metadata?: any): Promise<User>;
  
  // Statistics
  getUserWeightStats(userId: string): Promise<{
    totalLost: number;
    avgPerWeek: number;
    totalRecordings: number;
    progressPercentage: number;
  }>;

  // Admin settings operations
  getAdminSetting(key: string): Promise<string | null>;
  setAdminSetting(key: string, value: string): Promise<void>;
  
  // Push notification operations
  getUsersWithDailyReminders(): Promise<User[]>;
  hasUserRecordedToday(userId: string): Promise<boolean>;
  
  // Email verification operations
  createVerificationCode(userId: string, email: string, code: string, expiresAt: Date): Promise<EmailVerificationCode>;
  getVerificationCode(userId: string, code: string): Promise<EmailVerificationCode | undefined>;
  markVerificationCodeUsed(codeId: string): Promise<void>;
  deleteExpiredCodes(): Promise<void>;
  
  // Password reset operations
  createPasswordResetToken(userId: string, token: string, expiresAt: Date): Promise<PasswordResetToken>;
  getPasswordResetToken(token: string): Promise<PasswordResetToken | undefined>;
  deletePasswordResetToken(token: string): Promise<void>;
  updateUserPassword(userId: string, hashedPassword: string): Promise<User>;
  
  // Payment webhook operations
  getUserByProviderCustomerId(customerId: string): Promise<User | undefined>;
  updateUserSubscription(userId: string, subscriptionData: {
    paymentProvider: string;
    providerCustomerId: string;
    providerSubscriptionId: string;
    subscriptionStatus: any;
    subscriptionTier: any;
    subscriptionCurrentPeriodEnd: Date | null;
    subscriptionEndsAt: Date | null;
  }): Promise<User>;
  
  // WhatsApp operations
  getUserByWhatsAppPhone(phoneNumber: string): Promise<User | undefined>;
  createWhatsAppInteraction(interaction: InsertWhatsappInteraction): Promise<WhatsappInteraction>;
}

export class DatabaseStorage implements IStorage {
  // User operations
  // (IMPORTANT) these user operations are mandatory for Replit Auth.

  async getUser(id: string): Promise<User | undefined> {
    // 🚀 Try cache first (1 hour TTL)
    const cached = await cacheService.getUserProfile(id);
    if (cached) {
      return cached;
    }

    // Cache miss - fetch from database
    const [user] = await db.select().from(users).where(eq(users.id, id));
    
    // Cache the result for future requests
    if (user) {
      await cacheService.setUserProfile(user);
    }
    
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    // 🚀 Try cache first (1 hour TTL)
    const cached = await cacheService.getUserByEmail(email);
    if (cached) {
      return cached;
    }

    // Cache miss - fetch from database
    const [user] = await db.select().from(users).where(eq(users.email, email));
    
    // Cache the result for future requests
    if (user) {
      await cacheService.setUserByEmail(email, user);
      await cacheService.setUserProfile(user); // Also cache by ID
    }
    
    return user;
  }

  async getUserByFacebookId(facebookId: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.facebookId, facebookId));
    return user;
  }

  async getUserByTwitterId(twitterId: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.twitterId, twitterId));
    return user;
  }

  async linkFacebookId(userId: string, facebookId: string): Promise<User> {
    const [user] = await db
      .update(users)
      .set({ 
        facebookId,
        updatedAt: new Date() 
      })
      .where(eq(users.id, userId))
      .returning();
    
    // 🗑️ Invalidate user cache after update
    await cacheService.invalidateUserProfile(userId);
    
    return user;
  }

  async updateUserEmailVerified(userId: string, email: string, verified: boolean): Promise<User> {
    const [user] = await db
      .update(users)
      .set({ 
        email,
        emailVerified: verified,
        updatedAt: new Date() 
      })
      .where(eq(users.id, userId))
      .returning();
    
    // 🗑️ Invalidate user cache after email update
    await cacheService.invalidateUserProfile(userId);
    
    return user;
  }

  async createUser(userData: any): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(userData)
      .returning();
    
    // 🚀 Cache new user profile immediately
    await cacheService.setUserProfile(user);
    if (user.email) {
      await cacheService.setUserByEmail(user.email, user);
    }
    
    // Invalidate admin stats (new user affects totals)
    await cacheService.invalidateAdminStats();
    
    return user;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(userData)
      .onConflictDoUpdate({
        target: users.id,
        set: {
          ...userData,
          updatedAt: new Date(),
        },
      })
      .returning();
    
    // 🚀 Update cache with latest user data
    await cacheService.setUserProfile(user);
    if (user.email) {
      await cacheService.setUserByEmail(user.email, user);
    }
    
    return user;
  }
  
  async getUserByProviderCustomerId(customerId: string): Promise<User | undefined> {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.providerCustomerId, customerId));
    return user;
  }
  
  // Overload signatures for updateUserSubscription
  async updateUserSubscription(userId: string, subscriptionData: {
    paymentProvider: string;
    providerCustomerId: string;
    providerSubscriptionId: string;
    subscriptionStatus: any;
    subscriptionTier: any;
    subscriptionCurrentPeriodEnd: Date | null;
    subscriptionEndsAt: Date | null;
  }): Promise<User>;
  async updateUserSubscription(userId: string, subscriptionData: {
    subscriptionTier: string;
    subscriptionStatus: string;
    subscriptionEndsAt: Date;
    paymentProvider?: string;
    providerSubscriptionId?: string;
  }): Promise<User>;
  async updateUserSubscription(userId: string, subscriptionData: any): Promise<User> {
    // Unified implementation that handles both parameter shapes
    const updateData: any = {
      updatedAt: new Date(),
    };
    
    // Map all possible fields from either shape
    if (subscriptionData.subscriptionTier) updateData.subscriptionTier = subscriptionData.subscriptionTier;
    if (subscriptionData.subscriptionStatus) updateData.subscriptionStatus = subscriptionData.subscriptionStatus;
    if (subscriptionData.subscriptionEndsAt) updateData.subscriptionEndsAt = subscriptionData.subscriptionEndsAt;
    if (subscriptionData.paymentProvider) updateData.paymentProvider = subscriptionData.paymentProvider;
    if (subscriptionData.providerCustomerId) updateData.providerCustomerId = subscriptionData.providerCustomerId;
    if (subscriptionData.providerSubscriptionId) updateData.providerSubscriptionId = subscriptionData.providerSubscriptionId;
    if (subscriptionData.subscriptionCurrentPeriodEnd) updateData.subscriptionCurrentPeriodEnd = subscriptionData.subscriptionCurrentPeriodEnd;
    
    const [user] = await db
      .update(users)
      .set(updateData)
      .where(eq(users.id, userId))
      .returning();
    
    // Always invalidate user cache after subscription update
    await cacheService.invalidateUserProfile(userId);
    
    return user;
  }

  // Weight entry operations
  async createWeightEntry(entry: InsertWeightEntry): Promise<WeightEntry> {
    const [weightEntry] = await db
      .insert(weightEntries)
      .values(entry)
      .returning();
    
    // 🗑️ Invalidate weight-related caches after new entry
    await cacheService.invalidateWeightData(entry.userId);
    
    return weightEntry;
  }

  async getUserWeightEntries(userId: string, limit = 50): Promise<WeightEntry[]> {
    // 🚀 Try cache first (5 minute TTL)
    const cached = await cacheService.getWeightEntries(userId, limit);
    if (cached) {
      return cached;
    }

    // Cache miss - fetch from database
    const entries = await db
      .select()
      .from(weightEntries)
      .where(eq(weightEntries.userId, userId))
      .orderBy(desc(weightEntries.createdAt))
      .limit(limit);
    
    // Cache the result for future requests
    await cacheService.setWeightEntries(userId, entries, limit);
    
    return entries;
  }

  async getWeightEntriesInRange(userId: string, startDate: Date, endDate: Date): Promise<WeightEntry[]> {
    return await db
      .select()
      .from(weightEntries)
      .where(
        and(
          eq(weightEntries.userId, userId),
          gte(weightEntries.createdAt, startDate),
          sql`${weightEntries.createdAt} <= ${endDate}`
        )
      )
      .orderBy(weightEntries.createdAt);
  }

  async getLatestWeightEntry(userId: string): Promise<WeightEntry | undefined> {
    // 🚀 Try cache first (5 minute TTL)
    const cached = await cacheService.getLatestWeightEntry(userId);
    if (cached) {
      return cached;
    }

    // Cache miss - fetch from database
    const [entry] = await db
      .select()
      .from(weightEntries)
      .where(eq(weightEntries.userId, userId))
      .orderBy(desc(weightEntries.createdAt))
      .limit(1);
    
    // Cache the result for future requests
    if (entry) {
      await cacheService.setLatestWeightEntry(userId, entry);
    }
    
    return entry;
  }

  async canRecordWeight(userId: string): Promise<boolean> {
    // 🚀 Try cache first (5 minute TTL) 
    const cached = await cacheService.getCanRecordWeight(userId);
    if (cached !== null) {
      return cached;
    }

    const user = await this.getUser(userId);
    if (!user) {
      // Cache negative result briefly
      await cacheService.setCanRecordWeight(userId, false);
      return false;
    }
    
    // Get the latest weight entry to check timing
    const latestEntry = await this.getLatestWeightEntry(userId);
    const lastRecordingDate = latestEntry?.createdAt;
    
    // Use the proper subscription logic from shared utils
    const { getUserTier } = await import('@shared/subscriptionUtils');
    const tier = getUserTier(user);
    
    if (tier.recordingFrequency === "unlimited") {
      await cacheService.setCanRecordWeight(userId, true);
      return true;
    }
    
    if (!lastRecordingDate) {
      await cacheService.setCanRecordWeight(userId, true);
      return true; // First recording is always allowed
    }
    
    const now = new Date();
    const lastRecording = new Date(lastRecordingDate);
    
    let canRecord = false;
    
    if (tier.recordingFrequency === "daily") {
      // Allow one recording per day (starter, premium, pro users)
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const lastRecordingDay = new Date(lastRecording.getFullYear(), lastRecording.getMonth(), lastRecording.getDate());
      canRecord = today.getTime() > lastRecordingDay.getTime();
    } else if (tier.recordingFrequency === "weekly") {
      // Allow one recording per week (free users)
      const daysDifference = (now.getTime() - lastRecording.getTime()) / (1000 * 60 * 60 * 24);
      canRecord = daysDifference >= 7;
    }
    
    // Cache the result
    await cacheService.setCanRecordWeight(userId, canRecord);
    
    return canRecord;
  }

  // Activity log operations
  async createActivityLog(activity: InsertActivityLog): Promise<ActivityLog> {
    const [log] = await db
      .insert(activityLog)
      .values(activity)
      .returning();
    return log;
  }

  async getUserActivityLog(userId: string, limit = 20): Promise<ActivityLog[]> {
    return await db
      .select()
      .from(activityLog)
      .where(eq(activityLog.userId, userId))
      .orderBy(desc(activityLog.createdAt))
      .limit(limit);
  }

  // Statistics
  async getUserWeightStats(userId: string): Promise<{
    totalLost: number;
    avgPerWeek: number;
    totalRecordings: number;
    progressPercentage: number;
  }> {
    // 🚀 Try cache first (10 minute TTL for expensive calculations)
    const cached = await cacheService.getUserStats(userId);
    if (cached) {
      return cached;
    }

    // Cache miss - perform expensive calculations
    const entries = await this.getUserWeightEntries(userId);
    const user = await this.getUser(userId);
    
    if (entries.length === 0) {
      const emptyStats = {
        totalLost: 0,
        avgPerWeek: 0,
        totalRecordings: 0,
        progressPercentage: 0,
      };
      // Cache empty result briefly to avoid repeated calculations
      await cacheService.setUserStats(userId, emptyStats);
      return emptyStats;
    }

    const currentWeight = parseFloat(entries[0].weight);
    const startWeight = parseFloat(entries[entries.length - 1].weight);
    const totalLost = startWeight - currentWeight;
    
    // Calculate weeks since first entry
    const firstEntry = entries[entries.length - 1];
    const weeksSinceFirst = Math.max(1, 
      (Date.now() - new Date(firstEntry.createdAt!).getTime()) / (1000 * 60 * 60 * 24 * 7)
    );
    
    const avgPerWeek = totalLost / weeksSinceFirst;
    
    // Calculate progress percentage to goal
    let progressPercentage = 0;
    if (user?.goalWeight) {
      const goalWeight = parseFloat(user.goalWeight);
      const totalGoal = startWeight - goalWeight;
      if (totalGoal > 0) {
        progressPercentage = Math.min(100, (totalLost / totalGoal) * 100);
      }
    }

    const stats = {
      totalLost: Math.max(0, totalLost),
      avgPerWeek,
      totalRecordings: entries.length,
      progressPercentage: Math.max(0, progressPercentage),
    };

    // Cache the expensive calculation result
    await cacheService.setUserStats(userId, stats);

    return stats;
  }

  // Admin operations
  async getUserCount(): Promise<number> {
    // 🚀 Try cache first (30 minute TTL for admin stats)
    const cached = await cacheService.getAdminTotalUsers();
    if (cached !== null) {
      return cached;
    }

    // Cache miss - fetch from database
    const result = await db.select({ count: sql<number>`count(*)` }).from(users);
    const count = result[0].count;
    
    // Cache the result
    await cacheService.setAdminTotalUsers(count);
    
    return count;
  }

  async getUserCountByTier(tier: 'free' | 'starter' | 'premium' | 'pro' | 'admin'): Promise<number> {
    // 🚀 Try cache first (30 minute TTL for admin stats)
    const cached = await cacheService.getAdminUsersByTier(tier);
    if (cached !== null) {
      return cached;
    }

    // Cache miss - fetch from database
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(users)
      .where(eq(users.subscriptionTier, tier));
    const count = result[0].count;
    
    // Cache the result
    await cacheService.setAdminUsersByTier(tier, count);
    
    return count;
  }

  async getActiveUsersToday(): Promise<number> {
    // 🚀 Try cache first (30 minute TTL for expensive JOIN query)
    const cached = await cacheService.getAdminActiveToday();
    if (cached !== null) {
      return cached;
    }

    // Cache miss - perform expensive JOIN query
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const result = await db
      .select({ count: sql<number>`count(distinct ${users.id})` })
      .from(users)
      .innerJoin(weightEntries, eq(users.id, weightEntries.userId))
      .where(gte(weightEntries.createdAt, today));
    
    const count = result[0].count;
    
    // Cache the expensive result
    await cacheService.setAdminActiveToday(count);
    
    return count;
  }

  async getTotalWeightEntries(): Promise<number> {
    // 🚀 Try cache first (30 minute TTL for admin stats)
    const cached = await cacheService.getAdminTotalEntries();
    if (cached !== null) {
      return cached;
    }

    // Cache miss - fetch from database
    const result = await db.select({ count: sql<number>`count(*)` }).from(weightEntries);
    const count = result[0].count;
    
    // Cache the result
    await cacheService.setAdminTotalEntries(count);
    
    return count;
  }

  async getAllUsersWithStats(): Promise<any[]> {
    // 🚀 Try cache first (30 minute TTL for VERY expensive N+1 query)
    const cached = await cacheService.getAdminAllUsersStats();
    if (cached) {
      return cached;
    }

    // Cache miss - perform very expensive N+1 query
    const allUsers = await db.select().from(users).orderBy(desc(users.createdAt));
    
    const usersWithStats = await Promise.all(
      allUsers.map(async (user) => {
        const entriesCount = await db
          .select({ count: sql<number>`count(*)` })
          .from(weightEntries)
          .where(eq(weightEntries.userId, user.id));
        
        const lastEntry = await db
          .select()
          .from(weightEntries)
          .where(eq(weightEntries.userId, user.id))
          .orderBy(desc(weightEntries.createdAt))
          .limit(1);

        return {
          ...user,
          weightEntriesCount: entriesCount[0].count,
          lastActiveAt: lastEntry[0]?.createdAt || null,
        };
      })
    );

    // Cache the very expensive result
    await cacheService.setAdminAllUsersStats(usersWithStats);

    return usersWithStats;
  }

  async updateUserSubscriptionTier(userId: string, tier: 'free' | 'starter' | 'premium' | 'pro' | 'admin'): Promise<any> {
    const [updatedUser] = await db
      .update(users)
      .set({ 
        subscriptionTier: tier,
        updatedAt: new Date()
      })
      .where(eq(users.id, userId))
      .returning();
    
    return updatedUser;
  }

  async updateUserByAdmin(userId: string, updates: any): Promise<User> {
    // Process the updates to handle date conversion
    const processedUpdates: any = { ...updates };
    
    // Convert dateOfBirth string to Date object if present
    if (processedUpdates.dateOfBirth && typeof processedUpdates.dateOfBirth === 'string') {
      processedUpdates.dateOfBirth = new Date(processedUpdates.dateOfBirth);
    }
    
    // Ensure height is properly handled as integer
    if (processedUpdates.height && typeof processedUpdates.height === 'string') {
      processedUpdates.height = parseInt(processedUpdates.height, 10);
    }
    
    const [updatedUser] = await db
      .update(users)
      .set({ 
        ...processedUpdates,
        updatedAt: new Date()
      })
      .where(eq(users.id, userId))
      .returning();
    
    // 🗑️ Invalidate user cache after admin update
    await cacheService.invalidateUserProfile(userId);
    
    return updatedUser;
  }

  async deleteUserCompletely(userId: string): Promise<void> {
    // Delete in order to respect foreign key constraints
    await db.delete(activityLog).where(eq(activityLog.userId, userId));
    await db.delete(weightEntries).where(eq(weightEntries.userId, userId));
    await db.delete(users).where(eq(users.id, userId));
  }

  // Admin settings operations
  async getAdminSetting(key: string): Promise<string | null> {
    const [setting] = await db
      .select()
      .from(adminSettings)
      .where(eq(adminSettings.setting_key, key))
      .limit(1);
    
    return setting?.setting_value || null;
  }

  async setAdminSetting(key: string, value: string): Promise<void> {
    await db
      .insert(adminSettings)
      .values({
        setting_key: key,
        setting_value: value,
      })
      .onConflictDoUpdate({
        target: adminSettings.setting_key,
        set: {
          setting_value: value,
          updatedAt: new Date(),
        },
      });
  }

  // Provider-agnostic subscription operations
  async updateUserPaymentProvider(userId: string, subscriptionData: {
    subscriptionTier?: string;
    paymentProvider?: string;
    providerCustomerId?: string;
    providerSubscriptionId?: string;
    providerMetadata?: any;
    subscriptionStatus?: string;
    subscriptionEndsAt?: Date;
    trialEndsAt?: Date;
  }): Promise<User> {
    const [user] = await db
      .update(users)
      .set({
        ...subscriptionData,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId))
      .returning();
    
    // 🗑️ Invalidate user cache after payment provider update
    await cacheService.invalidateUserProfile(userId);
    
    return user;
  }

  // Language preference operations
  async updateUserLocale(userId: string, locale: string): Promise<User> {
    const [user] = await db
      .update(users)
      .set({
        locale: locale,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId))
      .returning();
    
    // 🗑️ Invalidate user cache after locale update
    await cacheService.invalidateUserProfile(userId);
    
    return user;
  }

  // Delete weight entry (Pro users only)
  async deleteWeightEntry(userId: string, entryId: string): Promise<void> {
    await db
      .delete(weightEntries)
      .where(and(
        eq(weightEntries.userId, userId),
        eq(weightEntries.id, entryId)
      ));
    
    // 🗑️ Invalidate weight-related caches after deletion
    await cacheService.invalidateWeightData(userId);
  }

  // Provider-agnostic customer/subscription info update
  async updateUserProviderInfo(userId: string, paymentProvider: string, customerId: string, subscriptionId: string | null, metadata?: any): Promise<User> {
    const [user] = await db
      .update(users)
      .set({
        paymentProvider,
        providerCustomerId: customerId,
        providerSubscriptionId: subscriptionId,
        providerMetadata: metadata,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId))
      .returning();
    return user;
  }


  // Provider-agnostic subscription status update  
  async updateSubscriptionStatus(
    userId: string, 
    tier: string, 
    status: string, 
    subscriptionId: string | null, 
    endsAt: Date | null,
    paymentProvider?: string
  ): Promise<User> {
    const updateData: any = {
      subscriptionTier: tier,
      subscriptionStatus: status,
      subscriptionEndsAt: endsAt,
      updatedAt: new Date(),
    };
    
    // Use provider-agnostic fields when provider is specified
    if (paymentProvider && subscriptionId) {
      updateData.paymentProvider = paymentProvider;
      updateData.providerSubscriptionId = subscriptionId;
    }
    
    const [user] = await db
      .update(users)
      .set(updateData)
      .where(eq(users.id, userId))
      .returning();
    return user;
  }

  // Reminder notification operations
  async getUsersWithDailyReminders(): Promise<User[]> {
    return await db
      .select()
      .from(users)
      .where(eq(users.dailyReminderEnabled, true));
  }

  async getUsersWithWeeklyProgress(): Promise<User[]> {
    return await db
      .select()
      .from(users)
      .where(and(
        eq(users.weeklyProgressEnabled, true),
        eq(users.subscriptionTier, 'pro')
      ));
  }

  async hasUserRecordedToday(userId: string): Promise<boolean> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const [entry] = await db
      .select()
      .from(weightEntries)
      .where(and(
        eq(weightEntries.userId, userId),
        gte(weightEntries.createdAt, today)
      ))
      .limit(1);
      
    return !!entry;
  }

  async getUserWeeklyStats(userId: string): Promise<{
    recordingCount: number;
    weightChange: number;
    currentStreak: number;
  }> {
    // Get entries from the last 7 days
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    
    const weeklyEntries = await db
      .select()
      .from(weightEntries)
      .where(and(
        eq(weightEntries.userId, userId),
        gte(weightEntries.createdAt, oneWeekAgo)
      ))
      .orderBy(desc(weightEntries.createdAt));

    const recordingCount = weeklyEntries.length;
    
    // Calculate weight change (most recent - oldest in the week)
    let weightChange = 0;
    if (weeklyEntries.length >= 2) {
      const mostRecent = parseFloat(weeklyEntries[0].weight);
      const oldest = parseFloat(weeklyEntries[weeklyEntries.length - 1].weight);
      weightChange = mostRecent - oldest;
    }

    // Calculate current streak (consecutive days with recordings)
    const allEntries = await db
      .select()
      .from(weightEntries)
      .where(eq(weightEntries.userId, userId))
      .orderBy(desc(weightEntries.createdAt));

    let currentStreak = 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let i = 0; i < allEntries.length; i++) {
      const entryDate = new Date(allEntries[i].createdAt!);
      entryDate.setHours(0, 0, 0, 0);
      
      const daysDiff = Math.floor((today.getTime() - entryDate.getTime()) / (1000 * 60 * 60 * 24));
      
      if (daysDiff === currentStreak) {
        currentStreak++;
      } else {
        break;
      }
    }

    return {
      recordingCount,
      weightChange,
      currentStreak,
    };
  }

  // Email verification operations
  async createVerificationCode(userId: string, email: string, code: string, expiresAt: Date): Promise<EmailVerificationCode> {
    const [verificationCode] = await db
      .insert(emailVerificationCodes)
      .values({
        userId,
        email,
        code,
        expiresAt,
      })
      .returning();
    return verificationCode;
  }

  async getVerificationCode(userId: string, code: string): Promise<EmailVerificationCode | undefined> {
    const [verificationCode] = await db
      .select()
      .from(emailVerificationCodes)
      .where(
        and(
          eq(emailVerificationCodes.userId, userId),
          eq(emailVerificationCodes.code, code),
          eq(emailVerificationCodes.verified, false),
          sql`${emailVerificationCodes.expiresAt} > NOW()`
        )
      )
      .limit(1);
    return verificationCode;
  }

  async markVerificationCodeUsed(codeId: string): Promise<void> {
    await db
      .update(emailVerificationCodes)
      .set({ verified: true })
      .where(eq(emailVerificationCodes.id, codeId));
  }

  async deleteExpiredCodes(): Promise<void> {
    await db
      .delete(emailVerificationCodes)
      .where(sql`${emailVerificationCodes.expiresAt} <= NOW()`);
  }

  // Password reset operations
  async createPasswordResetToken(userId: string, token: string, expiresAt: Date): Promise<PasswordResetToken> {
    const [resetToken] = await db
      .insert(passwordResetTokens)
      .values({
        userId,
        token,
        expiresAt,
      })
      .returning();
    
    return resetToken;
  }

  async getPasswordResetToken(token: string): Promise<PasswordResetToken | undefined> {
    const [resetToken] = await db
      .select()
      .from(passwordResetTokens)
      .where(and(
        eq(passwordResetTokens.token, token),
        eq(passwordResetTokens.used, false)
      ));
    
    return resetToken;
  }

  async deletePasswordResetToken(token: string): Promise<void> {
    await db
      .delete(passwordResetTokens)
      .where(eq(passwordResetTokens.token, token));
  }

  async updateUserPassword(userId: string, hashedPassword: string): Promise<User> {
    const [user] = await db
      .update(users)
      .set({ 
        password: hashedPassword,
        updatedAt: new Date() 
      })
      .where(eq(users.id, userId))
      .returning();
    
    // 🗑️ Invalidate user cache after password update
    await cacheService.invalidateUserProfile(userId);
    
    return user;
  }

  // WhatsApp operations
  async getUserByWhatsAppPhone(phoneNumber: string): Promise<User | undefined> {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.whatsappPhone, phoneNumber))
      .limit(1);
    
    return user;
  }

  async createWhatsAppInteraction(interaction: InsertWhatsappInteraction): Promise<WhatsappInteraction> {
    const [whatsappInteraction] = await db
      .insert(whatsappInteractions)
      .values(interaction)
      .returning();
    
    return whatsappInteraction;
  }
}

export const storage = new DatabaseStorage();

import { redisManager } from './redis';
import type { User, WeightEntry, ActivityLog } from '@shared/schema';

/**
 * 🚀 Redis-Powered Data Caching Service
 * 
 * Provides high-performance caching for frequently accessed data
 * with automatic TTL management and graceful fallback mechanisms.
 * 
 * Performance targets:
 * - 80-90% reduction in database queries
 * - Sub-100ms response times
 * - Support for millions of concurrent users
 */

export interface CacheStats {
  totalLost: number;
  avgPerWeek: number;
  totalRecordings: number;
  progressPercentage: number;
}

export interface AdminStats {
  totalUsers: number;
  activeUsersToday: number;
  totalWeightEntries: number;
  usersByTier: Record<string, number>;
}

export interface WeeklyStats {
  recordingCount: number;
  weightChange: number;
  currentStreak: number;
}

/**
 * Cache TTL Strategies (in seconds):
 * - User profiles: 3600s (1 hour) - High frequency, moderate change rate
 * - Weight entries: 300s (5 minutes) - High volume, frequent updates  
 * - Analytics: 600s (10 minutes) - Expensive calculations, moderate change
 * - Admin stats: 1800s (30 minutes) - Very expensive, low change rate
 * - Activity logs: 600s (10 minutes) - Moderate frequency
 */
const TTL = {
  USER_PROFILE: 3600,      // 1 hour
  WEIGHT_ENTRIES: 300,     // 5 minutes  
  ANALYTICS: 600,          // 10 minutes
  ADMIN_STATS: 1800,       // 30 minutes
  ACTIVITY_LOG: 600,       // 10 minutes
  VERIFICATION_CODE: 300,  // 5 minutes
} as const;

/**
 * Cache key generation with consistent prefixing
 */
const CACHE_KEYS = {
  // User data
  USER_PROFILE: (userId: string) => `user:profile:${userId}`,
  USER_BY_EMAIL: (email: string) => `user:email:${email}`,
  USER_BY_PROVIDER: (provider: string, id: string) => `user:${provider}:${id}`,
  
  // Weight data
  WEIGHT_ENTRIES: (userId: string, limit?: number) => `weight:entries:${userId}:${limit || 'all'}`,
  WEIGHT_LATEST: (userId: string) => `weight:latest:${userId}`,
  WEIGHT_RANGE: (userId: string, start: string, end: string) => `weight:range:${userId}:${start}:${end}`,
  WEIGHT_CAN_RECORD: (userId: string) => `weight:can_record:${userId}`,
  
  // Analytics
  USER_STATS: (userId: string) => `analytics:user_stats:${userId}`,
  WEEKLY_STATS: (userId: string) => `analytics:weekly:${userId}`,
  
  // Activity
  ACTIVITY_LOG: (userId: string, limit?: number) => `activity:log:${userId}:${limit || 20}`,
  
  // Admin stats  
  ADMIN_TOTAL_USERS: 'admin:stats:total_users',
  ADMIN_ACTIVE_TODAY: 'admin:stats:active_today',
  ADMIN_TOTAL_ENTRIES: 'admin:stats:total_entries',
  ADMIN_USERS_BY_TIER: (tier: string) => `admin:stats:tier:${tier}`,
  ADMIN_ALL_USERS_STATS: 'admin:stats:all_users',
  
  // Verification codes
  VERIFICATION_CODE: (userId: string, code: string) => `verify:${userId}:${code}`,
} as const;

export class CacheService {
  private isProduction = process.env.NODE_ENV === 'production';

  /**
   * Generic cache operations with automatic fallback
   */
  
  async get<T>(key: string): Promise<T | null> {
    try {
      const cached = await redisManager.get(key);
      if (cached) {
        return JSON.parse(cached) as T;
      }
      return null;
    } catch (error) {
      console.warn(`[CACHE] Failed to get ${key}:`, error);
      return null; // Graceful fallback to database
    }
  }

  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    try {
      await redisManager.set(key, JSON.stringify(value), { ex: ttlSeconds });
    } catch (error) {
      console.warn(`[CACHE] Failed to set ${key}:`, error);
      // Non-blocking - application continues without caching
    }
  }

  async del(key: string): Promise<void> {
    try {
      await redisManager.del(key);
    } catch (error) {
      console.warn(`[CACHE] Failed to delete ${key}:`, error);
      // Non-blocking
    }
  }

  async invalidatePattern(pattern: string): Promise<void> {
    try {
      // Note: For production scaling, consider implementing SCAN-based pattern deletion
      // For now, we'll handle specific key invalidation
      console.log(`[CACHE] Pattern invalidation requested: ${pattern}`);
    } catch (error) {
      console.warn(`[CACHE] Failed to invalidate pattern ${pattern}:`, error);
    }
  }

  /**
   * 👤 User Profile Caching
   */
  
  async getUserProfile(userId: string): Promise<User | null> {
    return this.get<User>(CACHE_KEYS.USER_PROFILE(userId));
  }

  async setUserProfile(user: User): Promise<void> {
    await this.set(CACHE_KEYS.USER_PROFILE(user.id), user, TTL.USER_PROFILE);
  }

  async invalidateUserProfile(userId: string): Promise<void> {
    await Promise.all([
      this.del(CACHE_KEYS.USER_PROFILE(userId)),
      this.del(CACHE_KEYS.USER_BY_EMAIL(userId)), // Email might change
      // Invalidate related caches
      this.del(CACHE_KEYS.WEIGHT_CAN_RECORD(userId)),
      this.del(CACHE_KEYS.USER_STATS(userId)),
    ]);
  }

  async getUserByEmail(email: string): Promise<User | null> {
    return this.get<User>(CACHE_KEYS.USER_BY_EMAIL(email));
  }

  async setUserByEmail(email: string, user: User): Promise<void> {
    await this.set(CACHE_KEYS.USER_BY_EMAIL(email), user, TTL.USER_PROFILE);
  }

  /**
   * ⚖️ Weight Entries Caching
   */
  
  async getWeightEntries(userId: string, limit?: number): Promise<WeightEntry[] | null> {
    return this.get<WeightEntry[]>(CACHE_KEYS.WEIGHT_ENTRIES(userId, limit));
  }

  async setWeightEntries(userId: string, entries: WeightEntry[], limit?: number): Promise<void> {
    await this.set(CACHE_KEYS.WEIGHT_ENTRIES(userId, limit), entries, TTL.WEIGHT_ENTRIES);
  }

  async getLatestWeightEntry(userId: string): Promise<WeightEntry | null> {
    return this.get<WeightEntry>(CACHE_KEYS.WEIGHT_LATEST(userId));
  }

  async setLatestWeightEntry(userId: string, entry: WeightEntry): Promise<void> {
    await this.set(CACHE_KEYS.WEIGHT_LATEST(userId), entry, TTL.WEIGHT_ENTRIES);
  }

  async invalidateWeightData(userId: string): Promise<void> {
    await Promise.all([
      // Invalidate all weight entry caches for this user
      this.del(CACHE_KEYS.WEIGHT_ENTRIES(userId)),
      this.del(CACHE_KEYS.WEIGHT_ENTRIES(userId, 50)),
      this.del(CACHE_KEYS.WEIGHT_LATEST(userId)),
      this.del(CACHE_KEYS.WEIGHT_CAN_RECORD(userId)),
      // Invalidate dependent analytics
      this.del(CACHE_KEYS.USER_STATS(userId)),
      this.del(CACHE_KEYS.WEEKLY_STATS(userId)),
      // Invalidate admin stats (new entry affects totals)
      this.del(CACHE_KEYS.ADMIN_TOTAL_ENTRIES),
      this.del(CACHE_KEYS.ADMIN_ACTIVE_TODAY),
    ]);
  }

  async getCanRecordWeight(userId: string): Promise<boolean | null> {
    return this.get<boolean>(CACHE_KEYS.WEIGHT_CAN_RECORD(userId));
  }

  async setCanRecordWeight(userId: string, canRecord: boolean): Promise<void> {
    // Shorter TTL since this can change frequently
    await this.set(CACHE_KEYS.WEIGHT_CAN_RECORD(userId), canRecord, 300); // 5 minutes
  }

  /**
   * 📊 Analytics Caching
   */
  
  async getUserStats(userId: string): Promise<CacheStats | null> {
    return this.get<CacheStats>(CACHE_KEYS.USER_STATS(userId));
  }

  async setUserStats(userId: string, stats: CacheStats): Promise<void> {
    await this.set(CACHE_KEYS.USER_STATS(userId), stats, TTL.ANALYTICS);
  }

  async getWeeklyStats(userId: string): Promise<WeeklyStats | null> {
    return this.get<WeeklyStats>(CACHE_KEYS.WEEKLY_STATS(userId));
  }

  async setWeeklyStats(userId: string, stats: WeeklyStats): Promise<void> {
    await this.set(CACHE_KEYS.WEEKLY_STATS(userId), stats, TTL.ANALYTICS);
  }

  /**
   * 📝 Activity Log Caching
   */
  
  async getActivityLog(userId: string, limit?: number): Promise<ActivityLog[] | null> {
    return this.get<ActivityLog[]>(CACHE_KEYS.ACTIVITY_LOG(userId, limit));
  }

  async setActivityLog(userId: string, activities: ActivityLog[], limit?: number): Promise<void> {
    await this.set(CACHE_KEYS.ACTIVITY_LOG(userId, limit), activities, TTL.ACTIVITY_LOG);
  }

  async invalidateActivityLog(userId: string): Promise<void> {
    await Promise.all([
      this.del(CACHE_KEYS.ACTIVITY_LOG(userId)),
      this.del(CACHE_KEYS.ACTIVITY_LOG(userId, 20)),
    ]);
  }

  /**
   * 👨‍💼 Admin Statistics Caching (Very Expensive Queries)
   */
  
  async getAdminTotalUsers(): Promise<number | null> {
    return this.get<number>(CACHE_KEYS.ADMIN_TOTAL_USERS);
  }

  async setAdminTotalUsers(count: number): Promise<void> {
    await this.set(CACHE_KEYS.ADMIN_TOTAL_USERS, count, TTL.ADMIN_STATS);
  }

  async getAdminActiveToday(): Promise<number | null> {
    return this.get<number>(CACHE_KEYS.ADMIN_ACTIVE_TODAY);
  }

  async setAdminActiveToday(count: number): Promise<void> {
    await this.set(CACHE_KEYS.ADMIN_ACTIVE_TODAY, count, TTL.ADMIN_STATS);
  }

  async getAdminTotalEntries(): Promise<number | null> {
    return this.get<number>(CACHE_KEYS.ADMIN_TOTAL_ENTRIES);
  }

  async setAdminTotalEntries(count: number): Promise<void> {
    await this.set(CACHE_KEYS.ADMIN_TOTAL_ENTRIES, count, TTL.ADMIN_STATS);
  }

  async getAdminUsersByTier(tier: string): Promise<number | null> {
    return this.get<number>(CACHE_KEYS.ADMIN_USERS_BY_TIER(tier));
  }

  async setAdminUsersByTier(tier: string, count: number): Promise<void> {
    await this.set(CACHE_KEYS.ADMIN_USERS_BY_TIER(tier), count, TTL.ADMIN_STATS);
  }

  async getAdminAllUsersStats(): Promise<any[] | null> {
    return this.get<any[]>(CACHE_KEYS.ADMIN_ALL_USERS_STATS);
  }

  async setAdminAllUsersStats(users: any[]): Promise<void> {
    await this.set(CACHE_KEYS.ADMIN_ALL_USERS_STATS, users, TTL.ADMIN_STATS);
  }

  async invalidateAdminStats(): Promise<void> {
    await Promise.all([
      this.del(CACHE_KEYS.ADMIN_TOTAL_USERS),
      this.del(CACHE_KEYS.ADMIN_ACTIVE_TODAY),
      this.del(CACHE_KEYS.ADMIN_TOTAL_ENTRIES),
      this.del(CACHE_KEYS.ADMIN_ALL_USERS_STATS),
      // Invalidate all tier counts
      this.del(CACHE_KEYS.ADMIN_USERS_BY_TIER('free')),
      this.del(CACHE_KEYS.ADMIN_USERS_BY_TIER('starter')),
      this.del(CACHE_KEYS.ADMIN_USERS_BY_TIER('premium')),
      this.del(CACHE_KEYS.ADMIN_USERS_BY_TIER('pro')),
      this.del(CACHE_KEYS.ADMIN_USERS_BY_TIER('admin')),
    ]);
  }

  /**
   * 🔐 Email Verification Caching
   */
  
  async getVerificationCode(userId: string, code: string): Promise<any | null> {
    return this.get<any>(CACHE_KEYS.VERIFICATION_CODE(userId, code));
  }

  async setVerificationCode(userId: string, code: string, data: any): Promise<void> {
    await this.set(CACHE_KEYS.VERIFICATION_CODE(userId, code), data, TTL.VERIFICATION_CODE);
  }

  async invalidateVerificationCode(userId: string, code: string): Promise<void> {
    await this.del(CACHE_KEYS.VERIFICATION_CODE(userId, code));
  }

  /**
   * 🧹 Bulk Invalidation Helpers
   */
  
  async invalidateUserData(userId: string): Promise<void> {
    // Comprehensive invalidation for user-related data
    await Promise.all([
      this.invalidateUserProfile(userId),
      this.invalidateWeightData(userId),
      this.invalidateActivityLog(userId),
      // Don't invalidate admin stats for individual user changes (too expensive)
    ]);
  }

  /**
   * 📈 Cache Performance Monitoring
   */
  
  async getCacheHealth(): Promise<{
    redis_connected: boolean;
    keys_count?: number;
    memory_usage?: string;
  }> {
    try {
      const connectionInfo = redisManager.getConnectionInfo();
      const isConnected = connectionInfo.isConnected;
      
      if (!isConnected) {
        return { redis_connected: false };
      }

      // Additional health metrics could be added here
      return {
        redis_connected: true,
        // keys_count and memory_usage would require Redis INFO commands
      };
    } catch (error) {
      return { redis_connected: false };
    }
  }
}

// Export singleton instance
export const cacheService = new CacheService();
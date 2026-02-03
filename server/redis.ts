import { createClient, type RedisClientType } from 'redis';
import { Redis as UpstashRedis } from '@upstash/redis';

// Redis configuration for different environments
interface RedisConfig {
  url?: string;
  token?: string;
  host?: string;
  port?: number;
  password?: string;
}

export class RedisManager {
  private static instance: RedisManager;
  private redisClient: RedisClientType | UpstashRedis | null = null;
  private memoryStore: Map<string, { value: any; expiry?: number }> = new Map();
  private isProduction: boolean;
  private useUpstash: boolean;
  private initPromise: Promise<void>;
  private isReady: boolean = false;

  private constructor() {
    this.isProduction = process.env.NODE_ENV === 'production';
    this.useUpstash = !!process.env.UPSTASH_REDIS_REST_URL;
    this.initPromise = this.initialize();
  }

  public static getInstance(): RedisManager {
    if (!RedisManager.instance) {
      RedisManager.instance = new RedisManager();
    }
    return RedisManager.instance;
  }

  private async initialize(): Promise<void> {
    try {
      if (this.useUpstash && process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
        // Production: Use Upstash Redis with REST API
        console.log('🚀 [REDIS] Initializing Upstash Redis for production...');
        this.redisClient = new UpstashRedis({
          url: process.env.UPSTASH_REDIS_REST_URL,
          token: process.env.UPSTASH_REDIS_REST_TOKEN,
        });
        
        // Test connection with retry logic
        await this.connectWithRetry();
        
      } else if (process.env.REDIS_URL) {
        // Alternative: Standard Redis connection
        this.redisClient = createClient({ url: process.env.REDIS_URL });
        
        this.redisClient.on('connect', () => {
          this.isReady = true;
        });
        
        this.redisClient.on('error', (err: Error) => {
          console.error('❌ [REDIS] Standard Redis connection error:', err);
          this.isReady = false;
          if (this.isProduction) {
            // In production, try to reconnect instead of falling back to memory
            this.reconnectWithDelay();
          } else {
            this.fallbackToMemory();
          }
        });
        
        await this.redisClient.connect();
        this.isReady = true;
        
      } else {
        // Development: Use in-memory store
        this.fallbackToMemory();
      }
    } catch (error) {
      console.error('❌ [REDIS] Redis initialization failed:', error);
      if (this.isProduction) {
        // In production, keep trying to connect instead of permanent fallback
        this.reconnectWithDelay();
      } else {
        this.fallbackToMemory();
      }
    }
  }

  private async connectWithRetry(maxRetries: number = 3): Promise<void> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await (this.redisClient as UpstashRedis).ping();
        this.isReady = true;
        return;
      } catch (error) {
        console.error(`❌ [REDIS] Connection attempt ${attempt}/${maxRetries} failed:`, error);
        if (attempt === maxRetries) {
          throw error;
        }
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt)); // Exponential backoff
      }
    }
  }

  private async reconnectWithDelay(): Promise<void> {
    console.log('🔄 [REDIS] Attempting to reconnect in 5 seconds...');
    setTimeout(async () => {
      try {
        await this.initialize();
      } catch (error) {
        console.error('❌ [REDIS] Reconnection failed, will retry:', error);
        this.reconnectWithDelay(); // Keep trying
      }
    }, 5000);
  }

  // Public method to wait for Redis to be ready
  async waitForReady(): Promise<void> {
    await this.initPromise;
  }

  private fallbackToMemory() {
    if (this.isProduction) {
      console.error('🚨 [REDIS] CRITICAL: Cannot fall back to memory in production!');
      throw new Error('Redis connection required in production environment');
    }
    
    console.log('⚠️  [REDIS] Falling back to in-memory store for development');
    this.redisClient = null;
    this.isReady = true; // Memory store is always "ready"
    
    // Clean up expired keys periodically
    setInterval(() => {
      const now = Date.now();
      const keysToDelete: string[] = [];
      this.memoryStore.forEach((item, key) => {
        if (item.expiry && item.expiry < now) {
          keysToDelete.push(key);
        }
      });
      keysToDelete.forEach(key => this.memoryStore.delete(key));
    }, 60000); // Clean up every minute
  }

  // Universal Redis operations that work with any backend
  async get(key: string): Promise<string | null> {
    try {
      if (this.redisClient) {
        const result = await this.redisClient.get(key);
        return typeof result === 'string' ? result : (result ? JSON.stringify(result) : null);
      } else {
        // Check if production - cannot fall back to memory
        if (this.isProduction) {
          throw new Error('Redis connection required in production environment');
        }
        // In-memory fallback (development only)
        const item = this.memoryStore.get(key);
        if (!item) return null;
        if (item.expiry && item.expiry < Date.now()) {
          this.memoryStore.delete(key);
          return null;
        }
        return typeof item.value === 'string' ? item.value : JSON.stringify(item.value);
      }
    } catch (error) {
      console.error('❌ [REDIS] Get operation failed:', error);
      return null;
    }
  }

  async set(key: string, value: string, options?: { ex?: number }): Promise<boolean> {
    try {
      if (this.redisClient) {
        if (this.useUpstash) {
          // Upstash Redis API - use set with options object
          if (options?.ex) {
            await (this.redisClient as UpstashRedis).set(key, value, { ex: options.ex });
          } else {
            await (this.redisClient as UpstashRedis).set(key, value);
          }
        } else {
          // Standard Redis API
          if (options?.ex) {
            await (this.redisClient as RedisClientType).setEx(key, options.ex, value);
          } else {
            await (this.redisClient as RedisClientType).set(key, value);
          }
        }
        return true;
      } else {
        // Check if production - cannot fall back to memory
        if (this.isProduction) {
          throw new Error('Redis connection required in production environment');
        }
        // In-memory fallback (development only)
        const expiry = options?.ex ? Date.now() + (options.ex * 1000) : undefined;
        this.memoryStore.set(key, { value, expiry });
        return true;
      }
    } catch (error) {
      console.error('❌ [REDIS] Set operation failed:', error);
      return false;
    }
  }

  async del(key: string): Promise<boolean> {
    try {
      if (this.redisClient) {
        if (this.useUpstash) {
          await (this.redisClient as UpstashRedis).del(key);
        } else {
          await (this.redisClient as RedisClientType).del(key);
        }
        return true;
      } else {
        // Check if production - cannot fall back to memory
        if (this.isProduction) {
          throw new Error('Redis connection required in production environment');
        }
        // In-memory fallback (development only)
        return this.memoryStore.delete(key);
      }
    } catch (error) {
      console.error('❌ [REDIS] Delete operation failed:', error);
      return false;
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      if (this.redisClient) {
        if (this.useUpstash) {
          const result = await (this.redisClient as UpstashRedis).exists(key);
          return !!result;
        } else {
          const result = await (this.redisClient as RedisClientType).exists(key);
          return result > 0;
        }
      } else {
        // Check if production - cannot fall back to memory
        if (this.isProduction) {
          throw new Error('Redis connection required in production environment');
        }
        // In-memory fallback (development only)
        return this.memoryStore.has(key);
      }
    } catch (error) {
      console.error('❌ [REDIS] Exists operation failed:', error);
      return false;
    }
  }

  async expire(key: string, seconds: number): Promise<boolean> {
    try {
      if (this.redisClient) {
        if (this.useUpstash) {
          const result = await (this.redisClient as UpstashRedis).expire(key, seconds);
          return !!result;
        } else {
          const result = await (this.redisClient as RedisClientType).expire(key, seconds);
          return !!result;
        }
      } else {
        // Check if production - cannot fall back to memory
        if (this.isProduction) {
          throw new Error('Redis connection required in production environment');
        }
        // In-memory fallback (development only)
        const item = this.memoryStore.get(key);
        if (item) {
          item.expiry = Date.now() + (seconds * 1000);
          this.memoryStore.set(key, item);
          return true;
        }
        return false;
      }
    } catch (error) {
      console.error('❌ [REDIS] Expire operation failed:', error);
      return false;
    }
  }

  // Session-specific operations (no prefix here - prefix handled by session store)
  async getSession(sessionId: string): Promise<any | null> {
    try {
      const sessionData = await this.get(sessionId);
      return sessionData ? JSON.parse(sessionData) : null;
    } catch (error) {
      console.error('❌ [REDIS] Get session failed:', error);
      return null;
    }
  }

  async setSession(sessionId: string, sessionData: any, maxAge: number = 86400): Promise<boolean> {
    try {
      const serialized = JSON.stringify(sessionData);
      return await this.set(sessionId, serialized, { ex: maxAge });
    } catch (error) {
      console.error('❌ [REDIS] Set session failed:', error);
      return false;
    }
  }

  async deleteSession(sessionId: string): Promise<boolean> {
    try {
      return await this.del(sessionId);
    } catch (error) {
      console.error('❌ [REDIS] Delete session failed:', error);
      return false;
    }
  }

  // Health check
  async ping(): Promise<boolean> {
    try {
      if (this.redisClient) {
        if (this.useUpstash) {
          // Upstash ping returns string
          const result = await (this.redisClient as UpstashRedis).ping();
          return result === 'PONG';
        } else {
          // Standard Redis ping
          const result = await (this.redisClient as RedisClientType).ping();
          return result === 'PONG';
        }
      }
      return true; // In-memory store is always "healthy"
    } catch (error) {
      console.error('❌ [REDIS] Ping failed:', error);
      return false;
    }
  }

  // Get connection info for monitoring
  getConnectionInfo(): { type: string; isConnected: boolean } {
    if (this.useUpstash) {
      return { type: 'upstash', isConnected: !!this.redisClient };
    } else if (this.redisClient) {
      return { type: 'standard', isConnected: true };
    } else {
      return { type: 'memory', isConnected: true };
    }
  }

  // Graceful shutdown
  async disconnect(): Promise<void> {
    try {
      if (this.redisClient && 'disconnect' in this.redisClient) {
        await (this.redisClient as RedisClientType).disconnect();
      }
    } catch (error) {
      console.error('❌ [REDIS] Disconnect error:', error);
    }
  }
}

// Export singleton instance
export const redisManager = RedisManager.getInstance();
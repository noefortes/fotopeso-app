import { Store } from 'express-session';
import { redisManager } from './redis';
import { db } from './db';
import { sessions } from '@shared/schema';
import { eq } from 'drizzle-orm';

export interface RedisSessionStoreOptions {
  prefix?: string;
  ttl?: number;
  dualWrite?: boolean; // Enable dual-write to PostgreSQL for migration
  readFromPg?: boolean; // Enable reading from PostgreSQL fallback
  logLevel?: 'debug' | 'info' | 'warn' | 'error';
}

export class RedisSessionStore extends Store {
  private prefix: string;
  private ttl: number;
  private dualWrite: boolean;
  private readFromPg: boolean;
  private logLevel: string;

  constructor(options: RedisSessionStoreOptions = {}) {
    super();
    this.prefix = options.prefix || 'sess:';
    this.ttl = options.ttl || 86400; // 1 day default
    this.dualWrite = options.dualWrite ?? true; // Enable dual-write by default for migration
    this.readFromPg = options.readFromPg ?? true; // Enable PG fallback by default
    this.logLevel = options.logLevel || 'info';
  }

  private log(level: string, message: string, ...args: any[]) {
    const levels = { debug: 0, info: 1, warn: 2, error: 3 };
    const currentLevel = levels[this.logLevel as keyof typeof levels] || 1;
    const messageLevel = levels[level as keyof typeof levels] || 1;
    
    if (messageLevel >= currentLevel) {
      console.log(`[REDIS-SESSION-${level.toUpperCase()}] ${message}`, ...args);
    }
  }

  private getKey(sid: string): string {
    return `${this.prefix}${sid}`;
  }

  // Get session data
  async get(sid: string, callback: (err?: any, session?: any) => void): Promise<void> {
    try {
      const key = this.getKey(sid);
      let redisSession = null;
      
      // Try Redis first with graceful error handling
      try {
        await redisManager.waitForReady();
        redisSession = await redisManager.getSession(key);
        if (redisSession) {
          this.log('debug', `Session found in Redis: ${sid}`);
          callback(null, redisSession);
          return;
        }
      } catch (redisError) {
        this.log('warn', `Redis error for session ${sid}, falling back to PostgreSQL:`, redisError);
        // Continue to PostgreSQL fallback
      }

      // Fallback to PostgreSQL if enabled
      if (this.readFromPg) {
        this.log('debug', `Session not in Redis, checking PostgreSQL: ${sid}`);
        const pgSession = await db
          .select()
          .from(sessions)
          .where(eq(sessions.sid, sid))
          .limit(1);

        if (pgSession.length > 0) {
          const sessionData = pgSession[0].sess;
          this.log('debug', `Session found in PostgreSQL: ${sid}`);
          
          // Try to backfill to Redis (if Redis is available)
          try {
            await redisManager.setSession(key, sessionData, this.ttl);
            this.log('debug', `Session backfilled to Redis: ${sid}`);
          } catch (backfillError) {
            this.log('warn', `Failed to backfill session to Redis: ${sid}`, backfillError);
            // Don't fail the request if backfill fails
          }
          
          callback(null, sessionData);
          return;
        }
      }

      this.log('debug', `Session not found: ${sid}`);
      callback(null, null);
    } catch (error) {
      this.log('error', `Error getting session ${sid}:`, error);
      callback(error);
    }
  }

  // Set session data
  async set(sid: string, session: any, callback?: (err?: any) => void): Promise<void> {
    try {
      const key = this.getKey(sid);
      
      // Try to write to Redis with graceful error handling
      try {
        await redisManager.waitForReady();
        const redisSuccess = await redisManager.setSession(key, session, this.ttl);
        if (redisSuccess) {
          this.log('debug', `Session written to Redis: ${sid}`);
        } else {
          this.log('warn', `Failed to write session to Redis: ${sid}`);
        }
      } catch (redisError) {
        this.log('warn', `Redis error writing session ${sid}:`, redisError);
        // Continue to PostgreSQL write
      }

      // Dual-write to PostgreSQL if enabled
      if (this.dualWrite) {
        try {
          const expiry = new Date(Date.now() + (this.ttl * 1000));
          
          // Use upsert (INSERT ... ON CONFLICT) for better performance
          await db
            .insert(sessions)
            .values({
              sid,
              sess: session,
              expire: expiry,
            })
            .onConflictDoUpdate({
              target: sessions.sid,
              set: {
                sess: session,
                expire: expiry,
              },
            });
          
          this.log('debug', `Session dual-written to PostgreSQL: ${sid}`);
        } catch (pgError) {
          this.log('warn', `Failed to dual-write session to PostgreSQL: ${sid}`, pgError);
          // Don't fail the entire operation if PG write fails
        }
      }

      if (callback) callback(null);
    } catch (error) {
      this.log('error', `Error setting session ${sid}:`, error);
      if (callback) callback(error);
    }
  }

  // Destroy session
  async destroy(sid: string, callback?: (err?: any) => void): Promise<void> {
    try {
      const key = this.getKey(sid);
      
      // Wait for Redis to be ready before any operations
      await redisManager.waitForReady();
      
      // Delete from Redis (using prefixed key)
      const redisSuccess = await redisManager.deleteSession(key);
      if (!redisSuccess) {
        this.log('warn', `Failed to delete session from Redis: ${sid}`);
      } else {
        this.log('debug', `Session deleted from Redis: ${sid}`);
      }

      // Also delete from PostgreSQL if dual-write is enabled
      if (this.dualWrite) {
        try {
          await db.delete(sessions).where(eq(sessions.sid, sid));
          this.log('debug', `Session deleted from PostgreSQL: ${sid}`);
        } catch (pgError) {
          this.log('warn', `Failed to delete session from PostgreSQL: ${sid}`, pgError);
        }
      }

      if (callback) callback(null);
    } catch (error) {
      this.log('error', `Error destroying session ${sid}:`, error);
      if (callback) callback(error);
    }
  }

  // Touch session (update expiry)
  async touch(sid: string, session: any, callback?: (err?: any) => void): Promise<void> {
    try {
      const key = this.getKey(sid);
      
      // Wait for Redis to be ready before any operations
      await redisManager.waitForReady();
      
      // Update Redis expiry (using prefixed key)
      const redisSuccess = await redisManager.setSession(key, session, this.ttl);
      if (redisSuccess) {
        this.log('debug', `Session touched in Redis: ${sid}`);
      }

      // Also update PostgreSQL if dual-write is enabled
      if (this.dualWrite) {
        try {
          const expiry = new Date(Date.now() + (this.ttl * 1000));
          await db
            .update(sessions)
            .set({ expire: expiry })
            .where(eq(sessions.sid, sid));
          this.log('debug', `Session touched in PostgreSQL: ${sid}`);
        } catch (pgError) {
          this.log('warn', `Failed to touch session in PostgreSQL: ${sid}`, pgError);
        }
      }

      if (callback) callback(null);
    } catch (error) {
      this.log('error', `Error touching session ${sid}:`, error);
      if (callback) callback(error);
    }
  }

  // Get all sessions (not typically used in production)
  async all(callback: (err?: any, sessions?: any[]) => void): Promise<void> {
    try {
      // This is an expensive operation, mainly for debugging
      this.log('warn', 'Fetching all sessions - expensive operation');
      
      if (this.readFromPg) {
        const allSessions = await db.select().from(sessions);
        const sessionData = allSessions.map(row => row.sess);
        callback(null, sessionData);
      } else {
        callback(null, []);
      }
    } catch (error) {
      this.log('error', 'Error fetching all sessions:', error);
      callback(error);
    }
  }

  // Clear all sessions
  async clear(callback?: (err?: any) => void): Promise<void> {
    try {
      this.log('warn', 'Clearing all sessions');
      
      // Note: Redis doesn't have a simple way to delete by pattern without scanning
      // This is mainly for testing/development
      
      if (this.dualWrite) {
        await db.delete(sessions);
        this.log('debug', 'All sessions cleared from PostgreSQL');
      }

      if (callback) callback(null);
    } catch (error) {
      this.log('error', 'Error clearing all sessions:', error);
      if (callback) callback(error);
    }
  }

  // Get session count
  async length(callback: (err?: any, length?: number) => void): Promise<void> {
    try {
      if (this.readFromPg) {
        const result = await db
          .select({ count: sessions.sid })
          .from(sessions);
        callback(null, result.length);
      } else {
        callback(null, 0);
      }
    } catch (error) {
      this.log('error', 'Error getting session count:', error);
      callback(error);
    }
  }

  // Health check
  async ping(): Promise<boolean> {
    try {
      return await redisManager.ping();
    } catch (error) {
      this.log('error', 'Redis session store health check failed:', error);
      return false;
    }
  }

  // Get store statistics for monitoring
  getStats(): { 
    type: string; 
    dualWrite: boolean; 
    readFromPg: boolean; 
    connectionInfo: any 
  } {
    return {
      type: 'redis-with-pg-fallback',
      dualWrite: this.dualWrite,
      readFromPg: this.readFromPg,
      connectionInfo: redisManager.getConnectionInfo(),
    };
  }

  // Migration helpers for transitioning from PG to Redis
  async enableRedisOnly(): Promise<void> {
    this.log('info', 'Switching to Redis-only mode');
    this.dualWrite = false;
    this.readFromPg = false;
  }

  async enableDualWrite(): Promise<void> {
    this.log('info', 'Enabling dual-write mode');
    this.dualWrite = true;
    this.readFromPg = true;
  }
}
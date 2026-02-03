import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { Express } from "express";
import session from "express-session";
import connectPg from "connect-pg-simple";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { storage } from "./storage";
import type { User as DbUser } from "@shared/schema";
import { resolveMarket as resolveMarketFromRequest } from "./utils/marketResolver";
import { getMarketDefaults, resolveMarket } from "@shared/config/markets";
import { RedisSessionStore } from "./redis-session-store";

type UserWithoutPassword = Omit<DbUser, 'password'>;

declare global {
  namespace Express {
    interface User extends UserWithoutPassword {}
  }
}

const scryptAsync = promisify(scrypt);

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

export async function comparePasswords(supplied: string, stored: string): Promise<boolean> {
  const [hashed, salt] = stored.split(".");
  const hashedBuf = Buffer.from(hashed, "hex");
  const suppliedBuf = (await scryptAsync(supplied, salt, 64)) as Buffer;
  return timingSafeEqual(hashedBuf, suppliedBuf);
}

export function getSession() {
  const sessionTtl = 7 * 24 * 60 * 60 * 1000; // 1 week (in milliseconds)
  const sessionTtlSeconds = Math.floor(sessionTtl / 1000); // Convert to seconds for Redis

  // Enforce session secret in production
  const sessionSecret = process.env.SESSION_SECRET;
  if (process.env.NODE_ENV === 'production' && !sessionSecret) {
    throw new Error('SESSION_SECRET environment variable is required in production');
  }

  // Check if Redis session storage is enabled (default: true)
  const useRedisSession = process.env.USE_REDIS_SESSION !== 'false';
  

  if (useRedisSession) {
    // 🚀 Redis session store with dual-write to PostgreSQL for safe migration
    const redisSessionStore = new RedisSessionStore({
      prefix: 'sess:',
      ttl: sessionTtlSeconds,
      dualWrite: true,        // Write to both Redis and PostgreSQL
      readFromPg: true,       // Fallback to PostgreSQL if not in Redis
      logLevel: 'warn', // Clean logs - only show warnings and errors
    });

    console.log(`📊 [SESSION] Store stats:`, redisSessionStore.getStats());
    
    // Wait for Redis initialization before proceeding
    // Note: This is handled asynchronously, session store will fallback gracefully

    return session({
      secret: sessionSecret || "development-secret-change-in-production",
      store: redisSessionStore,
      resave: false,
      saveUninitialized: false,
      name: 'connect.sid', // Explicit session name
      cookie: {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production', // Secure cookies in production
        maxAge: sessionTtl,
        sameSite: "lax",
        // Remove domain restriction entirely to fix session persistence
      },
    });
  } else {
    // 📄 Fallback to PostgreSQL-only session storage
    const pgStore = connectPg(session);
    const sessionStore = new pgStore({
      conString: process.env.DATABASE_URL,
      createTableIfMissing: false,
      ttl: sessionTtlSeconds, // Use seconds for PostgreSQL TTL
      tableName: "sessions",
    });


    return session({
      secret: sessionSecret || "development-secret-change-in-production",
      store: sessionStore,
      resave: false,
      saveUninitialized: false,
      name: 'connect.sid', // Explicit session name
      cookie: {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production', // Secure cookies in production
        maxAge: sessionTtl,
        sameSite: "lax",
        // Remove domain restriction entirely to fix session persistence
      },
    });
  }
}

export function setupAuth(app: Express) {
  app.set("trust proxy", 1);
  app.use(getSession());
  app.use(passport.initialize());
  app.use(passport.session());

  // Local strategy for email/password authentication
  passport.use(
    new LocalStrategy(
      {
        usernameField: "email",
        passwordField: "password",
      },
      async (email, password, done) => {
        try {
          console.log("🔐 Login attempt for email:", email);
          const user = await storage.getUserByEmail(email);
          
          if (!user) {
            console.log("❌ User not found:", email);
            return done(null, false, { message: "Invalid email or password" });
          }
          
          if (!user.password) {
            console.log("❌ User has no password:", email);
            return done(null, false, { message: "Invalid email or password" });
          }
          
          console.log("🔍 Comparing passwords for:", email);
          console.log("  - Input password length:", password.length);
          console.log("  - Stored hash length:", user.password.length);
          
          const isValid = await comparePasswords(password, user.password);
          console.log("  - Password valid:", isValid);
          
          if (!isValid) {
            console.log("❌ Invalid password for:", email);
            return done(null, false, { message: "Invalid email or password" });
          }

          console.log("✅ Login successful for:", email);
          // Remove password from user object before returning
          const { password: _, ...userWithoutPassword } = user;
          return done(null, userWithoutPassword);
        } catch (error) {
          console.error("❌ Login error:", error);
          return done(error);
        }
      }
    )
  );

  // Google OAuth strategy - uses dynamic callback URL based on request
  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID!,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
        callbackURL: "/api/auth/google/callback", // Relative URL - passport constructs full URL from request domain
        passReqToCallback: false,
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          const email = profile.emails?.[0]?.value;
          if (!email) {
            return done(new Error("No email found in Google profile"));
          }

          // Check if user already exists
          let user = await storage.getUserByEmail(email);
          
          if (user) {
            // User exists, log them in
            const { password: _, ...userWithoutPassword } = user;
            return done(null, userWithoutPassword);
          } else {
            // Create new user with market-appropriate defaults
            // Default to US market - will be corrected on first app load via market detection
            const marketDefaults = getMarketDefaults(resolveMarket('us'));

            const newUser = await storage.createUser({
              email,
              firstName: profile.name?.givenName || "",
              lastName: profile.name?.familyName || "",
              subscriptionTier: "free",
              locale: marketDefaults.locale,
              currency: marketDefaults.currency,
              weightUnit: marketDefaults.weightUnit,
              heightUnit: marketDefaults.heightUnit,
              timezone: marketDefaults.timezone,
              emailVerified: true, // Google emails are pre-verified by Google
              // No password needed for OAuth users
            });
            
            const { password: _, ...userWithoutPassword } = newUser;
            return done(null, userWithoutPassword);
          }
        } catch (error) {
          return done(error);
        }
      }
    )
  );

  passport.serializeUser((user, done) => {
    done(null, user.id);
  });

  passport.deserializeUser(async (id: string, done) => {
    try {
      const user = await storage.getUser(id);
      if (user) {
        const { password: _, ...userWithoutPassword } = user;
        return done(null, userWithoutPassword);
      } else {
        return done(null, null); // Return null instead of false for proper session cleanup
      }
    } catch (error) {
      console.error("User deserialization error:", error);
      return done(error);
    }
  });

  // Register endpoint
  app.post("/api/auth/register", async (req, res) => {
    try {
      const { email, password, firstName, lastName } = req.body;

      if (!email || !password) {
        return res.status(400).json({ message: "Email and password are required" });
      }

      // Check if user already exists
      const existingUser = await storage.getUserByEmail(email);
      if (existingUser) {
        return res.status(400).json({ message: "User with this email already exists" });
      }

      // Detect market from request and get appropriate defaults
      const market = resolveMarketFromRequest(req);
      const marketDefaults = getMarketDefaults(market);
      

      // Hash password and create user with market-appropriate defaults
      const hashedPassword = await hashPassword(password);
      const user = await storage.createUser({
        email,
        password: hashedPassword,
        firstName: firstName || "",
        lastName: lastName || "",
        subscriptionTier: "free",
        locale: marketDefaults.locale,
        currency: marketDefaults.currency,
        weightUnit: marketDefaults.weightUnit,
        heightUnit: marketDefaults.heightUnit,
        timezone: marketDefaults.timezone,
      });

      // Log the user in and force session save
      req.login(user, (err) => {
        if (err) {
          return res.status(500).json({ message: "Error logging in user" });
        }
        // Force session save to ensure persistence
        req.session.save((saveErr) => {
          if (saveErr) {
            console.error("Session save error:", saveErr);
            return res.status(500).json({ message: "Error saving session" });
          }
          const { password: _, ...userWithoutPassword } = user;
          res.status(201).json(userWithoutPassword);
        });
      });
    } catch (error) {
      console.error("Registration error:", error);
      res.status(500).json({ message: "Error creating user" });
    }
  });

  // Login endpoint
  app.post("/api/auth/login", (req, res, next) => {
    passport.authenticate("local", (err: any, user: any, info: any) => {
      if (err) {
        return res.status(500).json({ message: "Authentication error" });
      }
      if (!user) {
        return res.status(401).json({ message: info?.message || "Invalid credentials" });
      }
      req.login(user, (err) => {
        if (err) {
          return res.status(500).json({ message: "Error logging in" });
        }
        // Force session save to ensure persistence
        req.session.save((saveErr) => {
          if (saveErr) {
            console.error("Session save error:", saveErr);
            return res.status(500).json({ message: "Error saving session" });
          }
          res.json(user);
        });
      });
    })(req, res, next);
  });

  // Logout endpoint (POST for API calls)
  app.post("/api/auth/logout", (req, res) => {
    req.logout((err) => {
      if (err) {
        return res.status(500).json({ message: "Error logging out" });
      }
      res.json({ message: "Logged out successfully" });
    });
  });

  // Logout endpoint (GET for direct browser navigation)
  app.get("/api/logout", (req, res) => {
    req.logout((err) => {
      if (err) {
        console.error("Logout error:", err);
      }
      // Always redirect to landing page after logout
      res.redirect("/");
    });
  });

  // Get current user endpoint
  app.get("/api/auth/user", (req, res) => {
    if (req.isAuthenticated()) {
      res.json(req.user);
    } else {
      res.status(401).json({ message: "Unauthorized" });
    }
  });

  // Debug endpoint to check OAuth configuration
  app.get("/api/auth/google/debug", (req, res) => {
    res.json({
      clientId: process.env.GOOGLE_CLIENT_ID?.substring(0, 20) + "...",
      callbackUrl: process.env.REPLIT_DEV_DOMAIN 
        ? `https://${process.env.REPLIT_DEV_DOMAIN}/api/auth/google/callback`
        : `https://weight-wise-opalheads.replit.app/api/auth/google/callback`,
      environment: process.env.NODE_ENV,
      domain: process.env.REPLIT_DEV_DOMAIN
    });
  });

  // Google OAuth routes
  app.get("/api/auth/google", 
    (req, res, next) => {
      const currentHost = req.get('host');
      
      console.log("=== GOOGLE OAUTH INITIATION ===");
      console.log("Current Host:", currentHost);
      console.log("Session ID before OAuth:", req.sessionID);
      console.log("==============================");
      
      passport.authenticate("google", { 
        scope: ["profile", "email"]
      })(req, res, next);
    }
  );

  app.get("/api/auth/google/callback",
    (req, res, next) => {
      console.log("=== GOOGLE CALLBACK RECEIVED ===");
      console.log("Query params:", req.query);
      console.log("Error param:", req.query.error);
      console.log("Code param:", req.query.code ? "present" : "missing");
      console.log("Session ID at callback:", req.sessionID);
      console.log("================================");
      next();
    },
    (req, res, next) => {
      passport.authenticate("google", (err: any, user: any, info: any) => {
        console.log("=== GOOGLE AUTH CALLBACK RESULT ===");
        console.log("Error:", err);
        if (process.env.NODE_ENV === 'development') {
          console.log("User:", user ? user.email : "NO USER");
        }
        if (process.env.NODE_ENV === 'development') {
          console.log("Info:", info);
        }
        console.log("==================================");
        
        if (err) {
          console.error("🔧 GOOGLE AUTH ERROR:", err);
          return res.redirect(`/auth?error=${encodeURIComponent(err.message)}`);
        }
        if (!user) {
          console.error("🔧 GOOGLE AUTH FAILED - No user returned:", info);
          return res.redirect("/auth?error=google_auth_failed");
        }
        
        req.logIn(user, (loginErr: any) => {
          if (loginErr) {
            console.error("🔧 GOOGLE AUTH LOGIN ERROR:", loginErr);
            return res.redirect(`/auth?error=${encodeURIComponent(loginErr.message)}`);
          }
          
          if (process.env.NODE_ENV === 'development') {
          }
          
          // Force session save before redirect
          req.session.save((saveErr) => {
            if (saveErr) {
              console.error("🔧 GOOGLE AUTH ERROR - Session save failed:", saveErr);
              return res.redirect("/auth?error=session_save_failed");
            }
            return res.redirect("/");
          });
        });
      })(req, res, next);
    }
  );



  // Apple OAuth endpoints are handled in appleAuth.ts

  // X (Twitter) OAuth endpoints are handled in twitterAuth.ts
}

export const isAuthenticated = (req: any, res: any, next: any) => {
  if (req.isAuthenticated()) {
    return next();
  }
  
  res.status(401).json({ message: "Unauthorized" });
};
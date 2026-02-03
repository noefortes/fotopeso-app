import passport from "passport";
import { Strategy as FacebookStrategy } from "passport-facebook";
import type { Express } from "express";
import { storage } from "./storage";
import { getMarketDefaults, resolveMarket } from "@shared/config/markets";

const getFacebookConfig = () => ({
  appId: process.env.FACEBOOK_APP_ID,
  appSecret: process.env.FACEBOOK_APP_SECRET,
});

export function setupFacebookAuth(app: Express) {
  const config = getFacebookConfig();
  
  if (!config.appId || !config.appSecret) {
    console.log('Facebook OAuth not configured - missing credentials');
    return;
  }

  // Configure Facebook Strategy
  passport.use(
    new FacebookStrategy(
      {
        clientID: config.appId,
        clientSecret: config.appSecret,
        callbackURL: "/api/auth/facebook/callback", // Relative URL - passport will construct full URL from request
        profileFields: ['id', 'emails', 'name']
        // scope: ['email'] // Requires App Review - using without email for now
      },
      async (accessToken: string, refreshToken: string, profile: any, done: any) => {
        try {
          if (process.env.NODE_ENV === 'development') {
            console.log("=== FACEBOOK AUTH PROFILE ===");
            console.log("Profile ID:", profile.id);
            console.log("Profile emails:", profile.emails);
            console.log("Profile name:", profile.name);
            console.log("===============================");
          }

          const facebookId = profile.id;
          let email = profile.emails?.[0]?.value;
          const isRealEmail = !!email;
          
          // First, try to find user by Facebook ID
          let existingUser = await storage.getUserByFacebookId(facebookId);
          
          if (existingUser) {
            
            // If we got a real email from Facebook and user doesn't have one, update it safely
            if (isRealEmail && existingUser.email?.includes('@scanmyscale.temp')) {
              // Check if another user already has this email
              const emailConflict = await storage.getUserByEmail(email);
              if (emailConflict && emailConflict.id !== existingUser.id) {
                console.error("🔧 FACEBOOK AUTH ERROR - Email conflict with existing user:", process.env.NODE_ENV === 'development' ? email : '[email conflict]');
                // Keep the temp email to avoid conflicts
              } else {
                existingUser = await storage.updateUserEmailVerified(existingUser.id, email, true);
              }
            }
            
            return done(null, existingUser);
          }
          
          // If no email from Facebook, generate one
          if (!email) {
            email = `facebook_${facebookId}@scanmyscale.temp`;
          }
          
          // Check if a user with this email already exists (from previous email/password signup)
          const existingEmailUser = await storage.getUserByEmail(email);
          
          if (existingEmailUser) {
            if (!existingEmailUser.facebookId) {
              // Link this Facebook account to the existing email account
              existingUser = await storage.linkFacebookId(existingEmailUser.id, facebookId);
              // Update email verification status if we got a real email
              if (isRealEmail) {
                existingUser = await storage.updateUserEmailVerified(existingUser.id, email, true);
              }
              return done(null, existingUser);
            } else if (existingEmailUser.facebookId === facebookId) {
              // Same Facebook user, just return them
              return done(null, existingEmailUser);
            } else {
              // Email conflict: different Facebook ID owns this email
              console.error("🔧 FACEBOOK AUTH ERROR - Email already owned by different Facebook account");
              return done(new Error("Email already associated with another Facebook account"), null);
            }
          }
          
          // Create new user with Facebook ID and market-appropriate defaults
          // Default to US market - will be corrected on first app load via market detection
          const marketDefaults = getMarketDefaults(resolveMarket('us'));

          existingUser = await storage.createUser({
            email: email,
            facebookId: facebookId,
            emailVerified: isRealEmail,
            firstName: profile.name?.givenName || '',
            lastName: profile.name?.familyName || '',
            profileImageUrl: profile.photos?.[0]?.value || null,
            password: null, // No password for OAuth users
            subscriptionTier: 'free',
            locale: marketDefaults.locale,
            currency: marketDefaults.currency,
            weightUnit: marketDefaults.weightUnit,
            heightUnit: marketDefaults.heightUnit,
            timezone: marketDefaults.timezone,
          });
          
          return done(null, existingUser);
        } catch (error) {
          console.error("🔧 FACEBOOK AUTH ERROR:", error);
          return done(error, null);
        }
      }
    )
  );

  // Facebook OAuth initiation
  app.get('/api/auth/facebook', (req, res, next) => {
    if (process.env.NODE_ENV === 'development') {
      console.log("=== FACEBOOK OAUTH INITIATION ===");
      console.log("App ID:", config.appId?.substring(0, 10) + "...");
      console.log("Current Host:", req.get('host'));
      console.log("Expected Callback URL:", `${req.protocol}://${req.get('host')}/api/auth/facebook/callback`);
      console.log("Environment:", process.env.NODE_ENV);
      console.log("Session ID before OAuth:", req.sessionID);
      console.log("==================================");
    }
    
    passport.authenticate('facebook')(req, res, next);
    // Note: email scope requires App Review - using basic profile for now
  });

  // Facebook OAuth callback
  app.get('/api/auth/facebook/callback', 
    (req, res, next) => {
      console.log("📘 FACEBOOK AUTH CALLBACK - Starting authentication");
      if (process.env.NODE_ENV === 'development') {
        console.log("📘 FACEBOOK AUTH CALLBACK - Query:", req.query);
        console.log("📘 FACEBOOK AUTH CALLBACK - Session ID:", req.sessionID);
        console.log("📘 FACEBOOK AUTH CALLBACK - Host:", req.get('host'));
      }
      
      if (req.query.error) {
        if (process.env.NODE_ENV === 'development') {
          console.error("📘 FACEBOOK AUTH ERROR from provider:", req.query);
        } else {
          console.error("📘 FACEBOOK AUTH ERROR from provider:", req.query.error);
        }
        return res.redirect(`/auth?error=facebook_${req.query.error}`);
      }
      
      passport.authenticate('facebook', {
        failureRedirect: '/auth?error=facebook_auth_failed',
        session: true
      })(req, res, next);
    },
    async (req, res, next) => {
      try {
        
        if (!req.user) {
          console.error("🔧 FACEBOOK AUTH ERROR - No user in request after authentication");
          return res.redirect("/auth?error=no_user_data");
        }
        
        const user = req.user as any;
        
        req.logIn(user, (loginErr: any) => {
          if (loginErr) {
            console.error("🔧 FACEBOOK AUTH LOGIN ERROR:", loginErr);
            return res.redirect(`/auth?error=${encodeURIComponent(loginErr.message)}`);
          }
          
          if (process.env.NODE_ENV === 'development') {
          }
          
          // Force session save before redirect
          req.session.save((saveErr) => {
            if (saveErr) {
              console.error("🔧 FACEBOOK AUTH ERROR - Session save failed:", saveErr);
              return res.redirect("/auth?error=session_save_failed");
            }
            return res.redirect("/");
          });
        });
      } catch (error) {
        console.error("🔧 FACEBOOK AUTH CALLBACK ERROR:", error);
        return res.redirect("/auth?error=callback_error");
      }
    }
  );

  console.log('Facebook Sign-In routes configured');
}
import passport from "passport";
import { Strategy as TwitterOAuth2Strategy } from "@superfaceai/passport-twitter-oauth2";
import type { Express } from "express";
import { storage } from "./storage";
import { getMarketDefaults, resolveMarket } from "@shared/config/markets";

const getTwitterConfig = () => ({
  clientID: process.env.X_CLIENT_ID,
  clientSecret: process.env.X_CLIENT_SECRET,
});

export function setupTwitterAuth(app: Express) {
  const config = getTwitterConfig();
  
  if (!config.clientID || !config.clientSecret) {
    console.log('X (Twitter) OAuth 2.0 not configured - missing credentials');
    return;
  }

  // Configure X (Twitter) OAuth 2.0 Strategy with PKCE
  passport.use(
    new TwitterOAuth2Strategy(
      {
        clientID: config.clientID,
        clientSecret: config.clientSecret,
        clientType: 'confidential', // Required for server-side OAuth 2.0 flows
        callbackURL: "/api/auth/twitter/callback", // Relative URL - passport will construct full URL from request
        scope: ['tweet.read', 'users.read'], // Minimal scopes for user identification
        state: true, // Enable state parameter for security
        pkce: true, // Enable PKCE for enhanced security
      },
      async (accessToken: string, refreshToken: string, profile: any, done: any) => {
        try {
          if (process.env.NODE_ENV === 'development') {
            console.log("=== X (TWITTER) OAUTH 2.0 PROFILE ===");
            console.log("Profile ID:", profile.id);
            console.log("Profile username:", profile.username);
            console.log("Profile display name:", profile.displayName);
            console.log("Profile email:", profile.email); // May not be available in OAuth 2.0
            console.log("====================================");
          }

          const twitterId = profile.id;
          if (!twitterId) {
            return done(new Error("No Twitter ID provided"), null);
          }

          // Look up user by Twitter ID first
          let existingUser = await storage.getUserByTwitterId(twitterId);
          
          if (!existingUser) {
            // If no user found by Twitter ID, check by email (if available)
            if (profile.email) {
              existingUser = await storage.getUserByEmail(profile.email);
              
              if (existingUser) {
                // Link existing email account with Twitter ID
                existingUser = await storage.updateUserByAdmin(existingUser.id, {
                  twitterId: twitterId,
                  emailVerified: true, // X provides verified data
                });
              }
            }
            
            if (!existingUser) {
              // Parse name from displayName
              const displayName = profile.displayName || profile.username || '';
              const nameParts = displayName.split(' ');
              const firstName = nameParts[0] || '';
              const lastName = nameParts.slice(1).join(' ') || '';

              // Create new user with Twitter ID and market-appropriate defaults
              // Default to US market - will be corrected on first app load via market detection
              const marketDefaults = getMarketDefaults(resolveMarket('us'));

              existingUser = await storage.createUser({
                email: profile.email || null, // Email may not be available
                firstName: firstName,
                lastName: lastName,
                subscriptionTier: 'free',
                locale: marketDefaults.locale,
                currency: marketDefaults.currency,
                weightUnit: marketDefaults.weightUnit,
                heightUnit: marketDefaults.heightUnit,
                timezone: marketDefaults.timezone,
                emailVerified: !!profile.email, // Only verified if email provided
                twitterId: twitterId, // Store Twitter ID for future lookups
                // No password needed for OAuth users
              });
              
              if (process.env.NODE_ENV === 'development') {
              } else {
              }
            }
          } else {
            if (process.env.NODE_ENV === 'development') {
            } else {
            }
          }

          return done(null, existingUser);
        } catch (error) {
          console.error("🔧 X (TWITTER) AUTH ERROR:", error);
          return done(error, null);
        }
      }
    )
  );

  // X (Twitter) OAuth 2.0 initiation
  app.get('/api/auth/twitter', (req, res, next) => {
    if (process.env.NODE_ENV === 'development') {
      console.log("=== X (TWITTER) OAUTH 2.0 INITIATION ===");
      console.log("Client ID:", config.clientID?.substring(0, 10) + "...");
      console.log("Current Host:", req.get('host'));
      console.log("Expected Callback URL:", `${req.protocol}://${req.get('host')}/api/auth/twitter/callback`);
      console.log("Environment:", process.env.NODE_ENV);
      console.log("Session ID before OAuth:", req.sessionID);
      console.log("========================================");
    }
    
    passport.authenticate('twitter')(req, res, next);
  });

  // X (Twitter) OAuth 2.0 callback
  app.get('/api/auth/twitter/callback', 
    passport.authenticate('twitter', {
      failureRedirect: '/auth?error=twitter_auth_failed',
      session: true
    }),
    async (req, res, next) => {
      try {
        
        if (!req.user) {
          console.error("🔧 X (TWITTER) AUTH ERROR - No user in request after authentication");
          return res.redirect("/auth?error=no_user_data");
        }
        
        const user = req.user as any;
        if (process.env.NODE_ENV === 'development') {
        }
        
        req.logIn(user, (loginErr: any) => {
          if (loginErr) {
            console.error("🔧 X (TWITTER) AUTH LOGIN ERROR:", loginErr);
            return res.redirect(`/auth?error=${encodeURIComponent(loginErr.message)}`);
          }
          
          if (process.env.NODE_ENV === 'development') {
          }
          
          // Force session save before redirect
          req.session.save((saveErr) => {
            if (saveErr) {
              console.error("🔧 X (TWITTER) AUTH ERROR - Session save failed:", saveErr);
              return res.redirect("/auth?error=session_save_failed");
            }
            return res.redirect("/");
          });
        });
      } catch (error) {
        console.error("🔧 X (TWITTER) OAUTH 2.0 CALLBACK ERROR:", error);
        return res.redirect("/auth?error=callback_error");
      }
    }
  );

  console.log('X (Twitter) OAuth 2.0 routes configured');
}
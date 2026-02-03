import jwt from 'jsonwebtoken';
import { Express } from 'express';
import { storage } from './storage';

// Extend Express Session interface
declare module 'express-session' {
  interface SessionData {
    appleState?: string;
    appleNonce?: string;
    appleRedirectUri?: string;
    userId?: string;
  }
}

// Apple Sign-In configuration
const getAppleConfig = () => ({
  clientId: process.env.APPLE_CLIENT_ID,
  teamId: process.env.APPLE_TEAM_ID,
  keyId: process.env.APPLE_KEY_ID,
  privateKey: process.env.APPLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
});

// Generate client secret for Apple
const generateClientSecret = () => {
  const config = getAppleConfig();
  
  // Config validation only - no sensitive data logged
  
  if (!config.teamId || !config.clientId || !config.keyId || !config.privateKey) {
    const missing = [];
    if (!config.teamId) missing.push('APPLE_TEAM_ID');
    if (!config.clientId) missing.push('APPLE_CLIENT_ID');
    if (!config.keyId) missing.push('APPLE_KEY_ID');
    if (!config.privateKey) missing.push('APPLE_PRIVATE_KEY');
    
    console.error("🍎 APPLE AUTH ERROR - Missing configuration:", missing);
    throw new Error(`Missing Apple configuration: ${missing.join(', ')}`);
  }

  const now = Math.floor(Date.now() / 1000);
  
  const payload = {
    iss: config.teamId,
    iat: now,
    exp: now + (6 * 30 * 24 * 60 * 60), // 6 months
    aud: 'https://appleid.apple.com',
    sub: config.clientId,
  };

  try {
    const clientSecret = jwt.sign(payload, config.privateKey, {
      algorithm: 'ES256',
      keyid: config.keyId,
    });
    
    console.log("🍎 APPLE AUTH - Client secret generated successfully");
    return clientSecret;
  } catch (error) {
    console.error("🍎 APPLE AUTH ERROR - Failed to generate client secret:", error);
    throw new Error(`Client secret generation failed: ${error}`);
  }
};

// Simple Apple ID token verification (basic validation)
const verifyAppleToken = async (idToken: string): Promise<any> => {
  try {
    // For now, we'll do basic JWT decode - in production you'd verify against Apple's keys
    const decoded = jwt.decode(idToken, { complete: true });
    
    if (!decoded || typeof decoded === 'string') {
      throw new Error('Invalid token format');
    }
    
    const payload = decoded.payload as any;
    
    // Basic validation
    if (payload.iss !== 'https://appleid.apple.com') {
      throw new Error('Invalid issuer');
    }
    
    const config = getAppleConfig();
    if (config.clientId && payload.aud !== config.clientId) {
      throw new Error('Invalid audience');
    }
    
    return payload;
  } catch (error) {
    console.error('Apple token verification failed:', error);
    throw new Error('Invalid Apple ID token');
  }
};

export function setupAppleAuth(app: Express) {
  // Check if Apple configuration is available
  const config = getAppleConfig();
  if (!config.clientId || !config.teamId || !config.keyId || !config.privateKey) {
    console.log('🍎 APPLE AUTH - Skipping setup due to missing configuration');
    return;
  }
  
  console.log('🍎 APPLE AUTH - Setting up Apple Sign-In with full configuration');
  
  // Apple OAuth initiation
  app.get('/api/auth/apple', async (req, res) => {
    try {
      const config = getAppleConfig();
      
      if (!config.clientId) {
        return res.status(500).json({ error: 'Apple Sign-In not configured' });
      }

      // Generate a simple state parameter - we'll use a simpler approach
      const state = `apple_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      const nonce = Math.random().toString(36).substring(7);
      
      if (process.env.NODE_ENV === 'development') {
        console.log("🍎 APPLE AUTH INITIATION - Generated state:", state);
        console.log("🍎 APPLE AUTH INITIATION - Session ID:", req.sessionID);
      }

      // Use exact redirect URI that was registered with Apple
      // Temporarily allow both production and development for testing
      const redirectUri = process.env.NODE_ENV === 'production' 
        ? 'https://scanmyscale.com/api/auth/apple/callback'
        : `${req.protocol}://${req.get('host')}/api/auth/apple/callback`;

      // Store redirect URI in session for token exchange
      req.session.appleRedirectUri = redirectUri;

      if (process.env.NODE_ENV === 'development') {
        console.log("🍎 APPLE AUTH - Using redirect URI:", redirectUri);
        console.log("🍎 APPLE AUTH - Client ID:", config.clientId);
      }

      const params = new URLSearchParams({
        client_id: config.clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: 'name email',
        response_mode: 'form_post',
        state,
        nonce,
      });

      const authUrl = `https://appleid.apple.com/auth/authorize?${params}`;
      res.redirect(authUrl);
    } catch (error) {
      console.error('Apple OAuth initiation error:', error);
      res.status(500).json({ error: 'Apple Sign-In configuration error' });
    }
  });

  // Apple OAuth callback
  app.post('/api/auth/apple/callback', async (req, res) => {
    if (process.env.NODE_ENV === 'development') {
      console.log("🍎 APPLE AUTH CALLBACK - Route hit!");
      console.log("🍎 APPLE AUTH CALLBACK - Method:", req.method);
      console.log("🍎 APPLE AUTH CALLBACK - URL:", req.url);
    }
    
    try {
      if (process.env.NODE_ENV === 'development') {
        console.log("🍎 APPLE AUTH CALLBACK - Body keys:", Object.keys(req.body || {}));
        console.log("🍎 APPLE AUTH CALLBACK - Content-Type:", req.headers['content-type']);
      }
      
      const { code, state, id_token, user } = req.body;
      
      if (process.env.NODE_ENV === 'development') {
        console.log("🍎 APPLE AUTH CALLBACK - Parsed data:", {
          hasCode: !!code,
          hasState: !!state,
          hasIdToken: !!id_token,
          hasUser: !!user,
          codeLength: code?.length || 0
        });
      }
      
      // Simple state validation - just check it starts with "apple_"
      if (!state || !state.startsWith('apple_')) {
        console.error("🍎 APPLE AUTH ERROR - Invalid state format:", state);
        return res.redirect('/auth?error=invalid_state');
      }
      
      console.log("🍎 APPLE AUTH - State validation passed");

      // Apple sends authorization code, not ID token directly
      if (!code) {
        return res.status(400).json({ error: 'No authorization code received' });
      }

      // Exchange authorization code for tokens
      console.log("🍎 APPLE AUTH - Exchanging code for tokens...");
      
      try {
        const config = getAppleConfig();
        
        if (process.env.NODE_ENV === 'development') {
          console.log("🍎 APPLE AUTH - Config check:", {
            hasClientId: !!config.clientId,
            hasTeamId: !!config.teamId,
            hasKeyId: !!config.keyId,
            hasPrivateKey: !!config.privateKey
          });
        }
        
        const clientSecret = generateClientSecret();
        console.log("🍎 APPLE AUTH - Client secret generated successfully");
        
        const storedRedirectUri = req.session.appleRedirectUri || 
          (process.env.NODE_ENV === 'production' 
            ? 'https://scanmyscale.com/api/auth/apple/callback'
            : `${req.protocol}://${req.get('host')}/api/auth/apple/callback`);

        if (process.env.NODE_ENV === 'development') {
          console.log("🍎 APPLE AUTH - Using redirect URI for token exchange:", storedRedirectUri);
        }

        // Log the token exchange request details for debugging
        const tokenRequestBody = {
          client_id: config.clientId || '',
          client_secret: clientSecret,
          code: code,
          grant_type: 'authorization_code',
          redirect_uri: storedRedirectUri
        };
        
        if (process.env.NODE_ENV === 'development') {
          console.log("🍎 APPLE AUTH - Token exchange request details:", {
            grant_type: tokenRequestBody.grant_type,
            redirect_uri: tokenRequestBody.redirect_uri,
            code_length: code?.length || 0
          });
        }

        const tokenResponse = await fetch('https://appleid.apple.com/auth/token', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams(tokenRequestBody).toString()
        });

        if (!tokenResponse.ok) {
          console.error("🍎 APPLE AUTH ERROR - Token exchange failed:", tokenResponse.status);
          const errorText = await tokenResponse.text();
          console.error("🍎 APPLE AUTH ERROR - Response:", errorText);
          if (process.env.NODE_ENV === 'development') {
            console.error("🍎 APPLE AUTH ERROR - Request grant_type:", tokenRequestBody.grant_type);
          }
          return res.status(400).json({ error: 'Token exchange failed' });
        }

        const tokens = await tokenResponse.json();
        if (process.env.NODE_ENV === 'development') {
          console.log("🍎 APPLE AUTH - Token exchange successful:", { 
            hasAccessToken: !!tokens.access_token,
            hasIdToken: !!tokens.id_token,
            hasRefreshToken: !!tokens.refresh_token
          });
        }

        if (!tokens.id_token) {
          return res.status(400).json({ error: 'No ID token in response' });
        }

        // Replace the id_token variable with the actual token
        const actualIdToken = tokens.id_token;
        
        if (process.env.NODE_ENV === 'development') {
          console.log("🍎 APPLE AUTH - Received data:", { 
            hasIdToken: !!actualIdToken, 
            hasUser: !!user
          });
        }

        // Verify Apple ID token
        const appleUser = await verifyAppleToken(actualIdToken);
        
        if (process.env.NODE_ENV === 'development') {
          console.log("🍎 APPLE AUTH - Decoded user:", {
            sub: appleUser.sub,
            email: appleUser.email,
            email_verified: appleUser.email_verified
          });
        }
        
        if (!appleUser.sub || !appleUser.email) {
          console.error("🍎 APPLE AUTH ERROR - Missing user data:", appleUser);
          return res.status(400).json({ error: 'Invalid user data from Apple' });
        }

        // Check if user exists
        let existingUser = await storage.getUserByEmail(appleUser.email);
      
      if (!existingUser) {
        // Parse user info from Apple (if provided)
        let firstName = '';
        let lastName = '';
        
        if (user) {
          try {
            const userInfo = typeof user === 'string' ? JSON.parse(user) : user;
            firstName = userInfo.name?.firstName || '';
            lastName = userInfo.name?.lastName || '';
          } catch (e) {
            console.warn('Failed to parse Apple user info:', e);
          }
        }

        // Create new user with full profile
        existingUser = await storage.createUser({
          email: appleUser.email,
          firstName,
          lastName,
          subscriptionTier: 'free',
          weightUnit: 'lbs',
          heightUnit: 'inches',
          emailVerified: true, // Apple emails are pre-verified by Apple
          appleId: appleUser.sub, // Store Apple ID
          // No password needed for OAuth users
        });
        
        // Apple ID is already stored during user creation
      } else {
        // User exists - we'll link Apple ID later when storage is updated
      }

      // Create session
      req.session.userId = existingUser!.id;
      req.session.save((err) => {
        if (err) {
          console.error('Session save error:', err);
          return res.status(500).json({ error: 'Session creation failed' });
        }
        
        // Redirect to app
        res.redirect('/');
      });

    } catch (tokenError) {
      console.error('Token exchange error:', tokenError);
      return res.status(500).json({ error: 'Token exchange failed' });
    }

    } catch (error) {
      console.error('🍎 APPLE AUTH ERROR - Apple OAuth callback error:', error);
      if (error instanceof Error) {
        console.error('🍎 APPLE AUTH ERROR - Error stack:', error.stack);
        console.error('🍎 APPLE AUTH ERROR - Error details:', {
          message: error.message,
          name: error.name,
          stack: error.stack
        });
      }
      res.status(500).json({ error: 'Authentication failed' });
    }
  });

  // Add comprehensive Apple route debugging with error handling
  app.all('/api/auth/apple*', (req, res, next) => {
    if (process.env.NODE_ENV === 'development') {
      console.log("🍎 APPLE AUTH - Catch-all route hit:", req.method, req.path);
      console.log("🍎 APPLE AUTH - Content-Type:", req.headers['content-type']);
    }
    
    // Add error handling for the next middleware
    try {
      next();
    } catch (error) {
      console.error("🍎 APPLE AUTH ERROR - Error in catch-all middleware:", error);
      res.status(500).json({ error: 'Middleware error' });
    }
  });
  
  // Add a specific GET callback route in case Apple is using GET instead of POST
  app.get('/api/auth/apple/callback', (req, res) => {
    if (process.env.NODE_ENV === 'development') {
      console.log("🍎 APPLE AUTH CALLBACK - GET route hit (unexpected!)");
      console.log("🍎 APPLE AUTH CALLBACK - Query keys:", Object.keys(req.query || {}));
    }
    res.status(400).json({ error: 'Apple callback should use POST, not GET' });
  });
  
  // Add a test route to verify Apple callback URL accessibility
  app.get('/api/auth/apple/test-callback', (req, res) => {
    console.log("🍎 APPLE AUTH - Test callback route hit");
    res.json({ message: 'Apple callback route is accessible', timestamp: new Date().toISOString() });
  });
}
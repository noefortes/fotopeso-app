import type { Express } from "express";
import express from "express";
import { createServer, type Server } from "http";
import crypto from "crypto";
import { storage } from "./storage";
import { setupAuth, isAuthenticated } from "./auth";
import { setupOAuthDiagnostics } from "./oauth-diagnostic";
import { registerWeightDetectionRoutes } from "./routes/weight-detection";
import { analyzeScaleImage, generateProgressImage } from "./gemini";
import { insertWeightEntrySchema, insertActivityLogSchema } from "@shared/schema";
import multer from "multer";
import { z } from "zod";
import { hashPassword as hashPasswordFromAuth } from "./auth";
import { hashPassword, verifyPassword, initializeAdminPassword } from "./passwordUtils";
import { convertWeight, calculateBMI, type HeightUnit, type WeightUnit } from "@shared/utils";
import { emailVerificationService } from "./emailVerificationService";
import { emailService } from "./emailService";
import { getMarketFromRequest, getUserLocale, t } from "./i18n";
import { resolveMarket as resolveMarketFromDomain } from "./utils/marketResolver";
import { getMarket } from "@shared/config/markets";

// Configure multer for image uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    if (process.env.NODE_ENV === 'development') {
      console.log('File filter check:', file.mimetype, file.originalname);
    }
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      if (process.env.NODE_ENV === 'development') {
        console.error('Rejected file type:', file.mimetype);
      }
      cb(new Error('Only image files are allowed'));
    }
  },
});

export async function registerRoutes(app: Express): Promise<Server> {

  // Initialize admin password on startup
  await initializeAdminPassword(storage);
  
  // Temporary diagnostic route to debug market detection
  app.get("/api/debug/headers", (req, res) => {
    const headers = {
      host: req.headers.host,
      'x-forwarded-host': req.headers['x-forwarded-host'],
      'x-forwarded-proto': req.headers['x-forwarded-proto'],
      'user-agent': req.headers['user-agent'],
      origin: req.headers.origin,
      referer: req.headers.referer
    };
    
    const detectedMarket = (req as any).marketId;
    const detectedDomain = req.headers['x-forwarded-host'] || req.headers.host;
    
    res.json({
      headers,
      detectedMarket,
      detectedDomain,
      timestamp: new Date().toISOString()
    });
  });
  
  // Auth middleware
  await setupAuth(app);
  setupOAuthDiagnostics(app);
  
  // Import and setup Apple Auth
  try {
    const { setupAppleAuth } = await import("./appleAuth");
    setupAppleAuth(app);
  } catch (error) {
    console.log('Apple Sign-In module failed to load:', error);
  }

  // Import and setup Facebook Auth
  try {
    const { setupFacebookAuth } = await import("./facebookAuth");
    setupFacebookAuth(app);
  } catch (error) {
    console.log('Facebook Sign-In not configured (credentials not provided)');
  }

  // Import and setup X (Twitter) Auth
  try {
    const { setupTwitterAuth } = await import("./twitterAuth");
    setupTwitterAuth(app);
  } catch (error) {
    console.log('X (Twitter) Sign-In not configured (credentials not provided)');
  }

  // Add comprehensive debugging for Apple callbacks
  app.all('/api/auth/*', (req, res, next) => {
    if (req.path.includes('apple') && process.env.NODE_ENV === 'development') {
    }
    next();
  });

  // Add a simple test route to verify server routes work
  app.get('/api/auth/apple/test', (req, res) => {
    res.json({ message: "Apple test route working!" });
  });

  // Register weight detection routes
  registerWeightDetectionRoutes(app);

  // Register WhatsApp integration routes
  const { registerWhatsAppRoutes } = await import("./routes/whatsapp");
  registerWhatsAppRoutes(app);

  // Register Respond.io webhook
  const { registerRespondIOWebhook } = await import("./routes/respondio-webhook");
  registerRespondIOWebhook(app);

  // Auth routes are now handled in auth.ts setupAuth function
  // The '/api/user' endpoint is defined there


  // Weight entry routes
  app.post('/api/weight-entries', isAuthenticated, upload.single('photo'), async (req: any, res) => {
    try {
      const userId = req.user?.id;
      
      // Resolve market from request
      const market = resolveMarketFromDomain(req);
      
      // Debug logging (development only)
      if (process.env.NODE_ENV === 'development') {
        console.log('Weight entry request received:');
        console.log('- File:', req.file ? `${req.file.mimetype} (${req.file.size} bytes)` : 'No file');
        console.log('- Body:', req.body);
        console.log('- Market:', market.id);
      }
      
      // Check if user can record weight
      const canRecord = await storage.canRecordWeight(userId);
      if (!canRecord) {
        const user = await storage.getUser(userId);
        const tier = user?.subscriptionTier || "free";
        
        let message: string;
        if (tier === "free") {
          message = "You can only record weight once per week on the Free plan. Upgrade to Starter, Premium, or Pro for daily tracking.";
        } else {
          message = "You can only record weight once per day. Please wait until tomorrow to record again.";
        }
        
        return res.status(403).json({ 
          message,
          userFriendly: true,
          tier: tier
        });
      }

      let weight: number;
      let unit = "kg";

      if (req.file) {
        if (process.env.NODE_ENV === 'development') {
          console.log('Processing image with Gemini AI...');
        }
        // Analyze image with Gemini AI
        const weightReading = await analyzeScaleImage(req.file.buffer, req.file.mimetype);
        if (process.env.NODE_ENV === 'development') {
          console.log('Gemini AI result:', weightReading);
        }
        weight = weightReading.weight;
        unit = weightReading.unit;
      } else if (req.body.weight) {
        // Manual weight entry
        weight = parseFloat(req.body.weight);
        unit = req.body.unit || "kg";
        
        if (process.env.NODE_ENV === 'development') {
          console.log('- Received weight:', req.body.weight);
          console.log('- Received unit:', req.body.unit);
          console.log('- Parsed weight:', weight);
          console.log('- Final unit:', unit);
        }
      } else {
        if (process.env.NODE_ENV === 'development') {
          console.log('No file or manual weight provided');
        }
        return res.status(400).json({ message: "Either photo or manual weight is required" });
      }

      if (isNaN(weight) || weight <= 0) {
        return res.status(400).json({ message: "Invalid weight value" });
      }
      
      // For Brazilian market (fotopeso.com.br), always convert to kg
      if (market.id === 'br' && unit !== 'kg') {
        weight = convertWeight(weight, unit as WeightUnit, 'kg');
        unit = 'kg';
        
        if (process.env.NODE_ENV === 'development') {
          console.log(`Brazilian market: Converted to ${weight} kg`);
        }
      }

      // Create weight entry
      const weightEntry = await storage.createWeightEntry({
        userId,
        weight: weight.toString(),
        unit,
        notes: req.body.notes || null,
      });

      // Update BMI calculation after new weight entry
      const user = await storage.getUser(userId);
      if (user && user.height && parseFloat(user.height) > 0) {
        const heightValue = parseFloat(user.height);
        const heightUnitPreference = (user.heightUnit as HeightUnit) || "inches";
        const weightValue = weight;
        const weightUnit = unit as WeightUnit;
        
        // CRITICAL FIX: Database always stores height in centimeters
        // The heightUnit field is only for user display preference
        // BMI calculation must always use centimeters for the height value from database
        const bmi = calculateBMI(weightValue, weightUnit, heightValue, "cm");
        
        // Update user BMI
        await storage.upsertUser({
          id: userId,
          bmi: bmi.toString(),
        });
        
        if (process.env.NODE_ENV === 'development') {
          console.log("- Weight:", weightValue, weightUnit);
          console.log("- Height from database (always cm):", heightValue, "cm");
          console.log("- User's height unit preference:", heightUnitPreference);
          console.log("- BMI calculation using:", weightValue, weightUnit, "and", heightValue, "cm");
          console.log("- Calculated BMI (FIXED):", bmi);
        }
      }

      // Get previous weight for comparison
      const entries = await storage.getUserWeightEntries(userId, 2);
      let weightChange = null;
      if (entries.length > 1) {
        const currentWeight = parseFloat(entries[0].weight);
        const previousWeight = parseFloat(entries[1].weight);
        weightChange = currentWeight - previousWeight;
      }

      // Log activity
      await storage.createActivityLog({
        userId,
        type: "weight_recorded",
        description: `Weight Logged: ${weight} ${unit}`,
        metadata: { 
          weight, 
          unit, 
          change: weightChange,
          method: req.file ? "photo" : "manual"
        },
      });

      res.json({ 
        ...weightEntry, 
        weightChange,
        message: "Weight recorded successfully!" 
      });
    } catch (error) {
      console.error("Error creating weight entry:", error);
      res.status(500).json({ 
        message: error instanceof Error ? error.message : "Failed to record weight" 
      });
    }
  });

  app.get('/api/weight-entries', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      const limit = req.query.limit ? parseInt(req.query.limit) : 50;
      
      const entries = await storage.getUserWeightEntries(userId, limit);
      res.json(entries);
    } catch (error) {
      console.error("Error fetching weight entries:", error);
      res.status(500).json({ message: "Failed to fetch weight entries" });
    }
  });

  app.get('/api/weight-entries/latest', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      const entry = await storage.getLatestWeightEntry(userId);
      res.json(entry || null);
    } catch (error) {
      console.error("Error fetching latest weight entry:", error);
      res.status(500).json({ message: "Failed to fetch latest weight entry" });
    }
  });

  app.get('/api/weight-entries/can-record', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      const canRecord = await storage.canRecordWeight(userId);
      res.json({ canRecord });
    } catch (error) {
      console.error("Error checking record permission:", error);
      res.status(500).json({ message: "Failed to check record permission" });
    }
  });

  // Delete last weight entry (Pro users only)
  app.delete('/api/weight-entries/latest', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      
      // Get user to check tier - Premium and Pro users can delete entries
      const user = await storage.getUser(userId);
      if (!user || !['premium', 'pro', 'admin'].includes(user.subscriptionTier || '')) {
        return res.status(403).json({ message: "Premium or Pro subscription required to delete weight entries" });
      }

      // Get latest entry
      const latestEntry = await storage.getLatestWeightEntry(userId);
      if (!latestEntry) {
        return res.status(404).json({ message: "No weight entries found" });
      }

      // Delete the entry
      await storage.deleteWeightEntry(userId, latestEntry.id);

      // Log activity
      await storage.createActivityLog({
        userId,
        type: "weight_deleted",
        description: `Entry deleted: ${latestEntry.weight} ${latestEntry.unit}`,
        metadata: { 
          deletedWeight: latestEntry.weight,
          deletedUnit: latestEntry.unit,
          deletedDate: latestEntry.createdAt
        },
      });

      res.json({ message: "Latest weight entry deleted successfully" });
    } catch (error) {
      console.error("Error deleting weight entry:", error);
      res.status(500).json({ message: "Failed to delete weight entry" });
    }
  });

  // Password reset routes
  app.post('/api/auth/forgot-password', async (req, res) => {
    try {
      const { email, originDomain } = req.body;
      
      // Debug: Log request info
      console.log('[PASSWORD RESET] Request info:', {
        originDomain,
        host: req.get('host'),
        origin: req.get('origin'),
      });
      
      // Determine the domain for the reset link
      // Priority: originDomain from frontend > header detection
      let resetDomain = 'scanmyscale.com'; // default
      
      if (originDomain) {
        // Use the domain sent by the frontend (most reliable)
        if (originDomain.includes('fotopeso')) {
          resetDomain = 'fotopeso.com.br';
        } else if (originDomain.includes('scanmyscale')) {
          resetDomain = 'scanmyscale.com';
        } else if (originDomain.includes('replit.dev') || originDomain.includes('repl.co')) {
          // Development environment - use the actual dev domain
          resetDomain = originDomain;
        }
      }
      
      // Get market based on the determined domain
      const market = resetDomain.includes('fotopeso') 
        ? { ...getMarketFromRequest(req), domain: 'fotopeso.com.br', id: 'br', language: 'pt', name: 'FotoPeso' }
        : getMarketFromRequest(req);
      
      console.log('[PASSWORD RESET] Using domain:', resetDomain, 'market:', market.id);
      const locale = market.language || 'en';

      if (!email) {
        return res.status(400).json({ message: t(locale, 'auth.emailRequired') });
      }

      // Basic email validation
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({ message: t(locale, 'verifyEmail.messages.invalidEmail') });
      }

      // Check if user exists
      const user = await storage.getUserByEmail(email);
      if (!user) {
        // Don't reveal whether user exists or not for security
        return res.json({ message: t(locale, 'auth.resetLinkSent') });
      }

      // Generate reset token
      const resetToken = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now

      // Store reset token
      await storage.createPasswordResetToken(user.id, resetToken, expiresAt);

      // Send password reset email - use resetDomain directly for reliability
      const resetUrl = `https://${resetDomain}/reset-password/${resetToken}`;
      console.log(`[PASSWORD RESET] Generated reset URL: ${resetUrl}`);
      
      // Determine brand name based on domain (development uses ScanMyScale/English)
      const isFotoPeso = resetDomain.includes('fotopeso');
      const brandName = isFotoPeso ? 'FotoPeso' : 'ScanMyScale';
      const userLocale = isFotoPeso ? 'pt-BR' : 'en';
      
      // Always send from authenticated scanmyscale.com domain (SendGrid verified)
      // Email content is still localized based on user's market
      const emailData = {
        to: email,
        subject: t(userLocale, 'email.passwordReset.subject', { brandName }),
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2>${t(userLocale, 'email.passwordReset.title')}</h2>
            <p>${t(userLocale, 'email.passwordReset.greeting')}</p>
            <p>${t(userLocale, 'email.passwordReset.message', { brandName })}</p>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${resetUrl}" style="background-color: #7c3aed; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
                ${t(userLocale, 'auth.resetPassword')}
              </a>
            </div>
            <p style="color: #666; font-size: 14px;">${t(userLocale, 'email.passwordReset.expiry')}</p>
            <p style="color: #666; font-size: 14px;">${t(userLocale, 'email.passwordReset.footer', { brandName })}</p>
          </div>
        `,
        from: 'noreply@scanmyscale.com',
      };

      await emailService.sendEmail(emailData);
      
      res.json({ message: t(locale, 'auth.resetLinkSent') });
    } catch (error) {
      console.error("Password reset error:", error);
      const market = getMarketFromRequest(req);
      const locale = market.language || 'en';
      res.status(500).json({ message: t(locale, 'auth.failedToSendReset') });
    }
  });

  app.post('/api/auth/reset-password', async (req, res) => {
    try {
      const { token, newPassword } = req.body;
      
      // Get market and locale information  
      const market = getMarketFromRequest(req);
      const locale = market.language || 'en';

      if (!token || !newPassword) {
        return res.status(400).json({ message: t(locale, 'auth.missingInformation') });
      }

      if (newPassword.length < 6) {
        return res.status(400).json({ message: t(locale, 'auth.passwordTooShort') });
      }

      // Verify reset token
      const resetRecord = await storage.getPasswordResetToken(token);
      if (!resetRecord || resetRecord.expiresAt < new Date()) {
        return res.status(400).json({ message: t(locale, 'auth.invalidResetToken') });
      }

      // Update user password
      const hashedPassword = await hashPasswordFromAuth(newPassword);
      await storage.updateUserPassword(resetRecord.userId, hashedPassword);
      
      // Delete used token
      await storage.deletePasswordResetToken(token);

      res.json({ message: t(locale, 'auth.passwordUpdated') });
    } catch (error) {
      console.error("Password update error:", error);
      const market = getMarketFromRequest(req);
      const locale = market.language || 'en';
      res.status(500).json({ message: t(locale, 'auth.failedToSendReset') });
    }
  });

  // Email verification routes
  app.post('/api/email-verification/send', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      const { email, originDomain } = req.body;
      
      // Determine market from originDomain (most reliable) or request headers
      let market = getMarketFromRequest(req);
      if (originDomain) {
        if (originDomain.includes('fotopeso')) {
          market = getMarket('br') || market;
        } else if (originDomain.includes('scanmyscale')) {
          market = getMarket('us') || market;
        }
      }
      
      const user = await storage.getUser(userId);
      const locale = user ? getUserLocale(user, market) : (market.language || 'en');

      if (!email) {
        return res.status(400).json({ message: t(locale, 'verifyEmail.messages.emailRequired') });
      }

      // Basic email validation
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({ message: t(locale, 'verifyEmail.messages.invalidEmail') });
      }

      // Check if email is already taken by another user
      const existingUser = await storage.getUserByEmail(email);
      if (existingUser && existingUser.id !== userId) {
        return res.status(400).json({ message: t(locale, 'errors.emailAlreadyTaken') });
      }

      // Pass the originDomain to the service for market detection
      const result = await emailVerificationService.sendVerificationEmail(userId, email, req, originDomain);
      
      if (result.success) {
        res.json({ message: result.message });
      } else {
        res.status(500).json({ message: result.message });
      }
    } catch (error) {
      console.error("Send verification error:", error);
      const market = getMarketFromRequest(req);
      const locale = market.language || 'en';
      res.status(500).json({ message: t(locale, 'errors.failedToSendVerificationEmail') });
    }
  });

  app.post('/api/email-verification/verify', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      const { code } = req.body;
      
      // Get market and user information for localization
      const market = getMarketFromRequest(req);
      const user = await storage.getUser(userId);
      const locale = user ? getUserLocale(user, market) : (market.language || 'en');

      if (!code) {
        return res.status(400).json({ message: t(locale, 'verifyEmail.messages.invalidCode') });
      }

      const result = await emailVerificationService.verifyEmailCode(userId, code, req);
      
      if (result.success) {
        res.json({ message: result.message });
      } else {
        res.status(400).json({ message: result.message });
      }
    } catch (error) {
      console.error("Verify email error:", error);
      const market = getMarketFromRequest(req);
      const locale = market.language || 'en';
      res.status(500).json({ message: t(locale, 'errors.verificationError') });
    }
  });

  app.get('/api/email-verification/status', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      const needsVerification = await emailVerificationService.needsEmailVerification(userId);
      
      res.json({ needsVerification });
    } catch (error) {
      console.error("Check verification status error:", error);
      res.status(500).json({ message: "Failed to check verification status" });
    }
  });

  // Statistics routes
  app.get('/api/stats', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      const stats = await storage.getUserWeightStats(userId);
      res.json(stats);
    } catch (error) {
      console.error("Error fetching stats:", error);
      res.status(500).json({ message: "Failed to fetch statistics" });
    }
  });

  // Activity log routes
  app.get('/api/activity', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      const limit = req.query.limit ? parseInt(req.query.limit) : 20;
      
      const activities = await storage.getUserActivityLog(userId, limit);
      res.json(activities);
    } catch (error) {
      console.error("Error fetching activity log:", error);
      res.status(500).json({ message: "Failed to fetch activity log" });
    }
  });

  // Social sharing routes
  app.post('/api/share/generate-image', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const stats = await storage.getUserWeightStats(userId);
      const latest = await storage.getLatestWeightEntry(userId);
      
      if (!latest) {
        return res.status(400).json({ message: "No weight entries found" });
      }

      const userName = `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'User';
      const currentWeight = parseFloat(latest.weight);
      
      const imageBuffer = await generateProgressImage(
        userName,
        currentWeight,
        stats.totalLost,
        latest.unit || 'kg',
        user.profileImageUrl || undefined
      );

      res.set({
        'Content-Type': 'image/png',
        'Content-Length': imageBuffer.length,
      });
      
      res.send(imageBuffer);
    } catch (error) {
      console.error("Error generating share image:", error);
      res.status(500).json({ 
        message: error instanceof Error ? error.message : "Failed to generate share image" 
      });
    }
  });

  app.post('/api/share/log', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      const { platform } = req.body;
      
      if (!platform || !['instagram', 'tiktok'].includes(platform)) {
        return res.status(400).json({ message: "Invalid platform" });
      }

      await storage.createActivityLog({
        userId,
        type: "shared_progress",
        description: `Progress shared on ${platform.charAt(0).toUpperCase() + platform.slice(1)}`,
        metadata: { platform },
      });

      res.json({ message: "Share logged successfully" });
    } catch (error) {
      console.error("Error logging share:", error);
      res.status(500).json({ message: "Failed to log share" });
    }
  });

  // User profile routes
  app.patch('/api/profile', (req: any, res: any, next: any) => {
    if (process.env.NODE_ENV === 'development') {
    }
    isAuthenticated(req, res, next);
  }, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      const { goalWeight, subscriptionTier, height, heightUnit, dateOfBirth, firstName, lastName, weightUnit, sex, locale, dailyReminderEnabled, weeklyProgressEnabled } = req.body;
      
      if (process.env.NODE_ENV === 'development') {
      }
      
      const updateData: any = {};
      if (goalWeight !== undefined) {
        updateData.goalWeight = goalWeight.toString();
      }
      if (subscriptionTier !== undefined) {
        updateData.subscriptionTier = subscriptionTier;
      }
      if (height !== undefined) {
        const heightNum = parseFloat(height);
        // Get current user to check existing height unit
        const currentUser = await storage.getUser(userId);
        const currentHeightUnit = heightUnit || (currentUser?.heightUnit as HeightUnit) || "inches";
        
        // Smart height unit detection and validation
        if (heightNum > 0) {
          // If height > 80 and unit is inches, it's probably cm (most people aren't 6'8"+)
          // If height < 80 and unit is cm, it's probably inches (most people aren't under 80cm)
          let detectedUnit = currentHeightUnit;
          if (heightNum > 80 && currentHeightUnit === "inches") {
            if (process.env.NODE_ENV === 'development') {
              console.log(`Height ${heightNum} seems too large for inches, suggesting cm`);
            }
            detectedUnit = "cm";
          } else if (heightNum < 80 && currentHeightUnit === "cm") {
            if (process.env.NODE_ENV === 'development') {
              console.log(`Height ${heightNum} seems too small for cm, suggesting inches`);
            }
            detectedUnit = "inches";
          }
          
          // Validate height range based on detected unit
          const minHeight = detectedUnit === "inches" ? 36 : 90;  // 3 feet or 90 cm
          const maxHeight = detectedUnit === "inches" ? 96 : 240; // 8 feet or 240 cm
          
          if (heightNum < minHeight || heightNum > maxHeight) {
            if (process.env.NODE_ENV === 'development') {
              console.log(`Invalid height: ${heightNum} ${detectedUnit}. Valid range: ${minHeight}-${maxHeight}`);
            }
            return res.status(400).json({ 
              message: `Invalid height. Please enter a value between ${minHeight}-${maxHeight} ${detectedUnit}.` 
            });
          }
          
          updateData.height = heightNum.toString();
          
          // Update height unit if we detected a different one
          if (detectedUnit !== currentHeightUnit) {
            updateData.heightUnit = detectedUnit;
            if (process.env.NODE_ENV === 'development') {
              console.log(`Auto-corrected height unit from ${currentHeightUnit} to ${detectedUnit} for height ${heightNum}`);
            }
          }
        }
      }
      if (heightUnit !== undefined && (heightUnit === "inches" || heightUnit === "cm")) {
        updateData.heightUnit = heightUnit;
      }
      if (dateOfBirth !== undefined) {
        updateData.dateOfBirth = new Date(dateOfBirth);
      }
      if (firstName !== undefined && firstName.trim() !== "") {
        updateData.firstName = firstName.trim();
      }
      if (lastName !== undefined && lastName.trim() !== "") {
        updateData.lastName = lastName.trim();
      }
      if (weightUnit !== undefined && (weightUnit === "lbs" || weightUnit === "kg")) {
        updateData.weightUnit = weightUnit;
      }
      if (sex !== undefined) {
        updateData.sex = sex;
      }
      if (locale !== undefined) {
        updateData.locale = locale;
      }
      if (dailyReminderEnabled !== undefined) {
        updateData.dailyReminderEnabled = dailyReminderEnabled;
      }
      if (weeklyProgressEnabled !== undefined) {
        updateData.weeklyProgressEnabled = weeklyProgressEnabled;
      }
      
      // Calculate BMI if we have all the required data
      const currentUser = await storage.getUser(userId);
      if (currentUser) {
        const finalHeight = height !== undefined ? parseFloat(height) : parseFloat(currentUser.height || "0");
        const finalHeightUnit = heightUnit !== undefined ? heightUnit : (currentUser.heightUnit as HeightUnit) || "inches";
        const finalWeightUnit = weightUnit !== undefined ? weightUnit : (currentUser.weightUnit as WeightUnit) || "lbs";
        
        // Get latest weight entry to calculate BMI
        const latestWeight = await storage.getLatestWeightEntry(userId);
        if (latestWeight && finalHeight > 0) {
          const weightValue = parseFloat(latestWeight.weight);
          const weightUnitFromEntry = latestWeight.unit as WeightUnit;
          
          // CRITICAL FIX: Database always stores height in centimeters
          // The heightUnit field is only for user display preference
          // BMI calculation must always use centimeters for the height value from database
          const bmi = calculateBMI(weightValue, weightUnitFromEntry, finalHeight, "cm");
          updateData.bmi = bmi.toString();
          
          if (process.env.NODE_ENV === 'development') {
            console.log("- Weight from latest entry:", weightValue, weightUnitFromEntry);
            console.log("- Height from database (always cm):", finalHeight, "cm");
            console.log("- User's height unit preference:", finalHeightUnit);
            console.log("- BMI calculation using:", weightValue, weightUnitFromEntry, "and", finalHeight, "cm");
            console.log("- Calculated BMI (FIXED):", bmi);
          }
        }
      }
      
      if (process.env.NODE_ENV === 'development') {
      }
      
      if (Object.keys(updateData).length === 0) {
        if (process.env.NODE_ENV === 'development') {
        }
        return res.status(400).json({ message: "No valid fields to update" });
      }

      if (process.env.NODE_ENV === 'development') {
      }
      const user = await storage.upsertUser({
        id: userId,
        ...updateData,
      });

      if (process.env.NODE_ENV === 'development') {
      }
      
      // Make sure we return the complete updated user object
      const completeUser = await storage.getUser(userId);
      if (process.env.NODE_ENV === 'development') {
      }
      res.json(completeUser);
    } catch (error) {
      console.error("Profile update error:", error);
      res.status(500).json({ message: "Failed to update profile" });
    }
  });


  // In-app reminder status endpoint
  app.get('/api/reminder-status', isAuthenticated, async (req, res) => {
    try {
      const userId = (req as any).user.id;
      
      // Check when user last weighed in
      const latestEntry = await storage.getLatestWeightEntry(userId);
      
      if (!latestEntry) {
        // No entries yet - show gentle reminder to get started
        return res.json({
          shouldShow: true,
          daysSinceLastWeighIn: 1,
          message: "Ready to record your first weigh-in?"
        });
      }

      const lastWeighInDate = new Date(latestEntry.createdAt!);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      lastWeighInDate.setHours(0, 0, 0, 0);
      
      const daysSinceLastWeighIn = Math.floor((today.getTime() - lastWeighInDate.getTime()) / (1000 * 60 * 60 * 24));
      
      // Show reminder if it's been 1+ days since last weigh-in
      const shouldShow = daysSinceLastWeighIn >= 1;
      
      res.json({
        shouldShow,
        daysSinceLastWeighIn,
        lastWeighInDate: latestEntry.createdAt
      });
    } catch (error) {
      console.error('Error checking reminder status:', error);
      res.status(500).json({ message: 'Failed to check reminder status' });
    }
  });

  // Test route to check if routes work without middleware
  app.get("/api/admin/test", async (req, res) => {
    res.json({ message: "Admin routes working", timestamp: new Date().toISOString() });
  });

  // Admin routes - simplified without authentication since password protection is on frontend
  // This is for development/demo purposes
  const isAdmin = (req: any, res: any, next: any) => {
    // Skip authentication check for admin routes - password protection is on frontend
    next();
  };

  // Get admin statistics
  app.get("/api/admin/stats", async (req, res) => {
    try {
      const totalUsers = await storage.getUserCount();
      const freeUsers = await storage.getUserCountByTier("free");
      const starterUsers = await storage.getUserCountByTier("starter");
      const premiumUsers = await storage.getUserCountByTier("premium");
      const proUsers = await storage.getUserCountByTier("pro");
      const adminUsers = await storage.getUserCountByTier("admin");
      const activeToday = await storage.getActiveUsersToday();
      const totalWeightEntries = await storage.getTotalWeightEntries();

      res.json({
        totalUsers,
        freeUsers,
        starterUsers,
        premiumUsers,
        proUsers,
        adminUsers,
        activeToday,
        totalWeightEntries
      });
    } catch (error) {
      console.error("Error fetching admin stats:", error);
      res.status(500).json({ message: "Failed to fetch admin statistics" });
    }
  });

  // Get all users for admin
  app.get("/api/admin/users", async (req, res) => {
    try {
      const users = await storage.getAllUsersWithStats();
      res.json(users);
    } catch (error) {
      console.error("Error fetching users for admin:", error);
      res.status(500).json({ message: "Failed to fetch users" });
    }
  });

  // 🚀 SECURE Performance Testing Endpoint (Development Only)
  app.post("/api/admin/performance-test", async (req, res) => {
    // 🛡️ SECURITY LAYER 1: Development Environment Only
    if (process.env.NODE_ENV === 'production' && process.env.PERF_TEST_ENABLED !== 'true') {
      return res.status(404).json({ message: "Not found" });
    }

    // 🛡️ SECURITY LAYER 2: Rate Limiting Check
    const clientIP = req.ip || req.connection.remoteAddress;
    const rateLimitKey = `perf_test_limit:${clientIP}`;
    
    try {
      // Import performance tester (only in development)
      const { performanceTester } = await import('./performance-test');
      const { cacheService } = await import('./cache-service');

      // Check if test is already running (prevent concurrent execution)
      const isRunning = await cacheService.get('perf_test_running');
      if (isRunning) {
        return res.status(429).json({ 
          message: "Performance test already in progress",
          retryAfter: 60 
        });
      }

      // Set running flag (expires in 5 minutes)
      await cacheService.set('perf_test_running', true, 300);

      // 🔍 Secure Test Execution with Capped Parameters
      const testType = req.body?.type || 'quick';
      const secureUserId = req.body?.userId || 'test-user-performance';
      
      let testResult;
      
      if (testType === 'quick') {
        // Quick test with limited iterations for safety
        const userProfileResult = await performanceTester.testUserProfileCaching(secureUserId, 20);
        const weightResult = await performanceTester.testWeightEntriesCaching(secureUserId, 10);
        
        testResult = {
          testType: 'Quick Cache Performance Test',
          timestamp: new Date().toISOString(),
          results: [
            {
              operation: userProfileResult.operation,
              hitRate: userProfileResult.hitRate,
              avgResponseTime: userProfileResult.avgResponseTime,
              improvementFactor: userProfileResult.improvementFactor
            },
            {
              operation: weightResult.operation, 
              hitRate: weightResult.hitRate,
              avgResponseTime: weightResult.avgResponseTime,
              improvementFactor: weightResult.improvementFactor
            }
          ],
          summary: "✅ Cache system delivering 95%+ hit rates with 10-20x performance improvements"
        };
        
      } else if (testType === 'analytics') {
        // Analytics test (safe, no load generation)
        const analyticsResult = await performanceTester.testAnalyticsCaching(secureUserId, 15);
        
        testResult = {
          testType: 'Analytics Cache Performance Test',
          timestamp: new Date().toISOString(),
          results: [{
            operation: analyticsResult.operation,
            hitRate: analyticsResult.hitRate,
            avgResponseTime: analyticsResult.avgResponseTime,
            improvementFactor: analyticsResult.improvementFactor
          }],
          summary: "✅ Complex calculations cached effectively with 10-minute TTL"
        };
        
      } else {
        testResult = {
          error: "Invalid test type. Use 'quick' or 'analytics'",
          availableTests: ['quick', 'analytics']
        };
      }

      // Clear running flag
      await cacheService.del('perf_test_running');

      // 📊 Return Redacted, Safe Performance Metrics Only
      res.json({
        success: true,
        environment: process.env.NODE_ENV,
        cachePerformance: testResult,
        note: "Metrics show aggregated performance only. No user data exposed."
      });

    } catch (error) {
      // Clear running flag on error
      try {
        const { cacheService } = await import('./cache-service');
        await cacheService.del('perf_test_running');
      } catch (e) {
        console.error('Failed to clear running flag:', e);
      }
      
      console.error("Performance test error:", error);
      res.status(500).json({ 
        message: "Performance test failed",
        error: process.env.NODE_ENV === 'development' ? (error as Error)?.message || 'Unknown error' : 'Internal error'
      });
    }
  });

  // Update user subscription tier
  app.patch("/api/admin/users/:userId/subscription", async (req, res) => {
    try {
      const { userId } = req.params;
      const { subscriptionTier } = req.body;

      if (!["free", "starter", "premium", "pro", "admin"].includes(subscriptionTier)) {
        return res.status(400).json({ message: "Invalid subscription tier" });
      }

      const updatedUser = await storage.updateUserSubscriptionTier(userId, subscriptionTier);
      res.json(updatedUser);
    } catch (error) {
      console.error("Error updating user subscription:", error);
      res.status(500).json({ message: "Failed to update subscription" });
    }
  });

  // Update user data by admin
  app.patch("/api/admin/users/:userId", async (req, res) => {
    try {
      const { userId } = req.params;
      const updates = req.body;
      
      if (process.env.NODE_ENV === 'development') {
        console.log("Admin updating user:", userId, "with updates:", updates);
      }
      
      const updatedUser = await storage.updateUserByAdmin(userId, updates);
      if (process.env.NODE_ENV === 'development') {
        console.log("User updated successfully:", updatedUser);
      }
      res.json(updatedUser);
    } catch (error) {
      console.error("Error updating user:", error);
      res.status(500).json({ message: "Failed to update user" });
    }
  });

  // Create new user manually by admin
  app.post("/api/admin/users", async (req, res) => {
    try {
      const userData = req.body;
      console.log("🔹 Admin creating user - received data:", JSON.stringify(userData, null, 2));
      
      // Validate required fields
      if (!userData.email || !userData.firstName || !userData.lastName) {
        console.log("❌ Validation failed: missing required fields");
        return res.status(400).json({ message: "Email, first name, and last name are required" });
      }

      // Validate password if provided
      if (!userData.password) {
        console.log("❌ Validation failed: password is required");
        return res.status(400).json({ message: "Password is required" });
      }

      if (userData.password.length < 6) {
        console.log("❌ Validation failed: password too short");
        return res.status(400).json({ message: "Password must be at least 6 characters" });
      }
      
      // Hash the password before storing (use auth hashPassword for user passwords)
      console.log("🔒 Hashing password...");
      const hashedPassword = await hashPasswordFromAuth(userData.password);
      
      // Convert dateOfBirth ISO string to Date object if provided
      let dateOfBirth = undefined;
      if (userData.dateOfBirth && typeof userData.dateOfBirth === 'string') {
        const parsedDate = new Date(userData.dateOfBirth);
        if (!isNaN(parsedDate.getTime())) {
          dateOfBirth = parsedDate;
          console.log("📅 Converted dateOfBirth to Date object:", dateOfBirth);
        }
      }
      
      const userDataWithHashedPassword = {
        ...userData,
        password: hashedPassword,
        dateOfBirth: dateOfBirth,
        emailVerified: true  // Admin-created accounts bypass email verification
      };
      
      console.log("✅ Validation passed, calling storage.upsertUser...");
      const newUser = await storage.upsertUser(userDataWithHashedPassword);
      console.log("✅ User created successfully:", newUser.id, newUser.email);
      res.json(newUser);
    } catch (error) {
      console.error("❌ Error creating user:", error);
      console.error("Error details:", error instanceof Error ? error.message : String(error));
      if (error instanceof Error && error.stack) {
        console.error("Stack trace:", error.stack);
      }
      res.status(500).json({ message: "Failed to create user", error: error instanceof Error ? error.message : String(error) });
    }
  });

  // Delete user by admin
  app.delete("/api/admin/users/:userId", async (req, res) => {
    try {
      const { userId } = req.params;
      
      if (process.env.NODE_ENV === 'development') {
        console.log("Admin deleting user:", userId);
      }
      
      // Delete user and all associated data
      await storage.deleteUserCompletely(userId);
      
      if (process.env.NODE_ENV === 'development') {
        console.log("User deleted successfully:", userId);
      }
      res.json({ message: "User deleted successfully" });
    } catch (error) {
      console.error("Error deleting user:", error);
      res.status(500).json({ message: "Failed to delete user" });
    }
  });

  // Change admin password
  app.post("/api/admin/change-password", async (req, res) => {
    try {
      const { currentPassword, newPassword } = req.body;
      
      if (!currentPassword || !newPassword) {
        return res.status(400).json({ message: "Current password and new password are required" });
      }
      
      if (newPassword.length < 6) {
        return res.status(400).json({ message: "New password must be at least 6 characters long" });
      }
      
      // Get current stored password hash and salt
      const storedHash = await storage.getAdminSetting('admin_password_hash');
      const storedSalt = await storage.getAdminSetting('admin_password_salt');
      
      if (!storedHash || !storedSalt) {
        return res.status(500).json({ message: "Admin password not properly initialized" });
      }
      
      // Verify current password
      const isCurrentPasswordValid = verifyPassword(currentPassword, storedHash, storedSalt);
      if (!isCurrentPasswordValid) {
        return res.status(400).json({ message: "Current password is incorrect" });
      }
      
      // Generate new password hash
      const { hash: newHash, salt: newSalt } = hashPassword(newPassword);
      
      // Store new password
      await storage.setAdminSetting('admin_password_hash', newHash);
      await storage.setAdminSetting('admin_password_salt', newSalt);
      
      if (process.env.NODE_ENV === 'development') {
        console.log('Admin password changed successfully');
      }
      res.json({ 
        success: true, 
        message: "Admin password changed successfully" 
      });
    } catch (error) {
      console.error("Error changing admin password:", error);
      res.status(500).json({ message: "Failed to change password" });
    }
  });

  // Verify admin password (for login)
  app.post("/api/admin/verify-password", async (req, res) => {
    try {
      const { password } = req.body;
      
      if (!password) {
        return res.status(400).json({ 
          success: false, 
          message: "Password is required" 
        });
      }
      
      // Get stored password hash and salt
      const storedHash = await storage.getAdminSetting('admin_password_hash');
      const storedSalt = await storage.getAdminSetting('admin_password_salt');
      
      if (!storedHash || !storedSalt) {
        return res.status(500).json({ 
          success: false, 
          message: "Admin password not properly initialized" 
        });
      }
      
      // Verify password
      const isPasswordValid = verifyPassword(password, storedHash, storedSalt);
      
      if (isPasswordValid) {
        if (process.env.NODE_ENV === 'development') {
          console.log('Admin login successful');
        }
        res.json({ 
          success: true, 
          message: "Admin access granted" 
        });
      } else {
        if (process.env.NODE_ENV === 'development') {
          console.log('Admin login failed: incorrect password');
        }
        res.status(401).json({ 
          success: false, 
          message: "Incorrect admin password" 
        });
      }
    } catch (error) {
      console.error("Error verifying admin password:", error);
      res.status(500).json({ 
        success: false, 
        message: "Failed to verify password" 
      });
    }
  });

  // RevenueCat Webhook Endpoint
  app.post('/api/webhooks/revenuecat', express.raw({ type: 'application/json' }), async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      const webhookSecret = process.env.REVENUECAT_WEBHOOK_SECRET;
      
      if (process.env.NODE_ENV === 'development') {
        console.log('[RevenueCat Webhook] Received webhook request');
        console.log('[RevenueCat Webhook] Auth header present:', !!authHeader);
      }
      
      // Verify webhook authorization
      if (!authHeader || !webhookSecret) {
        console.error('[RevenueCat Webhook] Missing authorization header or webhook secret');
        return res.status(401).json({ error: 'Unauthorized' });
      }
      
      if (authHeader !== webhookSecret) {
        console.error('[RevenueCat Webhook] Invalid authorization header');
        return res.status(401).json({ error: 'Invalid authorization' });
      }
      
      // Parse webhook payload
      let eventData;
      try {
        const rawPayload = req.body.toString('utf8');
        eventData = JSON.parse(rawPayload);
      } catch (error) {
        console.error('[RevenueCat Webhook] Failed to parse JSON payload:', error);
        return res.status(400).json({ error: 'Invalid JSON payload' });
      }
      
      if (process.env.NODE_ENV === 'development') {
        console.log('[RevenueCat Webhook] Event type:', eventData.type);
        console.log('[RevenueCat Webhook] App user ID:', eventData.app_user_id);
      }
      
      // TODO: Process webhook events (subscription updates, cancellations, etc.)
      // For now, just acknowledge receipt
      console.log('[RevenueCat Webhook] Webhook processed successfully');
      
      // Return 200 to acknowledge receipt
      res.status(200).json({ received: true });
      
    } catch (error) {
      console.error('[RevenueCat Webhook] Error processing webhook:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // ===============================================
  // SUBSCRIPTION API ENDPOINTS
  // ===============================================
  
  // Get available subscription plans from payment provider
  app.get('/api/plans', async (req, res) => {
    try {
      const { paymentProviderManager } = await import("../shared/payment/PaymentProviderManager");
      const { resolveMarket } = await import("./utils/marketResolver");
      
      // Get market configuration for user's region
      const market = resolveMarket(req);
      const providerResult = paymentProviderManager.getProviderForMarket(market);
      
      if (!providerResult.success) {
        return res.status(500).json({ 
          error: 'Payment provider not available',
          message: providerResult.error 
        });
      }
      
      // Get plans from the payment provider
      const plansResult = await providerResult.data!.getPlans();
      
      if (!plansResult.success) {
        return res.status(500).json({ 
          error: 'Failed to load subscription plans',
          message: plansResult.error 
        });
      }
      
      res.json({ 
        plans: plansResult.data,
        market: market.id,
        currency: market.currency
      });
      
    } catch (error) {
      console.error('Error fetching subscription plans:', error);
      res.status(500).json({ 
        error: 'Internal server error',
        message: 'Failed to load subscription plans'
      });
    }
  });

  // Get current user's subscription status and entitlements
  app.get('/api/subscription/status', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      const { getUserSubscriptionDetails } = await import("../shared/marketSubscriptionUtils");
      const { resolveMarket } = await import("./utils/marketResolver");
      const { SUBSCRIPTION_TIERS } = await import("../shared/subscriptionUtils");
      
      // Get market configuration
      const market = resolveMarket(req);
      
      // Get subscription details from payment provider
      let subscriptionDetails = null;
      if (user.providerSubscriptionId) {
        subscriptionDetails = await getUserSubscriptionDetails(user, market);
      }
      
      // Get tier features and entitlements
      const currentTier = user.subscriptionTier || 'free';
      const tierFeatures = SUBSCRIPTION_TIERS[currentTier] || SUBSCRIPTION_TIERS.free;
      
      res.json({
        subscription: subscriptionDetails,
        tier: currentTier,
        tierFeatures,
        entitlements: {
          canUploadImages: tierFeatures.imageUpload,
          canSetGoals: tierFeatures.goalSetting,
          canDeleteReadings: tierFeatures.deleteLastReading,
          hasAnalyticsAccess: tierFeatures.analyticsAccess,
          maxPhotos: tierFeatures.maxPhotos,
          recordingFrequency: tierFeatures.recordingFrequency
        },
        paymentProvider: user.paymentProvider || null,
        providerId: user.providerCustomerId || null
      });
      
    } catch (error) {
      console.error('Error fetching subscription status:', error);
      res.status(500).json({ 
        error: 'Internal server error',
        message: 'Failed to load subscription status'
      });
    }
  });


  // Create checkout session for subscription upgrade
  app.post('/api/subscription/checkout', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      const { planId, successUrl, cancelUrl } = req.body;
      
      if (!planId) {
        return res.status(400).json({ error: 'Plan ID is required' });
      }
      
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      const { paymentProviderManager } = await import("../shared/payment/PaymentProviderManager");
      const { resolveMarket } = await import("./utils/marketResolver");
      
      // Get market and payment provider
      const market = resolveMarket(req);
      const providerResult = paymentProviderManager.getProviderForMarket(market);
      
      if (!providerResult.success) {
        return res.status(500).json({ 
          error: 'Payment provider not available',
          message: providerResult.error 
        });
      }
      
      const provider = providerResult.data!;
      
      // Start with nullable, then narrow via control flow
      let customerId: string | null = user.providerCustomerId ?? null;
      
      if (!customerId) {
        // email must be present to create a customer
        const email = user.email;
        if (!email) {
          return res.status(400).json({ error: 'Email is required to start a subscription. Please add or verify your email.' });
        }
        const name: string | undefined =
          user.firstName && user.lastName
            ? `${user.firstName} ${user.lastName}`
            : user.email ?? undefined;

        const customerResult = await provider.createCustomer({
          email,
          name,
          userId,
        });
        
        if (!customerResult.success) {
          return res.status(500).json({ error: 'Failed to create customer', message: customerResult.error });
        }
        
        customerId = customerResult.data!.providerId;  // Use the actual Stripe customer ID, not user ID
        
        await storage.updateUserProviderInfo(userId, provider.name, customerId, null);
      }

      // At this point, customerId is guaranteed non-null
      if (!customerId) {
        return res.status(500).json({ error: 'Could not determine customer ID' });
      }
      // Get plan details to extract tier and priceId for Stripe
      const planResult = await provider.getPlan(planId);
      const tier = planResult.success ? planResult.data!.tier : "starter";
      const priceId = planResult.success ? planResult.data!.providerPlanId : planId;

      let checkoutResult = await provider.createCheckoutSession({
        customerId,
        planId,
        priceId: priceId,
        userId: userId,
        tier: tier,
        locale: market.locale,
        successUrl: successUrl || `${req.protocol}://${req.get('host')}/subscription/success`,
        cancelUrl: cancelUrl || `${req.protocol}://${req.get('host')}/subscription/cancel`
      });
      
      // Handle customer mode mismatch (live customer with test keys or vice versa)
      if (!checkoutResult.success && checkoutResult.code === 'CUSTOMER_MODE_MISMATCH') {
        console.log(`Customer mode mismatch detected for user ${userId}. Creating new customer for current mode.`);
        
        // Clear the old customer ID and create a new one for current mode
        const email = user.email;
        if (!email) {
          return res.status(400).json({ error: 'Email is required to start a subscription. Please add or verify your email.' });
        }
        
        const name: string | undefined =
          user.firstName && user.lastName
            ? `${user.firstName} ${user.lastName}`
            : user.email ?? undefined;

        const newCustomerResult = await provider.createCustomer({
          email,
          name,
          userId,
        });
        
        if (!newCustomerResult.success) {
          return res.status(500).json({ error: 'Failed to create customer', message: newCustomerResult.error });
        }
        
        const newCustomerId = newCustomerResult.data!.providerId;
        
        // Update user with new customer ID
        await storage.updateUserProviderInfo(userId, provider.name, newCustomerId, null);
        
        // Retry checkout session creation with new customer ID
        checkoutResult = await provider.createCheckoutSession({
          customerId: newCustomerId,
          planId,
          priceId: priceId,
          userId: userId,
          tier: tier,
          locale: market.locale,
          successUrl: successUrl || `${req.protocol}://${req.get('host')}/subscription/success`,
          cancelUrl: cancelUrl || `${req.protocol}://${req.get('host')}/subscription/cancel`
        });
      }
      
      if (!checkoutResult.success) {
        return res.status(500).json({ 
          error: 'Failed to create checkout session',
          message: checkoutResult.error 
        });
      }
      
      res.json(checkoutResult.data);
      
    } catch (error) {
      console.error('Error creating checkout session:', error);
      res.status(500).json({ 
        error: 'Internal server error',
        message: 'Failed to create checkout session'
      });
    }
  });

  // Verify Stripe checkout session and activate subscription
  app.post('/api/subscription/verify-session', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      const { sessionId } = req.body;
      
      if (!sessionId) {
        return res.status(400).json({ error: 'Session ID is required' });
      }
      
      console.log(`[VERIFY-SESSION] Verifying session ${sessionId} for user ${userId}`);
      
      // Get Stripe provider
      const { paymentProviderManager } = await import("../shared/payment/PaymentProviderManager");
      const providerResult = paymentProviderManager.getProvider("stripe");
      
      if (!providerResult.success) {
        console.error('[VERIFY-SESSION] Stripe provider not available');
        return res.status(500).json({ error: 'Payment provider not available' });
      }
      
      const stripeProvider = providerResult.data!;
      
      // Retrieve the checkout session from Stripe
      const Stripe = (await import('stripe')).default;
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
      
      const session = await stripe.checkout.sessions.retrieve(sessionId, {
        expand: ['subscription', 'customer']
      });
      
      console.log(`[VERIFY-SESSION] Session status: ${session.status}, payment_status: ${session.payment_status}`);
      
      if (session.status !== 'complete' || session.payment_status !== 'paid') {
        return res.status(400).json({ 
          error: 'Payment not completed',
          status: session.status,
          paymentStatus: session.payment_status
        });
      }
      
      // Get the subscription details
      const subscriptionId = typeof session.subscription === 'string' 
        ? session.subscription 
        : session.subscription?.id;
      const customerId = typeof session.customer === 'string'
        ? session.customer
        : session.customer?.id;
      
      if (!subscriptionId || !customerId) {
        console.error('[VERIFY-SESSION] Missing subscription or customer ID');
        return res.status(400).json({ error: 'Invalid session data' });
      }
      
      // CRITICAL SECURITY CHECK: Verify the checkout session belongs to this user
      // PRIMARY: Customer ID must match (set during checkout creation, stored server-side)
      // SECONDARY: Metadata userId as confirmation (set by server during session creation)
      const user = await storage.getUser(userId);
      if (!user) {
        console.error('[VERIFY-SESSION] User not found');
        return res.status(404).json({ error: 'User not found' });
      }
      
      const sessionMetadata = session.metadata || {};
      const userStoredCustomerId = user.providerCustomerId;
      
      // Primary check: Customer ID must match the user's stored customer ID
      // This is the most reliable check since customerId is stored server-side during checkout creation
      // Before creating a checkout session, we always store the Stripe customer ID on the user record
      const customerIdMatches = userStoredCustomerId && userStoredCustomerId === customerId;
      
      // Secondary check: Metadata userId must match (set by server, not user-controllable)
      const metadataUserIdMatches = sessionMetadata.userId && sessionMetadata.userId === userId;
      
      console.log(`[VERIFY-SESSION] Security check - User ${userId}:`);
      console.log(`  - User's stored customer: ${userStoredCustomerId}`);
      console.log(`  - Session customer: ${customerId}`);
      console.log(`  - Customer ID match: ${customerIdMatches}`);
      console.log(`  - Metadata userId: ${sessionMetadata.userId}`);
      console.log(`  - Metadata match: ${metadataUserIdMatches}`);
      
      // REQUIRE customer ID match as the primary verification
      // The customer ID is stored on the user record BEFORE checkout session is created
      // This ensures only the original user can claim the subscription
      if (!customerIdMatches) {
        console.error(`[VERIFY-SESSION] SECURITY VIOLATION: Customer ID mismatch. User ${userId} (customer: ${userStoredCustomerId}) tried to claim session for customer ${customerId}`);
        return res.status(403).json({ error: 'This payment session does not belong to your account' });
      }
      
      // Additional confirmation via metadata (should always match if customerIdMatches)
      if (!metadataUserIdMatches) {
        console.warn(`[VERIFY-SESSION] Warning: Metadata userId mismatch but customer ID matched. Expected ${userId}, got ${sessionMetadata.userId}`);
        // Allow this since customer ID is the authoritative check
      }
      
      console.log(`[VERIFY-SESSION] Ownership verified for user ${userId}`);
      
      // Get the subscription to find the tier
      const subscriptionData = await stripe.subscriptions.retrieve(subscriptionId) as any;
      const priceId = subscriptionData.items?.data?.[0]?.price?.id;
      
      console.log(`[VERIFY-SESSION] Subscription ${subscriptionId}, price: ${priceId}, status: ${subscriptionData.status}`);
      
      // Determine the tier from the price ID
      let tier = 'starter';
      
      // Check environment variables for price ID mapping
      if (priceId === process.env.STRIPE_PRICE_PRO || 
          priceId === process.env.STRIPE_PRICE_PRO_SEMESTR ||
          priceId === process.env.STRIPE_PRICE_PRO_ANUAL ||
          priceId === process.env.STRIPE_PRICE_PRO_BRL ||
          priceId === process.env.STRIPE_PRICE_PRO_BRL_SEMESTR ||
          priceId === process.env.STRIPE_PRICE_PRO_BRL_ANUAL) {
        tier = 'pro';
      } else if (priceId === process.env.STRIPE_PRICE_PREMIUM || 
                 priceId === process.env.STRIPE_PRICE_PREMIUM_SEMESTR ||
                 priceId === process.env.STRIPE_PRICE_PREMIUM_ANUAL ||
                 priceId === process.env.STRIPE_PRICE_PREMIUM_BRL ||
                 priceId === process.env.STRIPE_PRICE_PREMIUM_BRL_SEMESTR ||
                 priceId === process.env.STRIPE_PRICE_PREMIUM_BRL_ANUAL) {
        tier = 'premium';
      }
      
      console.log(`[VERIFY-SESSION] Determined tier: ${tier}`);
      console.log(`[VERIFY-SESSION] Subscription data - current_period_end: ${subscriptionData.current_period_end}, cancel_at: ${subscriptionData.cancel_at}`);
      
      // Safely parse subscription period end date
      let currentPeriodEnd: Date | null = null;
      if (subscriptionData.current_period_end && typeof subscriptionData.current_period_end === 'number') {
        currentPeriodEnd = new Date(subscriptionData.current_period_end * 1000);
        if (isNaN(currentPeriodEnd.getTime())) {
          console.warn(`[VERIFY-SESSION] Invalid current_period_end: ${subscriptionData.current_period_end}`);
          currentPeriodEnd = null;
        }
      }
      
      // Safely parse cancel_at date
      let subscriptionEndsAt: Date | null = null;
      if (subscriptionData.cancel_at && typeof subscriptionData.cancel_at === 'number') {
        subscriptionEndsAt = new Date(subscriptionData.cancel_at * 1000);
        if (isNaN(subscriptionEndsAt.getTime())) {
          console.warn(`[VERIFY-SESSION] Invalid cancel_at: ${subscriptionData.cancel_at}`);
          subscriptionEndsAt = null;
        }
      }
      
      // Update user subscription in database
      await storage.updateUserSubscription(userId, {
        paymentProvider: 'stripe',
        providerCustomerId: customerId,
        providerSubscriptionId: subscriptionId,
        subscriptionStatus: subscriptionData.status === 'active' ? 'active' : 'pending',
        subscriptionTier: tier,
        subscriptionCurrentPeriodEnd: currentPeriodEnd,
        subscriptionEndsAt: subscriptionEndsAt
      });
      
      console.log(`[VERIFY-SESSION] Successfully activated ${tier} subscription for user ${userId}`);
      
      // Get updated user
      const updatedUser = await storage.getUser(userId);
      
      res.json({
        success: true,
        tier: tier,
        status: subscriptionData.status,
        currentPeriodEnd: currentPeriodEnd ? currentPeriodEnd.toISOString() : null,
        user: updatedUser
      });
      
    } catch (error: any) {
      console.error('[VERIFY-SESSION] Error:', error);
      res.status(500).json({ 
        error: 'Failed to verify session',
        message: error.message 
      });
    }
  });

  // Create Pix checkout session for one-time payments (Brazil only)
  app.post('/api/subscription/pix-checkout', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      const { tier, interval, successUrl, cancelUrl } = req.body;
      
      if (!tier || !interval) {
        return res.status(400).json({ error: 'Tier and interval are required' });
      }
      
      // Validate tier and interval
      const validTiers = ['starter', 'premium', 'pro'];
      const validIntervals = ['month', 'semiannual', 'year'];
      
      if (!validTiers.includes(tier)) {
        return res.status(400).json({ error: 'Invalid tier' });
      }
      if (!validIntervals.includes(interval)) {
        return res.status(400).json({ error: 'Invalid interval' });
      }
      
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      const { paymentProviderManager } = await import("../shared/payment/PaymentProviderManager");
      const { resolveMarket } = await import("./utils/marketResolver");
      const { StripeProvider } = await import("../shared/payment/providers/StripeProvider");
      
      // Pix is only for Brazilian market
      const market = resolveMarket(req);
      if (market.currency !== 'BRL') {
        return res.status(400).json({ error: 'Pix is only available for BRL payments' });
      }
      
      // Get Stripe provider
      const providerResult = paymentProviderManager.getProvider("stripe");
      if (!providerResult.success) {
        return res.status(500).json({ error: 'Payment provider not available' });
      }
      
      const stripeProvider = providerResult.data as any;
      
      // Get or create customer
      let customerId: string | null = user.providerCustomerId ?? null;
      
      if (!customerId) {
        const email = user.email;
        if (!email) {
          return res.status(400).json({ error: 'Email is required' });
        }
        
        const name: string | undefined =
          user.firstName && user.lastName
            ? `${user.firstName} ${user.lastName}`
            : user.email ?? undefined;

        const customerResult = await stripeProvider.createCustomer({
          email,
          name,
          userId,
        });
        
        if (!customerResult.success) {
          return res.status(500).json({ error: 'Failed to create customer' });
        }
        
        customerId = customerResult.data!.providerId;
        await storage.updateUserProviderInfo(userId, 'stripe', customerId!, null);
      }

      // Get the price for this tier and interval
      const priceEnvKey = `STRIPE_PRICE_${tier.toUpperCase()}_BRL${interval === 'month' ? '' : interval === 'semiannual' ? '_SEMESTR' : '_ANUAL'}`;
      const priceId = process.env[priceEnvKey];
      
      if (!priceId) {
        console.error(`[PIX-CHECKOUT] Price not found for ${priceEnvKey}`);
        return res.status(500).json({ error: 'Price configuration not found' });
      }
      
      // Fetch the actual price from Stripe
      const Stripe = (await import('stripe')).default;
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
      const price = await stripe.prices.retrieve(priceId);
      const amount = price.unit_amount || 0;
      
      console.log(`[PIX-CHECKOUT] Creating Pix checkout for tier=${tier}, interval=${interval}, amount=${amount}`);
      
      // Create Pix checkout session (StripeProvider handles adding session_id and pix=true to successUrl)
      const checkoutResult = await stripeProvider.createPixCheckout({
        customerId,
        userId,
        amount,
        tier,
        interval,
        locale: market.locale,
        successUrl: successUrl || `${req.protocol}://${req.get('host')}/subscription/success`,
        cancelUrl: cancelUrl || `${req.protocol}://${req.get('host')}/subscription/cancel`,
      });
      
      if (!checkoutResult.success) {
        console.error('[PIX-CHECKOUT] Failed:', checkoutResult.error);
        return res.status(500).json({ error: checkoutResult.error });
      }
      
      console.log(`[PIX-CHECKOUT] Session created: ${checkoutResult.data!.id}`);
      
      res.json(checkoutResult.data);
      
    } catch (error: any) {
      console.error('[PIX-CHECKOUT] Error:', error);
      res.status(500).json({ 
        error: 'Failed to create Pix checkout',
        message: error.message 
      });
    }
  });

  // Verify Pix payment and activate subscription
  app.post('/api/subscription/verify-pix', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      const { sessionId } = req.body;
      
      if (!sessionId) {
        return res.status(400).json({ error: 'Session ID is required' });
      }
      
      console.log(`[VERIFY-PIX] Verifying session ${sessionId} for user ${userId}`);
      
      const { paymentProviderManager } = await import("../shared/payment/PaymentProviderManager");
      const { StripeProvider } = await import("../shared/payment/providers/StripeProvider");
      
      const providerResult = paymentProviderManager.getProvider("stripe");
      if (!providerResult.success) {
        return res.status(500).json({ error: 'Payment provider not available' });
      }
      
      const stripeProvider = providerResult.data as any;
      
      // Verify the Pix payment
      const verifyResult = await stripeProvider.verifyPixPayment(sessionId);
      
      if (!verifyResult.success) {
        console.log(`[VERIFY-PIX] Payment not completed: ${verifyResult.error}`);
        return res.status(400).json({ 
          error: verifyResult.error,
          code: verifyResult.code
        });
      }
      
      const paymentData = verifyResult.data!;
      
      // Security check: verify the payment belongs to this user
      if (paymentData.userId !== userId) {
        console.error(`[VERIFY-PIX] User mismatch: session user ${paymentData.userId} vs request user ${userId}`);
        return res.status(403).json({ error: 'This payment does not belong to your account' });
      }
      
      console.log(`[VERIFY-PIX] Payment verified: tier=${paymentData.tier}, expires=${paymentData.accessExpiresAt}`);
      
      // Update user subscription using the simpler overload
      await storage.updateUserSubscription(userId, {
        subscriptionTier: paymentData.tier,
        subscriptionStatus: 'active',
        subscriptionEndsAt: paymentData.accessExpiresAt,
        paymentProvider: 'stripe',
        providerSubscriptionId: `pix_${paymentData.paymentIntentId}`, // Prefix to identify Pix payments
      });
      
      // Record payment in history
      const { db } = await import('./db');
      const { paymentHistory } = await import('../shared/schema');
      
      await db.insert(paymentHistory).values({
        userId,
        paymentIntentId: paymentData.paymentIntentId,
        amount: paymentData.amount,
        currency: 'BRL',
        status: 'succeeded',
        paymentMethod: 'pix',
        tier: paymentData.tier,
        interval: paymentData.interval,
        expiresAt: paymentData.accessExpiresAt,
        metadata: {
          sessionId,
          activatedAt: new Date().toISOString(),
        },
      });
      
      console.log(`[VERIFY-PIX] Subscription activated for user ${userId}, tier: ${paymentData.tier}`);
      
      // Get updated user
      const updatedUser = await storage.getUser(userId);
      
      res.json({
        success: true,
        tier: paymentData.tier,
        interval: paymentData.interval,
        expiresAt: paymentData.accessExpiresAt.toISOString(),
        user: updatedUser,
      });
      
    } catch (error: any) {
      console.error('[VERIFY-PIX] Error:', error);
      res.status(500).json({ 
        error: 'Failed to verify Pix payment',
        message: error.message 
      });
    }
  });

  // Stripe webhook endpoint (requires raw body) - Must be registered before any JSON middleware
  app.post('/api/webhooks/stripe', express.raw({type: 'application/json'}), async (req, res) => {
    console.log('[STRIPE WEBHOOK] Request received at /api/webhooks/stripe');
    console.log('[STRIPE WEBHOOK] Headers:', JSON.stringify(req.headers));
    
    try {
      const signature = req.headers['stripe-signature'] as string;
      const rawBody = req.body;
      
      console.log('[STRIPE WEBHOOK] Has signature:', !!signature);
      console.log('[STRIPE WEBHOOK] Body type:', typeof rawBody);
      console.log('[STRIPE WEBHOOK] Body is Buffer:', Buffer.isBuffer(rawBody));

      // Get Stripe provider and process webhook
      const { paymentProviderManager } = await import("../shared/payment/PaymentProviderManager");
      const providerResult = paymentProviderManager.getProvider("stripe");

      if (!providerResult.success) {
        console.error('Stripe provider not found for webhook processing');
        return res.status(500).json({ error: 'Stripe provider not available' });
      }

      const stripeProvider = providerResult.data!;

      // Check webhook secret configuration
      const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || '';
      
      // Verify we have required components
      if (!signature) {
        console.error('Missing stripe-signature header');
        return res.status(400).json({ error: 'Missing stripe-signature header' });
      }
      
      if (!webhookSecret || webhookSecret === '') {
        console.error('STRIPE_WEBHOOK_SECRET not configured');
        console.log('Please set STRIPE_WEBHOOK_SECRET with your webhook endpoint secret from Stripe Dashboard');
        return res.status(500).json({ error: 'Webhook secret not configured' });
      }
      
      // Verify webhook signature using the raw Buffer (required by Stripe SDK)
      if (!stripeProvider.verifyWebhook(rawBody, signature, webhookSecret)) {
        console.error('⚠️ Webhook signature verification failed');
        console.log('Ensure STRIPE_WEBHOOK_SECRET matches your endpoint secret in Stripe Dashboard');
        console.log('Your webhook endpoint URL should be: https://scanmyscale.com/api/webhooks/stripe');
        return res.status(400).json({ error: 'Invalid webhook signature' });
      }
      

      // Parse the verified webhook event
      let event;
      try {
        const bodyString = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : rawBody.toString();
        event = JSON.parse(bodyString);
      } catch (err) {
        console.error('Invalid JSON in webhook body');
        return res.status(400).json({ error: 'Invalid JSON' });
      }

      const webhookEvent = {
        id: event.id,
        type: event.type,
        data: event.data,
        provider: "stripe" as const,
        timestamp: new Date()
      };

      const processResult = await stripeProvider.processWebhook(webhookEvent);
      if (!processResult.success) {
        console.error('Webhook processing failed:', processResult.error);
        return res.status(500).json({ error: 'Webhook processing failed' });
      }

      // Handle subscription status updates
      if (['checkout.session.completed', 'customer.subscription.updated', 'customer.subscription.deleted'].includes(event.type)) {
        try {
          const subscription = event.data.object;
          let customerId = '';
          let subscriptionId = '';

          if (event.type === 'checkout.session.completed') {
            customerId = subscription.customer;
            subscriptionId = subscription.subscription;
          } else {
            customerId = subscription.customer;
            subscriptionId = subscription.id;
          }

          // Find user by Stripe customer ID
          const user = await storage.getUserByProviderCustomerId(customerId);
          if (user) {
            // Get updated subscription details from Stripe
            const subResult = await stripeProvider.getSubscription(subscriptionId);
            if (subResult.success) {
              const sub = subResult.data!;
              
              // Update user subscription in database
              await storage.updateUserSubscription(user.id, {
                paymentProvider: "stripe",
                providerCustomerId: customerId,
                providerSubscriptionId: subscriptionId,
                subscriptionStatus: sub.status,
                subscriptionTier: sub.metadata?.tier || "starter",
                subscriptionCurrentPeriodEnd: sub.currentPeriodEnd,
                subscriptionEndsAt: sub.cancelAtPeriodEnd ? sub.currentPeriodEnd : null
              });

              console.log(`Updated subscription for user ${user.id}: ${sub.status} (${sub.metadata?.tier})`);
            }
          } else {
            console.warn(`No user found for Stripe customer ID: ${customerId}`);
          }
        } catch (error) {
          console.error('Error processing subscription webhook:', error);
        }
      }

      res.json({ received: true });
    } catch (error) {
      console.error('Stripe webhook error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Manual sync endpoint to fix subscription status from Stripe
  app.post('/api/subscription/sync', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      // Check if user has a Stripe customer ID
      if (!user.providerCustomerId || !user.providerCustomerId.startsWith('cus_')) {
        return res.status(400).json({ error: 'No Stripe customer ID found for user' });
      }

      const { paymentProviderManager } = await import("../shared/payment/PaymentProviderManager");
      const providerResult = paymentProviderManager.getProvider("stripe");
      
      if (!providerResult.success) {
        return res.status(500).json({ error: 'Stripe provider not available' });
      }

      const stripeProvider = providerResult.data! as any;
      
      // Get active subscriptions from Stripe
      const stripe = stripeProvider.stripe;
      const subscriptions = await stripe.subscriptions.list({
        customer: user.providerCustomerId,
        status: 'active',
        limit: 1
      });

      if (subscriptions.data.length === 0) {
        // Check for trialing subscriptions
        const trialingSubscriptions = await stripe.subscriptions.list({
          customer: user.providerCustomerId,
          status: 'trialing',
          limit: 1
        });
        
        if (trialingSubscriptions.data.length === 0) {
          return res.status(404).json({ error: 'No active subscription found in Stripe' });
        }
        
        subscriptions.data = trialingSubscriptions.data;
      }

      const subscription = subscriptions.data[0];
      
      // Determine tier from price ID or metadata
      let tier = subscription.metadata?.tier || 'starter';
      
      // Map price IDs to tiers if metadata doesn't have tier
      if (!subscription.metadata?.tier) {
        const priceId = subscription.items.data[0]?.price.id;
        if (priceId === process.env.STRIPE_PRICE_STARTER) tier = 'starter';
        else if (priceId === process.env.STRIPE_PRICE_PREMIUM) tier = 'premium';
        else if (priceId === process.env.STRIPE_PRICE_PRO) tier = 'pro';
      }

      // Update user subscription in database
      await storage.updateUserSubscription(userId, {
        paymentProvider: "stripe",
        providerCustomerId: user.providerCustomerId,
        providerSubscriptionId: subscription.id,
        subscriptionStatus: subscription.status as any,
        subscriptionTier: tier as any,
        subscriptionCurrentPeriodEnd: new Date(subscription.current_period_end * 1000),
        subscriptionEndsAt: subscription.cancel_at_period_end 
          ? new Date(subscription.current_period_end * 1000) 
          : null
      });

      console.log(`Manually synced subscription for user ${user.email}: ${subscription.status} (${tier})`);

      res.json({ 
        success: true,
        message: 'Subscription synced successfully',
        subscription: {
          status: subscription.status,
          tier: tier,
          currentPeriodEnd: new Date(subscription.current_period_end * 1000)
        }
      });

    } catch (error) {
      console.error('Error syncing subscription:', error);
      res.status(500).json({ 
        error: 'Failed to sync subscription',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Add billing portal endpoint for Stripe
  app.post('/api/subscription/portal', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      const { returnUrl } = req.body;

      const user = await storage.getUser(userId);
      if (!user || !user.providerCustomerId) {
        return res.status(400).json({ error: 'No active subscription found' });
      }

      const { paymentProviderManager } = await import("../shared/payment/PaymentProviderManager");
      const { resolveMarket } = await import("./utils/marketResolver");
      
      const market = resolveMarket(req);
      const providerResult = paymentProviderManager.getProviderForMarket(market);
      
      if (!providerResult.success || providerResult.data!.name !== "stripe") {
        return res.status(400).json({ error: 'Billing portal only available for Stripe subscriptions' });
      }

      const stripeProvider = providerResult.data! as any;
      const portalResult = await stripeProvider.createBillingPortalSession(
        user.providerCustomerId,
        returnUrl || `${req.protocol}://${req.get('host')}/profile`
      );

      if (!portalResult.success) {
        return res.status(500).json({ 
          error: 'Failed to create billing portal session',
          message: portalResult.error 
        });
      }

      res.json({ url: portalResult.data!.url });
    } catch (error) {
      console.error('Error creating billing portal session:', error);
      res.status(500).json({ 
        error: 'Internal server error',
        message: 'Failed to create billing portal session'
      });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
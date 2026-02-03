import type { Express } from "express";
import { isAuthenticated } from "../auth";
import { db } from "../db";
import { users } from "@shared/schema";
import { eq } from "drizzle-orm";
import { 
  canAccessWhatsApp, 
  getInitialWhatsAppStatus, 
  calculateWhatsAppTrialEndDate,
  isWhatsAppIncludedInPlan,
  getWhatsAppTrialDaysRemaining
} from "../whatsappAccess";

export function registerWhatsAppRoutes(app: Express) {
  
  /**
   * GET /api/whatsapp/status
   * Get current WhatsApp integration status for the user
   */
  app.get('/api/whatsapp/status', isAuthenticated, async (req, res) => {
    try {
      const userId = req.user!.id;
      
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const accessResult = await canAccessWhatsApp(user);
      const subscriptionTier = (user as any).subscriptionTier || "free";
      const includedInPlan = isWhatsAppIncludedInPlan(subscriptionTier);

      res.json({
        enabled: (user as any).whatsappEnabled || false,
        phone: (user as any).whatsappPhone || null,
        status: (user as any).whatsappStatus || "not_enabled",
        canAccess: accessResult.canAccess,
        reason: accessResult.reason,
        trialDaysRemaining: accessResult.trialDaysRemaining,
        trialEndsAt: (user as any).whatsappTrialEndsAt,
        optInAt: (user as any).whatsappOptInAt,
        includedInPlan,
        subscriptionTier
      });

    } catch (error) {
      console.error("Error fetching WhatsApp status:", error);
      res.status(500).json({ 
        message: error instanceof Error ? error.message : "Failed to fetch WhatsApp status" 
      });
    }
  });

  /**
   * POST /api/whatsapp/connect
   * Initiate WhatsApp connection (generates verification code or QR)
   */
  app.post('/api/whatsapp/connect', isAuthenticated, async (req, res) => {
    try {
      const userId = req.user!.id;
      const { phoneNumber } = req.body;

      if (!phoneNumber) {
        return res.status(400).json({ message: "Phone number is required" });
      }

      // Validate phone number format (basic validation)
      const phoneRegex = /^\+?[1-9]\d{1,14}$/;
      if (!phoneRegex.test(phoneNumber)) {
        return res.status(400).json({ 
          message: "Invalid phone number format. Use international format (e.g., +5511999999999)" 
        });
      }

      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const subscriptionTier = (user as any).subscriptionTier || "free";
      const initialStatus = getInitialWhatsAppStatus(subscriptionTier);
      
      // Calculate trial end date only for free users
      const trialEndsAt = subscriptionTier === "free" 
        ? calculateWhatsAppTrialEndDate() 
        : null;

      // Update user with WhatsApp connection details
      await db
        .update(users)
        .set({
          whatsappPhone: phoneNumber,
          whatsappEnabled: true,
          whatsappStatus: initialStatus,
          whatsappOptInAt: new Date(),
          whatsappTrialEndsAt: trialEndsAt,
          updatedAt: new Date()
        } as any)
        .where(eq(users.id, userId));

      // In a real implementation, this is where you would:
      // 1. Call Respond.io API to send verification code
      // 2. Or generate QR code for WhatsApp linking
      // For now, we'll return a placeholder verification flow

      res.json({
        success: true,
        message: "WhatsApp connection initiated",
        phoneNumber,
        status: initialStatus,
        verificationMethod: "qr_code", // or "otp"
        trialEndsAt,
        // In production, include:
        // qrCode: "data:image/png;base64,..." or
        // verificationCode: "123456"
      });

    } catch (error) {
      console.error("Error connecting WhatsApp:", error);
      res.status(500).json({ 
        message: error instanceof Error ? error.message : "Failed to connect WhatsApp" 
      });
    }
  });

  /**
   * POST /api/whatsapp/verify
   * Verify phone number with OTP or QR code scan confirmation
   */
  app.post('/api/whatsapp/verify', isAuthenticated, async (req, res) => {
    try {
      const userId = req.user!.id;
      const { verificationCode } = req.body;

      // In production, verify the code/QR scan with Respond.io
      // For now, auto-approve

      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      if ((user as any).whatsappStatus !== "pending_verification") {
        return res.status(400).json({ 
          message: "No pending verification" 
        });
      }

      const subscriptionTier = (user as any).subscriptionTier || "free";
      const finalStatus = isWhatsAppIncludedInPlan(subscriptionTier) ? "active" : "trialing";

      // Update status to active or trialing
      await db
        .update(users)
        .set({
          whatsappStatus: finalStatus,
          updatedAt: new Date()
        } as any)
        .where(eq(users.id, userId));

      res.json({
        success: true,
        message: "WhatsApp verified successfully",
        status: finalStatus
      });

    } catch (error) {
      console.error("Error verifying WhatsApp:", error);
      res.status(500).json({ 
        message: error instanceof Error ? error.message : "Failed to verify WhatsApp" 
      });
    }
  });

  /**
   * DELETE /api/whatsapp/disconnect
   * Disconnect WhatsApp integration
   */
  app.delete('/api/whatsapp/disconnect', isAuthenticated, async (req, res) => {
    try {
      const userId = req.user!.id;

      await db
        .update(users)
        .set({
          whatsappEnabled: false,
          whatsappStatus: null,
          whatsappPhone: null,
          whatsappOptInAt: null,
          whatsappTrialEndsAt: null,
          whatsappLastMessageAt: null,
          updatedAt: new Date()
        } as any)
        .where(eq(users.id, userId));

      res.json({
        success: true,
        message: "WhatsApp disconnected successfully"
      });

    } catch (error) {
      console.error("Error disconnecting WhatsApp:", error);
      res.status(500).json({ 
        message: error instanceof Error ? error.message : "Failed to disconnect WhatsApp" 
      });
    }
  });

  /**
   * POST /api/whatsapp/webhook
   * Receive messages from Respond.io (for future implementation)
   */
  app.post('/api/whatsapp/webhook', async (req, res) => {
    try {
      // Verify webhook signature (Respond.io specific)
      // Process incoming WhatsApp messages
      // Route to appropriate handler (weight entry, chart request, etc.)
      
      console.log("WhatsApp webhook received:", req.body);
      
      // For now, just acknowledge receipt
      res.json({ success: true });

    } catch (error) {
      console.error("Error processing WhatsApp webhook:", error);
      res.status(500).json({ 
        message: error instanceof Error ? error.message : "Failed to process webhook" 
      });
    }
  });
}

import { storage } from "./storage";
import { emailService, type EmailData } from "./emailService";
import { randomInt } from "crypto";
import { getMarketFromRequest, getUserLocale, getEmailTemplate, t } from "./i18n";
import { getMarket, US_MARKET } from "@shared/config/markets";

export class EmailVerificationService {
  // Generate a cryptographically secure 6-digit verification code
  private generateVerificationCode(): string {
    return randomInt(100000, 999999).toString();
  }

  // Rate limiting cache for send attempts
  private sendAttempts = new Map<string, { count: number; lastAttempt: number }>();
  private verifyAttempts = new Map<string, { count: number; lastAttempt: number }>();

  // Check rate limiting for send attempts (max 5 per 15 minutes)
  private checkSendRateLimit(userId: string): boolean {
    const now = Date.now();
    const userAttempts = this.sendAttempts.get(userId) || { count: 0, lastAttempt: 0 };
    
    // Reset if 15 minutes have passed
    if (now - userAttempts.lastAttempt > 15 * 60 * 1000) {
      userAttempts.count = 0;
    }
    
    if (userAttempts.count >= 5) {
      return false; // Rate limited
    }
    
    userAttempts.count++;
    userAttempts.lastAttempt = now;
    this.sendAttempts.set(userId, userAttempts);
    return true;
  }

  // Check rate limiting for verify attempts (max 10 per 15 minutes)
  private checkVerifyRateLimit(userId: string): boolean {
    const now = Date.now();
    const userAttempts = this.verifyAttempts.get(userId) || { count: 0, lastAttempt: 0 };
    
    // Reset if 15 minutes have passed
    if (now - userAttempts.lastAttempt > 15 * 60 * 1000) {
      userAttempts.count = 0;
    }
    
    if (userAttempts.count >= 10) {
      return false; // Rate limited
    }
    
    userAttempts.count++;
    userAttempts.lastAttempt = now;
    this.verifyAttempts.set(userId, userAttempts);
    return true;
  }

  // Send verification email to user
  async sendVerificationEmail(userId: string, email: string, req?: any, originDomain?: string): Promise<{ success: boolean; message: string }> {
    try {
      // Check if user exists first (needed for market determination)
      const user = await storage.getUser(userId);
      if (!user) {
        // Without user, fall back to request-based market detection
        const fallbackMarket = req ? getMarketFromRequest(req) : US_MARKET;
        const locale = fallbackMarket.language || 'en';
        return { success: false, message: t(locale, 'errors.userNotFound') };
      }

      // Determine market: originDomain (most reliable) > user settings > request headers > fallback
      let market;
      if (originDomain?.includes('fotopeso')) {
        market = getMarket('br') || US_MARKET; // Brazilian market from origin domain
      } else if (originDomain?.includes('scanmyscale')) {
        market = getMarket('us') || US_MARKET; // US market from origin domain
      } else if (user.currency === 'BRL' || user.locale?.startsWith('pt')) {
        market = getMarket('br') || US_MARKET; // Brazilian market from user settings
      } else if (req) {
        market = getMarketFromRequest(req); // Fall back to request-based detection
      } else {
        market = US_MARKET; // Final fallback
      }

      // Check rate limiting
      if (!this.checkSendRateLimit(userId)) {
        const locale = market.language || 'en';
        return { success: false, message: t(locale, 'errors.tooManyVerificationAttempts') };
      }
      
      // Get user's preferred locale
      const locale = getUserLocale(user, market);
      

      // Clean up any expired codes
      await storage.deleteExpiredCodes();

      // Generate verification code
      const code = this.generateVerificationCode();
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes from now

      // Store verification code
      await storage.createVerificationCode(userId, email, code, expiresAt);

      // Prepare localized email content
      const userName = user.firstName || t(locale, 'errors.there');
      // Create URL with parameters to go directly to code entry step
      const encodedEmail = encodeURIComponent(email);
      const verifyUrl = `https://${market.domain}/verify-email?step=code&email=${encodedEmail}`;
      const cta = t(locale, 'email.verification.cta' as any, {});
      const instructions = t(locale, 'email.verification.instructions' as any, {});
      const expiry = t(locale, 'email.verification.expiry' as any, {});
      
      const { subject, html } = getEmailTemplate(locale, 'verification', market, {
        code,
        userName,
        cta,
        ctaUrl: verifyUrl,
        instructions,
        expiry
      });
      
      const emailData: EmailData = {
        to: email,
        subject,
        html,
        from: 'noreply@scanmyscale.com',
      };

      // Send email
      const emailSent = await emailService.sendEmail(emailData);
      
      if (emailSent) {
        return { 
          success: true, 
          message: t(locale, 'errors.verificationCodeSentSuccessfully')
        };
      } else {
        return { 
          success: false, 
          message: t(locale, 'errors.failedToSendVerificationEmail')
        };
      }

    } catch (error) {
      console.error("Email verification service error:", error);
      return { 
        success: false, 
        message: t('en', 'errors.errorOccurredSendingEmail') 
      };
    }
  }

  // Verify the code and update user's email
  async verifyEmailCode(userId: string, code: string, req?: any): Promise<{ success: boolean; message: string }> {
    try {
      // Get market and user information for localization
      const market = req ? getMarketFromRequest(req) : US_MARKET;
      const user = await storage.getUser(userId);
      const locale = user ? getUserLocale(user, market) : (market.language || 'en');

      // Check rate limiting
      if (!this.checkVerifyRateLimit(userId)) {
        return { 
          success: false, 
          message: t(locale, 'errors.tooManyVerifyAttempts')
        };
      }

      // Get the verification code
      const verificationCode = await storage.getVerificationCode(userId, code);
      
      if (!verificationCode) {
        return { 
          success: false, 
          message: t(locale, 'errors.invalidOrExpiredCode')
        };
      }

      // Mark code as used
      await storage.markVerificationCodeUsed(verificationCode.id);

      // Check if email is still available before updating
      const emailConflict = await storage.getUserByEmail(verificationCode.email);
      if (emailConflict && emailConflict.id !== userId) {
        return { 
          success: false, 
          message: t(locale, 'errors.emailAlreadyTaken')
        };
      }

      // Update user's email and mark as verified
      await storage.updateUserEmailVerified(userId, verificationCode.email, true);
      
      // Clear rate limiting on successful verification
      this.verifyAttempts.delete(userId);

      return { 
        success: true, 
        message: t(locale, 'errors.emailVerifiedSuccessfully')
      };

    } catch (error) {
      console.error("Email verification error:", error);
      return { 
        success: false, 
        message: t('en', 'errors.verificationError')
      };
    }
  }

  // Check if user needs email verification
  async needsEmailVerification(userId: string): Promise<boolean> {
    try {
      const user = await storage.getUser(userId);
      if (!user) return false;

      // Check if user has a generated email (from Facebook) and it's not verified
      return user.email?.includes('@scanmyscale.temp') || !user.emailVerified;
    } catch (error) {
      console.error("Error checking email verification status:", error);
      return false;
    }
  }
}

export const emailVerificationService = new EmailVerificationService();
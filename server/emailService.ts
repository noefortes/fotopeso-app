import { MailService } from '@sendgrid/mail';
import { getEmailTemplate, t } from './i18n';
import { resolveMarket, type MarketConfig } from '@shared/config/markets';

// Check if SendGrid is configured
const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;
let emailConfigured = false;

if (SENDGRID_API_KEY) {
  try {
    const mailService = new MailService();
    mailService.setApiKey(SENDGRID_API_KEY);
    emailConfigured = true;
    console.log('Email service configured successfully');
  } catch (error) {
    console.log('Email service disabled: Invalid SendGrid API key');
    emailConfigured = false;
  }
} else {
  console.log('Email service disabled: SENDGRID_API_KEY not configured');
}

const mailService = emailConfigured ? new MailService() : null;
if (mailService && SENDGRID_API_KEY) {
  mailService.setApiKey(SENDGRID_API_KEY);
}

export interface EmailData {
  to: string;
  subject: string;
  html: string;
  text?: string;
  from?: string;
}

export class EmailService {
  async sendEmail(emailData: EmailData): Promise<boolean> {
    if (!emailConfigured || !mailService) {
      console.log('Email service not configured - email not sent');
      return false;
    }

    try {
      await mailService.send({
        to: emailData.to,
        from: emailData.from || 'noefortes@scanmyscale.com', // Use provided from address or default
        subject: emailData.subject,
        html: emailData.html,
        text: emailData.text || emailData.html.replace(/<[^>]*>/g, ''), // Strip HTML for text version
      });
      
      console.log(`Email sent successfully to ${emailData.to}: ${emailData.subject}`);
      return true;
    } catch (error: any) {
      console.error('Failed to send email:', error);
      return false;
    }
  }

  async sendDailyWeighInReminder(
    userEmail: string, 
    userName: string = 'there', 
    market?: MarketConfig, 
    locale?: string
  ): Promise<boolean> {
    // Use provided market or default to US
    const currentMarket = market || resolveMarket('us');
    const currentLocale = locale || currentMarket.language || 'en';
    
    const ctaUrl = `https://${currentMarket.domain}`;
    const cta = t(currentLocale, 'email.dailyReminder.cta');
    
    const { subject, html } = getEmailTemplate(currentLocale, 'dailyReminder', currentMarket, {
      userName,
      cta,
      ctaUrl
    });
    
    const emailData: EmailData = {
      to: userEmail,
      subject,
      html,
      from: `noefortes@${currentMarket.domain}`,
    };

    return this.sendEmail(emailData);
  }

  async sendWeeklyProgressSummary(
    userEmail: string, 
    progressData: any, 
    market?: MarketConfig, 
    locale?: string
  ): Promise<boolean> {
    const { userName = 'there', recordingCount = 0, weightChange = 0, streak = 0 } = progressData;
    
    // Use provided market or default to US
    const currentMarket = market || resolveMarket('us');
    const currentLocale = locale || currentMarket.language || 'en';
    
    const ctaUrl = `https://${currentMarket.domain}/analytics`;
    const cta = t(currentLocale, 'email.weeklyProgress.cta', {});
    
    const { subject, html } = getEmailTemplate(currentLocale, 'weeklyProgress', currentMarket, {
      userName,
      recordingCount,
      weightChange: `${weightChange >= 0 ? '+' : ''}${weightChange.toFixed(1)}`,
      streak,
      cta,
      ctaUrl
    });
    
    const emailData: EmailData = {
      to: userEmail,
      subject,
      html,
      from: `noefortes@${currentMarket.domain}`,
    };

    return this.sendEmail(emailData);
  }
}

export const emailService = new EmailService();
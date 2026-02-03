import { emailService } from './emailService';
import { smsService } from './smsService';
import { storage } from './storage';
import { getMarketFromDomain, getUserLocale, getEmailTemplate } from "./i18n";
import { resolveMarket, BRAZIL_MARKET, US_MARKET, type MarketConfig } from "@shared/config/markets";

// Helper function to determine user's market based on their locale and currency
function getUserMarket(user: any): MarketConfig {
  // If user has Brazilian locale (pt-BR or pt), use Brazilian market
  if (user.locale && (user.locale.startsWith('pt') || user.locale.includes('BR'))) {
    return BRAZIL_MARKET;
  }
  
  // If user has Brazilian currency, use Brazilian market  
  if (user.currency === 'BRL') {
    return BRAZIL_MARKET;
  }
  
  // Default to US market
  return US_MARKET;
}

class ReminderScheduler {
  private dailyReminderInterval?: NodeJS.Timeout;
  private weeklyProgressInterval?: NodeJS.Timeout;
  
  start() {
    console.log('Starting reminder scheduler...');
    
    // Schedule daily reminders at 9:00 AM every day
    this.scheduleDailyReminders();
    
    // Schedule weekly progress summaries on Sundays at 6:00 PM
    this.scheduleWeeklyProgress();
  }

  stop() {
    if (this.dailyReminderInterval) {
      clearInterval(this.dailyReminderInterval);
    }
    if (this.weeklyProgressInterval) {
      clearInterval(this.weeklyProgressInterval);
    }
  }

  private scheduleDailyReminders() {
    // Run every hour to check if it's time to send daily reminders
    this.dailyReminderInterval = setInterval(async () => {
      const now = new Date();
      const hour = now.getHours();
      
      
      // Send daily reminders at 9:00 AM
      if (hour === 9) {
        console.log('Sending daily weigh-in reminders...');
        await this.sendDailyReminders();
      }
    }, 60 * 60 * 1000); // Check every hour
    
    console.log('Daily reminder scheduler initialized (9:00 AM)');
  }

  private scheduleWeeklyProgress() {
    // Run every hour to check if it's time to send weekly summaries
    this.weeklyProgressInterval = setInterval(async () => {
      const now = new Date();
      const hour = now.getHours();
      const dayOfWeek = now.getDay(); // 0 = Sunday
      
      // Send weekly summaries on Sundays at 6:00 PM
      if (dayOfWeek === 0 && hour === 18) {
        console.log('Sending weekly progress summaries...');
        await this.sendWeeklyProgressSummaries();
      }
    }, 60 * 60 * 1000); // Check every hour
    
    console.log('Weekly progress scheduler initialized (Sundays 6:00 PM)');
  }

  private async sendDailyReminders(): Promise<void> {
    try {
      // Get all users with daily reminders enabled
      const users = await storage.getUsersWithDailyReminders();
      console.log(`Found ${users.length} users with daily reminders enabled`);
      
      for (const user of users) {
        try {
          // Check if user has already recorded weight today
          const hasRecordedToday = await storage.hasUserRecordedToday(user.id);
          
          if (!hasRecordedToday) {
            // Determine market based on user's locale and currency preferences
            const market = getUserMarket(user);
            const locale = getUserLocale(user, market);
            
            // Send email reminder if daily reminders are enabled and user has email
            if (user.dailyReminderEnabled && user.email) {
              await emailService.sendDailyWeighInReminder(
                user.email,
                user.firstName || 'there',
                market,
                locale
              );
            }
            
            // Send SMS reminder if SMS is enabled and phone number exists
            if (user.smsEnabled && user.phoneNumber) {
              await smsService.sendDailyWeighInReminder(user.phoneNumber, user, market);
            }
          }
        } catch (error) {
          console.error(`Error sending daily reminder to user ${user.id}:`, error);
        }
      }
      
      console.log(`Daily reminders processed for ${users.length} users`);
    } catch (error) {
      console.error('Error scheduling daily reminders:', error);
    }
  }

  private async sendWeeklyProgressSummaries(): Promise<void> {
    try {
      // Get all Pro users with weekly progress enabled
      const users = await storage.getUsersWithWeeklyProgress();
      
      for (const user of users) {
        try {
          // Get user's weekly stats
          const weeklyStats = await storage.getUserWeeklyStats(user.id);
          
          const progressData = {
            userName: user.firstName || 'there',
            recordingCount: weeklyStats.recordingCount,
            weightChange: weeklyStats.weightChange,
            streak: weeklyStats.currentStreak,
          };
          
          // Determine market based on user's locale and currency preferences
          const market = getUserMarket(user);
          const locale = getUserLocale(user, market);
          
          // Send email summary if weekly progress is enabled and user has email
          if (user.weeklyProgressEnabled && user.email) {
            await emailService.sendWeeklyProgressSummary(
              user.email,
              progressData,
              market,
              locale
            );
          }
          
          // Send SMS summary if SMS is enabled and phone number exists
          if (user.smsEnabled && user.phoneNumber) {
            await smsService.sendWeeklyProgressSummary(user.phoneNumber, progressData, user, market);
          }
        } catch (error) {
          console.error(`Error sending weekly progress to user ${user.id}:`, error);
        }
      }
      
      console.log(`Weekly progress summaries processed for ${users.length} users`);
    } catch (error) {
      console.error('Error scheduling weekly progress summaries:', error);
    }
  }
}

export const reminderScheduler = new ReminderScheduler();


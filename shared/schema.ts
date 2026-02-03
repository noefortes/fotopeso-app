import { sql } from 'drizzle-orm';
import {
  index,
  jsonb,
  pgTable,
  timestamp,
  varchar,
  decimal,
  boolean,
  text,
  integer,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Session storage table.
// (IMPORTANT) This table is mandatory for Replit Auth, don't drop it.
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

// User storage table.
// (IMPORTANT) This table is mandatory for Replit Auth, don't drop it.
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").unique(),
  password: varchar("password"), // For email/password auth
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  subscriptionTier: varchar("subscription_tier").default("free"), // "free", "starter", "premium", "pro", or "admin"
  // Provider-agnostic payment fields
  paymentProvider: varchar("payment_provider"), // "revenuecat", "mercadopago", "pagarme", "pagseguro"
  providerCustomerId: varchar("provider_customer_id"), // Provider-specific customer ID
  providerSubscriptionId: varchar("provider_subscription_id"), // Provider-specific subscription ID
  providerMetadata: jsonb("provider_metadata"), // Provider-specific subscription metadata
  subscriptionStatus: varchar("subscription_status").default("inactive"), // "active", "inactive", "canceled", "past_due", "pending", "trialing"
  subscriptionEndsAt: timestamp("subscription_ends_at"), // When current subscription period ends
  // Legacy subscription period fields (keeping for backward compatibility)
  subscriptionCurrentPeriodStart: timestamp("subscription_current_period_start"),
  subscriptionCurrentPeriodEnd: timestamp("subscription_current_period_end"),
  subscriptionPeriodEnd: timestamp("subscription_period_end"),
  trialEndsAt: timestamp("trial_ends_at"), // Free trial end date for Pro features
  locale: varchar("locale").default("en"), // User's preferred locale (en, pt-BR, etc.)
  currency: varchar("currency").default("USD"), // User's currency preference (USD, BRL, etc.)
  goalWeight: decimal("goal_weight", { precision: 5, scale: 2 }),
  height: decimal("height", { precision: 5, scale: 2 }), // Height value
  heightUnit: varchar("height_unit").default("inches"), // "inches" or "cm" - user's preferred height unit
  bmi: decimal("bmi", { precision: 4, scale: 1 }), // BMI calculated automatically
  dateOfBirth: timestamp("date_of_birth"),
  sex: varchar("sex"), // "male" or "female"
  weightUnit: varchar("weight_unit").default("lbs"), // "lbs" or "kg" - user's preferred unit
  dailyReminderEnabled: boolean("daily_reminder_enabled").default(false), // Daily weigh-in reminder preference (email/SMS)
  weeklyProgressEnabled: boolean("weekly_progress_enabled").default(false), // Weekly progress summary preference (email/SMS)
  phoneNumber: varchar("phone_number"), // Phone number for SMS reminders
  smsEnabled: boolean("sms_enabled").default(false), // SMS reminder preference
  emailEnabled: boolean("email_enabled").default(true), // Email reminder preference
  appleId: varchar("apple_id").unique(), // Apple Sign-In user identifier
  facebookId: varchar("facebook_id").unique(), // Facebook user identifier
  twitterId: varchar("twitter_id").unique(), // X (Twitter) user identifier
  emailVerified: boolean("email_verified").default(false), // Whether email is verified
  // WhatsApp Integration fields
  whatsappEnabled: boolean("whatsapp_enabled").default(false), // Whether WhatsApp integration is active
  whatsappPhone: varchar("whatsapp_phone"), // User's WhatsApp phone number
  whatsappOptInAt: timestamp("whatsapp_opt_in_at"), // When user enabled WhatsApp
  whatsappTrialEndsAt: timestamp("whatsapp_trial_ends_at"), // 30-day trial expiration for free users
  whatsappStatus: varchar("whatsapp_status"), // "trialing" | "active" | "expired" | "pending_verification"
  whatsappLastMessageAt: timestamp("whatsapp_last_message_at"), // Last WhatsApp interaction timestamp
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  // Critical performance indexes for webhook and payment lookups
  index("idx_users_provider_customer_id").on(table.providerCustomerId),
  index("idx_users_provider_subscription_id").on(table.providerSubscriptionId),
  index("idx_users_whatsapp_phone").on(table.whatsappPhone),
]);

export const weightEntries = pgTable("weight_entries", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  weight: decimal("weight", { precision: 5, scale: 2 }).notNull(),
  unit: varchar("unit").default("lbs"), // "kg" or "lbs" - unit detected from scale
  photoUrl: varchar("photo_url"), // Optional photo of the scale
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  // Critical performance indexes for user weight queries
  index("idx_weight_entries_user_created").on(table.userId, table.createdAt.desc()),
  index("idx_weight_entries_user_id").on(table.userId),
]);

export const activityLog = pgTable("activity_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  type: varchar("type").notNull(), // "weight_recorded", "shared_progress", etc.
  description: text("description").notNull(),
  metadata: jsonb("metadata"), // Additional data like weight change, platform shared to, etc.
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  // Critical performance indexes for user activity queries
  index("idx_activity_log_user_created").on(table.userId, table.createdAt.desc()),
  index("idx_activity_log_user_id").on(table.userId),
]);

// Admin settings table for storing admin configurations
export const adminSettings = pgTable("admin_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  setting_key: varchar("setting_key").notNull().unique(),
  setting_value: text("setting_value").notNull(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Subscription plans table for managing pricing tiers
export const subscriptionPlans = pgTable("subscription_plans", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name").notNull(), // "Pro Monthly", "Pro Yearly"
  priceId: varchar("price_id").notNull().unique(), // Payment provider price ID
  amount: integer("amount").notNull(), // Price in cents
  currency: varchar("currency").default("usd"),
  interval: varchar("interval").notNull(), // "month", "year"
  intervalCount: integer("interval_count").default(1), // Every X intervals
  features: jsonb("features"), // Array of features included
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

// Payment history table for tracking transactions
export const paymentHistory = pgTable("payment_history", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  paymentIntentId: varchar("payment_intent_id").unique(),
  invoiceId: varchar("invoice_id").unique(),
  amount: integer("amount").notNull(), // Amount in cents
  currency: varchar("currency").default("usd"),
  status: varchar("status").notNull(), // "succeeded", "failed", "pending", "refunded", "expired"
  paymentMethod: varchar("payment_method").default("card"), // "card", "pix"
  tier: varchar("tier"), // "starter", "premium", "pro" - the tier being purchased
  interval: varchar("interval"), // "month", "semiannual", "year" - billing interval
  expiresAt: timestamp("expires_at"), // When this payment access expires (for Pix prepaid)
  planId: varchar("plan_id").references(() => subscriptionPlans.id),
  metadata: jsonb("metadata"), // Additional payment details (Pix QR code, etc.)
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  // Performance indexes for payment queries
  index("idx_payment_history_user_id").on(table.userId),
  index("idx_payment_history_user_created").on(table.userId, table.createdAt.desc()),
  index("idx_payment_history_payment_intent").on(table.paymentIntentId),
]);

// Email verification codes table
export const emailVerificationCodes = pgTable("email_verification_codes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  email: varchar("email").notNull(),
  code: varchar("code").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  verified: boolean("verified").default(false),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  // Critical indexes for email verification lookups and cleanup
  index("idx_email_verification_user_code").on(table.userId, table.code),
  index("idx_email_verification_expires").on(table.expiresAt),
]);

// Password reset tokens table
export const passwordResetTokens = pgTable("password_reset_tokens", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  token: varchar("token").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  used: boolean("used").default(false),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  // Critical indexes for password reset lookups and cleanup
  index("idx_password_reset_token").on(table.token),
  index("idx_password_reset_user_expires").on(table.userId, table.expiresAt),
]);

// WhatsApp interactions audit table for tracking messages and costs
export const whatsappInteractions = pgTable("whatsapp_interactions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  messageType: varchar("message_type").notNull(), // "reminder", "chart", "photo_response", "analytics", "welcome", "trial_warning", "trial_expired"
  direction: varchar("direction").notNull(), // "inbound" | "outbound"
  status: varchar("status").notNull(), // "sent", "delivered", "read", "failed"
  cost: decimal("cost", { precision: 10, scale: 4 }), // Meta API cost in BRL
  metadata: jsonb("metadata"), // Message details (content, WhatsApp message ID, etc.)
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  // Performance indexes for WhatsApp message queries
  index("idx_whatsapp_interactions_user_created").on(table.userId, table.createdAt.desc()),
  index("idx_whatsapp_interactions_user_id").on(table.userId),
  index("idx_whatsapp_interactions_type").on(table.messageType),
]);

// Insert schemas
export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertWeightEntrySchema = createInsertSchema(weightEntries).omit({
  id: true,
  createdAt: true,
});

export const insertActivityLogSchema = createInsertSchema(activityLog).omit({
  id: true,
  createdAt: true,
});

export const insertAdminSettingsSchema = createInsertSchema(adminSettings).omit({
  id: true,
  updatedAt: true,
});

export const insertSubscriptionPlanSchema = createInsertSchema(subscriptionPlans).omit({
  id: true,
  createdAt: true,
});

export const insertPaymentHistorySchema = createInsertSchema(paymentHistory).omit({
  id: true,
  createdAt: true,
});

export const insertEmailVerificationCodeSchema = createInsertSchema(emailVerificationCodes).omit({
  id: true,
  createdAt: true,
});

export const insertPasswordResetTokenSchema = createInsertSchema(passwordResetTokens).omit({
  id: true,
  createdAt: true,
});

export const insertWhatsappInteractionSchema = createInsertSchema(whatsappInteractions).omit({
  id: true,
  createdAt: true,
});

// Types
export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;
export type WeightEntry = typeof weightEntries.$inferSelect;
export type InsertWeightEntry = z.infer<typeof insertWeightEntrySchema>;
export type ActivityLog = typeof activityLog.$inferSelect;
export type InsertActivityLog = z.infer<typeof insertActivityLogSchema>;
export type AdminSettings = typeof adminSettings.$inferSelect;
export type InsertAdminSettings = z.infer<typeof insertAdminSettingsSchema>;
export type SubscriptionPlan = typeof subscriptionPlans.$inferSelect;
export type InsertSubscriptionPlan = z.infer<typeof insertSubscriptionPlanSchema>;
export type PaymentHistory = typeof paymentHistory.$inferSelect;
export type InsertPaymentHistory = z.infer<typeof insertPaymentHistorySchema>;
export type EmailVerificationCode = typeof emailVerificationCodes.$inferSelect;
export type InsertEmailVerificationCode = z.infer<typeof insertEmailVerificationCodeSchema>;
export type PasswordResetToken = typeof passwordResetTokens.$inferSelect;
export type InsertPasswordResetToken = z.infer<typeof insertPasswordResetTokenSchema>;
export type WhatsappInteraction = typeof whatsappInteractions.$inferSelect;
export type InsertWhatsappInteraction = z.infer<typeof insertWhatsappInteractionSchema>;

# ScanMyScale - Smart Weight Tracking with AI

## Overview
ScanMyScale is a production-ready, mobile-first web application designed for users to track weight progress using AI-powered scale image recognition. It leverages Google's Gemini AI to automatically extract weight readings from scale photos. The application offers comprehensive tracking features, historical data, analytics, progress visualization, social sharing capabilities, and user account management, aiming to provide a seamless and insightful weight management experience.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter
- **Styling**: Tailwind CSS with CSS variables and shadcn/ui
- **State Management**: TanStack Query (React Query)
- **Build Tool**: Vite
- **UI/UX**: Mobile-first responsive design, bottom navigation, web camera integration, touch-friendly.

### Backend
- **Runtime**: Node.js with Express.js
- **Language**: TypeScript with ES modules
- **API Design**: RESTful with JSON responses
- **File Upload**: Multer
- **Session Management**: Express sessions with PostgreSQL storage

### Key Features
- **Authentication**: Email/password authentication with social login UI (Google, Apple, X ready for integration), PostgreSQL-based session management, route-level protection.
- **AI Image Processing**: Google Gemini 2.5 Pro for weight extraction from scale photos, structured JSON response.
- **Weight Tracking**: Data model for entries (timestamps, photos, notes), support for kg, lbs, stones, historical trend analysis.
- **Analytics & Visualization**: Recharts for progress visualization, statistics (total lost, average per week), goal tracking.
- **Social Features**: AI-generated social media images for progress sharing (Instagram, TikTok optimized).
- **WhatsApp Integration**: Optional channel for weight tracking via WhatsApp messages, 30-day free trial for free-tier users, auto-included with paid subscriptions, phone-based opt-in system with trial countdown and subscription gating.

### Native Mobile App (Capacitor)
- **Framework**: Capacitor 8 for iOS and Android native app builds
- **Native Plugins**: @capacitor/camera, @capacitor/splash-screen, @capacitor/status-bar, @capacitor/app
- **Build Output**: `dist/public` (web assets wrapped in native containers)
- **iOS Project**: `ios/` directory with Xcode project
- **Android Project**: `android/` directory with Gradle project

#### Building Native Apps
```bash
# Build web assets and sync to native projects
npm run build && npx cap sync

# Open iOS project in Xcode (requires Mac)
npx cap open ios

# Open Android project in Android Studio
npx cap open android
```

#### Publishing Requirements
- **iOS**: Apple Developer Program ($99/year), Xcode on Mac, App Store Connect account
- **Android**: Google Play Developer account ($25 one-time), Android Studio

## Recent Changes
- **February 3, 2026**: Added Capacitor integration for native iOS and Android app builds. Configured native camera plugin with fallback to web API, iOS Info.plist with camera permission descriptions, and updated camera modal to use native camera when running in Capacitor environment.
- **December 3, 2025**: Configured SendGrid email service with domain authentication for scanmyscale.com. Email verification flow fully functional, sending transactional emails from noreply@scanmyscale.com. Fixed admin panel user creation with proper password hashing using bcrypt.
- **October 3, 2025**: Fully implemented WhatsApp integration with Settings-based opt-in (NOT auth-page login to avoid confusion). Complete database schema with whatsappEnabled/whatsappStatus/whatsappTrialEndsAt/whatsappPhone fields and whatsappInteractions audit table. Backend API endpoints (/api/whatsapp/connect, verify, status, disconnect) with subscription-based access middleware (hasWhatsAppAccess). Settings page UI with trial countdown, expiration warnings, and subscription gating. Business model: Free tier = 30-day trial then upgrade required; Paid tiers (Starter/Premium/Pro) = auto-included. Selected Respond.io as WhatsApp Business Solution Provider (Meta BSP, 4.8★ support, free API, omnichannel expandability). Ready for Respond.io account setup and Meta approval.
- **September 29, 2025**: Implemented kilogram-only localization for fotopeso.com.br (Brazilian market) to eliminate user confusion. Cleaned test user database and implemented market-enforced kg-only system: (1) Added getEffectiveWeightUnit() utility for market-based unit enforcement, (2) Hidden weight unit conversion selector in Settings for Brazilian users, (3) Backend automatically converts all weight entries to kg for Brazilian market regardless of input unit, (4) New Brazilian users default to kg weight unit. This creates truly localized experience where Brazilian users only see and use kilograms, while other markets retain full unit flexibility.
- **September 29, 2025**: Enhanced AI processing UX with full-screen processing overlay featuring dynamic progress indicators, step-by-step messages, and branded animations. Replaced basic "processing" text with comprehensive 15-second experience including progress bar and contextual feedback. Implemented market-specific messaging for both English (scanmyscale.com) and Portuguese (fotopeso.com.br) with custom Brazilian Portuguese overlay text.
- **August 21, 2025**: Set up professional Google Workspace email system for scanmyscale.com with custom MX records. Company now has professional email addresses (admin@scanmyscale.com, support@scanmyscale.com). Fixed authentication flow to eliminate 404 page flash during email login by implementing immediate cache updates and improved stale-while-revalidate behavior.
- **August 21, 2025**: Completely resolved critical session persistence bug affecting all authentication methods. Fixed session storage configuration and authentication middleware to maintain sessions across server restarts. Updated weight detection routes to use correct authentication system. Removed debug logging for cleaner user experience. Authentication system now fully functional with seamless login experience for both email/password and Google OAuth.
- **January 21, 2025**: Purchased custom domain scanmyscale.com through Replit and configured Google OAuth to use stable domain. This resolves previous redirect_uri_mismatch errors with dynamic Replit domains.
- **January 19, 2025**: Reverted from Replit Auth back to custom email/password authentication system after discovering that Replit Auth still shows consent pages, which doesn't match the seamless experience found on replit.com itself. Custom auth provides the desired Instagram/TikTok-style login without any consent screens.
- **January 18, 2025**: Replaced Replit OAuth with simpler email/password authentication system. Added Instagram/TikTok-style auth page with social login buttons (Google, Apple, X) ready for future integration. Updated database schema with password field and migrated all authentication references throughout the application.
- **January 16, 2025**: Fixed profile completion validation bug where sex field selection wasn't being processed properly, affecting both frontend form validation and backend profile update endpoint.
- **January 16, 2025**: Added comprehensive admin panel manual account creation feature with complete form including sex field for enhanced user data collection.

## External Dependencies

### Core Services
- **Neon Database**: PostgreSQL hosting for data persistence and session management.
- **Google Gemini AI**: Image analysis for automated weight extraction.
- **Authentication**: Custom email/password authentication with Passport.js, social login UI prepared.
- **SendGrid**: Transactional email service for verification codes, password resets, and notifications. Domain authenticated for `scanmyscale.com`, sending from `noreply@scanmyscale.com`.

### Development Tools
- **Drizzle ORM**: Type-safe database operations and migrations.
- **Zod**: Runtime type validation for API inputs.
- **ESBuild**: Fast JavaScript bundling.

### UI Libraries
- **Radix UI**: Accessible component primitives.
- **Lucide React**: Icon library.
- **Date-fns**: Date manipulation.
- **Recharts**: Data visualization components.
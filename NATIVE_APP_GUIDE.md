# FotoPeso Native App Publishing Guide

This guide covers how to build and publish FotoPeso as native iOS and Android apps.

## Prerequisites

### For iOS
- Mac computer with Xcode installed
- Apple Developer Program membership ($99/year)
- Apple ID connected to App Store Connect

### For Android
- Android Studio installed (works on Mac, Windows, or Linux)
- Google Play Developer account ($25 one-time fee)

## Building the Apps

### Step 1: Build Web Assets
```bash
npm run build
```

### Step 2: Sync to Native Projects
```bash
npx cap sync
```

### Step 3: Open in IDE

**For iOS:**
```bash
npx cap open ios
```
This opens the project in Xcode.

**For Android:**
```bash
npx cap open android
```
This opens the project in Android Studio.

## iOS Publishing Workflow

### 1. Configure Signing
1. Open `ios/App/App.xcworkspace` in Xcode
2. Select the App target → Signing & Capabilities
3. Select your Team (Apple Developer account)
4. Xcode will automatically manage signing

### 2. Update App Info
Edit `ios/App/App/Info.plist` if needed:
- Bundle display name: "FotoPeso"
- Bundle identifier: "com.fotopeso.app"

### 3. Create App Icons
Place your app icon in `ios/App/App/Assets.xcassets/AppIcon.appiconset/`
Required sizes: 20pt, 29pt, 40pt, 60pt, 76pt, 83.5pt (all @1x, @2x, @3x)

### 4. Create Screenshots
Take screenshots on various devices for App Store listing:
- iPhone 6.5" (iPhone 14 Pro Max)
- iPhone 5.5" (iPhone 8 Plus)
- iPad Pro 12.9"

### 5. Build Archive
1. In Xcode: Product → Archive
2. Once complete, Organizer opens automatically
3. Click "Distribute App" → App Store Connect
4. Follow prompts to upload

### 6. Submit for Review
1. Go to App Store Connect
2. Create a new app with bundle ID "com.fotopeso.app"
3. Fill in app metadata (description, keywords, screenshots)
4. Submit for review

## Android Publishing Workflow

### 1. Configure Signing
Create a keystore for signing:
```bash
keytool -genkey -v -keystore fotopeso-release.keystore -alias fotopeso -keyalg RSA -keysize 2048 -validity 10000
```

Add to `android/app/build.gradle`:
```gradle
android {
    signingConfigs {
        release {
            storeFile file('fotopeso-release.keystore')
            storePassword 'your-password'
            keyAlias 'fotopeso'
            keyPassword 'your-key-password'
        }
    }
    buildTypes {
        release {
            signingConfig signingConfigs.release
        }
    }
}
```

### 2. Create App Icons
Place icons in `android/app/src/main/res/`:
- mipmap-mdpi: 48x48
- mipmap-hdpi: 72x72
- mipmap-xhdpi: 96x96
- mipmap-xxhdpi: 144x144
- mipmap-xxxhdpi: 192x192

### 3. Build Release APK/AAB
```bash
cd android
./gradlew bundleRelease
```
Output: `android/app/build/outputs/bundle/release/app-release.aab`

### 4. Create Google Play Listing
1. Go to Google Play Console
2. Create new application
3. Fill in store listing (description, screenshots, graphics)
4. Upload AAB file
5. Submit for review

## Testing Before Publishing

### Local Testing (iOS Simulator)
```bash
npx cap run ios
```

### Local Testing (Android Emulator)
```bash
npx cap run android
```

### Device Testing
1. Build the app
2. Install on physical device
3. Test all features:
   - Camera capture
   - Gallery upload
   - AI weight detection
   - Authentication
   - Subscription flows

## Important Notes

### Camera Permissions
iOS Info.plist already includes:
- NSCameraUsageDescription
- NSPhotoLibraryUsageDescription
- NSPhotoLibraryAddUsageDescription

### Backend Connection
The app connects to your published backend at fotopeso.com.br / scanmyscale.com. Ensure the backend is running before testing.

### API Configuration
If you need to change the API endpoint for the native app, you can configure it in `capacitor.config.ts`:
```typescript
server: {
  url: 'https://fotopeso.com.br',
  cleartext: false,
}
```

## Estimated Timeline

| Phase | Duration | Tasks |
|-------|----------|-------|
| Setup | 1-2 days | Developer accounts, certificates |
| Icons & Assets | 1-2 days | App icons, splash screens, screenshots |
| Testing | 2-3 days | Device testing, bug fixes |
| Submission | 1-2 days | Store listings, submission |
| Review | 1-7 days | Apple/Google review process |

**Total: 1-2 weeks to live apps**

## Need Help?

For issues with:
- Capacitor: https://capacitorjs.com/docs
- iOS Publishing: https://developer.apple.com/app-store/submitting/
- Android Publishing: https://developer.android.com/distribute

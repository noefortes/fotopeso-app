import { Express } from "express";

export function setupOAuthDiagnostics(app: Express) {
  // Only enable diagnostics in development to prevent security exposure
  if (process.env.NODE_ENV !== 'development') {
    return; // Skip diagnostic setup in production
  }

  // Comprehensive OAuth diagnostic endpoint
  app.get("/api/auth/google/diagnostic", (req, res) => {
    const currentDomain = process.env.REPLIT_DEV_DOMAIN;
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    
    // Generate all possible callback URLs
    const possibleCallbacks = [
      `https://${currentDomain}/api/auth/google/callback`,
      `http://${currentDomain}/api/auth/google/callback`,
      `http://localhost:5000/api/auth/google/callback`,
      `http://localhost:3000/api/auth/google/callback`,
    ];
    
    // Current configuration
    const currentConfig = {
      clientId: clientId ? `${clientId.substring(0, 30)}...` : "NOT SET",
      clientSecretSet: !!clientSecret,
      domain: currentDomain,
      nodeEnv: process.env.NODE_ENV || "not set",
      actualCallbackUrl: currentDomain 
        ? `https://${currentDomain}/api/auth/google/callback`
        : `https://weight-wise-opalheads.replit.app/api/auth/google/callback`,
    };
    
    // Generate the exact OAuth URL that will be used
    const oauthUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
      `response_type=code&` +
      `redirect_uri=${encodeURIComponent(`https://${currentDomain}/api/auth/google/callback`)}&` +
      `scope=profile%20email&` +
      `client_id=${clientId}`;
    
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Google OAuth Diagnostic</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            max-width: 1200px;
            margin: 40px auto;
            padding: 20px;
            background: #f5f5f5;
          }
          .container {
            background: white;
            padding: 30px;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
          }
          h1 {
            color: #1a73e8;
            margin-bottom: 30px;
          }
          h2 {
            color: #333;
            margin-top: 30px;
            border-bottom: 2px solid #e0e0e0;
            padding-bottom: 10px;
          }
          .config-box {
            background: #f8f9fa;
            padding: 15px;
            border-radius: 4px;
            margin: 15px 0;
            border-left: 4px solid #1a73e8;
          }
          .url-box {
            background: #e8f5e9;
            padding: 15px;
            border-radius: 4px;
            margin: 15px 0;
            word-break: break-all;
            font-family: monospace;
            font-size: 12px;
          }
          .warning {
            background: #fff3e0;
            padding: 15px;
            border-radius: 4px;
            margin: 15px 0;
            border-left: 4px solid #ff9800;
          }
          .error {
            background: #ffebee;
            padding: 15px;
            border-radius: 4px;
            margin: 15px 0;
            border-left: 4px solid #f44336;
          }
          .success {
            background: #e8f5e9;
            padding: 15px;
            border-radius: 4px;
            margin: 15px 0;
            border-left: 4px solid #4caf50;
          }
          .button {
            background: #1a73e8;
            color: white;
            padding: 10px 20px;
            border-radius: 4px;
            text-decoration: none;
            display: inline-block;
            margin: 10px 0;
          }
          .button:hover {
            background: #1557b0;
          }
          code {
            background: #f5f5f5;
            padding: 2px 6px;
            border-radius: 3px;
            font-size: 14px;
          }
          .checklist {
            list-style: none;
            padding: 0;
          }
          .checklist li {
            padding: 10px;
            margin: 5px 0;
            background: #f8f9fa;
            border-radius: 4px;
          }
          .checklist li:before {
            content: "□ ";
            font-weight: bold;
            margin-right: 10px;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>🔍 Google OAuth Configuration Diagnostic</h1>
          
          <h2>📋 Current Configuration</h2>
          <div class="config-box">
            <p><strong>Client ID:</strong> <code>${currentConfig.clientId}</code></p>
            <p><strong>Client Secret:</strong> ${currentConfig.clientSecretSet ? '✅ Set' : '❌ Not Set'}</p>
            <p><strong>Current Domain:</strong> <code>${currentConfig.domain}</code></p>
            <p><strong>Environment:</strong> <code>${currentConfig.nodeEnv}</code></p>
          </div>
          
          <h2>🔗 OAuth Redirect URI Being Used</h2>
          <div class="url-box">
            ${currentConfig.actualCallbackUrl}
          </div>
          <p><strong>⚠️ This EXACT URL must be added to your Google Console's "Authorized redirect URIs"</strong></p>
          
          <h2>📝 Google Console Setup Checklist</h2>
          <div class="warning">
            <p><strong>Please verify these settings in your Google Console:</strong></p>
            <ol class="checklist">
              <li>Go to <a href="https://console.cloud.google.com/apis/credentials" target="_blank">Google Cloud Console → Credentials</a></li>
              <li>Click on your OAuth 2.0 Client ID (should be named something like "Web client 1")</li>
              <li>In the "Authorized redirect URIs" section, you should have EXACTLY this URL:
                <div class="url-box" style="margin-top: 10px;">
                  ${currentConfig.actualCallbackUrl}
                </div>
              </li>
              <li>Make sure there are NO trailing slashes or extra characters</li>
              <li>Verify the protocol is HTTPS (not HTTP) for the Replit domain</li>
              <li>Click "Save" if you made any changes</li>
            </ol>
          </div>
          
          <h2>🧪 Test OAuth Flow</h2>
          <a href="/api/auth/google" class="button">Test Google Sign-In</a>
          <p><em>This will redirect you to Google's OAuth consent screen</em></p>
          
          <h2>🔧 Full OAuth URL Generated</h2>
          <p>This is the exact URL that will be sent to Google:</p>
          <div class="url-box">
            ${oauthUrl}
          </div>
          
          <h2>💡 Common Issues & Solutions</h2>
          <div class="warning">
            <h3>Issue: redirect_uri_mismatch</h3>
            <p><strong>Cause:</strong> The redirect URI in your code doesn't match what's configured in Google Console</p>
            <p><strong>Solution:</strong> Copy the EXACT URL from the green box above and add it to Google Console</p>
          </div>
          
          <div class="warning">
            <h3>Issue: Domain changes on Replit</h3>
            <p><strong>Cause:</strong> Replit domains can change when the environment restarts</p>
            <p><strong>Current Domain:</strong> <code>${currentConfig.domain}</code></p>
            <p><strong>Solution:</strong> Update Google Console whenever your domain changes</p>
          </div>
          
          <h2>🔄 Alternative Callback URLs</h2>
          <p>If the above doesn't work, you might need one of these instead:</p>
          ${possibleCallbacks.map(url => `
            <div class="url-box">
              ${url}
            </div>
          `).join('')}
          
          <div style="margin-top: 40px; padding-top: 20px; border-top: 2px solid #e0e0e0;">
            <p style="color: #666; font-size: 14px;">
              Generated at: ${new Date().toISOString()}<br>
              <a href="/">← Back to App</a>
            </p>
          </div>
        </div>
      </body>
      </html>
    `);
  });
}
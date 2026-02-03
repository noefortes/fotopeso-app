import express, { type Request, Response, NextFunction } from "express";
import cors from "cors";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { reminderScheduler } from "./reminderScheduler";
import { getCorsOrigins, attachMarketMiddleware, isValidDomain } from "./utils/marketResolver";
import { DOMAIN_TO_MARKET } from "../shared/config/markets";
// Payment providers will be dynamically imported to isolate import failures

const app = express();

// Trust proxy for host header resolution
app.set('trust proxy', true);

// CORS configuration for all markets
app.use(cors({
  origin: getCorsOrigins(),
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// Domain validation middleware - Skip for published Replit apps
app.use((req, res, next) => {
  const domain = req.headers.host || '';
  
  // Skip validation for Replit's internal domains (published apps)
  if (domain.includes('.replit.dev') || domain.includes('.replit.app')) {
    next();
    return;
  }
  
  // Validate custom domains
  if (!isValidDomain(req)) {
    const forwardedHost = req.headers['x-forwarded-host'] || 'none';
    console.error(`❌ Domain validation failed for: ${domain}`);
    console.error(`🔄 X-Forwarded-Host: ${forwardedHost}`);
    console.error(`📋 Allowed domains:`, Object.keys(DOMAIN_TO_MARKET));
    return res.status(403).json({ error: 'Domain not allowed' });
  }
  next();
});

// Attach market context to all requests
app.use(attachMarketMiddleware);

// IMPORTANT: Apply JSON parsing to all routes EXCEPT the webhook routes
// Webhook routes need raw body for signature verification
app.use((req, res, next) => {
  // Skip JSON parsing for webhook endpoints
  if (req.path.startsWith('/api/webhooks/')) {
    return next();
  }
  express.json()(req, res, next);
});
app.use(express.urlencoded({ extended: false }));

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  console.log("[BOOT] server bootstrap starting");
  
  // Add process error hooks for debugging
  process.on('unhandledRejection', e => console.error('[BOOT] UnhandledRejection', e));
  process.on('uncaughtException', e => console.error('[BOOT] UncaughtException', e));
  
  // Initialize payment providers FIRST (before routes) with dynamic imports
  try {
    console.log("[BOOT] Initializing payment providers...");
    
    // Dynamic imports to isolate import failures
    const { paymentProviderManager, DEFAULT_ROUTING_RULES } = await import("../shared/payment/PaymentProviderManager");
    const { RevenueCatProvider, MercadoPagoProvider, PagarmeProvider, PagseguroProvider, StripeProvider } = await import("../shared/payment/providers");
    
    // Register all payment providers
    await paymentProviderManager.registerProvider(new RevenueCatProvider(), {
      apiKey: process.env.REVENUECAT_API_KEY || "test_key",
      environment: process.env.NODE_ENV === "production" ? "production" : "sandbox"
    });
    
    await paymentProviderManager.registerProvider(new MercadoPagoProvider(), {
      apiKey: process.env.MERCADOPAGO_API_KEY || "test_key",
      environment: process.env.NODE_ENV === "production" ? "production" : "sandbox"
    });
    
    await paymentProviderManager.registerProvider(new PagarmeProvider(), {
      apiKey: process.env.PAGARME_API_KEY || "test_key",
      environment: process.env.NODE_ENV === "production" ? "production" : "sandbox"
    });
    
    await paymentProviderManager.registerProvider(new PagseguroProvider(), {
      apiKey: process.env.PAGSEGURO_API_KEY || "test_key",
      environment: process.env.NODE_ENV === "production" ? "production" : "sandbox"
    });

    // Register Stripe provider (for US market)
    if (process.env.STRIPE_SECRET_KEY) {
      // Smart environment detection: check if API keys are live keys
      const isLiveKey = process.env.STRIPE_SECRET_KEY.startsWith('sk_live_');
      const environment = isLiveKey ? "production" : "sandbox";
      
      await paymentProviderManager.registerProvider(new StripeProvider(), {
        apiKey: process.env.STRIPE_SECRET_KEY,
        webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
        environment: environment
      });
    } else {
      console.warn("[BOOT] Stripe not configured - STRIPE_SECRET_KEY missing");
    }
    
    // Set up routing rules
    paymentProviderManager.setRoutingRules(DEFAULT_ROUTING_RULES);
    paymentProviderManager.setDefaultProvider("revenuecat");
    
    console.log("[BOOT] Providers registered:", paymentProviderManager.getRegisteredProviders());
    log(`Payment providers registered: ${paymentProviderManager.getRegisteredProviders().join(", ")}`);
  } catch (error) {
    console.error("[BOOT] Payment provider initialization failed:", error);
    log(`Error: Payment provider initialization failed: ${error}`);
    // Continue startup even if payment providers fail to initialize (graceful degradation)
  }

  console.log("[BOOT] Registering routes...");
  const server = await registerRoutes(app);
  
  // Add debug endpoint for payment provider verification
  app.get('/api/debug/payments', async (_req, res) => {
    try {
      const { paymentProviderManager } = await import("../shared/payment/PaymentProviderManager");
      res.json({ 
        providers: paymentProviderManager.getRegisteredProviders(),
        status: "Payment providers accessible"
      });
    } catch (error) {
      res.status(500).json({ 
        error: "Payment providers not accessible", 
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // Add API route protection - prevent static fallback from catching API routes
  app.use('/api/*', (req, res) => {
    res.status(404).json({ error: `API endpoint not found: ${req.method} ${req.path}` });
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || '5000', 10);
  
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
  }, () => {
    log(`serving on port ${port}`);
    
    // Start the reminder scheduler
    reminderScheduler.start();
  });
})();

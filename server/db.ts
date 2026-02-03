import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from "ws";
import * as schema from "@shared/schema";

// Configure Neon for optimal performance
neonConfig.webSocketConstructor = ws;

// Enable connection pooling for production scale
neonConfig.poolQueryViaFetch = true; // Use HTTP for simple queries
neonConfig.useSecureWebSocket = true; // Force secure connections

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// Optimize DATABASE_URL for Neon's connection pooler
const databaseUrl = process.env.DATABASE_URL;
const optimizedUrl = databaseUrl.includes('-pooler') 
  ? databaseUrl 
  : databaseUrl.replace('.us-east-2', '-pooler.us-east-2').replace('.eu-west-1', '-pooler.eu-west-1').replace('.ap-southeast-1', '-pooler.ap-southeast-1');

// Configure connection pool for high-scale production
export const pool = new Pool({ 
  connectionString: optimizedUrl,
  // Optimize for serverless and high concurrency
  connectionTimeoutMillis: 5000,     // 5 second timeout
  idleTimeoutMillis: 60000,          // 1 minute idle timeout
  max: 10,                           // Max 10 connections per instance (Neon handles pooling)
  allowExitOnIdle: true,             // Allow clean shutdown
});

export const db = drizzle({ client: pool, schema });
import { z } from 'zod';

// Define the schema for environment variables
const boolFromEnv = (fallback: boolean) =>
  z.preprocess(
    (val) => {
      if (val === undefined || val === null || val === '') return fallback;
      if (typeof val === 'boolean') return val;
      return String(val).toLowerCase() === 'true';
    },
    z.boolean(),
  );

const EnvSchema = z.object({
  EXPO_PUBLIC_API_PROTOCOL: z.preprocess(
    (v) => (v === undefined || v === null || v === '' ? 'http' : v),
    z.union([z.literal('http'), z.literal('https')]),
  ),
  EXPO_PUBLIC_API_HOST: z.preprocess(
    (v) => (v === undefined || v === null || v === '' ? 'localhost' : v),
    z.string().min(1),
  ),
  EXPO_PUBLIC_API_PORT: z.preprocess(
    (v) => (v === undefined || v === null || v === '' ? '8000' : String(v)),
    z.string().regex(/^\d+$/).transform(Number),
  ),
  EXPO_PUBLIC_WS_PROTOCOL: z.preprocess(
    (v) => (v === undefined || v === null || v === '' ? 'ws' : v),
    z.union([z.literal('ws'), z.literal('wss')]),
  ),
  EXPO_PUBLIC_ENABLE_DEBUG: boolFromEnv(false),
  EXPO_PUBLIC_ENABLE_MOCKS: boolFromEnv(false),
  EXPO_PUBLIC_LOG_LEVEL: z.preprocess(
    (v) => (v === undefined || v === null || v === '' ? 'info' : v),
    z.union([z.literal('debug'), z.literal('info'), z.literal('warn'), z.literal('error')]),
  ),
  EXPO_PUBLIC_ENABLE_TELEMETRY: boolFromEnv(true),
  EXPO_PUBLIC_ENABLE_ANALYTICS: boolFromEnv(false),
  EXPO_PUBLIC_ENABLE_WEBSOCKET: boolFromEnv(true),
  EXPO_PUBLIC_ENABLE_OFFLINE_MODE: boolFromEnv(true),
  EXPO_PUBLIC_ENABLE_VERBOSE_NETWORK_LOGS: boolFromEnv(false),
});

// Helper to extract env vars (process.env on Node/Expo environments)
const rawEnv = {
  EXPO_PUBLIC_API_PROTOCOL: process.env.EXPO_PUBLIC_API_PROTOCOL,
  EXPO_PUBLIC_API_HOST: process.env.EXPO_PUBLIC_API_HOST,
  EXPO_PUBLIC_API_PORT: process.env.EXPO_PUBLIC_API_PORT,
  EXPO_PUBLIC_WS_PROTOCOL: process.env.EXPO_PUBLIC_WS_PROTOCOL,
  EXPO_PUBLIC_ENABLE_DEBUG: process.env.EXPO_PUBLIC_ENABLE_DEBUG,
  EXPO_PUBLIC_ENABLE_MOCKS: process.env.EXPO_PUBLIC_ENABLE_MOCKS,
  EXPO_PUBLIC_LOG_LEVEL: process.env.EXPO_PUBLIC_LOG_LEVEL,
  EXPO_PUBLIC_ENABLE_TELEMETRY: process.env.EXPO_PUBLIC_ENABLE_TELEMETRY,
  EXPO_PUBLIC_ENABLE_ANALYTICS: process.env.EXPO_PUBLIC_ENABLE_ANALYTICS,
  EXPO_PUBLIC_ENABLE_WEBSOCKET: process.env.EXPO_PUBLIC_ENABLE_WEBSOCKET,
  EXPO_PUBLIC_ENABLE_OFFLINE_MODE: process.env.EXPO_PUBLIC_ENABLE_OFFLINE_MODE,
  EXPO_PUBLIC_ENABLE_VERBOSE_NETWORK_LOGS: process.env.EXPO_PUBLIC_ENABLE_VERBOSE_NETWORK_LOGS,
};

// Validate the environment variables
const parsedEnv = EnvSchema.safeParse(rawEnv);

if (!parsedEnv.success) {
  console.error("❌ Invalid environment variables:", parsedEnv.error.format());
  throw new Error("Invalid environment configuration. Please check your .env file.");
}

const env = parsedEnv.data;

export const ApiConfig = {
  protocol: env.EXPO_PUBLIC_API_PROTOCOL,
  host: env.EXPO_PUBLIC_API_HOST,
  port: env.EXPO_PUBLIC_API_PORT,
  get baseUrl() {
    return `${this.protocol}://${this.host}:${this.port}/api/v1`;
  },
};

export const SocketConfig = {
  protocol: env.EXPO_PUBLIC_WS_PROTOCOL,
  host: env.EXPO_PUBLIC_API_HOST,
  port: env.EXPO_PUBLIC_API_PORT,
  get baseUrl() {
    return `${this.protocol}://${this.host}:${this.port}`;
  },
};

export const FeatureFlags = {
  enableDebug: env.EXPO_PUBLIC_ENABLE_DEBUG,
  enableMocks: env.EXPO_PUBLIC_ENABLE_MOCKS,
  logLevel: env.EXPO_PUBLIC_LOG_LEVEL,
  enableTelemetry: env.EXPO_PUBLIC_ENABLE_TELEMETRY,
  enableAnalytics: env.EXPO_PUBLIC_ENABLE_ANALYTICS,
  enableWebSocket: env.EXPO_PUBLIC_ENABLE_WEBSOCKET,
  enableOfflineMode: env.EXPO_PUBLIC_ENABLE_OFFLINE_MODE,
  enableVerboseNetworkLogs: env.EXPO_PUBLIC_ENABLE_VERBOSE_NETWORK_LOGS,
};

export const Environment = {
  isDevelopment: __DEV__,
  isProduction: !__DEV__,
};

export default {
  ApiConfig,
  SocketConfig,
  FeatureFlags,
  Environment,
};

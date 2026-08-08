import { ApiConfig, SocketConfig } from './index';

/**
 * Resolved backend host (no scheme, no port).
 */
export const API_HOST: string = ApiConfig.host;

/** HTTP origin of the backend, e.g. http://192.168.1.100:8000 */
export const API_ORIGIN: string = `${ApiConfig.protocol}://${ApiConfig.host}:${ApiConfig.port}`;

/** Versioned REST API base, e.g. http://192.168.1.100:8000/api/v1 */
export const API_BASE_URL: string = ApiConfig.baseUrl;

/** WebSocket origin of the backend, e.g. ws://192.168.1.100:8000 */
export const WS_BASE_URL: string = SocketConfig.baseUrl;

/**
 * Build a fully-qualified WebSocket URL for a versioned API path.
 *
 * @param path Path under /api/v1, e.g. '/events/ws?token=…'
 */
export function wsUrl(path: string): string {
  // Assuming path includes a leading slash, like '/events/ws'
  return `${SocketConfig.baseUrl}/api/v1${path}`;
}

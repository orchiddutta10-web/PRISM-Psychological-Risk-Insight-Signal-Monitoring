import * as SecureStore from 'expo-secure-store';
import { API_BASE_URL } from '../config/network';

export interface User {
  id: string;
  full_name: string;
  email: string;
  created_at: string;
}

export interface ConsentRecord {
  id: string;
  device_id: string;
  signal_type: string;
  consent_copy_version: string;
  granted_at: string;
  revoked_at?: string;
}

export const TokenManager = {
  async saveToken(token: string) {
<<<<<<< HEAD
    try {
      await SecureStore.setItemAsync('prism_jwt_token', token);
    } catch {
      // Fallback removed to avoid localStorage issues in React Native
    }
  },
  async getToken() {
    try {
      return await SecureStore.getItemAsync('prism_jwt_token');
    } catch {
      return null;
    }
  },
  async clearToken() {
    try {
      await SecureStore.deleteItemAsync('prism_jwt_token');
    } catch {
      // Fallback removed to avoid localStorage issues in React Native
    }
=======
    await SecureStore.setItemAsync('prism_jwt_token', token);
  },
  async getToken() {
    return await SecureStore.getItemAsync('prism_jwt_token');
  },
  async clearToken() {
    await SecureStore.deleteItemAsync('prism_jwt_token');
>>>>>>> feature/dashboard-ui
  }
};

const REQUEST_TIMEOUT_MS = 10000;
const MAX_RETRIES = 3;

const requestInterceptor = async (options: RequestInit = {}): Promise<RequestInit> => {
  const token = await TokenManager.getToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    ...(options.headers || {})
  };
  return { ...options, headers };
};

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const ApiClient = {
  async request(endpoint: string, options: RequestInit = {}, retries = 0): Promise<any> {
    const interceptedOptions = await requestInterceptor(options);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    
    try {
      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        ...interceptedOptions,
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        const errData = await response.json().catch(() => ({ detail: 'API Error' }));
        throw new Error(errData.detail || 'Something went wrong');
      }

      return await response.json();
    } catch (error: any) {
      clearTimeout(timeoutId);
      
      // Retry logic for network errors or timeouts
      if ((error.name === 'AbortError' || error.message.includes('Network')) && retries < MAX_RETRIES) {
        const backoffMs = Math.pow(2, retries) * 1000; // Exponential backoff: 1s, 2s, 4s
        console.warn(`[ApiClient] Request failed, retrying in ${backoffMs}ms... (${retries + 1}/${MAX_RETRIES})`);
        await delay(backoffMs);
        return this.request(endpoint, options, retries + 1);
      }
      
      throw error;
    }
  },

  async post(endpoint: string, body?: Record<string, unknown>, options: RequestInit = {}) {
    return this.request(endpoint, {
      ...options,
      method: 'POST',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  },

  async login(email: string, password: string): Promise<{ access_token: string, user: User }> {
    const data = await this.post('', );
    await TokenManager.saveToken(data.access_token);
    return data;
  },

  async sendOTP(phoneNumber: string): Promise<{ status: string, code: string }> {
    return await this.post('', );
  },

  async verifyOTP(phoneNumber: string, code: string): Promise<{ is_new_user: boolean, access_token?: string, token_type?: string, user?: User }> {
    const data = await this.post('', );
    if (data.access_token) {
      await TokenManager.saveToken(data.access_token);
    }
    return data;
  },

  async registerOTP(phoneNumber: string, fullName: string): Promise<{ access_token: string, token_type: string, user: User }> {
    const data = await this.post('', );
    await TokenManager.saveToken(data.access_token);
    return data;
  },

  async registerDevice(name: string, platform: 'android' | 'ios', deviceToken: string): Promise<{ device: { id: string }, device_jwt_token: string }> {
    const data = await this.post('', );
    // Store the device JWT token for subsequent telemetry/consent calls
    await TokenManager.saveToken(data.device_jwt_token);
    return data;
  },

  async updateConsent(consent: { location_consent: boolean, typing_consent: boolean, app_activity_consent: boolean }) {
    const updates = [
      { signal_type: 'location', granted: consent.location_consent },
      { signal_type: 'typing', granted: consent.typing_consent },
      { signal_type: 'app_usage', granted: consent.app_activity_consent }
    ];
    
    const results = [];
    for (const update of updates) {
      const res = await this.post('', );
      results.push(res);
    }
    return results;
  },

  async sendTelemetry(deviceId: string, signalType: 'location' | 'typing' | 'app_usage', metadata: Record<string, any>) {
    return await this.request('/events/ingest', {
      method: 'POST',
      body: JSON.stringify({
        device_id: deviceId,
        signal_type: signalType,
        metadata,
        timestamp: new Date().toISOString()
      })
    });
  },

  async seedBaselines(payload: {
    device_id: string,
    relationship: string,
    date_of_birth: string,
    daily_screen_time_mins: number,
    usual_bedtime: string,
    concerns: string[]
  }) {
    return await this.post('', );
  },

  async getChatHistory(): Promise<{
    id: string;
    guardian_id: string;
    sender: string;
    aria_utterance: string;
    timestamp: string;
  }[]> {
    return await this.request('/events/chat/history', { method: 'GET' });
  }
};

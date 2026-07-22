import * as SecureStore from 'expo-secure-store';

// In local emulator/web environments, we use localhost or host IP.
const API_BASE_URL = 'http://localhost:8000/api/v1';

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
    try {
      await SecureStore.setItemAsync('prism_jwt_token', token);
    } catch {
      // Fallback for web testing
      localStorage.setItem('prism_jwt_token', token);
    }
  },
  async getToken() {
    try {
      return await SecureStore.getItemAsync('prism_jwt_token');
    } catch {
      return localStorage.getItem('prism_jwt_token');
    }
  },
  async clearToken() {
    try {
      await SecureStore.deleteItemAsync('prism_jwt_token');
    } catch {
      localStorage.removeItem('prism_jwt_token');
    }
  }
};

export const ApiClient = {
  async request(endpoint: string, options: RequestInit = {}) {
    const token = await TokenManager.getToken();
    const headers = {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      ...(options.headers || {})
    };

    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({ detail: 'API Error' }));
      throw new Error(errData.detail || 'Something went wrong');
    }

    return await response.json();
  },

  async login(email: string, password: string): Promise<{ access_token: string, user: User }> {
    const data = await this.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });
    await TokenManager.saveToken(data.access_token);
    return data;
  },

  async sendOTP(phoneNumber: string): Promise<{ status: string, code: string }> {
    return await this.request('/auth/otp/send', {
      method: 'POST',
      body: JSON.stringify({ phone_number: phoneNumber })
    });
  },

  async verifyOTP(phoneNumber: string, code: string): Promise<{ is_new_user: boolean, access_token?: string, token_type?: string, user?: User }> {
    const data = await this.request('/auth/otp/verify', {
      method: 'POST',
      body: JSON.stringify({ phone_number: phoneNumber, code })
    });
    if (data.access_token) {
      await TokenManager.saveToken(data.access_token);
    }
    return data;
  },

  async registerOTP(phoneNumber: string, fullName: string): Promise<{ access_token: string, token_type: string, user: User }> {
    const data = await this.request('/auth/otp/register', {
      method: 'POST',
      body: JSON.stringify({ phone_number: phoneNumber, full_name: fullName })
    });
    await TokenManager.saveToken(data.access_token);
    return data;
  },

  async registerDevice(name: string, platform: 'android' | 'ios', deviceToken: string): Promise<{ device: { id: string }, device_jwt_token: string }> {
    const data = await this.request('/auth/device', {
      method: 'POST',
      body: JSON.stringify({ name, platform, device_token: deviceToken })
    });
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
      const res = await this.request('/consent', {
        method: 'POST',
        body: JSON.stringify({
          signal_type: update.signal_type,
          granted: update.granted,
          consent_copy_version: '1.0'
        })
      });
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
    return await this.request('/events/baselines/seed', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
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

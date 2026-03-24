import { client } from '@/api/client';

export interface LoginRequest {
  password: string;
}

export interface AuthResponse {
  success: boolean;
  message?: string;
}

export const authApi = {
  async verify(): Promise<AuthResponse> {
    const response = await client.get('/api/auth/verify');
    return response.data;
  },

  async login(data: LoginRequest): Promise<AuthResponse> {
    const response = await client.post('/api/auth/login', data);
    return response.data;
  },

  async logout(): Promise<AuthResponse> {
    const response = await client.post('/api/auth/logout');
    return response.data;
  },
};

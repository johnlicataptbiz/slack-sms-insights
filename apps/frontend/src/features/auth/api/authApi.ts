import { client } from "@/api/client";

export interface LoginRequest {
  password: string;
}

export interface AuthResponse {
  success: boolean;
  message?: string;
}

export const authApi = {
  async verify(): Promise<AuthResponse> {
    return client.get("/api/auth/verify");
  },

  async login(data: LoginRequest): Promise<AuthResponse> {
    return client.post("/api/auth/login", data);
  },

  async logout(): Promise<AuthResponse> {
    return client.post("/api/auth/logout", {});
  },
};

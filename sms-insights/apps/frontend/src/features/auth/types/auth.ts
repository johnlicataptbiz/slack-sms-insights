export interface User {
  id: string;
  email?: string;
  name?: string;
  role: 'admin' | 'user' | 'viewer';
  lastLogin?: Date;
}

export interface AuthState {
  isAuthenticated: boolean;
  user: User | null;
  isLoading: boolean;
  error: string | null;
}

export interface LoginCredentials {
  password: string;
}

export interface AuthContextType extends AuthState {
  login: (credentials: LoginCredentials) => Promise<void>;
  logout: () => Promise<void>;
  verifyAuth: () => Promise<void>;
}

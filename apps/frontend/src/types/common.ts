// Common types used across the application
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface User {
  id: string;
  email?: string;
  name?: string;
  role?: string;
}

export interface ApiError {
  message: string;
  status: number;
  code?: string;
}

// Common component props
export interface BaseComponentProps {
  className?: string;
  children?: React.ReactNode;
}

export interface LoadingState {
  isLoading: boolean;
  error?: string | null;
}

// Form types
export interface FormField {
  name: string;
  label: string;
  type: 'text' | 'email' | 'password' | 'number' | 'select' | 'textarea';
  required?: boolean;
  placeholder?: string;
  options?: { value: string; label: string }[];
}

// API query types
export interface QueryOptions {
  enabled?: boolean;
  refetchOnWindowFocus?: boolean;
  staleTime?: number;
  cacheTime?: number;
}

export interface InfiniteQueryOptions extends QueryOptions {
  getNextPageParam?: (lastPage: any, allPages: any[]) => any;
}

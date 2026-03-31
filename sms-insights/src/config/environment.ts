export interface EnvironmentConfig {
  database: {
    retries: number;
    delay: number;
    circuitBreaker: {
      failureThreshold: number;
      recoveryTimeout: number;
    };
    cache: {
      defaultTtl: number;
      maxSize: number;
    };
  };
  monitoring: {
    enabled: boolean;
    healthCheckInterval: number;
  };
}

const configs: Record<string, EnvironmentConfig> = {
  production: {
    database: {
      retries: 5,
      delay: 2000,
      circuitBreaker: {
        failureThreshold: 10,
        recoveryTimeout: 60000
      },
      cache: {
        defaultTtl: 600000, // 10 minutes
        maxSize: 1000
      }
    },
    monitoring: {
      enabled: true,
      healthCheckInterval: 30000
    }
  },
  staging: {
    database: {
      retries: 3,
      delay: 1000,
      circuitBreaker: {
        failureThreshold: 5,
        recoveryTimeout: 30000
      },
      cache: {
        defaultTtl: 300000, // 5 minutes
        maxSize: 500
      }
    },
    monitoring: {
      enabled: true,
      healthCheckInterval: 60000
    }
  },
  development: {
    database: {
      retries: 3,
      delay: 500,
      circuitBreaker: {
        failureThreshold: 3,
        recoveryTimeout: 10000
      },
      cache: {
        defaultTtl: 60000, // 1 minute
        maxSize: 100
      }
    },
    monitoring: {
      enabled: false,
      healthCheckInterval: 120000
    }
  }
};

export const getEnvironmentConfig = (): EnvironmentConfig => {
  const env = process.env.NODE_ENV || 'development';
  return configs[env] || configs.development;
};

export const envConfig = getEnvironmentConfig();
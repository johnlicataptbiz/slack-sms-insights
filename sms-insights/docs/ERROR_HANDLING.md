# Database Error Handling and Resilience

## Overview
This document describes the comprehensive error handling and resilience mechanisms implemented for database operations in the SMS Insights application.

## Architecture

### Circuit Breaker Pattern
- **Purpose**: Prevent cascade failures during database outages
- **Configuration**: 5 failure threshold, 30-second recovery timeout
- **States**: CLOSED (normal), OPEN (failing), HALF_OPEN (testing recovery)

### Fallback Caching
- **Purpose**: Provide degraded service during outages
- **Implementation**: In-memory cache with TTL
- **Fallback Data**: Minimal valid responses for critical operations

### Monitoring and Health Checks
- **Health Endpoints**: `/health/database`, `/health/system`
- **Metrics**: Response times, error rates, circuit breaker state
- **Alerts**: Configurable thresholds for automated alerting

## Configuration

### Environment-Specific Settings
```typescript
// Production: Aggressive retries, long cache TTL
// Development: Fast failure, short cache TTL
// Staging: Balanced configuration
```

### Circuit Breaker Tuning
- **Failure Threshold**: Number of consecutive failures before opening
- **Recovery Timeout**: Time before attempting recovery
- **Monitoring Period**: Health check frequency

## Usage Examples

### Database Service
```typescript
import { databaseService } from './services/database-service';

// Automatic retry and caching
const conversation = await databaseService.getConversation(id);

// Manual error handling
try {
  const result = await databaseService.executeQuery(
    () => prisma.conversations.findUnique({ where: { id } }),
    `conversation:${id}`,
    { id, status: 'UNKNOWN' } // Fallback
  );
} catch (error) {
  // Handle gracefully
}
```

### Health Monitoring
```typescript
import { healthMonitor } from './lib/monitoring';

// Check overall system health
const overallHealth = healthMonitor.getOverallHealth();

// Get detailed service statuses
const services = healthMonitor.getHealthStatus();
```

## Testing
Run resilience tests:
```bash
npm test database-resilience.test.ts
```

## Monitoring
Access health endpoints:
- `GET /health` - Overall system health
- `GET /health/database` - Database-specific health
- `GET /metrics` - Performance metrics

## Best Practices
1. **Always use DatabaseService** for database operations
2. **Provide fallback data** for critical operations
3. **Monitor health endpoints** in production
4. **Configure alerts** for circuit breaker state changes
5. **Test failure scenarios** regularly

## Troubleshooting
- **Circuit Breaker Open**: Check database connectivity
- **High Error Rates**: Review application logs
- **Cache Misses**: Verify cache TTL settings
- **Slow Responses**: Check performance metrics
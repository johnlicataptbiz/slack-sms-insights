const { logger } = require('../dist/monitoring/logger.js');
const { userTracker } = require('../dist/monitoring/user-tracking.js');
const { PerformanceTracker } = require('../dist/monitoring/performance-tracker.js');

async function runMonitoringTest() {
  // Test logging
  logger.setContext('test_run', true);
  logger.info('Starting monitoring test');
  
  try {
    // Test user tracking
    userTracker.setUser('test_user_123', 'test@example.com');
    userTracker.trackAction('monitoring_test');
    userTracker.trackPageView('monitoring_test_page');

    // Test performance tracking
    const performanceTracker = PerformanceTracker.getInstance();
    
    performanceTracker.start('test_operation');
    await new Promise(resolve => setTimeout(resolve, 100)); // Simulate work
    performanceTracker.end('test_operation', { test_context: true });

    logger.info('Monitoring test completed successfully');
  } catch (error) {
    logger.error('Monitoring test failed', error);
    process.exit(1);
  }
}

runMonitoringTest();
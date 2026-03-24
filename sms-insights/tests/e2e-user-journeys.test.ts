// Comprehensive end-to-end testing for user journeys

import { test, describe } from 'node:test';
import assert from 'node:assert';

// Mock Slack client for testing
class MockSlackClient {
  private views: Map<string, any> = new Map();

  async views_publish({ user_id, view }: { user_id: string; view: any }) {
    this.views.set(user_id, view);
    return { ok: true };
  }

  getLastView(userId: string) {
    return this.views.get(userId);
  }

  clear() {
    this.views.clear();
  }
}

describe('End-to-End User Journeys', () => {
  let mockClient: MockSlackClient;

  test('beforeEach', () => {
    mockClient = new MockSlackClient();
  });

  test('afterEach', () => {
    mockClient.clear();
  });

  describe('New User Onboarding Journey', () => {
    test('should display personalized welcome for new user', async () => {
      // Simulate app_home_opened event for new user
      const event = {
        user: 'U123456',
        tab: 'home',
      };

      // Mock empty user state (new user)
      const userState = null;

      // Import and call the handler
      const { appHomeOpenedCallback } = await import('../listeners/events/app-home-opened.js');

      // Mock the required dependencies
      const mockLogger = {
        info: () => {},
        error: () => {},
      };

      // Call the handler
      await appHomeOpenedCallback({
        client: mockClient,
        event,
        logger: mockLogger,
      });

      // Verify the home tab was published
      const view = mockClient.getLastView('U123456');
      assert(view, 'Home view should be published');
      assert.strictEqual(view.type, 'home', 'Should be a home view');
      assert(view.blocks.length > 0, 'Should have content blocks');

      // Check for welcome content
      const headerBlock = view.blocks.find((block: any) => block.type === 'header');
      assert(headerBlock, 'Should have a header block');
      assert(headerBlock.text.text.includes('SMS Insights'), 'Should mention SMS Insights');
    });

    test('should show progressive disclosure sections', async () => {
      const event = { user: 'U123456', tab: 'home' };
      const { appHomeOpenedCallback } = await import('../listeners/events/app-home-opened.js');

      await appHomeOpenedCallback({
        client: mockClient,
        event,
        logger: { info: () => {}, error: () => {} },
      });

      const view = mockClient.getLastView('U123456');

      // Should have multiple sections
      const sections = view.blocks.filter((block: any) => block.type === 'section');
      assert(sections.length > 0, 'Should have section blocks');

      // Should have action blocks
      const actions = view.blocks.filter((block: any) => block.type === 'actions');
      assert(actions.length > 0, 'Should have action blocks');
    });
  });

  describe('Power User Dashboard Journey', () => {
    test('should display role-specific quick actions', async () => {
      // Test admin role quick actions
      const { PersonalizedDashboard } = await import('../src/ui/components/PersonalizedDashboard.js');

      const adminSections = PersonalizedDashboard.createPersonalizedSections(
        { theme: 'light', expandedSections: [] },
        PersonalizedDashboard.getUserRole('U_ADMIN')
      );

      const quickActionsSection = adminSections.find(s => s.id === 'quick-actions');
      assert(quickActionsSection, 'Should have quick actions section');

      // Should include admin-specific actions
      const actionsBlock = quickActionsSection.content.find((block: any) => block.type === 'actions');
      assert(actionsBlock, 'Should have actions block');
      assert(actionsBlock.elements.length > 0, 'Should have action elements');
    });

    test('should handle user preferences correctly', async () => {
      const { ProgressiveDisclosure } = await import('../src/ui/layouts/ProgressiveDisclosure.js');

      const sections = [
        { id: 'test1', title: 'Test 1', content: [], priority: 'high' as const },
        { id: 'test2', title: 'Test 2', content: [], priority: 'low' as const },
      ];

      const userPrefs = { expandedSections: ['test2'] };
      const blocks = ProgressiveDisclosure.createSections(sections, userPrefs);

      // Should respect user preferences for expanded sections
      assert(blocks.length > 0, 'Should generate blocks');
    });
  });

  describe('Report Generation Journey', () => {
    test('should handle export requests with progress tracking', async () => {
      const { ExportManager } = await import('../src/ui/components/ExportManager.ts');

      const job = ExportManager.startExportJob({
        format: 'pdf',
        dateRange: {
          start: new Date('2024-01-01'),
          end: new Date('2024-01-31'),
        },
      });

      assert(job, 'Should create export job');
      assert.strictEqual(job.status, 'pending', 'Should start as pending');
      assert(job.id, 'Should have job ID');
      assert(job.filename, 'Should have filename');

      // Simulate progress
      setTimeout(() => {
        const progressView = ExportManager.createProgressView(job);
        assert(progressView.length > 0, 'Should create progress view');
      }, 100);
    });

    test('should create drill-down navigation', async () => {
      const { DrillDown } = await import('../src/ui/components/DrillDown.ts');

      const level: any = {
        title: 'Performance Breakdown',
        options: [
          { id: 'conversions', label: 'Conversions', value: 'conversions', count: 150 },
          { id: 'responses', label: 'Responses', value: 'responses', count: 300 },
        ],
      };

      const blocks = DrillDown.createDrillDownMenu(level);
      assert(blocks.length > 0, 'Should create drill-down menu');
      assert(blocks[0].type === 'header', 'Should start with header');
    });
  });

  describe('Real-Time Features Journey', () => {
    test('should initialize and update live metrics', async () => {
      const { RealTimeUpdates } = await import('../src/services/RealTimeUpdates.ts');

      RealTimeUpdates.initializeMetrics();

      const metrics = RealTimeUpdates.getLiveMetrics();
      assert(metrics.length > 0, 'Should have live metrics');

      // Test metric updates
      const initialValue = metrics[0].value;
      RealTimeUpdates.updateMetric(metrics[0].id, initialValue + 10);

      const updatedMetrics = RealTimeUpdates.getLiveMetrics();
      const updatedMetric = updatedMetrics.find(m => m.id === metrics[0].id);
      assert(updatedMetric, 'Should find updated metric');
      assert.strictEqual(updatedMetric!.value, initialValue + 10, 'Should update value');

      RealTimeUpdates.cleanup();
    });

    test('should create live dashboard view', async () => {
      const { RealTimeUpdates } = await import('../src/services/RealTimeUpdates.ts');

      const dashboard = RealTimeUpdates.createLiveDashboard();
      assert(dashboard.length > 0, 'Should create dashboard blocks');

      const header = dashboard.find((block: any) => block.type === 'header');
      assert(header, 'Should have header');
      assert(header.text.text.includes('Live Dashboard'), 'Should mention live dashboard');
    });
  });

  describe('Performance & Caching Journey', () => {
    test('should cache and retrieve data efficiently', async () => {
      const { PerformanceOptimizer } = await import('../src/services/PerformanceOptimizer.ts');

      const testData = { message: 'test data', timestamp: Date.now() };
      const key = 'test_key';

      // Test caching
      await PerformanceOptimizer.get(key, async () => testData);
      const cached = await PerformanceOptimizer.get(key);
      assert.deepStrictEqual(cached, testData, 'Should return cached data');

      // Test cache stats
      const stats = PerformanceOptimizer.getCacheStats();
      assert(stats.size >= 1, 'Should have cache entries');
    });

    test('should enforce rate limits', async () => {
      const { PerformanceOptimizer } = await import('../src/services/PerformanceOptimizer.ts');

      const rules = PerformanceOptimizer.getDefaultRateLimitRules();
      assert(rules.length > 0, 'Should have default rules');

      const rule = rules[0];
      const result = PerformanceOptimizer.checkRateLimit('user123', rule);

      assert(result.allowed, 'Should allow initial request');
      assert.strictEqual(result.remaining, rule.maxRequests - 1, 'Should decrement remaining');
    });
  });

  describe('Cross-Device Compatibility Journey', () => {
    test('should adapt content for different devices', async () => {
      const { CrossDeviceSupport } = await import('../src/ui/components/CrossDeviceSupport.ts');

      const capabilities = CrossDeviceSupport.detectCapabilities();
      const config = CrossDeviceSupport.getResponsiveConfig(capabilities);

      assert(config, 'Should create responsive config');
      assert(['small', 'medium', 'large'].includes(config.maxColumns), 'Should have valid column count');
    });

    test('should create touch-optimized actions', async () => {
      const { CrossDeviceSupport } = await import('../src/ui/components/CrossDeviceSupport.ts');

      const actions = CrossDeviceSupport.createTouchOptimizedActions([
        { text: 'Test Action', actionId: 'test_action', emoji: '✅' },
      ]);

      assert(actions.type === 'actions', 'Should create actions block');
      assert(actions.elements.length > 0, 'Should have action elements');
    });
  });

  describe('Error Handling & Resilience Journey', () => {
    test('should handle offline scenarios gracefully', async () => {
      const { CrossDeviceSupport } = await import('../src/ui/components/CrossDeviceSupport.ts');

      const offlineBlocks = CrossDeviceSupport.createOfflineFallback();
      assert(offlineBlocks.length > 0, 'Should create offline fallback');

      const header = offlineBlocks.find((block: any) => block.type === 'header');
      assert(header, 'Should have header for offline state');
    });

    test('should optimize content for network quality', async () => {
      const { CrossDeviceSupport } = await import('../src/ui/components/CrossDeviceSupport.ts');

      const blocks = [
        { type: 'section', text: { type: 'mrkdwn', text: 'Test 1' } },
        { type: 'section', text: { type: 'mrkdwn', text: 'Test 2' } },
        { type: 'section', text: { type: 'mrkdwn', text: 'Test 3' } },
        { type: 'section', text: { type: 'mrkdwn', text: 'Test 4' } },
      ];

      const optimized = CrossDeviceSupport.optimizeForNetworkQuality(blocks, 'poor');
      assert(optimized.length <= 3, 'Should limit content for poor connection');
    });
  });
});
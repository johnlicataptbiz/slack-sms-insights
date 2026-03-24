// A/B testing framework for UI variants

export interface ABTest {
  id: string;
  name: string;
  variants: Array<{
    id: string;
    name: string;
    weight: number; // 0-100
    config: Record<string, any>;
  }>;
  targetUsers: 'all' | 'percentage' | 'specific' | 'role';
  targetValue?: number | string[]; // percentage or user/role list
  metrics: string[]; // metrics to track, e.g., 'engagement_time', 'conversion_rate'
  startDate: Date;
  endDate?: Date;
  active: boolean;
  results?: Record<string, Record<string, number>>; // variantId -> metric -> value
}

export class ABTesting {
  private static tests = new Map<string, ABTest>();
  private static userAssignments = new Map<string, Record<string, string>>(); // userId -> testId -> variantId

  static createTest(test: Omit<ABTest, 'id' | 'active' | 'results'>): string {
    const id = `ab_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const newTest: ABTest = {
      ...test,
      id,
      active: true,
      results: {},
    };

    // Validate weights sum to 100
    const totalWeight = newTest.variants.reduce((sum, v) => sum + v.weight, 0);
    if (totalWeight !== 100) {
      throw new Error('Variant weights must sum to 100');
    }

    this.tests.set(id, newTest);
    return id;
  }

  static getUserVariant(userId: string, testId: string): string | null {
    const test = this.tests.get(testId);
    if (!test || !test.active) return null;

    const assignments = this.userAssignments.get(userId) || {};
    if (assignments[testId]) return assignments[testId];

    // Check if user is targeted
    if (!this.isUserTargeted(userId, test)) {
      return null;
    }

    // Assign variant based on weights
    const random = Math.random() * 100;
    let cumulative = 0;

    for (const variant of test.variants) {
      cumulative += variant.weight;
      if (random <= cumulative) {
        assignments[testId] = variant.id;
        this.userAssignments.set(userId, assignments);
        return variant.id;
      }
    }

    // Fallback to first variant
    assignments[testId] = test.variants[0].id;
    this.userAssignments.set(userId, assignments);
    return test.variants[0].id;
  }

  static trackMetric(testId: string, variantId: string, metric: string, value: number): void {
    const test = this.tests.get(testId);
    if (!test) return;

    if (!test.results[variantId]) {
      test.results[variantId] = {};
    }

    if (!test.results[variantId][metric]) {
      test.results[variantId][metric] = 0;
    }

    test.results[variantId][metric] += value;
  }

  static getTestResults(testId: string): ABTest['results'] | null {
    const test = this.tests.get(testId);
    return test?.results || null;
  }

  static endTest(testId: string): boolean {
    const test = this.tests.get(testId);
    if (!test) return false;

    test.active = false;
    test.endDate = new Date();
    return true;
  }

  static createABTestDashboard(testId: string): any[] {
    const test = this.tests.get(testId);
    if (!test) return [];

    const blocks = [];

    blocks.push({
      type: 'header',
      text: {
        type: 'plain_text',
        text: `🅰️🅱️ A/B Test: ${test.name}`,
        emoji: true,
      },
    });

    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Status:* ${test.active ? '🟢 Active' : '🔴 Completed'}\n*Start:* ${test.startDate.toLocaleDateString()}\n*End:* ${test.endDate?.toLocaleDateString() || 'Ongoing'}\n*Variants:* ${test.variants.length}\n*Target:* ${test.targetUsers}`,
      },
    });

    // Results summary
    if (test.results && Object.keys(test.results).length > 0) {
      blocks.push({
        type: 'header',
        text: {
          type: 'plain_text',
          text: '📊 Results',
          emoji: true,
        },
      });

      test.metrics.forEach(metric => {
        const fields = test.variants.map(variant => {
          const value = test.results![variant.id]?.[metric] || 0;
          return {
            type: 'mrkdwn',
            text: `*${variant.name}*\n${value.toFixed(2)}`,
          };
        });

        blocks.push({
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*${metric}*`,
          },
          fields,
        });
      });
    } else {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '_No results available yet_',
        },
      });
    }

    // Actions
    blocks.push({
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: {
            type: 'plain_text',
            text: test.active ? '🛑 End Test' : '🔄 Restart Test',
            emoji: true,
          },
          action_id: test.active ? `end_ab_test_${test.id}` : `restart_ab_test_${test.id}`,
          style: test.active ? 'danger' : 'primary',
        },
        {
          type: 'button',
          text: {
            type: 'plain_text',
            text: '📊 Detailed Analytics',
            emoji: true,
          },
          action_id: `view_ab_analytics_${test.id}`,
          style: 'secondary',
        },
      ],
    });

    return blocks;
  }

  private static isUserTargeted(userId: string, test: ABTest): boolean {
    switch (test.targetUsers) {
      case 'all':
        return true;
      case 'percentage':
        if (typeof test.targetValue !== 'number') return false;
        return Math.random() * 100 < test.targetValue;
      case 'specific':
        if (!Array.isArray(test.targetValue)) return false;
        return test.targetValue.includes(userId);
      case 'role':
        if (!Array.isArray(test.targetValue)) return false;
        const userRole = 'setter'; // Mock user role
        return test.targetValue.includes(userRole);
      default:
        return false;
    }
  }

  static cleanup(): void {
    this.tests.clear();
    this.userAssignments.clear();
  }
}

// Example usage
const exampleTest = {
  name: 'Dashboard Layout Test',
  variants: [
    { id: 'A', name: 'Original Layout', weight: 50, config: { layout: 'grid' } },
    { id: 'B', name: 'New Layout', weight: 50, config: { layout: 'cards' } },
  ],
  targetUsers: 'percentage',
  targetValue: 50,
  metrics: ['engagement_time', 'click_rate', 'conversion_rate'],
  startDate: new Date(),
};

ABTesting.createTest(exampleTest);
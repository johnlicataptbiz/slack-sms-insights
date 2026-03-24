import { test, describe } from 'node:test';
import assert from 'node:assert';
import { DashboardCard } from '../src/ui/components/DashboardCard.js';
import { ProgressiveDisclosure } from '../src/ui/layouts/ProgressiveDisclosure.js';

describe('UI Components', () => {
  describe('DashboardCard', () => {
    test('should create a basic card', () => {
      const card = DashboardCard.create({
        title: 'Test Metric',
        value: 42,
      });

      assert.strictEqual(card.type, 'section');
      assert.strictEqual(card.text.type, 'mrkdwn');
      assert(card.text.text.includes('Test Metric'));
      assert(card.text.text.includes('42'));
    });

    test('should include trend information', () => {
      const card = DashboardCard.create({
        title: 'Revenue',
        value: 1000,
        trend: { direction: 'up', value: 15 },
      });

      assert(card.text.text.includes('📈 15%'));
    });

    test('should include status indicators', () => {
      const card = DashboardCard.create({
        title: 'Status',
        value: 'Active',
        status: 'success',
      });

      assert(card.text.text.includes('✅'));
    });
  });

  describe('ProgressiveDisclosure', () => {
    test('should create sections with proper priority ordering', () => {
      const sections = [
        {
          id: 'low-priority',
          title: 'Low Priority',
          content: [{ type: 'section', text: { type: 'mrkdwn', text: 'Low content' } }],
          priority: 'low' as const,
        },
        {
          id: 'high-priority',
          title: 'High Priority',
          content: [{ type: 'section', text: { type: 'mrkdwn', text: 'High content' } }],
          priority: 'high' as const,
        },
      ];

      const blocks = ProgressiveDisclosure.createSections(sections);

      // High priority should come first
      assert(blocks[0].text.text.includes('High Priority'));
    });

    test('should handle user preferences for expanded sections', () => {
      const sections = [
        {
          id: 'expandable',
          title: 'Expandable',
          content: [{ type: 'section', text: { type: 'mrkdwn', text: 'Content' } }],
          priority: 'medium' as const,
        },
      ];

      const userPrefs = { expandedSections: ['expandable'] };
      const blocks = ProgressiveDisclosure.createSections(sections, userPrefs);

      // Should show expanded content
      const hasContent = blocks.some(block => block.text?.text === 'Content');
      assert(hasContent);
    });
  });
});
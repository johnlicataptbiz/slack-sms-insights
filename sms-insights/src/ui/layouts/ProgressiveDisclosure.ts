// Using any for Block Kit blocks since the strict typing doesn't match runtime usage

export interface Section {
  id: string;
  title: string;
  content: any[];
  priority: 'high' | 'medium' | 'low';
  collapsed?: boolean;
}

export interface UserPrefs {
  theme?: 'light' | 'dark';
  expandedSections?: string[];
  quickActions?: string[];
}

export class ProgressiveDisclosure {
  static createSections(sections: Section[], userPrefs: UserPrefs = {}): any[] {
    const { expandedSections = [] } = userPrefs;
    const blocks: any[] = [];

    // Sort sections by priority (high first)
    const sortedSections = sections.sort((a, b) => {
      const priorityOrder = { high: 3, medium: 2, low: 1 };
      return priorityOrder[b.priority] - priorityOrder[a.priority];
    });

    for (const section of sortedSections) {
      // Section header with toggle
      const isExpanded = expandedSections.includes(section.id) || section.priority === 'high';

      blocks.push({
        type: 'header',
        text: {
          type: 'plain_text',
          text: `${isExpanded ? '🔽' : '▶️'} ${section.title}`,
          emoji: true,
        },
      });

      // Section content (only if expanded)
      if (isExpanded) {
        blocks.push(...section.content);

        // Add collapse action for non-high priority sections
        if (section.priority !== 'high') {
          blocks.push({
            type: 'actions',
            elements: [
              {
                type: 'button',
                text: {
                  type: 'plain_text',
                  text: 'Collapse Section',
                  emoji: true,
                },
                action_id: `collapse_section_${section.id}`,
                style: 'primary',
              },
            ],
          });
        }
      } else {
        // Show preview/teaser for collapsed sections
        const previewText = this.getSectionPreview(section);
        if (previewText) {
          blocks.push({
            type: 'context',
            elements: [
              {
                type: 'mrkdwn',
                text: previewText,
              },
            ],
          });
        }

        // Add expand action
        blocks.push({
          type: 'actions',
          elements: [
            {
              type: 'button',
              text: {
                type: 'plain_text',
                text: 'Expand Section',
                emoji: true,
              },
              action_id: `expand_section_${section.id}`,
              style: 'primary',
            },
          ],
        });
      }

      // Divider between sections
      blocks.push({ type: 'divider' });
    }

    return blocks;
  }

  private static getSectionPreview(section: Section): string | null {
    // Extract preview from first content block
    const firstBlock = section.content[0];
    if (firstBlock?.type === 'section' && firstBlock.text?.type === 'mrkdwn') {
      const text = firstBlock.text.text;
      // Return first line or truncated version
      const firstLine = text.split('\n')[0];
      return firstLine.length > 100 ? `${firstLine.substring(0, 100)}...` : firstLine;
    }
    return null;
  }

  static createQuickActions(actions: Array<{ text: string; actionId: string; url?: string }>): any {
    return {
      type: 'actions',
      elements: actions.map(action => ({
        type: 'button' as const,
        text: {
          type: 'plain_text',
          text: action.text,
          emoji: true,
        },
        action_id: action.url ? undefined : action.actionId,
        url: action.url,
        style: 'primary' as const,
      })),
    };
  }
}
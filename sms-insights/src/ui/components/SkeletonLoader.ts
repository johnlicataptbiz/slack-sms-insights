// Skeleton loading components for progressive UI loading

export class SkeletonLoader {
  static createSectionSkeleton(title: string): any {
    return {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*${title}*\n▫️ ▫️ ▫️ Loading...`,
      },
    };
  }

  static createCardSkeleton(): any {
    return {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '```\n┌─────────────────┐\n│                 │\n│   ░░░░░░░░░░   │\n│                 │\n│   ░░░░░░░░░░   │\n│                 │\n└─────────────────┘\n```\n_Loading metrics..._',
      },
    };
  }

  static createListSkeleton(count: number = 3): any[] {
    const skeletons = [];
    for (let i = 0; i < count; i++) {
      skeletons.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `▫️ ▫️ ▫️ ▫️ ▫️ ▫️ ▫️ ▫️\n_Loading item ${i + 1}..._`,
        },
      });
    }
    return skeletons;
  }

  static createActionSkeleton(): any {
    return {
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: {
            type: 'plain_text',
            text: '⏳ Loading...',
            emoji: true,
          },
          action_id: 'loading_placeholder',
        },
      ],
    };
  }
}
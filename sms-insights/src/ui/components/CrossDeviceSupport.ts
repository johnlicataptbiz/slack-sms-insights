// Cross-device compatibility and responsive design for Slack

export interface DeviceCapabilities {
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  hasTouch: boolean;
  screenSize: 'small' | 'medium' | 'large';
  connectionQuality: 'poor' | 'fair' | 'good';
}

export interface ResponsiveConfig {
  maxColumns: number;
  buttonSize: 'small' | 'medium' | 'large';
  textSize: 'small' | 'medium' | 'large';
  spacing: 'compact' | 'normal' | 'relaxed';
  showAdvanced: boolean;
}

export class CrossDeviceSupport {
  static detectCapabilities(userAgent?: string): DeviceCapabilities {
    // In Slack context, we need to infer from available context
    // Since Slack doesn't provide detailed device info, we'll use heuristics

    const capabilities: DeviceCapabilities = {
      isMobile: false,
      isTablet: false,
      isDesktop: true,
      hasTouch: false,
      screenSize: 'large',
      connectionQuality: 'good',
    };

    // Slack client detection (limited info available)
    // We'll assume desktop by default and adjust based on context

    return capabilities;
  }

  static getResponsiveConfig(capabilities: DeviceCapabilities): ResponsiveConfig {
    if (capabilities.isMobile) {
      return {
        maxColumns: 1,
        buttonSize: 'large',
        textSize: 'medium',
        spacing: 'relaxed',
        showAdvanced: false,
      };
    }

    if (capabilities.isTablet) {
      return {
        maxColumns: 2,
        buttonSize: 'medium',
        textSize: 'medium',
        spacing: 'normal',
        showAdvanced: true,
      };
    }

    // Desktop
    return {
      maxColumns: 3,
      buttonSize: 'medium',
      textSize: 'small',
      spacing: 'compact',
      showAdvanced: true,
    };
  }

  static adaptBlocksForDevice(blocks: any[], capabilities: DeviceCapabilities): any[] {
    const config = this.getResponsiveConfig(capabilities);
    const adaptedBlocks = [];

    for (const block of blocks) {
      const adapted = { ...block };

      switch (block.type) {
        case 'section':
          if (block.fields && block.fields.length > config.maxColumns) {
            // Split fields into multiple sections for smaller screens
            const fieldGroups = this.chunkArray(block.fields, config.maxColumns);
            fieldGroups.forEach((group: any[]) => {
              adaptedBlocks.push({
                ...block,
                fields: group,
              });
            });
            continue; // Skip adding the original block
          }
          break;

        case 'actions':
          if (block.elements && block.elements.length > config.maxColumns) {
            // Split actions into multiple rows for smaller screens
            const actionGroups = this.chunkArray(block.elements, config.maxColumns);
            actionGroups.forEach((group: any[]) => {
              adaptedBlocks.push({
                ...block,
                elements: group,
              });
            });
            continue;
          }

          // Adapt button sizes for touch devices
          if (capabilities.hasTouch && block.elements) {
            adapted.elements = block.elements.map((element: any) => ({
              ...element,
              style: config.buttonSize === 'large' ? 'primary' : element.style,
            }));
          }
          break;

        case 'input':
          // Simplify inputs for mobile devices
          if (capabilities.isMobile && adapted.element) {
            if (adapted.element.placeholder) {
              adapted.element.placeholder.text = adapted.element.placeholder.text.substring(0, 30) + '...';
            }
          }
          break;
      }

      adaptedBlocks.push(adapted);
    }

    return adaptedBlocks;
  }

  static createTouchOptimizedActions(actions: Array<{ text: string; actionId: string; emoji?: string }>): any {
    return {
      type: 'actions',
      elements: actions.map(action => ({
        type: 'button' as const,
        text: {
          type: 'plain_text',
          text: action.emoji ? `${action.emoji} ${action.text}` : action.text,
          emoji: !!action.emoji,
        },
        action_id: action.actionId,
        // Larger touch targets for mobile
        style: 'primary' as const,
      })),
    };
  }

  static createProgressiveLoadingBlocks(
    capabilities: DeviceCapabilities,
    contentLoader: () => Promise<any[]>
  ): any[] {
    const loadingBlocks = [];

    if (capabilities.connectionQuality === 'poor') {
      // Show minimal loading for poor connections
      loadingBlocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '_Loading..._',
        },
      });
    } else {
      // Show skeleton loading for better connections
      loadingBlocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '```\n┌─────────────────────────────────┐\n│                                 │\n│          Loading...            │\n│                                 │\n└─────────────────────────────────┘\n```',
        },
      });
    }

    // Load content asynchronously
    setTimeout(async () => {
      try {
        const content = await contentLoader();
        // In a real implementation, this would update the UI
        console.log('Content loaded:', content.length, 'blocks');
      } catch (error) {
        console.error('Failed to load content:', error);
      }
    }, capabilities.connectionQuality === 'poor' ? 1000 : 500);

    return loadingBlocks;
  }

  static createOfflineFallback(): any[] {
    return [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: '📶 Connection Issue',
          emoji: true,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: 'Unable to load live data. Showing cached information.\n\nSome features may be limited until connection is restored.',
        },
      },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: {
              type: 'plain_text',
              text: '🔄 Retry Connection',
              emoji: true,
            },
            action_id: 'retry_connection',
            style: 'primary',
          },
          {
            type: 'button',
            text: {
              type: 'plain_text',
              text: '📋 View Cached Data',
              emoji: true,
            },
            action_id: 'view_cached_data',
            style: 'secondary',
          },
        ],
      },
    ];
  }

  static optimizeForNetworkQuality(blocks: any[], connectionQuality: 'poor' | 'fair' | 'good'): any[] {
    switch (connectionQuality) {
      case 'poor':
        // Minimize content for poor connections
        return blocks.slice(0, 3).map(block => {
          if (block.type === 'section' && block.fields) {
            return {
              ...block,
              fields: block.fields.slice(0, 2), // Limit fields
            };
          }
          return block;
        });

      case 'fair':
        // Moderate optimization
        return blocks.slice(0, 5);

      case 'good':
      default:
        // Full content
        return blocks;
    }
  }

  static createAccessibilityEnhancements(blocks: any[]): any[] {
    const enhancedBlocks = [];

    for (const block of blocks) {
      const enhanced = { ...block };

      // Add accessibility hints for screen readers
      if (block.type === 'actions' && block.elements) {
        enhanced.elements = block.elements.map((element: any) => ({
          ...element,
          // Slack handles accessibility, but we can add hints
          accessibility_label: element.text?.text || element.action_id,
        }));
      }

      // Ensure sufficient contrast (Slack handles this)
      // Add semantic structure
      if (block.type === 'section' && !block.text && !block.fields) {
        // Empty sections might confuse screen readers
        continue;
      }

      enhancedBlocks.push(enhanced);
    }

    return enhancedBlocks;
  }

  private static chunkArray<T>(array: T[], size: number): T[][] {
    const chunks = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  static createMobileFirstLayout(content: any[]): any[] {
    // Rearrange content for mobile-first design
    const mobileOptimized = [];

    // Headers first
    const headers = content.filter(block => block.type === 'header');
    mobileOptimized.push(...headers);

    // Important actions next
    const actions = content.filter(block => block.type === 'actions');
    mobileOptimized.push(...actions.slice(0, 2)); // Limit actions on mobile

    // Key metrics
    const sections = content.filter(block => block.type === 'section');
    mobileOptimized.push(...sections.slice(0, 3)); // Limit sections

    // Add "View More" action if content was truncated
    if (content.length > 5) {
      mobileOptimized.push({
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: {
              type: 'plain_text',
              text: '📱 View Full Version',
              emoji: true,
            },
            action_id: 'view_full_content',
            style: 'secondary',
          },
        ],
      });
    }

    return mobileOptimized;
  }
}
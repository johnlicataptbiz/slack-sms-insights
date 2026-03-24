// Bulk actions with confirmation dialogs

export interface BulkAction {
  id: string;
  label: string;
  description: string;
  icon: string;
  danger?: boolean;
  requiresConfirmation?: boolean;
  confirmationMessage?: string;
  affectedItemsMessage?: string;
}

export interface BulkActionResult {
  success: boolean;
  processedCount: number;
  failedCount: number;
  errors?: string[];
}

export class BulkActions {
  static createBulkActionMenu(actions: BulkAction[], selectedCount: number): any[] {
    const blocks = [];

    blocks.push({
      type: 'header',
      text: {
        type: 'plain_text',
        text: `⚡ Bulk Actions (${selectedCount} selected)`,
        emoji: true,
      },
    });

    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `You've selected *${selectedCount}* item${selectedCount !== 1 ? 's' : ''}. Choose an action to perform on all selected items.`,
      },
    });

    // Action buttons
    const actionButtons = actions.map(action => ({
      type: 'button' as const,
      text: {
        type: 'plain_text',
        text: `${action.icon} ${action.label}`,
        emoji: true,
      },
      action_id: `bulk_action_${action.id}`,
      style: action.danger ? 'danger' : 'primary',
      value: JSON.stringify({ actionId: action.id, selectedCount }),
      confirm: action.requiresConfirmation ? {
        title: {
          type: 'plain_text',
          text: `Confirm ${action.label}`,
        },
        text: {
          type: 'mrkdwn',
          text: `${action.confirmationMessage || `Are you sure you want to ${action.label.toLowerCase()} ${selectedCount} item${selectedCount !== 1 ? 's' : ''}?`}\n\n${action.affectedItemsMessage || 'This action cannot be undone.'}`,
        },
        confirm: {
          type: 'plain_text',
          text: `Yes, ${action.label}`,
        },
        deny: {
          type: 'plain_text',
          text: 'Cancel',
        },
      } : undefined,
    }));

    // Split buttons into rows
    for (let i = 0; i < actionButtons.length; i += 4) {
      blocks.push({
        type: 'actions',
        elements: actionButtons.slice(i, i + 4),
      });
    }

    // Selection management
    blocks.push(
      { type: 'divider' },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: {
              type: 'plain_text',
              text: '✅ Select All',
              emoji: true,
            },
            action_id: 'select_all_items',
            style: 'secondary',
          },
          {
            type: 'button',
            text: {
              type: 'plain_text',
              text: '❌ Clear Selection',
              emoji: true,
            },
            action_id: 'clear_selection',
            style: 'secondary',
          },
        ],
      }
    );

    return blocks;
  }

  static createBulkActionProgress(action: BulkAction, result: BulkActionResult): any[] {
    const blocks = [];

    const statusEmoji = result.success ? '✅' : '❌';
    const statusText = result.success ? 'Completed' : 'Failed';

    blocks.push({
      type: 'header',
      text: {
        type: 'plain_text',
        text: `${statusEmoji} Bulk Action ${statusText}`,
        emoji: true,
      },
    });

    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*${action.label}* ${statusText.toLowerCase()}\n\n📊 **Results:**\n• ✅ Processed: ${result.processedCount}\n• ❌ Failed: ${result.failedCount}`,
      },
    });

    // Show errors if any
    if (result.errors && result.errors.length > 0) {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Errors:*\n${result.errors.slice(0, 3).map(error => `• ${error}`).join('\n')}${result.errors.length > 3 ? '\n• ...and more' : ''}`,
        },
      });
    }

    // Action buttons
    const actionButtons = [];
    if (result.failedCount > 0) {
      actionButtons.push({
        type: 'button' as const,
        text: {
          type: 'plain_text',
          text: '🔄 Retry Failed',
          emoji: true,
        },
        action_id: `retry_bulk_action_${action.id}`,
        style: 'primary',
      });
    }

    actionButtons.push({
      type: 'button',
      text: {
        type: 'plain_text',
        text: '📋 View Details',
        emoji: true,
      },
      action_id: `view_bulk_action_details_${action.id}`,
      style: 'secondary',
    });

    if (actionButtons.length > 0) {
      blocks.push({
        type: 'actions',
        elements: actionButtons,
      });
    }

    return blocks;
  }

  static createDefaultBulkActions(): BulkAction[] {
    return [
      {
        id: 'export',
        label: 'Export',
        description: 'Export selected items to file',
        icon: '📤',
        requiresConfirmation: false,
      },
      {
        id: 'archive',
        label: 'Archive',
        description: 'Move selected items to archive',
        icon: '📦',
        requiresConfirmation: true,
        confirmationMessage: 'Archiving will remove these items from your active view but keep them accessible in the archive.',
        affectedItemsMessage: 'Archived items can be restored later.',
      },
      {
        id: 'delete',
        label: 'Delete',
        description: 'Permanently delete selected items',
        icon: '🗑️',
        danger: true,
        requiresConfirmation: true,
        confirmationMessage: 'This will permanently delete the selected items.',
        affectedItemsMessage: 'This action cannot be undone.',
      },
      {
        id: 'tag',
        label: 'Add Tags',
        description: 'Add tags to selected items',
        icon: '🏷️',
        requiresConfirmation: false,
      },
      {
        id: 'move',
        label: 'Move',
        description: 'Move selected items to different category',
        icon: '📁',
        requiresConfirmation: false,
      },
      {
        id: 'duplicate',
        label: 'Duplicate',
        description: 'Create copies of selected items',
        icon: '📋',
        requiresConfirmation: false,
      },
    ];
  }

  static createReportBulkActions(): BulkAction[] {
    return [
      {
        id: 'regenerate',
        label: 'Regenerate',
        description: 'Regenerate selected reports with latest data',
        icon: '🔄',
        requiresConfirmation: false,
      },
      {
        id: 'share',
        label: 'Share',
        description: 'Share selected reports with team',
        icon: '📤',
        requiresConfirmation: false,
      },
      {
        id: 'schedule',
        label: 'Schedule',
        description: 'Set up automated delivery for selected reports',
        icon: '⏰',
        requiresConfirmation: false,
      },
      {
        id: 'archive',
        label: 'Archive',
        description: 'Move selected reports to archive',
        icon: '📦',
        requiresConfirmation: true,
        confirmationMessage: 'Archived reports will be removed from your active dashboard.',
        affectedItemsMessage: 'You can still access archived reports from the archive section.',
      },
    ];
  }

  static createUserBulkActions(): BulkAction[] {
    return [
      {
        id: 'activate',
        label: 'Activate',
        description: 'Activate selected user accounts',
        icon: '✅',
        requiresConfirmation: false,
      },
      {
        id: 'deactivate',
        label: 'Deactivate',
        description: 'Deactivate selected user accounts',
        icon: '🚫',
        requiresConfirmation: true,
        confirmationMessage: 'Deactivated users will lose access to the system.',
        affectedItemsMessage: 'Users can be reactivated later.',
      },
      {
        id: 'reset_password',
        label: 'Reset Password',
        description: 'Send password reset emails to selected users',
        icon: '🔑',
        requiresConfirmation: true,
        confirmationMessage: 'This will send password reset emails to all selected users.',
        affectedItemsMessage: 'Users will receive reset instructions via email.',
      },
      {
        id: 'change_role',
        label: 'Change Role',
        description: 'Update roles for selected users',
        icon: '👥',
        requiresConfirmation: true,
        confirmationMessage: 'This will change the role and permissions for selected users.',
        affectedItemsMessage: 'Users will have different access levels after this change.',
      },
    ];
  }
}
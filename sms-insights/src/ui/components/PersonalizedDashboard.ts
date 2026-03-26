import { UserUIState } from '../../services/ui-state-manager.js';
import { DashboardCard } from './DashboardCard.js';
import { SkeletonLoader } from './SkeletonLoader.js';

export interface UserRole {
  id: string;
  name: string;
  permissions: string[];
  dashboardSections: string[];
}

export class PersonalizedDashboard {
  private static readonly ROLES: Record<string, UserRole> = {
    admin: {
      id: 'admin',
      name: 'Administrator',
      permissions: ['all'],
      dashboardSections: ['welcome', 'quick-actions', 'recent-reports', 'system-health', 'user-activity'],
    },
    manager: {
      id: 'manager',
      name: 'Manager',
      permissions: ['reports', 'analytics', 'team'],
      dashboardSections: ['welcome', 'quick-actions', 'recent-reports', 'team-performance', 'goals'],
    },
    setter: {
      id: 'setter',
      name: 'Setter',
      permissions: ['reports', 'personal'],
      dashboardSections: ['welcome', 'quick-actions', 'recent-reports', 'personal-stats', 'tips'],
    },
  };

  static getUserRole(userId: string): UserRole {
    // In a real implementation, this would check user roles from database
    // For now, default to setter role
    return this.ROLES.setter;
  }

  static createPersonalizedSections(userState: UserUIState | null, userRole: UserRole, data: any = {}): any[] {
    const sections = [];
    const { expandedSections = [], preferences = {} } = userState || {};

    // Always show welcome section
    sections.push({
      id: 'welcome',
      title: 'Welcome Back! 👋',
      content: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `Hello! You're viewing the *${userRole.name} Dashboard*.\n\n${this.getPersonalizedGreeting(userRole)}`,
          },
        },
      ],
      priority: 'high' as const,
    });

    // Quick actions - always high priority
    sections.push({
      id: 'quick-actions',
      title: 'Quick Actions ⚡',
      content: [
        this.createQuickActionsForRole(userRole),
      ],
      priority: 'high' as const,
    });

    // Role-specific sections
    for (const sectionId of userRole.dashboardSections) {
      if (sectionId === 'welcome' || sectionId === 'quick-actions') continue;

      const section = this.createRoleSpecificSection(sectionId, userRole, data);
      if (section) {
        sections.push(section);
      }
    }

    return sections;
  }

  private static getPersonalizedGreeting(role: UserRole): string {
    const greetings = {
      admin: 'Manage system settings, monitor performance, and oversee all operations.',
      manager: 'Track team performance, review analytics, and manage your team.',
      setter: 'View your performance metrics, access reports, and optimize your outreach.',
    };
    return greetings[role.id as keyof typeof greetings] || 'Access your personalized dashboard.';
  }

  private static createQuickActionsForRole(role: UserRole): any {
    const actions = [];

    // Common actions for all roles
    actions.push(
      { text: '📊 View Reports', actionId: 'view_reports' },
      { text: '📈 Dashboard', actionId: 'open_dashboard' }
    );

    // Role-specific actions
    switch (role.id) {
      case 'admin':
        actions.push(
          { text: '⚙️ System Settings', actionId: 'system_settings' },
          { text: '👥 User Management', actionId: 'user_management' }
        );
        break;
      case 'manager':
        actions.push(
          { text: '👥 Team Overview', actionId: 'team_overview' },
          { text: '🎯 Set Goals', actionId: 'set_goals' }
        );
        break;
      case 'setter':
        actions.push(
          { text: '📞 My Calls', actionId: 'my_calls' },
          { text: '💡 Tips & Tricks', actionId: 'tips_tricks' }
        );
        break;
    }

    return {
      type: 'actions',
      elements: actions.slice(0, 5).map(action => ({
        type: 'button' as const,
        text: {
          type: 'plain_text',
          text: action.text,
          emoji: true,
        },
        action_id: action.actionId,
        style: 'primary' as const,
      })),
    };
  }

  private static createRoleSpecificSection(sectionId: string, role: UserRole, data: any): any | null {
    switch (sectionId) {
      case 'recent-reports':
        return {
          id: 'recent-reports',
          title: 'Recent Reports 📋',
          content: data.recentRuns?.length > 0
            ? this.createRecentReportsSection(data.recentRuns)
            : [SkeletonLoader.createSectionSkeleton('Loading recent reports...')],
          priority: 'medium' as const,
        };

      case 'personal-stats':
        return {
          id: 'personal-stats',
          title: 'Your Performance 📈',
          content: [
            DashboardCard.create({
              title: 'Today\'s Calls',
              value: data.todayCalls || 0,
              trend: data.todayCallsTrend,
              status: this.getStatusForMetric(data.todayCalls, 5),
            }),
            DashboardCard.create({
              title: 'Conversion Rate',
              value: `${data.conversionRate || 0}%`,
              trend: data.conversionTrend,
              status: this.getStatusForMetric(data.conversionRate, 10),
            }),
          ],
          priority: 'medium' as const,
        };

      case 'team-performance':
        return {
          id: 'team-performance',
          title: 'Team Overview 👥',
          content: [
            DashboardCard.create({
              title: 'Active Setters',
              value: data.activeSetters || 0,
              status: 'warning',
            }),
            DashboardCard.create({
              title: 'Total Calls Today',
              value: data.teamCallsToday || 0,
              trend: data.teamCallsTrend,
              status: 'success',
            }),
          ],
          priority: 'medium' as const,
        };

      case 'system-health':
        return {
          id: 'system-health',
          title: 'System Health 🔧',
          content: [
            DashboardCard.create({
              title: 'API Status',
              value: data.apiStatus || 'Operational',
              status: data.apiStatus === 'Operational' ? 'success' : 'error',
            }),
            DashboardCard.create({
              title: 'Database',
              value: data.dbStatus || 'Healthy',
              status: data.dbStatus === 'Healthy' ? 'success' : 'warning',
            }),
          ],
          priority: 'low' as const,
        };

      default:
        return null;
    }
  }

  private static createRecentReportsSection(recentRuns: any[]): any[] {
    return recentRuns.slice(0, 3).map(run => ({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `${run.status === 'success' ? '✅' : '❌'} *${run.date}* - ${run.type}\n${run.summary || 'Report generated'}`,
      },
      accessory: {
        type: 'button',
        text: {
          type: 'plain_text',
          text: 'View',
          emoji: true,
        },
        action_id: `view_report_${run.id}`,
      },
    }));
  }

  private static getStatusForMetric(value: number, threshold: number): 'success' | 'warning' | 'error' {
    if (value >= threshold) return 'success';
    if (value >= threshold * 0.5) return 'warning';
    return 'error';
  }
}

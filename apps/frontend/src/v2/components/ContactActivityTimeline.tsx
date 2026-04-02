/**
 * ContactActivityTimeline.tsx - Unified activity timeline for contacts
 * Shows SMS, calls, emails, and other touchpoints in chronological order
 */

import { cn } from '@/lib/utils';
import type React from 'react';
import { useMemo } from 'react';

export type ActivityType =
  | 'sms_inbound'
  | 'sms_outbound'
  | 'call_inbound'
  | 'call_outbound'
  | 'call_missed'
  | 'voicemail'
  | 'email_inbound'
  | 'email_outbound'
  | 'note_added'
  | 'status_change'
  | 'assignment_change'
  | 'qualification_change'
  | 'escalation';

export interface ContactActivity {
  id: string;
  contactKey: string;
  activityType: ActivityType;
  referenceId?: string;
  referenceType?: string;
  repId?: string;
  repName?: string;
  summary?: string;
  metadata?: Record<string, unknown>;
  occurredAt: Date;
}

interface ContactActivityTimelineProps {
  activities: ContactActivity[];
  maxItems?: number;
  showRep?: boolean;
  onActivityClick?: (activity: ContactActivity) => void;
}

const activityConfig: Record<
  ActivityType,
  { icon: string; label: string; color: string }
> = {
  sms_inbound: {
    icon: '💬',
    label: 'SMS Received',
    color: 'bg-blue-100 text-blue-800',
  },
  sms_outbound: {
    icon: '📤',
    label: 'SMS Sent',
    color: 'bg-blue-200 text-blue-900',
  },
  call_inbound: {
    icon: '📞',
    label: 'Call Received',
    color: 'bg-green-100 text-green-800',
  },
  call_outbound: {
    icon: '📲',
    label: 'Call Made',
    color: 'bg-green-200 text-green-900',
  },
  call_missed: {
    icon: '❌',
    label: 'Missed Call',
    color: 'bg-yellow-100 text-yellow-800',
  },
  voicemail: {
    icon: '📧',
    label: 'Voicemail',
    color: 'bg-orange-100 text-orange-800',
  },
  email_inbound: {
    icon: '📬',
    label: 'Email Received',
    color: 'bg-purple-100 text-purple-800',
  },
  email_outbound: {
    icon: '📮',
    label: 'Email Sent',
    color: 'bg-purple-200 text-purple-900',
  },
  note_added: {
    icon: '📝',
    label: 'Note Added',
    color: 'bg-gray-100 text-gray-800',
  },
  status_change: {
    icon: '🔄',
    label: 'Status Changed',
    color: 'bg-indigo-100 text-indigo-800',
  },
  assignment_change: {
    icon: '👤',
    label: 'Assignment Changed',
    color: 'bg-pink-100 text-pink-800',
  },
  qualification_change: {
    icon: '✅',
    label: 'Qualification Updated',
    color: 'bg-teal-100 text-teal-800',
  },
  escalation: {
    icon: '⚠️',
    label: 'Escalated',
    color: 'bg-red-100 text-red-800',
  },
};

const formatTimeAgo = (date: Date): string => {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
};

const formatDuration = (seconds?: number): string => {
  if (!seconds) return '';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
};

export const ContactActivityTimeline: React.FC<
  ContactActivityTimelineProps
> = ({ activities, maxItems = 50, showRep = true, onActivityClick }) => {
  const sortedActivities = useMemo(() => {
    return [...activities]
      .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())
      .slice(0, maxItems);
  }, [activities, maxItems]);

  if (activities.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <p>No activity recorded yet.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1 overflow-y-auto p-2">
      {sortedActivities.map((activity, index) => {
        const config = activityConfig[activity.activityType];
        const isCall = activity.activityType.startsWith('call_');
        const isSms = activity.activityType.startsWith('sms_');
        const metadata = activity.metadata as
          | {
              duration?: number;
              disposition?: string;
              newValue?: string;
              oldValue?: string;
            }
          | undefined;

        return (
          <div
            key={activity.id}
            className={cn(
              'group flex cursor-pointer items-start gap-3 rounded-lg p-2 transition-colors hover:bg-muted/50',
              onActivityClick && 'cursor-pointer',
            )}
            onClick={() => onActivityClick?.(activity)}
            role={onActivityClick ? 'button' : undefined}
            tabIndex={onActivityClick ? 0 : undefined}
          >
            {/* Timeline connector */}
            <div className="flex flex-col items-center">
              <div
                className={cn(
                  'flex h-8 w-8 items-center justify-center rounded-full text-sm',
                  config.color,
                )}
              >
                <span className="text-base">{config.icon}</span>
              </div>
              {index < sortedActivities.length - 1 && (
                <div className="h-4 w-0.5 bg-border" />
              )}
            </div>

            {/* Activity content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium">{config.label}</span>
                <span className="text-xs text-muted-foreground whitespace-nowrap">
                  {formatTimeAgo(activity.occurredAt)}
                </span>
              </div>

              {/* Activity details */}
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                {/* Duration for calls */}
                {isCall && metadata?.duration && (
                  <span className="rounded bg-muted px-1.5 py-0.5">
                    📞 {formatDuration(metadata.duration)}
                  </span>
                )}

                {/* Call disposition */}
                {isCall && metadata?.disposition && (
                  <span className="rounded bg-muted px-1.5 py-0.5">
                    {metadata.disposition}
                  </span>
                )}

                {/* SMS preview or summary */}
                {(isSms || activity.referenceType === 'sms') &&
                  activity.summary && (
                    <p className="truncate text-muted-foreground max-w-[200px]">
                      {activity.summary}
                    </p>
                  )}

                {/* Status/Qualification change values */}
                {(activity.activityType === 'status_change' ||
                  activity.activityType === 'qualification_change') &&
                  metadata?.oldValue &&
                  metadata?.newValue && (
                    <span className="rounded bg-muted px-1.5 py-0.5">
                      {metadata.oldValue} → {metadata.newValue}
                    </span>
                  )}

                {/* Note preview */}
                {activity.activityType === 'note_added' && activity.summary && (
                  <p className="truncate italic max-w-[200px]">
                    "{activity.summary}"
                  </p>
                )}
              </div>

              {/* Rep attribution */}
              {showRep && activity.repName && (
                <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                  <span>by</span>
                  <span className="font-medium">{activity.repName}</span>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

/**
 * Activity summary stats component
 */
interface ActivitySummaryProps {
  activities: ContactActivity[];
}

export const ActivitySummary: React.FC<ActivitySummaryProps> = ({
  activities,
}) => {
  const stats = useMemo(() => {
    const counts = {
      sms: { inbound: 0, outbound: 0 },
      calls: { inbound: 0, outbound: 0, missed: 0, voicemail: 0 },
      emails: { inbound: 0, outbound: 0 },
      other: 0,
    };

    activities.forEach((a) => {
      if (a.activityType === 'sms_inbound') counts.sms.inbound++;
      else if (a.activityType === 'sms_outbound') counts.sms.outbound++;
      else if (a.activityType === 'call_inbound') counts.calls.inbound++;
      else if (a.activityType === 'call_outbound') counts.calls.outbound++;
      else if (a.activityType === 'call_missed') counts.calls.missed++;
      else if (a.activityType === 'voicemail') counts.calls.voicemail++;
      else if (a.activityType === 'email_inbound') counts.emails.inbound++;
      else if (a.activityType === 'email_outbound') counts.emails.outbound++;
      else counts.other++;
    });

    return counts;
  }, [activities]);

  return (
    <div className="flex flex-wrap gap-3 text-sm">
      <div className="flex items-center gap-1.5 rounded bg-blue-100 px-2 py-1 text-blue-800">
        <span>💬</span>
        <span>{stats.sms.inbound} in</span>
        <span>{stats.sms.outbound} out</span>
      </div>

      <div className="flex items-center gap-1.5 rounded bg-green-100 px-2 py-1 text-green-800">
        <span>📞</span>
        <span>{stats.calls.inbound} in</span>
        <span>{stats.calls.outbound} out</span>
        {(stats.calls.missed > 0 || stats.calls.voicemail > 0) && (
          <span>·</span>
        )}
        {stats.calls.missed > 0 && <span>{stats.calls.missed} missed</span>}
        {stats.calls.voicemail > 0 && <span>{stats.calls.voicemail} VM</span>}
      </div>

      <div className="flex items-center gap-1.5 rounded bg-purple-100 px-2 py-1 text-purple-800">
        <span>📧</span>
        <span>{stats.emails.inbound} in</span>
        <span>{stats.emails.outbound} out</span>
      </div>
    </div>
  );
};

export default ContactActivityTimeline;

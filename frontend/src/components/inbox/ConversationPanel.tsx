import React from 'react';
import type { WorkItem, Conversation } from '../../api/types';

interface Props {
  workItem: WorkItem | null;
  conversation: Conversation | undefined;
  loading: boolean;
  onResolve: () => void;
}

export function ConversationPanel({
  workItem,
  conversation,
  loading,
  onResolve,
}: Props) {
  if (!workItem) {
    return (
      <div className="ConversationPanel" style={{ justifyContent: 'center', alignItems: 'center', color: '#6b7280' }}>
        Select a work item to view details
      </div>
    );
  }

  if (loading) {
    return (
      <div className="ConversationPanel" style={{ justifyContent: 'center', alignItems: 'center', color: '#6b7280' }}>
        Loading conversation...
      </div>
    );
  }

  if (!conversation) {
    return (
      <div className="ConversationPanel" style={{ justifyContent: 'center', alignItems: 'center', color: '#ef4444' }}>
        Conversation not found
      </div>
    );
  }

  return (
    <div className="ConversationPanel">
      <header className="ConversationPanel__header">
        <div className="ConversationPanel__title">
          <h2>{conversation.contactName ?? 'Unknown Contact'}</h2>
          <div className="ConversationPanel__subtitle">
            {conversation.repName ? `Assigned to ${conversation.repName}` : 'Unassigned'} • {conversation.stage}
          </div>
        </div>
        <div className="ConversationPanel__actions">
          {workItem.slackPermalink && (
            <button
              className="Button Button--secondary"
              onClick={() => window.open(workItem.slackPermalink, '_blank')}
            >
              Open in Slack
            </button>
          )}
          <button className="Button Button--primary" onClick={onResolve}>
            Mark Resolved
          </button>
        </div>
      </header>

      <div className="ConversationPanel__messages">
        {conversation.events.map((event) => (
          <div
            key={event.id}
            className={`MessageBubble MessageBubble--${event.direction}`}
          >
            <div className="MessageBubble__body">{event.body}</div>
            <div className="MessageBubble__time">
              {new Date(event.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

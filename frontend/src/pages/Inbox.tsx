import React, { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import '../styles/Dashboard.css';
import { useEventStream } from '../api/useEventStream';
import { useConversation, useConversationEvents, useWorkItems, type WorkItemSeverity } from '../api/queries';

export default function Inbox({ token }: { token: string }) {
  const queryClient = useQueryClient();

  const [severity, setSeverity] = useState<WorkItemSeverity | ''>('');
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);

  const workItemsQuery = useMemo(
    () => ({
      type: 'needs_reply' as const,
      limit: 50,
      severity: severity || undefined,
      overdueOnly: overdueOnly || undefined,
    }),
    [severity, overdueOnly],
  );

  const { data, isLoading, error, refetch, isFetching } = useWorkItems(workItemsQuery);

  const items = data?.items || [];

  const conversation = useConversation(selectedConversationId);
  const events = useConversationEvents(selectedConversationId, 25);

  useEventStream({
    enabled: Boolean(token),
    onEvent: (evt) => {
      if (evt.type === 'work_item_created' || evt.type === 'work_item_resolved') {
        queryClient.invalidateQueries({ queryKey: ['work-items'] });
      }
      if (evt.type === 'conversation_updated') {
        queryClient.invalidateQueries({ queryKey: ['conversation'] });
        queryClient.invalidateQueries({ queryKey: ['conversation-events'] });
      }
    },
  });

  return (
    <div className="dashboard-container">
      <header className="dashboard-header">
        <div className="header-left">
          <h1>📥 Inbox</h1>
          <p>Work items that need action (v1: needs reply)</p>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 8, flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              Severity
              <select value={severity} onChange={(e) => setSeverity(e.target.value as WorkItemSeverity | '')}>
                <option value="">All</option>
                <option value="high">high</option>
                <option value="med">med</option>
                <option value="low">low</option>
              </select>
            </label>

            <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input type="checkbox" checked={overdueOnly} onChange={(e) => setOverdueOnly(e.target.checked)} />
              Overdue only
            </label>

            {selectedConversationId ? (
              <button className="refresh-button" onClick={() => setSelectedConversationId(null)}>
                Close detail
              </button>
            ) : null}
          </div>
        </div>
        <button onClick={() => refetch()} className="refresh-button" disabled={isFetching}>
          🔄 Refresh
        </button>
      </header>

      {isLoading ? (
        <div className="loading">Loading work items...</div>
      ) : error ? (
        <div className="error-message">{error instanceof Error ? error.message : 'Failed to load work items'}</div>
      ) : items.length === 0 ? (
        <div className="empty-state">
          <p>No open work items 🎉</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: selectedConversationId ? '1fr 420px' : '1fr', gap: 16 }}>
          <div style={{ overflowX: 'auto' }}>
            <table className="run-list-table">
              <thead>
                <tr>
                  <th>Severity</th>
                  <th>Due</th>
                  <th>Contact</th>
                  <th>Unreplied</th>
                  <th>Last inbound</th>
                  <th>Last touch</th>
                  <th>Type</th>
                </tr>
              </thead>
              <tbody>
                {items.map((wi) => (
                  <tr
                    key={wi.id}
                    onClick={() => setSelectedConversationId(wi.conversation_id)}
                    style={{ cursor: 'pointer', background: wi.conversation_id === selectedConversationId ? '#f3f4f6' : '' }}
                  >
                    <td>
                      <span className={`badge badge--${wi.severity}`}>{wi.severity}</span>
                    </td>
                    <td>{new Date(wi.due_at).toLocaleString()}</td>
                    <td>{wi.contact_id ? `#${wi.contact_id}` : wi.contact_phone || wi.contact_key}</td>
                    <td>{wi.unreplied_inbound_count}</td>
                    <td>{wi.last_inbound_at ? new Date(wi.last_inbound_at).toLocaleString() : '-'}</td>
                    <td>{wi.last_touch_at ? new Date(wi.last_touch_at).toLocaleString() : '-'}</td>
                    <td>{wi.type}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {selectedConversationId ? (
            <aside style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 12, background: 'white' }}>
              <h3 style={{ marginTop: 0 }}>Conversation</h3>
              {conversation.isLoading ? (
                <div className="loading">Loading conversation…</div>
              ) : conversation.error ? (
                <div className="error-message">Failed to load conversation</div>
              ) : (
                <div style={{ fontSize: 13 }}>
                  <div>
                    <strong>Contact:</strong>{' '}
                    {conversation.data?.conversation.contact_id
                      ? `#${conversation.data.conversation.contact_id}`
                      : conversation.data?.conversation.contact_phone || conversation.data?.conversation.contact_key}
                  </div>
                  <div>
                    <strong>Rep:</strong> {conversation.data?.conversation.current_rep_id || '-'}
                  </div>
                  <div>
                    <strong>Unreplied:</strong> {conversation.data?.conversation.unreplied_inbound_count ?? '-'}
                  </div>
                  <div>
                    <strong>Last inbound:</strong>{' '}
                    {conversation.data?.conversation.last_inbound_at
                      ? new Date(conversation.data.conversation.last_inbound_at).toLocaleString()
                      : '-'}
                  </div>
                </div>
              )}

              <h4 style={{ marginTop: 12 }}>Recent events</h4>
              {events.isLoading ? (
                <div className="loading">Loading events…</div>
              ) : events.error ? (
                <div className="error-message">Failed to load events</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 420, overflow: 'auto' }}>
                  {(events.data?.events || []).map((e) => (
                    <div key={e.id} style={{ border: '1px solid #eee', borderRadius: 6, padding: 8 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                        <strong>{e.direction}</strong>
                        <span style={{ color: '#6b7280' }}>{new Date(e.event_ts).toLocaleString()}</span>
                      </div>
                      <div style={{ marginTop: 6, whiteSpace: 'pre-wrap' }}>{e.body || '(no body)'}</div>
                    </div>
                  ))}
                </div>
              )}
            </aside>
          ) : null}
        </div>
      )}
    </div>
  );
}

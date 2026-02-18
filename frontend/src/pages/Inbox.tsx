import React from 'react';
import { useQuery } from '@tanstack/react-query';
import '../styles/Dashboard.css';

const API_URL = import.meta.env.VITE_API_URL || '';

type WorkItem = {
  id: string;
  type: string;
  severity: 'low' | 'med' | 'high';
  due_at: string;
  created_at: string;

  conversation_id: string;
  contact_key: string;
  contact_id: string | null;
  contact_phone: string | null;
  last_inbound_at: string | null;
  last_outbound_at: string | null;
  last_touch_at: string | null;
  unreplied_inbound_count: number;
};

export default function Inbox({ token }: { token: string }) {
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['work-items', { type: 'needs_reply' }],
    queryFn: async (): Promise<{ items: WorkItem[] }> => {
      const params = new URLSearchParams({ type: 'needs_reply', limit: '50', offset: '0' });
      const res = await fetch(`${API_URL}/api/work-items?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`API error: ${res.status}`);
      return res.json();
    },
    staleTime: 10_000,
    refetchInterval: 10_000,
  });

  const items = data?.items || [];

  return (
    <div className="dashboard-container">
      <header className="dashboard-header">
        <div className="header-left">
          <h1>📥 Inbox</h1>
          <p>Work items that need action (v1: needs reply)</p>
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
                <tr key={wi.id}>
                  <td>{wi.severity}</td>
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
      )}
    </div>
  );
}

import { useState, useMemo } from 'react';
import { useWorkItems, useConversation, useResolveWorkItem } from '../api/queries';
import { WorkItemFilters } from '../components/inbox/WorkItemFilters';
import { WorkItemList } from '../components/inbox/WorkItemList';
import { ConversationPanel } from '../components/inbox/ConversationPanel';
import '../styles/Inbox.css';

export function Inbox() {
  const [filters, setFilters] = useState<{
    status: 'open' | 'snoozed' | 'resolved';
    repId: string;
    type: string;
    search: string;
  }>({
    status: 'open',
    repId: 'me',
    type: 'ALL',
    search: '',
  });
  const [selectedWorkItemId, setSelectedWorkItemId] = useState<string | null>(null);

  const { data: workItems = [], isLoading, isError } = useWorkItems({
    status: filters.status === 'open' ? 'open' : undefined,
    repId: filters.repId === 'me' ? undefined : filters.repId,
    type: filters.type === 'ALL' ? undefined : filters.type,
    search: filters.search || undefined,
  });

  const selectedWorkItem = useMemo(
    () => workItems.find(w => w.id === selectedWorkItemId) ?? null,
    [workItems, selectedWorkItemId]
  );

  const { data: conversation, isLoading: convoLoading } = useConversation(
    selectedWorkItem?.conversationId ?? null
  );

  const resolveMutation = useResolveWorkItem();

  return (
    <div className="Inbox">
      <aside className="Inbox__filters">
        <WorkItemFilters value={filters} onChange={setFilters} />
      </aside>

      <main className="Inbox__list">
        <WorkItemList
          items={workItems}
          loading={isLoading}
          error={isError}
          selectedId={selectedWorkItemId}
          onSelect={setSelectedWorkItemId}
          onResolve={id => resolveMutation.mutate(id)}
        />
      </main>

      <section className="Inbox__detail">
        <ConversationPanel
          workItem={selectedWorkItem}
          conversation={conversation}
          loading={convoLoading}
          onResolve={() => selectedWorkItem && resolveMutation.mutate(selectedWorkItem.id)}
        />
      </section>
    </div>
  );
}

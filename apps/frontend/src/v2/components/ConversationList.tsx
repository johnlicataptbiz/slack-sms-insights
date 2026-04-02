/**
 * ConversationList.tsx - Virtualized conversation list with React 19 patterns
 * React 19: useTransition for non-blocking filter updates
 * Performance: @tanstack/react-virtual for large conversation lists
 */

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { UseInboxStateReturn } from '@/v2/hooks/useInboxState';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useDeferredValue, useMemo, useRef, useTransition } from 'react';

interface Conversation {
  id: string;
  senderPhone: string;
  senderName?: string;
  lastMessage?: string;
  lastMessageTime?: number;
  status: 'open' | 'closed' | 'dnc';
  owner?: string;
  needsReply?: boolean;
  unreadCount?: number;
}

interface ConversationListProps {
  conversations: Conversation[];
  state: UseInboxStateReturn;
}

const STATUS_FILTERS = ['all', 'open', 'closed', 'dnc'] as const;

function ConversationRow({
  conv,
  isSelected,
  onSelect,
}: {
  conv: Conversation;
  isSelected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'w-full rounded-control p-2.5 text-left transition-all duration-200',
        'hover:bg-gradient-to-r hover:from-ds-primary-50/50 hover:to-ds-primary-100/30',
        'hover:shadow-sm hover:scale-[1.01]',
        'active:scale-[0.99] active:transition-transform',
        isSelected
          ? 'bg-gradient-to-r from-ds-primary-100/60 to-ds-primary-50/40 border border-ds-primary-200 shadow-sm'
          : 'border border-transparent',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p
            className={cn(
              'truncate text-sm font-semibold transition-colors',
              isSelected ? 'text-ds-primary-700' : 'text-foreground',
            )}
          >
            {conv.senderName || conv.senderPhone}
          </p>
          <p className="truncate text-xs text-muted-foreground line-clamp-1">
            {conv.lastMessage}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {(conv.unreadCount ?? 0) > 0 && (
            <Badge
              variant="destructive"
              className="text-xs animate-unread-pulse"
            >
              {conv.unreadCount}
            </Badge>
          )}
          {conv.needsReply && (
            <Badge
              variant="outline"
              className="text-xs bg-ds-warning-50 border-ds-warning-200 text-ds-warning-700"
            >
              💬
            </Badge>
          )}
        </div>
      </div>
      <div className="mt-1 flex items-center gap-2">
        <span
          className={cn(
            'text-xs px-1.5 py-0.5 rounded-chip',
            conv.status === 'open' && 'bg-ds-success-100 text-ds-success-700',
            conv.status === 'closed' && 'bg-ds-neutral-100 text-ds-neutral-600',
            conv.status === 'dnc' && 'bg-ds-error-100 text-ds-error-700',
          )}
        >
          {conv.status}
        </span>
        <span className="text-xs text-muted-foreground/70">
          {conv.owner || 'Unassigned'}
        </span>
      </div>
    </button>
  );
}

export function ConversationList({
  conversations,
  state,
}: ConversationListProps) {
  const scrollParentRef = useRef<HTMLDivElement>(null);
  const [isPending, startTransition] = useTransition();

  // Defer the search value so typing stays fast
  const deferredSearch = useDeferredValue(state.filters.search);

  const filteredConversations = useMemo(() => {
    let result = conversations;

    if (state.filters.statusFilter) {
      result = result.filter((c) => c.status === state.filters.statusFilter);
    }
    if (state.filters.needsReplyOnly) {
      result = result.filter((c) => c.needsReply);
    }
    if (state.filters.ownerFilter && state.filters.ownerFilter !== 'all') {
      result = result.filter((c) =>
        (c.owner || 'unassigned').includes(state.filters.ownerFilter as string),
      );
    }
    if (deferredSearch) {
      const q = deferredSearch.toLowerCase();
      result = result.filter((c) =>
        (c.senderPhone + (c.senderName ?? '') + (c.lastMessage ?? ''))
          .toLowerCase()
          .includes(q),
      );
    }

    return result;
  }, [conversations, state.filters, deferredSearch]);

  const sortedConversations = useMemo(() => {
    const sorted = [...filteredConversations];
    switch (state.filters.sortMode) {
      case 'oldest':
        return sorted.sort(
          (a, b) => (a.lastMessageTime ?? 0) - (b.lastMessageTime ?? 0),
        );
      case 'urgent':
      case 'needs_reply':
        return sorted.sort((a, b) => {
          const diff = (b.needsReply ? 1 : 0) - (a.needsReply ? 1 : 0);
          return diff !== 0
            ? diff
            : (b.lastMessageTime ?? 0) - (a.lastMessageTime ?? 0);
        });
      default:
        return sorted.sort(
          (a, b) => (b.lastMessageTime ?? 0) - (a.lastMessageTime ?? 0),
        );
    }
  }, [filteredConversations, state.filters.sortMode]);

  // Virtual list — renders only visible rows (handles 1000s of conversations)
  const virtualizer = useVirtualizer({
    count: sortedConversations.length,
    getScrollElement: () => scrollParentRef.current,
    estimateSize: () => 68,
    overscan: 5,
  });

  const virtualItems = virtualizer.getVirtualItems();

  return (
    <div className="flex h-full flex-col gap-0">
      {/* ── Filters ── */}
      <div className="space-y-2 border-b p-2">
        <Input
          type="search"
          placeholder="Search by phone, name…"
          value={state.filters.search}
          onChange={(e) =>
            startTransition(() => {
              state.updateFilters({ search: e.target.value });
            })
          }
          className="h-8"
        />

        <div className="flex flex-wrap gap-1">
          {STATUS_FILTERS.map((status) => (
            <Button
              key={status}
              size="sm"
              variant={
                (state.filters.statusFilter || 'all') === status
                  ? 'default'
                  : 'outline'
              }
              onClick={() =>
                startTransition(() => {
                  state.updateFilters({
                    statusFilter:
                      status === 'all'
                        ? ''
                        : (status as 'open' | 'closed' | 'dnc'),
                  });
                })
              }
            >
              {status}
            </Button>
          ))}
        </div>

        <Button
          size="sm"
          variant={state.filters.needsReplyOnly ? 'default' : 'outline'}
          onClick={() =>
            startTransition(() => {
              state.updateFilters({
                needsReplyOnly: !state.filters.needsReplyOnly,
              });
            })
          }
        >
          💬 Needs Reply
        </Button>
      </div>

      {/* ── Virtual list ── */}
      <div
        ref={scrollParentRef}
        className={cn(
          'flex-1 overflow-y-auto p-2',
          isPending && 'opacity-70 transition-opacity',
        )}
      >
        {sortedConversations.length === 0 ? (
          <p className="p-4 text-center text-sm text-muted-foreground">
            No conversations found
          </p>
        ) : (
          <div
            style={{ height: `${virtualizer.getTotalSize()}px` }}
            className="relative"
          >
            {virtualItems.map((virtualRow) => {
              const conv = sortedConversations[virtualRow.index];
              if (!conv) return null;
              return (
                <div
                  key={virtualRow.key}
                  data-index={virtualRow.index}
                  ref={virtualizer.measureElement}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  <ConversationRow
                    conv={conv}
                    isSelected={
                      state.uiState.selectedConversationId === conv.id
                    }
                    onSelect={() => state.selectConversation(conv.id)}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default ConversationList;

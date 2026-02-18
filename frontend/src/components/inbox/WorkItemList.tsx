import React from 'react';
import { WorkItemRow } from './WorkItemRow';
import type { WorkItem } from '../../api/types';

interface Props {
  items: WorkItem[];
  loading: boolean;
  error: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onResolve: (id: string) => void;
}

export function WorkItemList({
  items,
  loading,
  error,
  selectedId,
  onSelect,
  onResolve,
}: Props) {
  if (loading && items.length === 0) {
    return <div className="WorkItemList__loading">Loading work items...</div>;
  }

  if (error) {
    return <div className="WorkItemList__error">Failed to load work items.</div>;
  }

  if (items.length === 0) {
    return <div className="WorkItemList__empty">No work items found.</div>;
  }

  return (
    <div className="WorkItemList">
      {items.map((item) => (
        <WorkItemRow
          key={item.id}
          item={item}
          selected={item.id === selectedId}
          onSelect={() => onSelect(item.id)}
          onResolve={() => onResolve(item.id)}
        />
      ))}
    </div>
  );
}

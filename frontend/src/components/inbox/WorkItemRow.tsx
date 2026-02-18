import React from 'react';
import type { WorkItem } from '../../api/types';

interface Props {
  item: WorkItem;
  selected: boolean;
  onSelect: () => void;
  onResolve: () => void;
}

export const WorkItemRow = React.memo(function WorkItemRow({
  item,
  selected,
  onSelect,
  onResolve,
}: Props) {
  return (
    <div
      className={`WorkItemRow ${selected ? 'WorkItemRow--selected' : ''}`}
      onClick={onSelect}
    >
      <div className="WorkItemRow__header">
        <span className="WorkItemRow__contact">{item.contactName ?? 'Unknown'}</span>
        <span className="WorkItemRow__date">
          {new Date(item.createdAt).toLocaleDateString()}
        </span>
      </div>
      
      <span className={`WorkItemRow__type WorkItemRow__type--${item.type}`}>
        {item.type.replace(/_/g, ' ')}
      </span>

      <div className="WorkItemRow__meta">
        <span>{item.repName ?? 'Unassigned'}</span>
        {item.currentLagMinutes != null && (
          <span className="WorkItemRow__lag">
            {item.currentLagMinutes} min lag
          </span>
        )}
      </div>
      
      {/* Only show resolve button on hover or selection if desired, 
          but for now let's keep it simple or move it to the detail panel 
          if the row is too crowded. I'll keep it here as per plan. */}
      <div style={{ marginTop: '0.5rem', display: 'flex', justifyContent: 'flex-end' }}>
        <button
          className="Button Button--outline"
          style={{ fontSize: '0.7rem', padding: '0.25rem 0.5rem' }}
          onClick={(e) => {
            e.stopPropagation();
            onResolve();
          }}
        >
          Resolve
        </button>
      </div>
    </div>
  );
});

import React from 'react';

export interface WorkItemFiltersProps {
  value: {
    status: 'open' | 'snoozed' | 'resolved';
    repId: string;
    type: string;
    search: string;
  };
  onChange: (value: {
    status: 'open' | 'snoozed' | 'resolved';
    repId: string;
    type: string;
    search: string;
  }) => void;
}

export function WorkItemFilters({ value, onChange }: WorkItemFiltersProps) {
  const handleChange = (key: keyof typeof value, val: string) => {
    onChange({ ...value, [key]: val });
  };

  return (
    <div className="WorkItemFilters">
      <div>
        <label>Search</label>
        <input
          type="text"
          placeholder="Search contact or rep..."
          value={value.search}
          onChange={(e) => handleChange('search', e.target.value)}
        />
      </div>

      <div>
        <label>Status</label>
        <select
          value={value.status}
          onChange={(e) => handleChange('status', e.target.value as any)}
        >
          <option value="open">Open</option>
          <option value="snoozed">Snoozed</option>
          <option value="resolved">Resolved</option>
        </select>
      </div>

      <div>
        <label>Rep</label>
        <select
          value={value.repId}
          onChange={(e) => handleChange('repId', e.target.value)}
        >
          <option value="me">Assigned to Me</option>
          <option value="all">All Reps</option>
          {/* In a real app, we'd map over a list of reps here */}
        </select>
      </div>

      <div>
        <label>Type</label>
        <select
          value={value.type}
          onChange={(e) => handleChange('type', e.target.value)}
        >
          <option value="ALL">All Types</option>
          <option value="FIRST_RESPONSE_DUE">First Response Due</option>
          <option value="FOLLOWUP_DUE">Follow-up Due</option>
          <option value="HOT_LEAD">Hot Lead</option>
          <option value="STALLED_CONVERSATION">Stalled</option>
        </select>
      </div>
    </div>
  );
}

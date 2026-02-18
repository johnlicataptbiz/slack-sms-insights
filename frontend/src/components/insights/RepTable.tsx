import React from 'react';
import type { RepPerformance } from '../../api/types';

interface Props {
  reps: RepPerformance[];
}

export function RepTable({ reps }: Props) {
  return (
    <table className="RepTable">
      <thead>
        <tr>
          <th>Rep</th>
          <th>Convos</th>
          <th>Avg Response</th>
          <th>P90 Response</th>
          <th>Lag</th>
          <th>Overdue</th>
        </tr>
      </thead>
      <tbody>
        {reps.map((rep) => (
          <tr key={rep.repId}>
            <td>{rep.repName}</td>
            <td>{rep.conversationsHandled}</td>
            <td>
              {rep.avgFirstResponseMinutes != null
                ? `${Math.round(rep.avgFirstResponseMinutes)}m`
                : '-'}
            </td>
            <td>
              {rep.p90FirstResponseMinutes != null
                ? `${Math.round(rep.p90FirstResponseMinutes)}m`
                : '-'}
            </td>
            <td>
              {rep.followupLagMinutesAvg != null
                ? `${Math.round(rep.followupLagMinutesAvg)}m`
                : '-'}
            </td>
            <td style={{ color: rep.overdueWorkItems > 0 ? '#ef4444' : 'inherit', fontWeight: rep.overdueWorkItems > 0 ? 600 : 400 }}>
              {rep.overdueWorkItems}
            </td>
          </tr>
        ))}
        {reps.length === 0 && (
          <tr>
            <td colSpan={6} style={{ textAlign: 'center', color: '#6b7280' }}>
              No rep data available
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}

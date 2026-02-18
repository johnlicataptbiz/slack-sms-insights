import React from 'react';
import type { ResponseTimeBucket } from '../../api/types';

interface Props {
  buckets: ResponseTimeBucket[];
}

export function ResponseTimeChart({ buckets }: Props) {
  const maxCount = Math.max(...buckets.map((b) => b.count), 1);

  return (
    <div className="ResponseTimeChart">
      {buckets.map((bucket) => {
        const heightPercent = (bucket.count / maxCount) * 100;
        const isHigh = bucket.bucket === '180+';
        
        return (
          <div key={bucket.bucket} className="ResponseTimeChart__bar-container">
            <div className="ResponseTimeChart__value">{bucket.count}</div>
            <div
              className="ResponseTimeChart__bar"
              style={{ 
                height: `${heightPercent}%`,
                backgroundColor: isHigh ? 'var(--color-error)' : 'var(--color-primary)',
                opacity: 0.8 + (heightPercent / 500)
              }}
            />
            <div className="ResponseTimeChart__label">{bucket.bucket}m</div>
          </div>
        );
      })}
    </div>
  );
}

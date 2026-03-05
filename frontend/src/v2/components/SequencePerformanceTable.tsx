import { useMemo } from 'react';
import { V2Panel, V2State } from './V2Primitives';

// Formatting utilities
const fmtPct = (n: number) => `${n.toFixed(1)}%`;
const fmtInt = (n: number) => n.toLocaleString();

// Type definitions
export interface MergedSeqRow {
  label: string;
  leadMagnet: string;
  version: string;
  firstSeenAt: string | null;
  messagesSent: number;
  uniqueContacted: number;
  repliesReceived: number;
  replyRatePct: number;
  canonicalBookedCalls: number;
  bookingRatePct: number;
  canonicalBookedAfterSmsReply: number;
  canonicalBookedJack: number;
  canonicalBookedBrandon: number;
  canonicalBookedSelf: number;
  optOuts: number;
  optOutRatePct: number;
  bookedAuditRows: any[];
  diagnosticSmsBookingSignals: number;
  isManual: boolean;
  uniqueReplied: number;
  smsReplyPct: number | null;
}

const parseVersionParts = (value: string): number[] | null => {
  const match = value.toLowerCase().match(/v(\d+(?:\.\d+)*)/);
  if (!match) return null;
  const raw = match[1] ?? '';
  if (!raw) return null;
  const parts = raw
    .split('.')
    .map((part) => Number(part))
    .filter((part) => Number.isFinite(part));
  return parts.length > 0 ? parts : null;
};

const compareVersionParts = (a: number[] | null, b: number[] | null): number => {
  if (!a && !b) return 0;
  if (!a) return -1;
  if (!b) return 1;
  const maxLen = Math.max(a.length, b.length);
  for (let i = 0; i < maxLen; i += 1) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    if (av !== bv) return av - bv;
  }
  return 0;
};

const extractVersionDisplay = (label: string): string => {
  const match = label.match(/\b(v\d+(?:\.\d+)+)\b/i);
  return match?.[1] ?? '';
};

interface SequencePerformanceTableProps {
  mergedRows: MergedSeqRow[];
  modeLabel: string;
}

function SequenceFamilyGroup({ family, familyRows }: { family: string; familyRows: MergedSeqRow[] }) {
  const {
    sortedVersions,
    totalContacts,
    totalReplied,
    totalBooked,
    totalSent,
    avgReplyRate,
    avgBookingRate,
    hasMultipleVersions,
    confidenceLevel,
  } = useMemo(() => {
    const sorted = [...familyRows].sort((a, b) => {
      const aVer = parseVersionParts(extractVersionDisplay(a.label) || a.version);
      const bVer = parseVersionParts(extractVersionDisplay(b.label) || b.version);
      return compareVersionParts(bVer, aVer);
    });

    const contacts = familyRows.reduce((s, r) => s + r.uniqueContacted, 0);
    const replied = familyRows.reduce((s, r) => s + r.repliesReceived, 0);
    const booked = familyRows.reduce((s, r) => s + r.canonicalBookedCalls, 0);
    const sent = familyRows.reduce((s, r) => s + r.messagesSent, 0);
    const replyRate = sent > 0 ? (replied / sent) * 100 : 0;
    const bookingRate = contacts > 0 ? (booked / contacts) * 100 : 0;
    const multipleVersions = familyRows.length > 1;
    const isHighConfidence = contacts >= 200 || sent >= 400;
    const confLevel = isHighConfidence ? 'high' : contacts >= 75 || sent >= 150 ? 'medium' : 'low';

    return {
      sortedVersions: sorted,
      totalContacts: contacts,
      totalReplied: replied,
      totalBooked: booked,
      totalSent: sent,
      avgReplyRate: replyRate,
      avgBookingRate: bookingRate,
      hasMultipleVersions: multipleVersions,
      confidenceLevel: confLevel,
    };
  }, [familyRows]);

  return (
    <div style={{ border: '1px solid var(--v2-border)', borderRadius: '10px', overflow: 'hidden', background: 'var(--v2-bg)' }}>
      {/* Family Header */}
      <div style={{ background: 'var(--v2-bg-subtle)', padding: '1rem 1.25rem', borderBottom: '1px solid var(--v2-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.75rem' }}>
          <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 600, color: 'var(--v2-text)' }}>{family}</h3>
          <span style={{ fontSize: '0.8rem', color: 'var(--v2-text-dim)' }}>
            {familyRows.length} version{familyRows.length > 1 ? 's' : ''}
          </span>
        </div>

        <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center' }}>
          {/* Reply Rate */}
          <div style={{ textAlign: 'center', minWidth: '70px' }}>
            <div style={{ fontSize: '1.35rem', fontWeight: 700, color: avgReplyRate >= 10 ? 'var(--v2-positive)' : avgReplyRate < 5 ? 'var(--v2-warning)' : 'var(--v2-accent)' }}>
              {fmtPct(avgReplyRate)}
            </div>
            <div style={{ fontSize: '0.7rem', color: 'var(--v2-text-dim)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Reply Rate
            </div>
            <div style={{ fontSize: '0.65rem', color: 'var(--v2-text-dim)' }}>
              {fmtInt(totalReplied)}/{fmtInt(totalSent)} sent
            </div>
          </div>

          {/* Booking Rate */}
          <div style={{ textAlign: 'center', minWidth: '70px' }}>
            <div style={{ fontSize: '1.35rem', fontWeight: 700, color: avgBookingRate >= 2 ? 'var(--v2-positive)' : 'var(--v2-text)' }}>
              {fmtPct(avgBookingRate)}
            </div>
            <div style={{ fontSize: '0.7rem', color: 'var(--v2-text-dim)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Booking Rate
            </div>
            <div style={{ fontSize: '0.65rem', color: 'var(--v2-text-dim)' }}>
              {fmtInt(totalBooked)}/{fmtInt(totalContacts)} contacts
            </div>
          </div>

          {/* Confidence Badge */}
          <div style={{ textAlign: 'center' }}>
            <span className={`V2Badge ${confidenceLevel === 'high' ? 'V2Badge--confidenceHigh' : confidenceLevel === 'medium' ? 'V2Badge--confidenceMed' : 'V2Badge--confidenceLow'}`}>
              {confidenceLevel === 'high' ? 'High confidence' : confidenceLevel === 'medium' ? 'Medium' : 'Low sample'}
            </span>
            <div style={{ fontSize: '0.6rem', color: 'var(--v2-text-dim)', marginTop: '2px' }}>
              {confidenceLevel === 'high' ? '200+ contacts' : confidenceLevel === 'medium' ? '75+ contacts' : 'small dataset'}
            </div>
          </div>
        </div>
      </div>

      {/* Version Rows */}
      <div>
        {sortedVersions.map((row, idx) => {
          const replyRate = row.messagesSent > 0 ? (row.repliesReceived / row.messagesSent) * 100 : 0;
          const bookingRate = row.uniqueContacted > 0 ? (row.canonicalBookedCalls / row.uniqueContacted) * 100 : 0;
          const versionLabel = extractVersionDisplay(row.label) || row.version || 'Legacy';
          const isWinning = hasMultipleVersions && idx === 0;
          return (
            <div
              key={row.label}
              style={{
                padding: '0.75rem 1.25rem',
                borderBottom: idx < sortedVersions.length - 1 ? '1px solid var(--v2-border)' : 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '0.75rem',
                background: isWinning ? 'rgba(34, 197, 94, 0.04)' : undefined,
              }}
            >
              {/* Version & Volume Info */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: '180px' }}>
                <span className="V2Badge V2Badge--version" style={{ fontSize: '0.8rem' }}>
                  {versionLabel}
                </span>
                {isWinning && (
                  <span className="V2Badge" style={{ background: 'var(--v2-positive)', color: 'white', fontSize: '0.7rem' }}>
                    TOP
                  </span>
                )}
                <span style={{ fontSize: '0.8rem', color: 'var(--v2-text-dim)' }}>
                  {fmtInt(row.messagesSent)} sent
                </span>
              </div>

              {/* Metrics */}
              <div style={{ display: 'flex', gap: '1.25rem', alignItems: 'center' }}>
                {/* Reply */}
                <div style={{ minWidth: '70px' }}>
                  <div style={{ fontWeight: 600, fontSize: '0.9rem', color: replyRate >= 10 ? 'var(--v2-positive)' : replyRate < 5 ? 'var(--v2-warning)' : 'var(--v2-accent)' }}>
                    {fmtPct(replyRate)}
                  </div>
                  <div style={{ fontSize: '0.65rem', color: 'var(--v2-text-dim)' }}>
                    {fmtInt(row.repliesReceived)} replies
                  </div>
                </div>

                {/* Booking */}
                <div style={{ minWidth: '70px' }}>
                  <div style={{ fontWeight: 600, fontSize: '0.9rem', color: bookingRate >= 2 ? 'var(--v2-positive)' : 'var(--v2-text)' }}>
                    {fmtPct(bookingRate)}
                  </div>
                  <div style={{ fontSize: '0.65rem', color: 'var(--v2-text-dim)' }}>
                    {fmtInt(row.canonicalBookedCalls)} booked
                  </div>
                </div>

                {/* Rep Attribution */}
                <div style={{ minWidth: '80px', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                  {row.canonicalBookedJack > 0 && (
                    <span style={{ fontSize: '0.7rem', background: 'var(--v2-bg)', padding: '2px 5px', borderRadius: '3px', color: 'var(--v2-text-dim)' }}>
                      J:{row.canonicalBookedJack}
                    </span>
                  )}
                  {row.canonicalBookedBrandon > 0 && (
                    <span style={{ fontSize: '0.7rem', background: 'var(--v2-bg)', padding: '2px 5px', borderRadius: '3px', color: 'var(--v2-text-dim)' }}>
                      B:{row.canonicalBookedBrandon}
                    </span>
                  )}
                  {row.canonicalBookedSelf > 0 && (
                    <span style={{ fontSize: '0.7rem', background: 'var(--v2-bg)', padding: '2px 5px', borderRadius: '3px', color: 'var(--v2-text-dim)' }}>
                      S:{row.canonicalBookedSelf}
                    </span>
                  )}
                  {row.canonicalBookedCalls === 0 && (
                    <span style={{ fontSize: '0.7rem', color: 'var(--v2-text-dim)' }}>—</span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function SequencePerformanceTable({ mergedRows, modeLabel }: SequencePerformanceTableProps) {
  const { familyEntries, activeSequenceCount, uniqueFamilyCount } = useMemo(() => {
    const filteredRows = mergedRows.filter((r) => !r.isManual);

    const grouped = filteredRows.reduce((acc, row) => {
      const family = row.leadMagnet || 'Not Captured Yet';
      if (!acc[family]) acc[family] = [];
      acc[family].push(row);
      return acc;
    }, {} as Record<string, MergedSeqRow[]>);

    return {
      familyEntries: Object.entries(grouped),
      activeSequenceCount: filteredRows.length,
      uniqueFamilyCount: new Set(mergedRows.map((r) => r.leadMagnet || 'Not Captured Yet')).size,
    };
  }, [mergedRows]);

  if (activeSequenceCount === 0) {
    return (
      <V2Panel title="Sequence Performance" caption={`${modeLabel} · Booked = Slack-verified`}>
        <V2State kind="empty">No sequence data for this window.</V2State>
      </V2Panel>
    );
  }

  return (
    <V2Panel
      title="Sequence Performance"
      caption={`${activeSequenceCount} sequences across ${uniqueFamilyCount} lead magnets · ${modeLabel} · Booked = Slack-verified`}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        {familyEntries.map(([family, familyRows]) => (
          <SequenceFamilyGroup key={family} family={family} familyRows={familyRows} />
        ))}
      </div>
    </V2Panel>
  );
}

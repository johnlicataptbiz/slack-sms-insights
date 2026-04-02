import { AnimatePresence, motion } from 'framer-motion';
import type { Variants } from 'framer-motion';
import {
  Calendar,
  ChevronDown,
  Filter,
  MessageSquare,
  Phone,
  Reply,
  SortAsc,
  SortDesc,
  Users,
} from 'lucide-react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { SequenceQualificationItem } from '../../api/v2Queries';
import {
  useV2AttributionMethodDaily,
  useV2AttributionReviewQueue,
  useV2RepResponseDaily,
  useV2SequenceFunnel,
  useV2SequenceQualification,
  useV2SequencesDeep,
  useV2UnresolvedAttributions,
} from '../../api/v2Queries';
import { DEFAULT_BUSINESS_TIME_ZONE } from '../../utils/runDay';
import { AttributionHealthPanel } from '../components/AttributionHealthPanel';
import {
  AttributionMethodPanel,
  AttributionReviewQueuePanel,
  RepResponsePanel,
  SequenceFunnelPanel,
  UnresolvedAttributionPanel,
} from '../components/SequenceAttributionPanels';
import { SequenceQualificationBreakdown } from '../components/SequenceQualificationBreakdown';
import {
  V2MetricCard,
  V2PageHeader,
  V2Panel,
  V2State,
} from '../components/V2Primitives';

const MODE_LABELS: Record<Mode, string> = {
  '7d': '7d',
  '30d': '30d',
  '90d': '90d',
  '180d': '180d',
  '365d': '365d',
};

type Mode = '7d' | '30d' | '90d' | '180d' | '365d';
type SortKey =
  | 'label'
  | 'messagesSent'
  | 'uniqueContacted'
  | 'repliesReceived'
  | 'replyRatePct'
  | 'bookedCalls'
  | 'bookingRatePct'
  | 'optOuts'
  | 'optOutRatePct';
type SortDirection = 'asc' | 'desc';
type SequenceColumnKey =
  | 'label'
  | 'uniqueContacted'
  | 'repliesReceived'
  | 'replyRatePct'
  | 'bookedCalls'
  | 'bookingRatePct'
  | 'optOuts'
  | 'optOutRatePct'
  | 'bookedSplit';
type SequenceColumnWidths = Record<SequenceColumnKey, number>;

const SEQUENCE_COLUMN_WIDTH_STORAGE_KEY = 'v2-sequences-column-widths';
const DEFAULT_SEQUENCE_COLUMN_WIDTHS: SequenceColumnWidths = {
  label: 280,
  uniqueContacted: 150,
  repliesReceived: 145,
  replyRatePct: 140,
  bookedCalls: 140,
  bookingRatePct: 140,
  optOuts: 130,
  optOutRatePct: 140,
  bookedSplit: 150,
};

const fmtInt = (n: number) => n.toLocaleString();
const fmtPct = (n: number) => `${n.toFixed(1)}%`;
const fmtSplit = (jack: number, brandon: number, selfBooked: number) =>
  `${fmtInt(jack)} / ${fmtInt(brandon)} / ${fmtInt(selfBooked)}`;

const normalizeSequenceColumnWidths = (
  value: unknown,
): SequenceColumnWidths | null => {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<Record<SequenceColumnKey, unknown>>;
  const next: Partial<SequenceColumnWidths> = {};
  for (const key of Object.keys(
    DEFAULT_SEQUENCE_COLUMN_WIDTHS,
  ) as SequenceColumnKey[]) {
    const raw = candidate[key];
    if (typeof raw !== 'number' || !Number.isFinite(raw)) return null;
    next[key] = Math.max(120, Math.min(420, Math.round(raw)));
  }
  return next as SequenceColumnWidths;
};

const filterVariants: Variants = {
  hidden: { opacity: 0, y: -20 },
  visible: { opacity: 1, y: 0, transition: { staggerChildren: 0.05 } },
};

const metricVariants: Variants = {
  hidden: { opacity: 0, scale: 0.9 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: { type: 'spring', stiffness: 300, damping: 20 },
  },
};

export default function SequencesV2() {
  const [mode] = useState<Mode>('30d');
  const [status] = useState<'active' | 'inactive' | ''>('active');
  const [minSendsThreshold, setMinSendsThreshold] = useState<number>(15);
  const [sortKey, setSortKey] = useState<SortKey>('messagesSent');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [columnWidths, setColumnWidths] = useState<SequenceColumnWidths>(() => {
    if (typeof window === 'undefined') return DEFAULT_SEQUENCE_COLUMN_WIDTHS;
    try {
      const saved = localStorage.getItem(SEQUENCE_COLUMN_WIDTH_STORAGE_KEY);
      if (saved) {
        const parsed = normalizeSequenceColumnWidths(JSON.parse(saved));
        if (parsed) return parsed;
      }
    } catch {
      // Ignore parse errors
    }
    return DEFAULT_SEQUENCE_COLUMN_WIDTHS;
  });
  const [activeTab, setActiveTab] = useState(0);
  const tableRef = useRef<HTMLDivElement | null>(null);

  const onSort = useCallback(
    (key: SortKey) => {
      if (sortKey === key) {
        setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'));
      } else {
        setSortKey(key);
        setSortDirection(key === 'label' ? 'asc' : 'desc');
      }
    },
    [sortKey],
  );

  const sortIndicator = (key: SortKey) => {
    if (sortKey !== key) return null;
    return sortDirection === 'asc' ? (
      <SortAsc size={12} className="V2IconGlow" />
    ) : (
      <SortDesc size={12} className="V2IconGlow" />
    );
  };

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(
        SEQUENCE_COLUMN_WIDTH_STORAGE_KEY,
        JSON.stringify(columnWidths),
      );
    }
  }, [columnWidths]);

  const startResize = useCallback(
    (key: SequenceColumnKey, event: ReactPointerEvent<HTMLSpanElement>) => {
      event.preventDefault();
      event.stopPropagation();

      const startX = event.clientX;
      const startWidth = columnWidths[key];

      const onMove = (moveEvent: PointerEvent) => {
        const nextWidth = Math.max(
          120,
          Math.min(420, startWidth + (moveEvent.clientX - startX)),
        );
        setColumnWidths((current) =>
          current[key] === nextWidth
            ? current
            : { ...current, [key]: nextWidth },
        );
      };

      const onUp = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onUp);
      };

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onUp);
    },
    [columnWidths],
  );

  const query = useV2SequencesDeep({
    range: mode,
    tz: DEFAULT_BUSINESS_TIME_ZONE,
    ...(status ? { status } : {}),
  });
  const funnelQuery = useV2SequenceFunnel({
    range: mode,
    tz: DEFAULT_BUSINESS_TIME_ZONE,
  });
  const attributionMethodQuery = useV2AttributionMethodDaily({
    range: mode,
    tz: DEFAULT_BUSINESS_TIME_ZONE,
  });
  const repResponseQuery = useV2RepResponseDaily({
    range: mode,
    tz: DEFAULT_BUSINESS_TIME_ZONE,
  });
  const reviewQueueQuery = useV2AttributionReviewQueue(8);
  const unresolvedQuery = useV2UnresolvedAttributions(8);
  const qualificationQuery = useV2SequenceQualification({
    range: mode,
    tz: DEFAULT_BUSINESS_TIME_ZONE,
  });

  const data = query.data?.data;
  const funnelRows = funnelQuery.data ?? [];
  const attributionMethodRows = attributionMethodQuery.data ?? [];
  const repResponseRows = repResponseQuery.data ?? [];
  const reviewQueueRows = reviewQueueQuery.data ?? [];
  const unresolvedRows = unresolvedQuery.data ?? [];
  const qualificationItems = qualificationQuery.data?.data.items ?? [];

  const qualificationSummary = useMemo(() => {
    const total = qualificationItems.reduce(
      (sum: number, item: SequenceQualificationItem) =>
        sum + item.totalConversations,
      0,
    );
    const sumFullTime = qualificationItems.reduce(
      (sum: number, item: SequenceQualificationItem) =>
        sum + item.fullTime.count,
      0,
    );
    const sumPartTime = qualificationItems.reduce(
      (sum: number, item: SequenceQualificationItem) =>
        sum + item.partTime.count,
      0,
    );
    const sumCash = qualificationItems.reduce(
      (sum: number, item: SequenceQualificationItem) =>
        sum + item.mostlyCash.count,
      0,
    );
    const sumInsurance = qualificationItems.reduce(
      (sum: number, item: SequenceQualificationItem) =>
        sum + item.mostlyInsurance.count,
      0,
    );
    const sumBalanced = qualificationItems.reduce(
      (sum: number, item: SequenceQualificationItem) =>
        sum + item.balancedMix.count,
      0,
    );
    const sumHighInterest = qualificationItems.reduce(
      (sum: number, item: SequenceQualificationItem) =>
        sum + item.highInterest.count,
      0,
    );
    const sumMediumInterest = qualificationItems.reduce(
      (sum: number, item: SequenceQualificationItem) =>
        sum + item.mediumInterest.count,
      0,
    );
    const sumLowInterest = qualificationItems.reduce(
      (sum: number, item: SequenceQualificationItem) =>
        sum + item.lowInterest.count,
      0,
    );
    const nicheMap = new Map<string, number>();
    for (const item of qualificationItems) {
      for (const niche of item.topNiches) {
        nicheMap.set(
          niche.niche,
          (nicheMap.get(niche.niche) || 0) + niche.count,
        );
      }
    }
    const topNiches = [...nicheMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([niche, count]) => ({ niche, count }));
    const pct = (value: number) => (total > 0 ? (value / total) * 100 : 0);
    return {
      total,
      fullTimePct: pct(sumFullTime),
      partTimePct: pct(sumPartTime),
      cashPct: pct(sumCash),
      insurancePct: pct(sumInsurance),
      balancedPct: pct(sumBalanced),
      highInterestPct: pct(sumHighInterest),
      mediumInterestPct: pct(sumMediumInterest),
      lowInterestPct: pct(sumLowInterest),
      topNiches,
    };
  }, [qualificationItems]);

  const tableEligibleSequences = useMemo(() => {
    if (!data) return [];
    return data.sequences.filter((row) => !row.isManualBucket);
  }, [data]);

  const totals = useMemo(() => {
    return tableEligibleSequences.reduce(
      (acc, row) => {
        acc.messagesSent += row.messagesSent;
        acc.uniqueContacted += row.uniqueContacted;
        acc.inboundTexts += row.inboundTexts;
        acc.repliesReceived += row.repliesReceived;
        acc.bookedCalls += row.bookedCalls;
        acc.optOuts += row.optOuts;
        return acc;
      },
      {
        messagesSent: 0,
        uniqueContacted: 0,
        inboundTexts: 0,
        repliesReceived: 0,
        bookedCalls: 0,
        optOuts: 0,
      },
    );
  }, [tableEligibleSequences]);

  const sortedSequences = useMemo(() => {
    const filtered = tableEligibleSequences.filter(
      (row) => row.messagesSent >= minSendsThreshold,
    );
    const dir = sortDirection === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      if (sortKey === 'label') return a.label.localeCompare(b.label) * dir;
      const aVal = a[sortKey as keyof typeof a] as number;
      const bVal = b[sortKey as keyof typeof b] as number;
      if (aVal < bVal) return -1 * dir;
      if (aVal > bVal) return 1 * dir;
      return a.label.localeCompare(b.label);
    });
  }, [tableEligibleSequences, minSendsThreshold, sortKey, sortDirection]);

  const summaryCopy = [
    `${fmtInt(totals.messagesSent)} outbound`,
    `${fmtInt(totals.uniqueContacted)} leads contacted`,
    `${fmtInt(totals.repliesReceived)} replied`,
    `${fmtInt(totals.bookedCalls)} booked`,
  ].join(' · ');

  return (
    <div className="V2Page V2Page--sequences">
      <V2PageHeader
        title="Sequences"
        subtitle="Performance analysis: outbound, response rates, bookings, and qualification insights."
      />

      {/* Compact Filter Bar */}
      <motion.div
        className="V2FilterBar"
        variants={filterVariants}
        initial="hidden"
        animate="visible"
      >
        <div className="V2FilterGroup">
          <motion.button className="V2FilterButton V2FilterButton--active">
            <Calendar size={16} />
            {MODE_LABELS[mode]}
            <ChevronDown size={16} />
          </motion.button>
          <motion.button className="V2FilterButton">
            <Filter size={16} />
            {status || 'All'}
            <ChevronDown size={16} />
          </motion.button>
        </div>
        <div className="V2FilterGroup">
          <span className="V2FilterLabel">Min sends</span>
          <input
            type="number"
            min={0}
            max={1000}
            value={minSendsThreshold}
            onChange={(e) =>
              setMinSendsThreshold(
                Math.max(0, Number.parseInt(e.target.value, 10) || 0),
              )
            }
            className="V2FilterInput"
          />
        </div>
        <motion.button
          className="V2ActionButton V2ActionButton--neon"
          onClick={() =>
            tableRef.current?.scrollIntoView({ behavior: 'smooth' })
          }
          whileHover={{ scale: 1.05 }}
        >
          Jump to Table
        </motion.button>
      </motion.div>

      {query.isLoading ? (
        <V2State kind="loading">
          <motion.div className="V2IndustrialLoader">
            Loading sequence performance...
          </motion.div>
        </V2State>
      ) : query.isError || !data ? (
        <V2State kind="error" onRetry={() => void query.refetch()}>
          <motion.div className="V2ErrorGlow" animate={{ scale: [1, 1.05, 1] }}>
            Failed to load sequence performance.
          </motion.div>
        </V2State>
      ) : (
        <>
          {data.warnings && data.warnings.length > 0 ? (
            <div className="V2InlineWarning V2NeonBorder">
              {data.warnings.join(' ')}
            </div>
          ) : null}

          {/* Animated Metrics Grid */}
          <motion.div
            className="V2MetricsGrid"
            variants={{ visible: { transition: { staggerChildren: 0.1 } } }}
            initial="hidden"
            animate="visible"
          >
            <motion.div variants={metricVariants}>
              <V2MetricCard
                label={
                  <span>
                    <MessageSquare size={16} /> Total Outbound
                  </span>
                }
                value={fmtInt(totals.messagesSent)}
              />
            </motion.div>
            <motion.div variants={metricVariants}>
              <V2MetricCard
                label={
                  <span>
                    <Users size={16} /> Leads Contacted
                  </span>
                }
                value={fmtInt(totals.uniqueContacted)}
              />
            </motion.div>
            <motion.div variants={metricVariants}>
              <V2MetricCard
                label={
                  <span>
                    <Reply size={16} /> Replies Received
                  </span>
                }
                value={fmtInt(totals.repliesReceived)}
              />
            </motion.div>
            <motion.div variants={metricVariants}>
              <V2MetricCard
                label={
                  <span>
                    <Phone size={16} /> Booked Calls
                  </span>
                }
                value={fmtInt(totals.bookedCalls)}
                tone="positive"
              />
            </motion.div>
          </motion.div>

          <div className="V2SummaryBar V2NeonText">{summaryCopy}</div>

          {/* Resizable Table */}
          <div ref={tableRef} className="V2TableContainer">
            <V2Panel
              title="Sequence Results"
              caption="Sortable and resizable performance table."
            >
              <div className="V2TableWrap">
                <table className="V2Table V2Table--neon SequencesTable--resizable">
                  <colgroup>
                    {Object.entries(columnWidths).map(([key]) => (
                      <col
                        key={key}
                        style={{
                          width: `${columnWidths[key as SequenceColumnKey]}px`,
                        }}
                      />
                    ))}
                  </colgroup>
                  <thead>
                    <tr>
                      <th>
                        <button
                          className="V2SortButton"
                          onClick={() => onSort('label')}
                        >
                          Sequence {sortIndicator('label')}
                        </button>
                        <span
                          className="V2ResizeHandle V2NeonGlow"
                          onPointerDown={(event) => startResize('label', event)}
                        />
                      </th>
                      <th className="is-right">
                        <button
                          className="V2SortButton"
                          onClick={() => onSort('uniqueContacted')}
                        >
                          Leads Contacted {sortIndicator('uniqueContacted')}
                        </button>
                        <span
                          className="V2ResizeHandle V2NeonGlow"
                          onPointerDown={(event) =>
                            startResize('uniqueContacted', event)
                          }
                        />
                      </th>
                      {/* Add other headers similarly */}
                      <th className="is-right">
                        <button
                          className="V2SortButton"
                          onClick={() => onSort('repliesReceived')}
                        >
                          Replies {sortIndicator('repliesReceived')}
                        </button>
                        <span
                          className="V2ResizeHandle V2NeonGlow"
                          onPointerDown={(event) =>
                            startResize('repliesReceived', event)
                          }
                        />
                      </th>
                      <th className="is-right">
                        <button
                          className="V2SortButton"
                          onClick={() => onSort('replyRatePct')}
                        >
                          Reply Rate {sortIndicator('replyRatePct')}
                        </button>
                        <span
                          className="V2ResizeHandle V2NeonGlow"
                          onPointerDown={(event) =>
                            startResize('replyRatePct', event)
                          }
                        />
                      </th>
                      <th className="is-right">
                        <button
                          className="V2SortButton"
                          onClick={() => onSort('bookedCalls')}
                        >
                          Booked {sortIndicator('bookedCalls')}
                        </button>
                        <span
                          className="V2ResizeHandle V2NeonGlow"
                          onPointerDown={(event) =>
                            startResize('bookedCalls', event)
                          }
                        />
                      </th>
                      <th className="is-right">
                        <button
                          className="V2SortButton"
                          onClick={() => onSort('bookingRatePct')}
                        >
                          Booking Rate {sortIndicator('bookingRatePct')}
                        </button>
                        <span
                          className="V2ResizeHandle V2NeonGlow"
                          onPointerDown={(event) =>
                            startResize('bookingRatePct', event)
                          }
                        />
                      </th>
                      <th className="is-right">
                        <button
                          className="V2SortButton"
                          onClick={() => onSort('optOuts')}
                        >
                          Opt-outs {sortIndicator('optOuts')}
                        </button>
                        <span
                          className="V2ResizeHandle V2NeonGlow"
                          onPointerDown={(event) =>
                            startResize('optOuts', event)
                          }
                        />
                      </th>
                      <th className="is-right">
                        <button
                          className="V2SortButton"
                          onClick={() => onSort('optOutRatePct')}
                        >
                          Opt-out Rate {sortIndicator('optOutRatePct')}
                        </button>
                        <span
                          className="V2ResizeHandle V2NeonGlow"
                          onPointerDown={(event) =>
                            startResize('optOutRatePct', event)
                          }
                        />
                      </th>
                      <th className="is-right">
                        J / B / Self
                        <span
                          className="V2ResizeHandle V2NeonGlow"
                          onPointerDown={(event) =>
                            startResize('bookedSplit', event)
                          }
                        />
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    <AnimatePresence>
                      {sortedSequences.length === 0 ? (
                        <motion.tr
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          className="V2TableRow--empty"
                        >
                          <td
                            colSpan={9}
                            className="V2TableCell--center V2NeonText"
                          >
                            No sequences match the current filter.
                          </td>
                        </motion.tr>
                      ) : (
                        sortedSequences.map((row, index) => (
                          <motion.tr
                            key={row.sequenceId}
                            initial={{ opacity: 0, x: -50 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: index * 0.05 }}
                            className={`V2TableRow ${row.isManualBucket ? 'V2TableRow--manual' : ''}`}
                          >
                            <td
                              title={`${row.label}${row.leadMagnet ? ` • ${row.leadMagnet}` : ''}`}
                            >
                              <span className="V2TableSeqName V2NeonText">
                                {row.label}
                              </span>
                            </td>
                            <td className="is-right V2TableCell--number">
                              {fmtInt(row.uniqueContacted)}
                            </td>
                            <td className="is-right V2TableCell--number">
                              {fmtInt(row.repliesReceived)}
                            </td>
                            <td className="is-right V2TableCell--pct">
                              {fmtPct(row.replyRatePct)}
                            </td>
                            <td className="is-right V2TableCell--number">
                              {fmtInt(row.bookedCalls)}
                            </td>
                            <td className="is-right V2TableCell--pct">
                              {fmtPct(row.bookingRatePct)}
                            </td>
                            <td className="is-right V2TableCell--number">
                              {fmtInt(row.optOuts)}
                            </td>
                            <td className="is-right V2TableCell--pct">
                              {fmtPct(row.optOutRatePct)}
                            </td>
                            <td className="is-right V2TableCell--split">
                              {fmtSplit(
                                row.bookedBreakdown.jack,
                                row.bookedBreakdown.brandon,
                                row.bookedBreakdown.selfBooked,
                              )}
                            </td>
                          </motion.tr>
                        ))
                      )}
                    </AnimatePresence>
                  </tbody>
                </table>
              </div>
            </V2Panel>
          </div>

          {/* Tabbed Panels */}
          <div className="V2Tabs">
            <div className="V2TabList V2NeonBorder">
              <button
                type="button"
                className="V2Tab V2NeonText"
                aria-selected={activeTab === 0}
                onClick={() => setActiveTab(0)}
              >
                Overview
              </button>
              <button
                type="button"
                className="V2Tab V2NeonText"
                aria-selected={activeTab === 1}
                onClick={() => setActiveTab(1)}
              >
                Funnel & Attribution
              </button>
              <button
                type="button"
                className="V2Tab V2NeonText"
                aria-selected={activeTab === 2}
                onClick={() => setActiveTab(2)}
              >
                Qualification
              </button>
            </div>
            {activeTab === 0 ? (
              <div>
                {/* Qualification Summary */}
                {!qualificationQuery.isLoading &&
                !qualificationQuery.isError &&
                qualificationItems.length > 0 ? (
                  <motion.div
                    className="V2QualSummary V2NeonGrid"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                  >
                    <motion.article className="V2QualCell">
                      <strong>
                        {fmtPct(qualificationSummary.fullTimePct)}
                      </strong>
                      <span>Full-time</span>
                      <small>
                        {fmtPct(qualificationSummary.partTimePct)} part-time
                      </small>
                    </motion.article>
                    <motion.article className="V2QualCell">
                      <strong>{fmtPct(qualificationSummary.cashPct)}</strong>
                      <span>Revenue mix</span>
                      <small>
                        {fmtPct(qualificationSummary.insurancePct)} insurance ·{' '}
                        {fmtPct(qualificationSummary.balancedPct)} balanced
                      </small>
                    </motion.article>
                    <motion.article className="V2QualCell">
                      <strong>
                        {fmtPct(qualificationSummary.highInterestPct)}
                      </strong>
                      <span>Coaching interest</span>
                      <small>
                        {fmtPct(qualificationSummary.mediumInterestPct)} medium
                        · {fmtPct(qualificationSummary.lowInterestPct)} low
                      </small>
                    </motion.article>
                    <motion.article className="V2QualCell">
                      <strong>Top niches</strong>
                      <span>Incoming interests</span>
                      <div className="V2QualNiches">
                        {qualificationSummary.topNiches.map((niche) => (
                          <span
                            key={niche.niche}
                            className="V2QualNiche V2NeonTag"
                          >
                            {niche.niche}
                            <strong>{fmtInt(niche.count)}</strong>
                          </span>
                        ))}
                      </div>
                    </motion.article>
                  </motion.div>
                ) : null}
              </div>
            ) : null}
            {activeTab === 1 ? (
              <div>
                <div className="V2Grid V2Grid--2">
                  <SequenceFunnelPanel rows={funnelRows} />
                  <AttributionReviewQueuePanel rows={reviewQueueRows} />
                  <AttributionHealthPanel />
                  <UnresolvedAttributionPanel rows={unresolvedRows} />
                  <AttributionMethodPanel rows={attributionMethodRows} />
                  <RepResponsePanel rows={repResponseRows} />
                </div>
              </div>
            ) : null}
            {activeTab === 2 ? (
              <div>
                <SequenceQualificationBreakdown
                  items={qualificationItems}
                  isLoading={qualificationQuery.isLoading}
                />
              </div>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}

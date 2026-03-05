import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Users, Briefcase, DollarSign, Target, ChevronDown, ChevronUp, TrendingUp, Building2, BarChart3 } from 'lucide-react';
import type { SequenceQualificationItem } from '../../api/v2Queries';

if (typeof document !== 'undefined') {
  void import('./SequenceQualificationBreakdown.css');
}

type Props = {
  items: SequenceQualificationItem[];
  isLoading?: boolean;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Number of conversations with at least one non-unknown qualification field */
const computeWithQualData = (item: SequenceQualificationItem): number => {
  const knownEmployment = item.fullTime.count + item.partTime.count;
  const knownRevenue = item.mostlyCash.count + item.mostlyInsurance.count + item.balancedMix.count;
  const knownDelivery = item.brickAndMortar.count + item.mobile.count + item.online.count + item.hybrid.count;
  const knownInterest = item.highInterest.count + item.mediumInterest.count + item.lowInterest.count;
  return Math.max(knownEmployment, knownRevenue, knownDelivery, knownInterest);
};

const EMPTY_MONDAY_OUTCOMES = {
  linkedContacts: 0,
  totalOutcomes: 0,
  booked: 0,
  closedWon: 0,
  closedLost: 0,
  noShow: 0,
  cancelled: 0,
  badTiming: 0,
  badFit: 0,
  other: 0,
  unknown: 0,
  bookedPct: 0,
  closedWonPct: 0,
  noShowPct: 0,
  cancelledPct: 0,
};

const getMondayOutcomes = (item: SequenceQualificationItem) => item.mondayOutcomes ?? EMPTY_MONDAY_OUTCOMES;

type SampleQuoteItem = { label: string; quote: string; count: number };

/** Collect non-null sample quotes from all fields, dedupe, and rank by signal strength. */
const collectSampleQuotes = (item: SequenceQualificationItem): SampleQuoteItem[] => {
  const candidates: SampleQuoteItem[] = [
    { label: 'Full-time', quote: item.fullTime.sampleQuote ?? '', count: item.fullTime.count },
    { label: 'Part-time', quote: item.partTime.sampleQuote ?? '', count: item.partTime.count },
    { label: 'Mostly Cash', quote: item.mostlyCash.sampleQuote ?? '', count: item.mostlyCash.count },
    { label: 'Mostly Insurance', quote: item.mostlyInsurance.sampleQuote ?? '', count: item.mostlyInsurance.count },
    { label: 'Balanced Mix', quote: item.balancedMix.sampleQuote ?? '', count: item.balancedMix.count },
    { label: 'Brick & Mortar', quote: item.brickAndMortar.sampleQuote ?? '', count: item.brickAndMortar.count },
    { label: 'Mobile', quote: item.mobile.sampleQuote ?? '', count: item.mobile.count },
    { label: 'Online', quote: item.online.sampleQuote ?? '', count: item.online.count },
    { label: 'Hybrid', quote: item.hybrid.sampleQuote ?? '', count: item.hybrid.count },
    { label: 'High Interest', quote: item.highInterest.sampleQuote ?? '', count: item.highInterest.count },
    { label: 'Medium Interest', quote: item.mediumInterest.sampleQuote ?? '', count: item.mediumInterest.count },
    { label: 'Low Interest', quote: item.lowInterest.sampleQuote ?? '', count: item.lowInterest.count },
  ].filter((entry) => entry.quote.trim().length > 0 && entry.count > 0);

  const seen = new Set<string>();
  const deduped: SampleQuoteItem[] = [];
  for (const entry of candidates) {
    const key = entry.quote.trim().toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push({ ...entry, quote: entry.quote.trim() });
  }

  deduped.sort((a, b) => b.count - a.count);
  return deduped;
};

// ─── MetricCard ──────────────────────────────────────────────────────────────

const MetricCard: React.FC<{
  label: string;
  count: number;
  pct: number;
  icon: React.ReactNode;
  color: string;
  sampleQuote?: string | null;
}> = ({ label, count, pct, icon, color, sampleQuote }) => (
  <div 
    className="metric-card" 
    title={sampleQuote ?? undefined}
    aria-label={sampleQuote ? `${label}: ${count} (${Math.round(pct)}%). Sample quote: ${sampleQuote}` : `${label}: ${count} (${Math.round(pct)}%)`}
    role={sampleQuote ? "tooltip" : undefined}
  >
    <div className="metric-icon" style={{ backgroundColor: `${color}20`, color }} aria-hidden="true">
      {icon}
    </div>
    <div className="metric-content">
      <div className="metric-value" style={{ color }}>
        {count}
        <span className="metric-percentage">({Math.round(pct)}%)</span>
      </div>
      <div className="metric-label">{label}</div>
    </div>
  </div>
);

// ─── SequenceCard ─────────────────────────────────────────────────────────────

const SequenceCard: React.FC<{
  item: SequenceQualificationItem;
  isExpanded: boolean;
  onToggle: () => void;
}> = ({ item, isExpanded, onToggle }) => {
  const withQualData = computeWithQualData(item);
  const monday = getMondayOutcomes(item);
  const qualificationRate = item.totalConversations > 0
    ? Math.round((withQualData / item.totalConversations) * 100)
    : 0;
  const sampleQuotes = collectSampleQuotes(item);
  const detailsId = `sequence-details-${item.sequenceLabel.replace(/\s+/g, '-')}`;

  return (
    <motion.div
      className={`sequence-card ${isExpanded ? 'expanded' : ''}`}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <button 
        id={`header-${detailsId}`}
        className="sequence-header" 
        onClick={onToggle}
        aria-expanded={isExpanded}
        aria-controls={detailsId}
        style={{ width: '100%', border: 'none', background: 'none', textAlign: 'left', cursor: 'pointer' }}
      >
        <div className="sequence-title">
          <h3>{item.sequenceLabel}</h3>
          <div className="sequence-meta">
            <span className="badge">{item.totalConversations} conversations</span>
            <span className={`badge ${qualificationRate > 50 ? 'success' : 'warning'}`}>
              {qualificationRate}% qualified
            </span>
          </div>
        </div>
        <div className="expand-btn" aria-hidden="true">
          {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
        </div>
      </button>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            id={detailsId}
            className="sequence-details"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3 }}
            role="region"
            aria-labelledby={`header-${detailsId}`}
          >
            <div className="metrics-grid">
              {/* Employment */}
              <div className="metric-section">
                <h4>
                  <Briefcase size={16} />
                  Employment Status
                </h4>
                <div className="metric-row">
                  <MetricCard
                    label="Full-time"
                    count={item.fullTime.count}
                    pct={item.fullTime.pct}
                    icon={<Briefcase size={16} />}
                    color="#22c55e"
                    sampleQuote={item.fullTime.sampleQuote}
                  />
                  <MetricCard
                    label="Part-time"
                    count={item.partTime.count}
                    pct={item.partTime.pct}
                    icon={<Briefcase size={16} />}
                    color="#3b82f6"
                    sampleQuote={item.partTime.sampleQuote}
                  />
                </div>
              </div>

              {/* Revenue Mix */}
              <div className="metric-section">
                <h4>
                  <DollarSign size={16} />
                  Revenue Mix
                </h4>
                <div className="metric-row">
                  <MetricCard
                    label="Mostly Cash"
                    count={item.mostlyCash.count}
                    pct={item.mostlyCash.pct}
                    icon={<DollarSign size={16} />}
                    color="#10b981"
                    sampleQuote={item.mostlyCash.sampleQuote}
                  />
                  <MetricCard
                    label="Mostly Insurance"
                    count={item.mostlyInsurance.count}
                    pct={item.mostlyInsurance.pct}
                    icon={<DollarSign size={16} />}
                    color="#8b5cf6"
                    sampleQuote={item.mostlyInsurance.sampleQuote}
                  />
                  <MetricCard
                    label="Balanced"
                    count={item.balancedMix.count}
                    pct={item.balancedMix.pct}
                    icon={<DollarSign size={16} />}
                    color="#f59e0b"
                    sampleQuote={item.balancedMix.sampleQuote}
                  />
                </div>
              </div>

              {/* Delivery Model */}
              <div className="metric-section">
                <h4>
                  <Building2 size={16} />
                  Clinic Setup
                </h4>
                <div className="metric-row">
                  <MetricCard
                    label="Brick & Mortar"
                    count={item.brickAndMortar.count}
                    pct={item.brickAndMortar.pct}
                    icon={<Building2 size={16} />}
                    color="#6366f1"
                    sampleQuote={item.brickAndMortar.sampleQuote}
                  />
                  <MetricCard
                    label="Mobile"
                    count={item.mobile.count}
                    pct={item.mobile.pct}
                    icon={<Building2 size={16} />}
                    color="#0ea5e9"
                    sampleQuote={item.mobile.sampleQuote}
                  />
                  <MetricCard
                    label="Online"
                    count={item.online.count}
                    pct={item.online.pct}
                    icon={<Building2 size={16} />}
                    color="#14b8a6"
                    sampleQuote={item.online.sampleQuote}
                  />
                  <MetricCard
                    label="Hybrid"
                    count={item.hybrid.count}
                    pct={item.hybrid.pct}
                    icon={<Building2 size={16} />}
                    color="#f97316"
                    sampleQuote={item.hybrid.sampleQuote}
                  />
                </div>
              </div>

              {/* Coaching Interest */}
              <div className="metric-section">
                <h4>
                  <Target size={16} />
                  Coaching Interest
                </h4>
                <div className="metric-row">
                  <MetricCard
                    label="High Interest"
                    count={item.highInterest.count}
                    pct={item.highInterest.pct}
                    icon={<TrendingUp size={16} />}
                    color="#22c55e"
                    sampleQuote={item.highInterest.sampleQuote}
                  />
                  <MetricCard
                    label="Medium Interest"
                    count={item.mediumInterest.count}
                    pct={item.mediumInterest.pct}
                    icon={<TrendingUp size={16} />}
                    color="#f59e0b"
                    sampleQuote={item.mediumInterest.sampleQuote}
                  />
                  <MetricCard
                    label="Low Interest"
                    count={item.lowInterest.count}
                    pct={item.lowInterest.pct}
                    icon={<TrendingUp size={16} />}
                    color="#ef4444"
                    sampleQuote={item.lowInterest.sampleQuote}
                  />
                </div>
              </div>

              {/* Monday Outcomes */}
              <div className="metric-section">
                <h4>
                  <BarChart3 size={16} />
                  Monday Outcomes
                </h4>
                {monday.totalOutcomes > 0 ? (
                  <>
                    <div className="metric-row">
                      <MetricCard
                        label="Booked"
                        count={monday.booked}
                        pct={monday.bookedPct}
                        icon={<BarChart3 size={16} />}
                        color="#16a34a"
                      />
                      <MetricCard
                        label="Closed Won"
                        count={monday.closedWon}
                        pct={monday.closedWonPct}
                        icon={<BarChart3 size={16} />}
                        color="#2563eb"
                      />
                      <MetricCard
                        label="No-Show"
                        count={monday.noShow}
                        pct={monday.noShowPct}
                        icon={<BarChart3 size={16} />}
                        color="#ea580c"
                      />
                      <MetricCard
                        label="Cancelled"
                        count={monday.cancelled}
                        pct={monday.cancelledPct}
                        icon={<BarChart3 size={16} />}
                        color="#dc2626"
                      />
                    </div>
                    <div className="metric-note">
                      Matched Monday leads: <strong>{monday.linkedContacts}</strong> contacts ·{' '}
                      <strong>{monday.totalOutcomes}</strong> outcome records in this window.
                    </div>
                  </>
                ) : (
                  <div className="quotes-empty">No matched Monday outcomes for this sequence in this date range.</div>
                )}
              </div>

              {/* Top Niches */}
              {item.topNiches.length > 0 && (
                <div className="metric-section">
                  <h4>Top Niches</h4>
                  <div className="niche-tags">
                    {item.topNiches.slice(0, 5).map((niche, idx) => (
                      <span key={idx} className="niche-tag">
                        {niche.niche} ({niche.count})
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Sample Quotes */}
              <div className="metric-section quotes-section">
                <h4>What Leads Are Saying</h4>
                {sampleQuotes.length > 0 ? (
                  <div className="quotes-list">
                    {sampleQuotes.slice(0, 4).map((sample, idx) => (
                      <div key={idx} className="quote-card">
                        <p className="quote-text">"{sample.quote}"</p>
                        <div className="quote-source">{sample.label}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="quotes-empty">No qualifying lead quotes found in this date range yet.</div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────

export const SequenceQualificationBreakdown: React.FC<Props> = ({ items, isLoading }) => {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="sequence-qualification-loading">
        <div className="spinner" />
        <p>Loading sequence qualification data...</p>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="sequence-qualification-empty">
        <Users size={48} />
        <p>No sequence qualification data available for this time period.</p>
      </div>
    );
  }

  // Summary stats
  const totalConversations = items.reduce((sum, item) => sum + item.totalConversations, 0);
  const totalWithQualification = items.reduce((sum, item) => sum + computeWithQualData(item), 0);
  const avgQualificationRate = totalConversations > 0
    ? Math.round((totalWithQualification / totalConversations) * 100)
    : 0;

  return (
    <div className="sequence-qualification-breakdown">
      <div className="breakdown-header">
        <h2>
          <Users size={24} />
          Lead Qualification by Sequence
        </h2>
        <div className="breakdown-summary">
          <span className="summary-stat">
            <strong>{items.length}</strong> sequences
          </span>
          <span className="summary-stat">
            <strong>{totalConversations}</strong> conversations
          </span>
          <span className={`summary-stat ${avgQualificationRate > 50 ? 'success' : 'warning'}`}>
            <strong>{avgQualificationRate}%</strong> qualified
          </span>
        </div>
      </div>

      <div className="sequence-cards">
        {items.map((item) => (
          <SequenceCard
            key={item.sequenceLabel}
            item={item}
            isExpanded={expandedId === item.sequenceLabel}
            onToggle={() => setExpandedId(
              expandedId === item.sequenceLabel ? null : item.sequenceLabel
            )}
          />
        ))}
      </div>
    </div>
  );
};

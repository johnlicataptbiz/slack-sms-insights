import React, { useState } from 'react';
import { V2Panel, V2Skeleton } from './V2Primitives';
import './SequenceQualificationBreakdown.css';

export type QualField = {
  count: number;
  pct: number;
  sampleQuote: string | null;
};

export type SequenceQualificationItem = {
  sequenceLabel: string;
  totalConversations: number;
  mondayOutcomes?: {
    linkedContacts: number;
    totalOutcomes: number;
    booked: number;
    closedWon: number;
    closedLost: number;
    noShow: number;
    cancelled: number;
    badTiming: number;
    badFit: number;
    other: number;
    unknown: number;
    bookedPct: number;
    closedWonPct: number;
    noShowPct: number;
    cancelledPct: number;
  };
  // Employment
  fullTime: QualField;
  partTime: QualField;
  unknownEmployment: QualField;
  // Revenue mix
  mostlyCash: QualField;
  mostlyInsurance: QualField;
  balancedMix: QualField;
  unknownRevenue: QualField;
  // Delivery model
  brickAndMortar: QualField;
  mobile: QualField;
  online: QualField;
  hybrid: QualField;
  unknownDelivery: QualField;
  // Coaching interest
  highInterest: QualField;
  mediumInterest: QualField;
  lowInterest: QualField;
  unknownInterest: QualField;
  // Niches
  topNiches: Array<{ niche: string; count: number }>;
};

export type SequenceQualificationBreakdownProps = {
  items: SequenceQualificationItem[];
  isLoading: boolean;
};

const QualificationBadge: React.FC<{
  label: string;
  count: number;
  pct: number;
  color: 'blue' | 'green' | 'purple' | 'orange' | 'gray';
  sampleQuote?: string | null;
}> = ({ label, count, pct, color, sampleQuote }) => {
  const [showTooltip, setShowTooltip] = useState(false);

  const colorMap = {
    blue: 'var(--v2-accent)',
    green: 'var(--v2-success)',
    purple: 'var(--v2-purple, #8b5cf6)',
    orange: 'var(--v2-warning)',
    gray: 'var(--v2-text-dim)',
  };

  return (
    <div
      className="QualificationBadge"
      style={{ borderColor: colorMap[color] }}
      onMouseEnter={() => sampleQuote && setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <span className="QualificationBadge__label">{label}</span>
      <span className="QualificationBadge__value" style={{ color: colorMap[color] }}>
        {pct.toFixed(0)}%
      </span>
      <span className="QualificationBadge__count">({count})</span>
      
      {showTooltip && sampleQuote && (
        <div className="QualificationBadge__tooltip">
          <div className="QualificationBadge__tooltipLabel">Sample quote:</div>
          <div className="QualificationBadge__tooltipQuote">"{sampleQuote}"</div>
        </div>
      )}
    </div>
  );
};

const NicheTag: React.FC<{
  niche: string;
  count: number;
  total: number;
}> = ({ niche, count, total }) => {
  const pct = total > 0 ? (count / total) * 100 : 0;
  
  return (
    <span className="NicheTag" title={`${count} mentions (${pct.toFixed(1)}%)`}>
      {niche}
      <span className="NicheTag__count">{count}</span>
    </span>
  );
};

const MondayOutcomesSummary: React.FC<{
  outcomes: SequenceQualificationItem['mondayOutcomes'];
}> = ({ outcomes }) => {
  if (!outcomes || outcomes.totalOutcomes === 0) {
    return <div className="MondayOutcomesSummary__empty">No Monday outcomes linked</div>;
  }

  return (
    <div className="MondayOutcomesSummary">
      <div className="MondayOutcomesSummary__header">
        <span className="MondayOutcomesSummary__linked">
          {outcomes.linkedContacts} contacts linked
        </span>
        <span className="MondayOutcomesSummary__total">
          {outcomes.totalOutcomes} total outcomes
        </span>
      </div>
      
      <div className="MondayOutcomesSummary__grid">
        <div className="MondayOutcomesSummary__item MondayOutcomesSummary__item--booked">
          <span className="MondayOutcomesSummary__label">Booked</span>
          <span className="MondayOutcomesSummary__value">{outcomes.booked}</span>
          <span className="MondayOutcomesSummary__pct">{outcomes.bookedPct.toFixed(1)}%</span>
        </div>
        
        <div className="MondayOutcomesSummary__item MondayOutcomesSummary__item--closedWon">
          <span className="MondayOutcomesSummary__label">Closed Won</span>
          <span className="MondayOutcomesSummary__value">{outcomes.closedWon}</span>
          <span className="MondayOutcomesSummary__pct">{outcomes.closedWonPct.toFixed(1)}%</span>
        </div>
        
        <div className="MondayOutcomesSummary__item MondayOutcomesSummary__item--noShow">
          <span className="MondayOutcomesSummary__label">No Show</span>
          <span className="MondayOutcomesSummary__value">{outcomes.noShow}</span>
          <span className="MondayOutcomesSummary__pct">{outcomes.noShowPct.toFixed(1)}%</span>
        </div>
        
        <div className="MondayOutcomesSummary__item MondayOutcomesSummary__item--cancelled">
          <span className="MondayOutcomesSummary__label">Cancelled</span>
          <span className="MondayOutcomesSummary__value">{outcomes.cancelled}</span>
          <span className="MondayOutcomesSummary__pct">{outcomes.cancelledPct.toFixed(1)}%</span>
        </div>
      </div>
      
      {outcomes.badTiming > 0 && (
        <div className="MondayOutcomesSummary__other">
          Bad Timing: {outcomes.badTiming} • Bad Fit: {outcomes.badFit} • Other: {outcomes.other + outcomes.unknown}
        </div>
      )}
    </div>
  );
};

const SequenceCard: React.FC<{
  item: SequenceQualificationItem;
  isExpanded: boolean;
  onToggle: () => void;
}> = ({ item, isExpanded, onToggle }) => {
  const total = item.totalConversations;
  
  // Calculate summary stats for collapsed view
  const hasFullTime = item.fullTime.count > item.partTime.count;
  const dominantRevenue = 
    item.mostlyCash.count > item.mostlyInsurance.count && item.mostlyCash.count > item.balancedMix.count
      ? 'Cash'
      : item.mostlyInsurance.count > item.mostlyCash.count && item.mostlyInsurance.count > item.balancedMix.count
        ? 'Insurance'
        : item.balancedMix.count > 0 ? 'Mixed' : 'Unknown';
  
  const coachingInterest = 
    item.highInterest.count > item.mediumInterest.count && item.highInterest.count > item.lowInterest.count
      ? 'High'
      : item.mediumInterest.count > item.highInterest.count && item.mediumInterest.count > item.lowInterest.count
        ? 'Medium'
        : item.lowInterest.count > 0 ? 'Low' : 'Unknown';

  return (
    <div className={`SequenceCard ${isExpanded ? 'SequenceCard--expanded' : ''}`}>
      <div className="SequenceCard__header" onClick={onToggle}>
        <div className="SequenceCard__title">
          <span className="SequenceCard__name">{item.sequenceLabel}</span>
          <span className="SequenceCard__count">{total.toLocaleString()} conversations</span>
        </div>
        
        {!isExpanded && (
          <div className="SequenceCard__summary">
            <span className="SequenceCard__summaryItem" title="Employment">
              {hasFullTime ? 'FT' : 'PT'} {((hasFullTime ? item.fullTime.pct : item.partTime.pct)).toFixed(0)}%
            </span>
            <span className="SequenceCard__summaryDivider">•</span>
            <span className="SequenceCard__summaryItem" title="Revenue Model">
              {dominantRevenue} {((dominantRevenue === 'Cash' ? item.mostlyCash.pct : 
                dominantRevenue === 'Insurance' ? item.mostlyInsurance.pct : 
                dominantRevenue === 'Mixed' ? item.balancedMix.pct : 0)).toFixed(0)}%
            </span>
            <span className="SequenceCard__summaryDivider">•</span>
            <span className="SequenceCard__summaryItem" title="Coaching Interest">
              {coachingInterest} Interest
            </span>
          </div>
        )}
        
        <span className={`SequenceCard__chevron ${isExpanded ? 'SequenceCard__chevron--up' : ''}`}>
          ▼
        </span>
      </div>
      
      {isExpanded && (
        <div className="SequenceCard__body">
          {/* Employment Status */}
          <div className="SequenceCard__section">
            <h5 className="SequenceCard__sectionTitle">Employment Status</h5>
            <div className="SequenceCard__badges">
              <QualificationBadge
                label="Full-time"
                count={item.fullTime.count}
                pct={item.fullTime.pct}
                color="blue"
                sampleQuote={item.fullTime.sampleQuote}
              />
              <QualificationBadge
                label="Part-time"
                count={item.partTime.count}
                pct={item.partTime.pct}
                color="purple"
                sampleQuote={item.partTime.sampleQuote}
              />
              {item.unknownEmployment.count > 0 && (
                <QualificationBadge
                  label="Unknown"
                  count={item.unknownEmployment.count}
                  pct={item.unknownEmployment.pct}
                  color="gray"
                />
              )}
            </div>
          </div>
          
          {/* Revenue Mix */}
          <div className="SequenceCard__section">
            <h5 className="SequenceCard__sectionTitle">Revenue Model</h5>
            <div className="SequenceCard__badges">
              <QualificationBadge
                label="Mostly Cash"
                count={item.mostlyCash.count}
                pct={item.mostlyCash.pct}
                color="green"
                sampleQuote={item.mostlyCash.sampleQuote}
              />
              <QualificationBadge
                label="Mostly Insurance"
                count={item.mostlyInsurance.count}
                pct={item.mostlyInsurance.pct}
                color="blue"
                sampleQuote={item.mostlyInsurance.sampleQuote}
              />
              <QualificationBadge
                label="Balanced Mix"
                count={item.balancedMix.count}
                pct={item.balancedMix.pct}
                color="purple"
                sampleQuote={item.balancedMix.sampleQuote}
              />
              {item.unknownRevenue.count > 0 && (
                <QualificationBadge
                  label="Unknown"
                  count={item.unknownRevenue.count}
                  pct={item.unknownRevenue.pct}
                  color="gray"
                />
              )}
            </div>
          </div>
          
          {/* Coaching Interest */}
          <div className="SequenceCard__section">
            <h5 className="SequenceCard__sectionTitle">Coaching Interest</h5>
            <div className="SequenceCard__badges">
              <QualificationBadge
                label="High"
                count={item.highInterest.count}
                pct={item.highInterest.pct}
                color="green"
                sampleQuote={item.highInterest.sampleQuote}
              />
              <QualificationBadge
                label="Medium"
                count={item.mediumInterest.count}
                pct={item.mediumInterest.pct}
                color="blue"
                sampleQuote={item.mediumInterest.sampleQuote}
              />
              <QualificationBadge
                label="Low"
                count={item.lowInterest.count}
                pct={item.lowInterest.pct}
                color="orange"
                sampleQuote={item.lowInterest.sampleQuote}
              />
              {item.unknownInterest.count > 0 && (
                <QualificationBadge
                  label="Unknown"
                  count={item.unknownInterest.count}
                  pct={item.unknownInterest.pct}
                  color="gray"
                />
              )}
            </div>
          </div>
          
          {/* Top Niches */}
          {item.topNiches.length > 0 && (
            <div className="SequenceCard__section">
              <h5 className="SequenceCard__sectionTitle">Top Niches Mentioned</h5>
              <div className="SequenceCard__niches">
                {item.topNiches.map((niche) => (
                  <NicheTag
                    key={niche.niche}
                    niche={niche.niche}
                    count={niche.count}
                    total={total}
                  />
                ))}
              </div>
            </div>
          )}
          
          {/* Monday Outcomes */}
          {item.mondayOutcomes && item.mondayOutcomes.totalOutcomes > 0 && (
            <div className="SequenceCard__section">
              <h5 className="SequenceCard__sectionTitle">Monday.com Outcomes</h5>
              <MondayOutcomesSummary outcomes={item.mondayOutcomes} />
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export const SequenceQualificationBreakdown: React.FC<SequenceQualificationBreakdownProps> = ({
  items,
  isLoading,
}) => {
  const [expandedSequence, setExpandedSequence] = useState<string | null>(null);

  if (isLoading) {
    return (
      <V2Panel title="Lead Qualification by Sequence" caption="Loading qualification data...">
        <V2Skeleton height={200} />
      </V2Panel>
    );
  }

  if (items.length === 0) {
    return (
      <V2Panel title="Lead Qualification by Sequence" caption="Self-identified lead attributes from qualification inference">
        <div className="SequenceQualificationBreakdown__empty">
          No qualification data available for the selected time period.
        </div>
      </V2Panel>
    );
  }

  return (
    <div className="SequenceQualificationBreakdown">
      {items.map((item) => (
        <SequenceCard
          key={item.sequenceLabel}
          item={item}
          isExpanded={expandedSequence === item.sequenceLabel}
          onToggle={() => setExpandedSequence(
            expandedSequence === item.sequenceLabel ? null : item.sequenceLabel
          )}
        />
      ))}
    </div>
  );
};

export default SequenceQualificationBreakdown;

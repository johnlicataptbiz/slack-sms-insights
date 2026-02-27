import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Users, Briefcase, DollarSign, Target, Quote, ChevronDown, ChevronUp, TrendingUp } from 'lucide-react';
import type { SequenceQualificationItem } from '../../api/v2Queries';
import './SequenceQualificationBreakdown.css';

type Props = {
  items: SequenceQualificationItem[];
  isLoading?: boolean;
};

const MetricCard: React.FC<{
  label: string;
  value: number;
  total: number;
  icon: React.ReactNode;
  color: string;
}> = ({ label, value, total, icon, color }) => {
  const percentage = total > 0 ? Math.round((value / total) * 100) : 0;
  
  return (
    <div className="metric-card">
      <div className="metric-icon" style={{ backgroundColor: `${color}20`, color }}>
        {icon}
      </div>
      <div className="metric-content">
        <div className="metric-value" style={{ color }}>
          {value}
          <span className="metric-percentage">({percentage}%)</span>
        </div>
        <div className="metric-label">{label}</div>
      </div>
    </div>
  );
};

const SequenceCard: React.FC<{
  item: SequenceQualificationItem;
  isExpanded: boolean;
  onToggle: () => void;
}> = ({ item, isExpanded, onToggle }) => {
  const qualificationRate = item.totalConversations > 0
    ? Math.round((item.withQualificationData / item.totalConversations) * 100)
    : 0;

  return (
    <motion.div
      className={`sequence-card ${isExpanded ? 'expanded' : ''}`}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <div className="sequence-header" onClick={onToggle}>
        <div className="sequence-title">
          <h3>{item.sequenceLabel}</h3>
          <div className="sequence-meta">
            <span className="badge">{item.totalConversations} conversations</span>
            <span className={`badge ${qualificationRate > 50 ? 'success' : 'warning'}`}>
              {qualificationRate}% qualified
            </span>
          </div>
        </div>
        <button className="expand-btn">
          {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
        </button>
      </div>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            className="sequence-details"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            <div className="metrics-grid">
              <div className="metric-section">
                <h4>
                  <Briefcase size={16} />
                  Employment Status
                </h4>
                <div className="metric-row">
                  <MetricCard
                    label="Full-time"
                    value={item.employment.fullTime}
                    total={item.totalConversations}
                    icon={<Briefcase size={16} />}
                    color="#22c55e"
                  />
                  <MetricCard
                    label="Part-time"
                    value={item.employment.partTime}
                    total={item.totalConversations}
                    icon={<Briefcase size={16} />}
                    color="#3b82f6"
                  />
                </div>
              </div>

              <div className="metric-section">
                <h4>
                  <DollarSign size={16} />
                  Revenue Mix
                </h4>
                <div className="metric-row">
                  <MetricCard
                    label="Mostly Cash"
                    value={item.revenueMix.mostlyCash}
                    total={item.totalConversations}
                    icon={<DollarSign size={16} />}
                    color="#10b981"
                  />
                  <MetricCard
                    label="Mostly Insurance"
                    value={item.revenueMix.mostlyInsurance}
                    total={item.totalConversations}
                    icon={<DollarSign size={16} />}
                    color="#8b5cf6"
                  />
                  <MetricCard
                    label="Balanced"
                    value={item.revenueMix.balanced}
                    total={item.totalConversations}
                    icon={<DollarSign size={16} />}
                    color="#f59e0b"
                  />
                </div>
              </div>

              <div className="metric-section">
                <h4>
                  <Target size={16} />
                  Coaching Interest
                </h4>
                <div className="metric-row">
                  <MetricCard
                    label="High Interest"
                    value={item.coachingInterest.high}
                    total={item.totalConversations}
                    icon={<TrendingUp size={16} />}
                    color="#22c55e"
                  />
                  <MetricCard
                    label="Medium Interest"
                    value={item.coachingInterest.medium}
                    total={item.totalConversations}
                    icon={<TrendingUp size={16} />}
                    color="#f59e0b"
                  />
                  <MetricCard
                    label="Low Interest"
                    value={item.coachingInterest.low}
                    total={item.totalConversations}
                    icon={<TrendingUp size={16} />}
                    color="#ef4444"
                  />
                </div>
              </div>

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

              {item.sampleQuotes.length > 0 && (
                <div className="metric-section quotes-section">
                  <h4>
                    <Quote size={16} />
                    What Leads Are Saying
                  </h4>
                  <div className="quotes-list">
                    {item.sampleQuotes.slice(0, 3).map((quote, idx) => (
                      <div key={idx} className="quote-card">
                        <p className="quote-text">"{quote.quote}"</p>
                        <span className="quote-date">
                          {new Date(quote.inferredAt).toLocaleDateString()}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

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

  // Calculate summary stats
  const totalConversations = items.reduce((sum, item) => sum + item.totalConversations, 0);
  const totalWithQualification = items.reduce((sum, item) => sum + item.withQualificationData, 0);
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

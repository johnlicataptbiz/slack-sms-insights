import React, { useMemo } from 'react';
import { useSalesMetrics } from '../api/queries';
import { resolveCurrentBusinessDay, shiftIsoDay } from '../utils/runDay';
import '../styles/DataPages.css';
import '../styles/RepScorecard.css';

type RepKey = 'jack' | 'brandon';

type Props = {
  rep: RepKey;
};

const BUSINESS_TIME_ZONE = 'America/Chicago';

const titleFor = (rep: RepKey) => (rep === 'jack' ? 'Jack' : 'Brandon');
const aliasFor = (rep: RepKey) => (rep === 'jack' ? 'Daily Snapshot' : 'Daily Snapshot');

function formatCount(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '-';
  return value.toLocaleString();
}

function toPct(numerator: number, denominator: number): number {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) return 0;
  return (numerator / denominator) * 100;
}

function formatPct(value: number): string {
  return `${value.toFixed(1)}%`;
}

export default function RepScorecard({ rep }: Props) {
  const currentBusinessDay = useMemo(
    () => resolveCurrentBusinessDay({ timeZone: BUSINESS_TIME_ZONE, startHour: 4 }),
    [],
  );
  const businessDay = useMemo(
    () => (currentBusinessDay ? shiftIsoDay(currentBusinessDay.day, -1) : null),
    [currentBusinessDay],
  );
  const salesQuery = businessDay
    ? { day: businessDay, tz: BUSINESS_TIME_ZONE }
    : { range: 'today' as const, tz: BUSINESS_TIME_ZONE };
  const { data, isLoading, error } = useSalesMetrics(salesQuery);

  const repSelfBooked = data?.bookedCalls?.selfBooked ?? null;
  const periodLabel = 'Previous Day';
  const repName = titleFor(rep);

  const jackBooked = data?.bookedCalls?.jack ?? 0;
  const brandonBooked = data?.bookedCalls?.brandon ?? 0;
  const repBooked = rep === 'jack' ? jackBooked : brandonBooked;
  const teamBooked = data?.bookedCalls?.booked ?? 0;
  const repBookedShareTeam = toPct(repBooked, teamBooked);

  const repRows = data?.repLeaderboard ?? [];
  const repNeedle = rep === 'jack' ? 'jack' : 'brandon';
  const repRow = repRows.find((row) => row.repName.toLowerCase().includes(repNeedle)) ?? null;
  const totalOutboundConvos = repRows.reduce((sum, row) => sum + row.outboundConversations, 0);
  const outboundConversations = repRow?.outboundConversations ?? 0;
  const outboundShare = toPct(outboundConversations, totalOutboundConvos);
  const repReplyRate = repRow?.replyRatePct ?? null;
  const optOuts = repRow?.optOuts ?? 0;
  const optOutRate = toPct(optOuts, outboundConversations);
  const bookingSignalsSms = repRow?.bookingSignalsSms ?? 0;

  return (
    <div className={`DataPage RepScorecard RepScorecard--${rep}`}>
      <div className="DataPage__header">
        <h1 className="DataPage__title">{repName} Scorecard</h1>
      </div>

      <p className="DataPage__subtitle">
        Daily activity summary for the previous business day. Canonical booked credit comes from Slack reactions.
      </p>

      {isLoading ? (
        <div className="DataLoading">Loading metrics…</div>
      ) : error ? (
        <div className="DataError">
          <div className="DataError__title">Failed to load metrics.</div>
          <div className="DataCode">{String((error as any)?.message ?? error)}</div>
        </div>
      ) : (
        <>
          <section className="RepHero">
            <div className="RepHero__identity">
              <div className="RepHero__eyebrow">{aliasFor(rep)}</div>
              <h2 className="RepHero__name">{repName}</h2>
              <p className="RepHero__meta">
                {periodLabel} | Business day {businessDay ?? 'auto'} | Time zone {BUSINESS_TIME_ZONE}
              </p>
            </div>
            <div className="RepHero__summary">
              <div className="RepHero__summaryItem">
                <span>Booked credits</span>
                <strong>{formatCount(repBooked)}</strong>
              </div>
              <div className="RepHero__summaryItem">
                <span>Outbound convos</span>
                <strong>{formatCount(outboundConversations)}</strong>
              </div>
              <div className="RepHero__summaryItem">
                <span>Opt-outs</span>
                <strong>{formatCount(optOuts)}</strong>
              </div>
            </div>
          </section>

          <section className="RepStatsGrid">
            <article className="RepStatCard RepStatCard--accent">
              <div className="RepStatCard__label">Calls booked credit</div>
              <div className="RepStatCard__value">{formatCount(repBooked)}</div>
              <div className="RepStatCard__meta">{formatPct(repBookedShareTeam)} of team booked calls</div>
            </article>
            <article className="RepStatCard">
              <div className="RepStatCard__label">Reply rate</div>
              <div className="RepStatCard__value">{repReplyRate == null ? '-' : formatPct(repReplyRate)}</div>
              <div className="RepStatCard__meta">People-based reply rate for this rep</div>
            </article>
            <article className="RepStatCard">
              <div className="RepStatCard__label">Outbound convos</div>
              <div className="RepStatCard__value">{formatCount(outboundConversations)}</div>
              <div className="RepStatCard__meta">{formatPct(outboundShare)} of rep conversation volume</div>
            </article>
            <article className="RepStatCard RepStatCard--danger">
              <div className="RepStatCard__label">Opt-outs</div>
              <div className="RepStatCard__value">{formatCount(optOuts)}</div>
              <div className="RepStatCard__meta">{formatPct(optOutRate)} of outbound convos</div>
            </article>
            <article className="RepStatCard">
              <div className="RepStatCard__label">Team total booked</div>
              <div className="RepStatCard__value">{formatCount(teamBooked)}</div>
              <div className="RepStatCard__meta">Self-booked: {formatCount(repSelfBooked)}</div>
            </article>
            <article className="RepStatCard">
              <div className="RepStatCard__label">SMS booking hints</div>
              <div className="RepStatCard__value">{formatCount(bookingSignalsSms)}</div>
              <div className="RepStatCard__meta">Diagnostic only (not canonical booked KPI)</div>
            </article>
          </section>

          <section className="RepPanels">
            <article className="RepPanel">
              <h3 className="RepPanel__title">How to read this card</h3>
              <p className="RepPanel__caption">
                This page is a daily summary, not a ranking. It shows activity, booked-call credit, and list health for
                one rep.
              </p>
              <p className="RepPanel__caption">
                Booked credit is Slack-based (:jack: and :me: reactions). SMS booking hints are diagnostic only.
              </p>
            </article>

            <article className="RepPanel">
              <h3 className="RepPanel__title">Booked Credit Breakdown (Team)</h3>
              <table className="RepBoard">
                <thead>
                  <tr>
                    <th>Bucket</th>
                    <th className="is-right">Booked</th>
                    <th className="is-right">Share</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Jack</td>
                    <td className="is-right">{formatCount(jackBooked)}</td>
                    <td className="is-right">{formatPct(toPct(jackBooked, teamBooked))}</td>
                  </tr>
                  <tr>
                    <td>Brandon</td>
                    <td className="is-right">{formatCount(brandonBooked)}</td>
                    <td className="is-right">{formatPct(toPct(brandonBooked, teamBooked))}</td>
                  </tr>
                  <tr>
                    <td>Self-booked</td>
                    <td className="is-right">{formatCount(repSelfBooked)}</td>
                    <td className="is-right">{formatPct(toPct(repSelfBooked ?? 0, teamBooked))}</td>
                  </tr>
                  <tr>
                    <td>
                      <strong>Total</strong>
                    </td>
                    <td className="is-right">
                      <strong>{formatCount(teamBooked)}</strong>
                    </td>
                    <td className="is-right">100.0%</td>
                  </tr>
                </tbody>
              </table>
            </article>
          </section>
        </>
      )}
    </div>
  );
}

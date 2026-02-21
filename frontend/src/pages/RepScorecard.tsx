import React, { useMemo } from 'react';
import { useSalesMetrics } from '../api/queries';
import { resolveCurrentBusinessDay, shiftIsoDay } from '../utils/runDay';
import brandLogo from '../assets/ptbiz-logo-sm.jpg';
import '../styles/DataPages.css';
import '../styles/RepScorecard.css';

type RepKey = 'jack' | 'brandon';

type Props = {
  rep: RepKey;
};

const BUSINESS_TIME_ZONE = 'America/Chicago';

const titleFor = (rep: RepKey) => (rep === 'jack' ? 'Jack' : 'Brandon');
const aliasFor = (rep: RepKey) => (rep === 'jack' ? 'Closer Card' : 'Setter Card');

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

function scoreTier(score: number): string {
  if (score >= 85) return 'All-Star';
  if (score >= 70) return 'Strong Day';
  if (score >= 50) return 'Solid';
  if (score >= 30) return 'Building';
  return 'Cold Start';
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
  const otherBooked = rep === 'jack' ? brandonBooked : jackBooked;
  const teamBooked = data?.bookedCalls?.booked ?? 0;
  const setterBookedTotal = jackBooked + brandonBooked;
  const repBookedShareTeam = toPct(repBooked, teamBooked);
  const repBookedShareSetter = toPct(repBooked, setterBookedTotal);

  const repRows = data?.repLeaderboard ?? [];
  const repNeedle = rep === 'jack' ? 'jack' : 'brandon';
  const repRow = repRows.find((row) => row.repName.toLowerCase().includes(repNeedle)) ?? null;
  const totalOutboundConvos = repRows.reduce((sum, row) => sum + row.outboundConversations, 0);
  const maxOutboundConvos = Math.max(1, ...repRows.map((row) => row.outboundConversations));
  const outboundConversations = repRow?.outboundConversations ?? 0;
  const outboundShare = toPct(outboundConversations, totalOutboundConvos);
  const optOuts = repRow?.optOuts ?? 0;
  const optOutRate = toPct(optOuts, outboundConversations);
  const bookingSignalsSms = repRow?.bookingSignalsSms ?? 0;

  const bookedComponent = setterBookedTotal > 0 ? (repBooked / Math.max(1, jackBooked, brandonBooked)) * 60 : 0;
  const activityComponent = (outboundConversations / maxOutboundConvos) * 25;
  const disciplinePenalty = Math.min(15, optOuts * 3 + optOutRate * 0.8);
  const disciplineComponent = Math.max(0, 15 - disciplinePenalty);
  const gameScore = Math.round(bookedComponent + activityComponent + disciplineComponent);
  const tier = scoreTier(gameScore);

  const scoreRows = [
    {
      label: 'Booked impact',
      points: bookedComponent,
      max: 60,
      detail: 'Compared to the top setter in this window',
    },
    {
      label: 'Activity volume',
      points: activityComponent,
      max: 25,
      detail: 'Outbound conversation volume',
    },
    {
      label: 'List discipline',
      points: disciplineComponent,
      max: 15,
      detail: 'Lower opt-outs preserve score',
    },
  ];

  return (
    <div className={`DataPage RepScorecard RepScorecard--${rep}`}>
      <div className="DataPage__header">
        <h1 className="DataPage__title">{repName} Scorecard</h1>
      </div>

      <p className="DataPage__subtitle">
        Player-card view for the previous business day. Canonical booked credit comes from Slack reactions.
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
              <img className="RepHero__logo" src={brandLogo} alt="PT Biz SMS logo" />
              <div className="RepHero__eyebrow">{aliasFor(rep)}</div>
              <h2 className="RepHero__name">{repName}</h2>
              <p className="RepHero__meta">
                {periodLabel} | Business day {businessDay ?? 'auto'} | Time zone {BUSINESS_TIME_ZONE}
              </p>
            </div>
            <div className="RepHero__score">
              <div className="RepHero__scoreLabel">Game Score</div>
              <div className="RepHero__scoreValue">{gameScore}</div>
              <div className="RepHero__scoreTier">{tier}</div>
            </div>
          </section>

          <section className="RepStatsGrid">
            <article className="RepStatCard RepStatCard--accent">
              <div className="RepStatCard__label">Calls booked credit</div>
              <div className="RepStatCard__value">{formatCount(repBooked)}</div>
              <div className="RepStatCard__meta">{formatPct(repBookedShareTeam)} of team booked calls</div>
            </article>
            <article className="RepStatCard">
              <div className="RepStatCard__label">Setter share</div>
              <div className="RepStatCard__value">{formatPct(repBookedShareSetter)}</div>
              <div className="RepStatCard__meta">Share vs Jack + Brandon only</div>
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
              <h3 className="RepPanel__title">Score Breakdown</h3>
              <div className="RepMeters">
                {scoreRows.map((row) => (
                  <div key={row.label} className="RepMeter">
                    <div className="RepMeter__head">
                      <span>{row.label}</span>
                      <strong>
                        {row.points.toFixed(1)} / {row.max}
                      </strong>
                    </div>
                    <div className="RepMeter__track">
                      <div className="RepMeter__fill" style={{ width: `${toPct(row.points, row.max)}%` }} />
                    </div>
                    <div className="RepMeter__detail">{row.detail}</div>
                  </div>
                ))}
              </div>
            </article>

            <article className="RepPanel">
              <h3 className="RepPanel__title">Booked Credit Board</h3>
              <table className="RepBoard">
                <thead>
                  <tr>
                    <th>Bucket</th>
                    <th className="is-right">Booked</th>
                    <th className="is-right">Share</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className={rep === 'jack' ? 'RepBoard__row--active' : ''}>
                    <td>Jack</td>
                    <td className="is-right">{formatCount(jackBooked)}</td>
                    <td className="is-right">{formatPct(toPct(jackBooked, teamBooked))}</td>
                  </tr>
                  <tr className={rep === 'brandon' ? 'RepBoard__row--active' : ''}>
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
              <p className="RepPanel__caption">
                Current matchup: {repName} {formatCount(repBooked)} vs {rep === 'jack' ? 'Brandon' : 'Jack'}{' '}
                {formatCount(otherBooked)} booked credits.
              </p>
            </article>
          </section>
        </>
      )}
    </div>
  );
}

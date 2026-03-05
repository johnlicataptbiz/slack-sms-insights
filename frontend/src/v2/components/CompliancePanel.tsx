import { V2Panel } from './V2Primitives';

const fmtPct = (n: number) => `${n.toFixed(1)}%`;
const fmtInt = (n: number) => n.toLocaleString();

interface ComplianceData {
  optOutRateWeeklyPct: number;
  optOutRateMonthlyPct: number;
  topOptOutSequences: Array<{
    label: string;
    optOuts: number;
    optOutRatePct: number;
  }>;
}

interface CompliancePanelProps {
  compliance: ComplianceData;
}

export function CompliancePanel({ compliance }: CompliancePanelProps) {
  return (
    <V2Panel
      title="Opt-Out Health"
      caption="Opt-out rates and top opt-out sequences · weekly window"
    >
      <div className="V2SeqCompliance">
        <div className="V2SeqCompliance__rates">
          <div className="V2SeqCompliance__rate">
            <span className="V2SeqCompliance__rateLabel">Weekly Opt-Out Rate</span>
            <span
              className={`V2SeqCompliance__rateValue${compliance.optOutRateWeeklyPct >= 3 ? ' V2SeqCompliance__rateValue--warn' : ''}`}
            >
              {fmtPct(compliance.optOutRateWeeklyPct)}
            </span>
          </div>
          <div className="V2SeqCompliance__rate">
            <span className="V2SeqCompliance__rateLabel">Monthly Opt-Out Rate</span>
            <span
              className={`V2SeqCompliance__rateValue${compliance.optOutRateMonthlyPct >= 3 ? ' V2SeqCompliance__rateValue--warn' : ''}`}
            >
              {fmtPct(compliance.optOutRateMonthlyPct)}
            </span>
          </div>
        </div>
        {compliance.topOptOutSequences.length > 0 && (
          <div className="V2SeqCompliance__topList">
            <p className="V2SeqCompliance__topTitle">Highest Opt-Out Sequences</p>
            <div className="V2TableWrap">
              <table className="V2Table">
                <thead>
                  <tr>
                    <th>Sequence</th>
                    <th className="is-right">Opt-Outs</th>
                    <th className="is-right">Opt-Out Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {compliance.topOptOutSequences.map((seq) => (
                    <tr key={seq.label}>
                      <td>{seq.label}</td>
                      <td className="is-right">{fmtInt(seq.optOuts)}</td>
                      <td className={`is-right${seq.optOutRatePct >= 5 ? ' V2Table__cell--warn' : ''}`}>
                        {fmtPct(seq.optOutRatePct)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </V2Panel>
  );
}

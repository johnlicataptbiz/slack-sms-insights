import { initDatabase, initializeSchema } from '../services/db.js';
import { getSalesMetricsSummary } from '../services/sales-metrics.js';

const main = async (): Promise<void> => {
  await initDatabase({ info: console.log, error: console.error });
  await initializeSchema();

  const to = new Date();
  const from = new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000);

  const res = await getSalesMetricsSummary({ from, to });

  console.log(
    JSON.stringify(
      {
        timeRange: res.timeRange,
        totals: res.totals,
        days: res.trendByDay.length,
        topSequences: res.topSequences.slice(0, 5),
        repLeaderboard: res.repLeaderboard.slice(0, 5),
      },
      null,
      2,
    ),
  );
};

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

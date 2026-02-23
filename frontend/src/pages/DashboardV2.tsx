import { KPIGrid } from "@/components/v2/KPIGrid";
import { ChartsGrid } from "@/components/v2/ChartsGrid";
import { CampaignsTable } from "@/components/v2/CampaignsTable";
import { useV2Runs, useV2SalesMetrics } from "@/api/v2Queries";
import { useEventStream } from "@/api/useEventStream";

export default function DashboardV2() {
  useEventStream();

  const salesMetricsQuery = useV2SalesMetrics({ range: "7d" }, { enabled: false });
  const runsQuery = useV2Runs({ daysBack: 7, limit: 10 });

  if (salesMetricsQuery.isLoading || runsQuery.isLoading) {
    return <div className="text-muted-foreground">Loading dashboard...</div>;
  }

  if (salesMetricsQuery.isError || runsQuery.isError) {
    return (
      <div className="text-destructive">
        Failed to load dashboard data.
        <pre className="mt-4 whitespace-pre-wrap text-xs text-muted-foreground">
          {JSON.stringify(
            {
              salesMetricsError: salesMetricsQuery.error,
              runsError: runsQuery.error,
              salesMetricsErrorString: String(salesMetricsQuery.error),
              runsErrorString: String(runsQuery.error),
            },
            null,
            2
          )}
        </pre>
      </div>
    );
  }

  const salesMetrics = salesMetricsQuery.data?.data;
  const runs = runsQuery.data?.data;

  if (!salesMetrics || !runs) {
    return <div className="text-muted-foreground">No data available.</div>;
  }

  return (
    <div className="flex flex-col gap-6">
      <KPIGrid data={salesMetrics} />
      <ChartsGrid data={salesMetrics} />
      <CampaignsTable data={runs} />
    </div>
  );
}

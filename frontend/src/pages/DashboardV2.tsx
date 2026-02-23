import { KPIGrid } from "@/components/v2/KPIGrid";
import { ChartsGrid } from "@/components/v2/ChartsGrid";
import { CampaignsTable } from "@/components/v2/CampaignsTable";
import { useV2Runs, useV2SalesMetrics } from "@/api/v2Queries";
import { useEventStream } from "@/api/useEventStream";

export default function DashboardV2() {
  useEventStream();

  const salesMetricsQuery = useV2SalesMetrics({ range: "7d" });
  const runsQuery = useV2Runs({ daysBack: 7, limit: 10 });

  const salesMetricsErrorMessage = salesMetricsQuery.isError ? String(salesMetricsQuery.error) : null;
  const salesMetricsUnavailable =
    salesMetricsQuery.isError &&
    (salesMetricsErrorMessage?.toLowerCase().includes("database not initialized") ||
      salesMetricsErrorMessage?.toLowerCase().includes("db not initialized"));

  if (runsQuery.isLoading) {
    return <div className="text-muted-foreground">Loading dashboard...</div>;
  }

  if (runsQuery.isError) {
    return (
      <div className="text-destructive">
        Failed to load dashboard data.
        <pre className="mt-4 whitespace-pre-wrap text-xs text-muted-foreground">
          {JSON.stringify(
            {
              runsError: runsQuery.error,
              runsErrorString: String(runsQuery.error),
            },
            null,
            2
          )}
        </pre>
      </div>
    );
  }

  const salesMetrics = salesMetricsUnavailable ? null : salesMetricsQuery.data?.data;
  const runs = runsQuery.data?.data;

  if (!runs) {
    return <div className="text-muted-foreground">No data available.</div>;
  }

  return (
    <div className="flex flex-col gap-6">
      {salesMetrics ? (
        <>
          <KPIGrid data={salesMetrics} />
          <ChartsGrid data={salesMetrics} />
        </>
      ) : salesMetricsQuery.isLoading ? (
        <div className="text-muted-foreground">Loading metrics...</div>
      ) : salesMetricsUnavailable ? (
        <div className="text-muted-foreground">
          Metrics are temporarily unavailable (database not initialized). Showing recent runs only.
        </div>
      ) : salesMetricsQuery.isError ? (
        <div className="text-muted-foreground">
          Metrics failed to load. Showing recent runs only.
          <pre className="mt-4 whitespace-pre-wrap text-xs text-muted-foreground">
            {JSON.stringify(
              {
                salesMetricsError: salesMetricsQuery.error,
                salesMetricsErrorString: String(salesMetricsQuery.error),
              },
              null,
              2
            )}
          </pre>
        </div>
      ) : null}

      <CampaignsTable data={runs} />
    </div>
  );
}

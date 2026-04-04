import { RunsListV2 } from "@/api/v2-types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface CampaignsTableProps {
  data: RunsListV2;
}

export function CampaignsTable({ data }: CampaignsTableProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent Campaign Runs</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Channel</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Duration</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.items.map((run) => (
              <TableRow key={run.id}>
                <TableCell>
                  {new Date(run.createdAt).toLocaleDateString()}
                </TableCell>
                <TableCell>{run.channelName ?? run.channelId}</TableCell>
                <TableCell className="capitalize">{run.reportType}</TableCell>
                <TableCell className="capitalize">{run.status}</TableCell>
                <TableCell className="text-right">
                  {run.durationMs ? `${(run.durationMs / 1000).toFixed(1)}s` : "-"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

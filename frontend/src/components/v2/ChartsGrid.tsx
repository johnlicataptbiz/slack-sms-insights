import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SalesMetricsV2 } from "@/api/v2-types";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface ChartsGridProps {
  data: SalesMetricsV2;
}

export function ChartsGrid({ data }: ChartsGridProps) {
  const { trendByDay } = data;

  // Format dates for display
  const formattedData = trendByDay.map((d) => ({
    ...d,
    day: new Date(d.day).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    }),
  }));

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card className="col-span-1">
        <CardHeader>
          <CardTitle>Sales Trend</CardTitle>
        </CardHeader>
        <CardContent className="pl-2">
          <ResponsiveContainer width="100%" height={350}>
            <BarChart data={formattedData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis
                dataKey="day"
                stroke="#888888"
                fontSize={12}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                stroke="#888888"
                fontSize={12}
                tickLine={false}
                axisLine={false}
                tickFormatter={(value) => `${value}`}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--background))",
                  borderColor: "hsl(var(--border))",
                }}
                itemStyle={{ color: "hsl(var(--foreground))" }}
              />
              <Legend />
              <Bar
                dataKey="messagesSent"
                name="Messages Sent"
                fill="#8884d8"
                radius={[4, 4, 0, 0]}
              />
              <Bar
                dataKey="repliesReceived"
                name="Replies"
                fill="#82ca9d"
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
      <Card className="col-span-1">
        <CardHeader>
          <CardTitle>Booked Calls Trend</CardTitle>
        </CardHeader>
        <CardContent className="pl-2">
          <ResponsiveContainer width="100%" height={350}>
            <LineChart data={formattedData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis
                dataKey="day"
                stroke="#888888"
                fontSize={12}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                stroke="#888888"
                fontSize={12}
                tickLine={false}
                axisLine={false}
                tickFormatter={(value) => `${value}`}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--background))",
                  borderColor: "hsl(var(--border))",
                }}
                itemStyle={{ color: "hsl(var(--foreground))" }}
              />
              <Legend />
              <Line
                type="monotone"
                dataKey="canonicalBookedCalls"
                name="Booked Calls"
                stroke="#ff8042"
                strokeWidth={2}
                activeDot={{ r: 8 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}

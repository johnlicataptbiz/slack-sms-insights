import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SalesMetricsV2 } from "@/api/v2-types";
import { MessageSquare, Users, Phone, Calendar } from "lucide-react";
import { Line, LineChart, ResponsiveContainer, Tooltip } from "recharts";

interface KPIGridProps {
  data: SalesMetricsV2;
}

export function KPIGrid({ data }: KPIGridProps) {
  const { totals, trendByDay } = data;

  const metrics = [
    {
      title: "Messages Sent",
      value: totals.messagesSent,
      icon: MessageSquare,
      trend: trendByDay.map((d) => ({ value: d.messagesSent })),
      color: "#8884d8",
    },
    {
      title: "People Contacted",
      value: totals.peopleContacted,
      icon: Users,
      trend: trendByDay.map((d) => ({ value: d.peopleContacted })),
      color: "#82ca9d",
    },
    {
      title: "Replies Received",
      value: totals.repliesReceived,
      subValue: `${totals.replyRatePct.toFixed(1)}% Rate`,
      icon: Phone,
      trend: trendByDay.map((d) => ({ value: d.repliesReceived })),
      color: "#ffc658",
    },
    {
      title: "Booked Calls",
      value: totals.canonicalBookedCalls,
      icon: Calendar,
      trend: trendByDay.map((d) => ({ value: d.canonicalBookedCalls })),
      color: "#ff8042",
    },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {metrics.map((metric, index) => (
        <Card key={index}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {metric.title}
            </CardTitle>
            <metric.icon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metric.value.toLocaleString()}</div>
            {metric.subValue && (
              <p className="text-xs text-muted-foreground">{metric.subValue}</p>
            )}
            <div className="h-[80px] mt-4">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={metric.trend}>
                  <Tooltip
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        return (
                          <div className="rounded-lg border bg-background p-2 shadow-sm">
                            <div className="grid grid-cols-2 gap-2">
                              <div className="flex flex-col">
                                <span className="text-[0.70rem] uppercase text-muted-foreground">
                                  Value
                                </span>
                                <span className="font-bold text-muted-foreground">
                                  {payload[0].value}
                                </span>
                              </div>
                            </div>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="value"
                    stroke={metric.color}
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

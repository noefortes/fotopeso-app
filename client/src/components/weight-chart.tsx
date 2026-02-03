import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip, ReferenceLine } from "recharts";
import { useState } from "react";
import { format, subDays, isAfter } from "date-fns";
import { useAuth } from "@/hooks/useAuth";
import { convertWeight, formatWeight, type WeightUnit } from "@shared/utils";
import { useTranslation } from "@/hooks/useTranslation";
import type { WeightEntry } from "@shared/schema";

export default function WeightChart() {
  const [timeRange, setTimeRange] = useState("30");
  const { user } = useAuth();
  const { t } = useTranslation();
  const userWeightUnit = ((user as any)?.weightUnit || "lbs") as WeightUnit;
  const goalWeight = (user as any)?.goalWeight ? parseFloat((user as any).goalWeight) : null;

  // Fetch weight entries
  const { data: weightEntries = [], isLoading } = useQuery<WeightEntry[]>({
    queryKey: ["/api/weight-entries"],
  });

  // Fetch statistics
  const { data: stats } = useQuery<{
    totalLost: number;
    avgPerWeek: number;
    totalRecordings: number;
    progressPercentage: number;
  }>({
    queryKey: ["/api/stats"],
  });

  if (isLoading) {
    return (
      <Card className="border-slate-200">
        <CardContent className="p-6">
          <div className="animate-pulse">
            <div className="h-4 bg-slate-200 rounded w-32 mb-4"></div>
            <div className="h-48 bg-slate-200 rounded"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (weightEntries.length === 0) {
    return (
      <Card className="border-slate-200">
        <CardHeader>
          <CardTitle className="text-lg">{t('chart.yourProgress')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-48 bg-slate-50 rounded-xl flex items-center justify-center">
            <p className="text-slate-500 text-center">
              No weight data yet.<br />
              <span className="text-sm">{t('chart.recordFirst')}</span>
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Filter data based on time range
  const filterDate = subDays(new Date(), parseInt(timeRange));
  const filteredEntries = weightEntries
    .filter((entry) => isAfter(new Date(entry.createdAt!), filterDate))
    .reverse(); // Reverse to show chronological order

  // Prepare data for the chart with weight conversion
  const chartData = filteredEntries.map((entry) => {
    const originalWeight = parseFloat(entry.weight);
    const convertedWeight = convertWeight(
      originalWeight,
      (entry.unit as WeightUnit) || "lbs",
      userWeightUnit
    );
    return {
      date: format(new Date(entry.createdAt!), 'MMM d'),
      weight: convertedWeight,
      fullDate: new Date(entry.createdAt!),
    };
  });

  // Calculate min/max for Y-axis with some padding
  const weights = chartData.map(d => d.weight);
  const allValues = goalWeight ? [...weights, goalWeight] : weights;
  const minWeight = Math.min(...allValues);
  const maxWeight = Math.max(...allValues);
  const padding = (maxWeight - minWeight) * 0.1 || 1; // 10% padding or 1kg minimum
  const yAxisMin = Math.max(0, minWeight - padding);
  const yAxisMax = maxWeight + padding;

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white p-2 border border-slate-200 rounded-lg shadow-sm">
          <p className="text-sm text-slate-600">{label}</p>
          <p className="text-sm font-semibold text-slate-900">
            {payload[0].value.toFixed(1)} {userWeightUnit}
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <Card className="border-slate-200">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">{t('chart.yourProgress')}</CardTitle>
          <Select value={timeRange} onValueChange={setTimeRange}>
            <SelectTrigger className="w-32 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="30">{t('chart.last30Days')}</SelectItem>
              <SelectItem value="90">{t('chart.last90Days')}</SelectItem>
              <SelectItem value="365">{t('chart.lastYear')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      
      <CardContent>
        {/* Chart */}
        <div className="h-48 mb-4">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis 
                dataKey="date" 
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 12, fill: '#64748b' }}
              />
              <YAxis 
                domain={[yAxisMin, yAxisMax]}
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 12, fill: '#64748b' }}
                tickFormatter={(value) => `${value.toFixed(0)}`}
              />
              <Tooltip content={<CustomTooltip />} />
              <Line 
                type="monotone" 
                dataKey="weight" 
                stroke="#10B981" 
                strokeWidth={3}
                dot={{ fill: '#10B981', strokeWidth: 2, r: 4 }}
                activeDot={{ r: 6, stroke: '#10B981', strokeWidth: 2 }}
              />
              {goalWeight && (
                <ReferenceLine 
                  y={goalWeight} 
                  stroke="#f59e0b" 
                  strokeDasharray="5 5" 
                  strokeWidth={2}
                  label={{ value: "Goal", fontSize: 12, fill: "#f59e0b" }}
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>
        
        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-3 gap-4 pt-4 border-t border-slate-100">
            <div className="text-center">
              <p className="text-xs text-slate-500">Total Change</p>
              <p className="text-sm font-semibold text-secondary">
                {formatWeight(stats.totalLost, userWeightUnit)}
              </p>
            </div>
            <div className="text-center">
              <p className="text-xs text-slate-500">Weekly Avg.</p>
              <p className="text-sm font-semibold text-slate-700">
                {formatWeight(Math.abs(stats.avgPerWeek), userWeightUnit)}
              </p>
            </div>
            <div className="text-center">
              <p className="text-xs text-slate-500">Entries</p>
              <p className="text-sm font-semibold text-slate-700">
                {stats.totalRecordings}
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

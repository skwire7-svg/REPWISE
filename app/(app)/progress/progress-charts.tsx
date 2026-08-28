"use client";

import { useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Table2 } from "lucide-react";
import type { WeeklyVolume } from "@/lib/db/progress";

interface WeightPoint {
  date: string;
  weightKg: number;
}

/**
 * Both charts are single-series, so neither carries a legend — the heading
 * names the one thing plotted. Colour comes from --chart-1, a token validated
 * against the card surface in both themes; passing `var(--chart-1)` straight
 * into the SVG attribute means the marks follow the theme toggle with no
 * JS-side colour logic.
 */
export function ProgressCharts({
  weights,
  volume,
}: {
  weights: WeightPoint[];
  volume: WeeklyVolume[];
}) {
  const hasVolume = volume.some((week) => week.volumeKg > 0);

  return (
    <div className="space-y-4">
      <ChartCard
        title="Bodyweight"
        unit="kg"
        // One point is a dot, not a trend. Below two the chart would imply a
        // line that isn't there, so the empty state is the honest render.
        empty={weights.length < 2 ? "Log at least two weigh-ins to see a trend." : null}
        table={weights.map((point) => [point.date, `${point.weightKg} kg`])}
        tableHeaders={["Date", "Weight"]}
      >
        <LineChart data={weights} margin={{ top: 6, right: 8, bottom: 0, left: -18 }}>
          <CartesianGrid stroke="var(--line)" strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={shortDate}
            tick={{ fill: "var(--faint)", fontSize: 11 }}
            stroke="var(--line)"
            tickLine={false}
            minTickGap={24}
          />
          <YAxis
            domain={["dataMin - 1", "dataMax + 1"]}
            tick={{ fill: "var(--faint)", fontSize: 11 }}
            stroke="var(--line)"
            tickLine={false}
            width={44}
          />
          <Tooltip
            content={<ChartTooltip unit="kg" labelFormatter={longDate} />}
            cursor={{ stroke: "var(--faint)", strokeDasharray: "3 3" }}
          />
          <Line
            type="monotone"
            dataKey="weightKg"
            stroke="var(--chart-1)"
            strokeWidth={2}
            // Points are dense on a daily log; a dot on every one turns the
            // line into a bead chain. The hover dot is the 8px marker.
            dot={false}
            activeDot={{ r: 4, stroke: "var(--surface)", strokeWidth: 2 }}
          />
        </LineChart>
      </ChartCard>

      <ChartCard
        title="Weekly training volume"
        unit="kg"
        empty={hasVolume ? null : "Log a workout and your weekly volume shows up here."}
        table={volume.map((week) => [
          shortDate(week.weekStart),
          `${week.volumeKg.toLocaleString()} kg`,
          `${week.sessions}`,
        ])}
        tableHeaders={["Week of", "Volume", "Sessions"]}
      >
        <BarChart
          data={volume}
          margin={{ top: 6, right: 8, bottom: 0, left: -18 }}
          barCategoryGap={2}
        >
          <CartesianGrid stroke="var(--line)" strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="weekStart"
            tickFormatter={shortDate}
            tick={{ fill: "var(--faint)", fontSize: 11 }}
            stroke="var(--line)"
            tickLine={false}
            minTickGap={16}
          />
          <YAxis
            tick={{ fill: "var(--faint)", fontSize: 11 }}
            stroke="var(--line)"
            tickLine={false}
            width={44}
            tickFormatter={(value: number) =>
              value >= 1000 ? `${Math.round(value / 1000)}k` : `${value}`
            }
          />
          <Tooltip
            content={<ChartTooltip unit="kg" labelFormatter={weekLabel} />}
            cursor={{ fill: "var(--surface-2)" }}
          />
          <Bar
            dataKey="volumeKg"
            fill="var(--chart-1)"
            radius={[4, 4, 0, 0]}
            maxBarSize={40}
          />
        </BarChart>
      </ChartCard>
    </div>
  );
}

/**
 * Wraps a chart with its heading and a table view.
 *
 * The table is the accessible equivalent of the plot, not a debugging aid —
 * a screen reader gets nothing useful out of an SVG of marks.
 */
function ChartCard({
  title,
  unit,
  empty,
  children,
  table,
  tableHeaders,
}: {
  title: string;
  unit: string;
  empty: string | null;
  children: React.ReactElement;
  table: string[][];
  tableHeaders: string[];
}) {
  const [showTable, setShowTable] = useState(false);

  return (
    <section className="card overflow-hidden">
      <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
        <h2 className="text-sm font-semibold">
          {title} <span className="font-normal text-faint">({unit})</span>
        </h2>
        {!empty && (
          <button
            type="button"
            onClick={() => setShowTable((value) => !value)}
            aria-pressed={showTable}
            className="flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted transition-colors hover:text-accent"
          >
            <Table2 className="h-3.5 w-3.5" aria-hidden />
            {showTable ? "Chart" : "Table"}
          </button>
        )}
      </header>

      {empty ? (
        <p className="px-4 py-8 text-center text-sm text-muted">{empty}</p>
      ) : showTable ? (
        <div className="max-h-64 overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-surface-2 text-left">
              <tr>
                {tableHeaders.map((header) => (
                  <th key={header} className="px-4 py-2 text-xs font-medium text-muted">
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {table.map((row) => (
                <tr key={row.join("|")}>
                  {row.map((cell, index) => (
                    <td
                      key={index}
                      className={`px-4 py-2 ${index > 0 ? "font-mono tabular-nums" : ""}`}
                    >
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="h-56 w-full px-2 pb-2 pt-4">
          <ResponsiveContainer width="100%" height="100%">
            {children}
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}

interface TooltipPayloadEntry {
  value: number;
}

function ChartTooltip({
  active,
  payload,
  label,
  unit,
  labelFormatter,
}: {
  active?: boolean;
  payload?: TooltipPayloadEntry[];
  label?: string;
  unit: string;
  labelFormatter: (value: string) => string;
}) {
  if (!active || !payload?.length) return null;

  return (
    <div className="rounded-lg border border-line bg-surface px-3 py-2 shadow-lg">
      <p className="text-xs text-muted">{labelFormatter(label ?? "")}</p>
      <p className="mt-0.5 font-mono text-sm font-semibold tabular-nums">
        {payload[0].value.toLocaleString()} {unit}
      </p>
    </div>
  );
}

function shortDate(value: string): string {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function longDate(value: string): string {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function weekLabel(value: string): string {
  return `Week of ${shortDate(value)}`;
}

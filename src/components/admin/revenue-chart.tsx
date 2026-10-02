"use client";

import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export function RevenueChart({ data }: { data: { date: string; amountCents: number }[] }) {
  const rows = data.map((item) => ({ date: item.date.slice(5), pesos: item.amountCents / 100 }));
  if (rows.length === 0) return <p className="py-10 text-sm text-muted-foreground">No captured payments in this range yet.</p>;
  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows}>
          <XAxis dataKey="date" />
          <YAxis />
          <Tooltip />
          <Bar dataKey="pesos" fill="#1f6b56" radius={6} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

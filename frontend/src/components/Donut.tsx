import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";

type DonutDatum = { name: string; value: number; color: string };

type DonutProps = {
  data: DonutDatum[];
  totalLabel?: string;
  size?: number;
};

export function Donut({ data, totalLabel = "Total", size = 140 }: DonutProps) {
  const total = data.reduce((sum, d) => sum + d.value, 0);

  if (total === 0) {
    return (
      <div className="donut-wrap">
        <div style={{ color: "var(--text-muted)", fontSize: 13 }}>No data yet.</div>
      </div>
    );
  }

  return (
    <div className="donut-wrap">
      <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              innerRadius={size / 2 - 24}
              outerRadius={size / 2 - 6}
              paddingAngle={2}
              stroke="none"
            >
              {data.map((entry, index) => (
                <Cell key={index} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                background: "var(--card-bg-solid)",
                border: "1px solid var(--card-border)",
                borderRadius: 10,
                color: "var(--text-primary)",
                fontSize: 12,
              }}
            />
          </PieChart>
        </ResponsiveContainer>
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            textAlign: "center",
            pointerEvents: "none",
          }}
        >
          <div style={{ fontSize: 20, fontWeight: 700, color: "var(--text-primary)" }}>{total}</div>
          <div style={{ fontSize: 9.5, color: "var(--text-muted)" }}>{totalLabel}</div>
        </div>
      </div>

      <div className="legend-list">
        {data.map((entry) => (
          <div className="legend-row" key={entry.name}>
            <span className="legend-dot" style={{ background: entry.color }} />
            <span style={{ textTransform: "capitalize" }}>{entry.name}</span>
            <span className="legend-value">{entry.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

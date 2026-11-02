// Line chart of a student's monthly proof-of-work snapshots (server-rendered SVG).

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const label = (month: string) => `${MONTHS.at(Number(month.slice(5, 7)) - 1)} ${month.slice(2, 4)}`;

export function GrowthChart({
  points,
  height = 160,
}: {
  points: { month: string; value: number }[];
  height?: number;
}) {
  if (points.length === 0) return <p className="text-sm text-muted">No growth history yet.</p>;

  const W = 560, H = height, left = 34, right = 28, top = 18, bottom = 28;
  const max = 100; // proof-of-work is 0–100
  const x = (i: number) => left + (points.length === 1 ? (W - left - right) / 2 : (i * (W - left - right)) / (points.length - 1));
  const y = (v: number) => top + (1 - v / max) * (H - top - bottom);
  const path = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(p.value).toFixed(1)}`).join(" ");
  const area = `${path} L${x(points.length - 1).toFixed(1)} ${y(0)} L${x(0).toFixed(1)} ${y(0)} Z`;
  const last = points.at(-1)!;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img"
         aria-label={`Proof-of-work over time, now ${last.value.toFixed(0)} out of 100`}>
      {[0, 50, 100].map((g) => (
        <g key={g}>
          <line x1={left} x2={W - right} y1={y(g)} y2={y(g)} stroke="var(--line)" />
          <text x={left - 8} y={y(g) + 4} textAnchor="end" fontSize="11" fill="var(--muted)">{g}</text>
        </g>
      ))}
      <path d={area} fill="var(--accent)" fillOpacity="0.1" />
      <path d={path} fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
      {points.map((p, i) => (
        <g key={p.month}>
          <circle cx={x(i)} cy={y(p.value)} r={i === points.length - 1 ? 4.5 : 3} fill="var(--accent)" />
          <text x={x(i)} y={H - 8} textAnchor="middle" fontSize="11" fill="var(--muted)">{label(p.month)}</text>
        </g>
      ))}
      <text x={x(points.length - 1)} y={y(last.value) - 10} textAnchor={points.length > 1 ? "end" : "middle"}
            fontSize="12" fontWeight="600" fill="var(--ink)">{last.value.toFixed(0)}</text>
    </svg>
  );
}

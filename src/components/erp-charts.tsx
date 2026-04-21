import Link from "next/link";

type TrendPoint = {
  label: string;
  value: number;
};

type PieSegment = {
  label: string;
  value: number;
  className?: string;
  href?: string;
  title?: string;
};

type ChartSegment = {
  label: string;
  value: number;
  className: string;
};

export function TrendLineChart({
  points,
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
  points: TrendPoint[];
}) {
  const maxValue = Math.max(...points.map((point) => point.value), 1);
  const width = 420;
  const height = 170;
  const stepX = points.length > 1 ? width / (points.length - 1) : width;
  const polyline = points
    .map((point, index) => {
      const x = index * stepX;
      const y = height - (point.value / maxValue) * (height - 28) - 14;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <div className="chart-card">
      <div className="section-header">
        <div>
          <h3 className="panel-title">{title}</h3>
          <p className="panel-subtitle">{subtitle}</p>
        </div>
      </div>

      <svg className="trend-chart" viewBox={`0 0 ${width} ${height + 28}`} role="img">
        <polyline className="trend-chart-line" fill="none" points={polyline} />
        {points.map((point, index) => {
          const x = index * stepX;
          const y = height - (point.value / maxValue) * (height - 28) - 14;
          return (
            <g key={point.label}>
              <circle className="trend-chart-dot" cx={x} cy={y} r="4" />
              <text className="trend-chart-label" textAnchor="middle" x={x} y={height + 18}>
                {point.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export function CompactBarChart({
  bars,
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
  bars: Array<{ label: string; value: number; note?: string; title?: string; segments?: ChartSegment[] }>;
}) {
  const maxValue = Math.max(
    ...bars.map((bar) => (bar.segments?.length ? bar.segments.reduce((sum, segment) => sum + segment.value, 0) : bar.value)),
    1
  );

  return (
    <div className="chart-card">
      <div className="section-header">
        <div>
          <h3 className="panel-title">{title}</h3>
          <p className="panel-subtitle">{subtitle}</p>
        </div>
      </div>

      <div className="chart-bar-list">
        {bars.map((bar) => (
          <div className="chart-bar-row" key={bar.label} title={bar.title}>
            <div className="chart-bar-copy">
              <strong>{bar.label}</strong>
              {bar.note ? <div className="small-text">{bar.note}</div> : null}
            </div>
            <div className="chart-bar-track">
              {bar.segments?.length ? (
                <div
                  className="chart-bar-stack"
                  style={{
                    width: `${Math.max(
                      6,
                      (bar.segments.reduce((sum, segment) => sum + segment.value, 0) / maxValue) * 100
                    )}%`,
                  }}
                >
                  {bar.segments.map((segment) => {
                    const total = bar.segments!.reduce((sum, current) => sum + current.value, 0);
                    return (
                      <div
                        className={`chart-bar-segment ${segment.className}`}
                        key={`${bar.label}-${segment.label}`}
                        style={{ width: `${total > 0 ? (segment.value / total) * 100 : 0}%` }}
                      />
                    );
                  })}
                </div>
              ) : (
                <div className="chart-bar-fill" style={{ width: `${Math.max(6, (bar.value / maxValue) * 100)}%` }} />
              )}
            </div>
            <div className="chart-bar-value">{bar.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function DualMetricBarChart({
  bars,
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
  bars: Array<{
    label: string;
    note?: string;
    title?: string;
    primary: ChartSegment;
    secondary: ChartSegment;
  }>;
}) {
  const maxValue = Math.max(
    ...bars.flatMap((bar) => [bar.primary.value, bar.secondary.value]),
    1
  );

  return (
    <div className="chart-card">
      <div className="section-header">
        <div>
          <h3 className="panel-title">{title}</h3>
          <p className="panel-subtitle">{subtitle}</p>
        </div>
      </div>

      <div className="chart-bar-list">
        {bars.map((bar) => (
          <div className="chart-bar-row chart-bar-row-dual" key={bar.label} title={bar.title}>
            <div className="chart-bar-copy">
              <strong>{bar.label}</strong>
              {bar.note ? <div className="small-text">{bar.note}</div> : null}
            </div>
            <div className="chart-bar-dual-stack">
              <div className="chart-bar-track">
                <div
                  className={`chart-bar-fill ${bar.primary.className}`}
                  style={{ width: `${Math.max(4, (bar.primary.value / maxValue) * 100)}%` }}
                />
              </div>
              <div className="chart-bar-track">
                <div
                  className={`chart-bar-fill ${bar.secondary.className}`}
                  style={{ width: `${Math.max(4, (bar.secondary.value / maxValue) * 100)}%` }}
                />
              </div>
            </div>
            <div className="chart-bar-dual-values">
              <strong>{bar.primary.value}</strong>
              <span>{bar.secondary.value}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function DonutChart({
  segments,
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
  segments: PieSegment[];
}) {
  const total = Math.max(
    1,
    segments.reduce((sum, segment) => sum + segment.value, 0)
  );
  let offset = 0;

  return (
    <div className="chart-card">
      <div className="section-header">
        <div>
          <h3 className="panel-title">{title}</h3>
          <p className="panel-subtitle">{subtitle}</p>
        </div>
      </div>

      <div className="donut-layout">
        <svg className="donut-chart" viewBox="0 0 42 42" role="img">
          <circle className="donut-ring" cx="21" cy="21" r="15.9155" />
          {segments.map((segment) => {
            const percentage = (segment.value / total) * 100;
            const dash = `${percentage} ${100 - percentage}`;
            const currentOffset = offset;
            offset += percentage;
            return (
              <circle
                className={`donut-segment ${segment.className ?? "donut-segment-info"}`}
                cx="21"
                cy="21"
                key={segment.label}
                r="15.9155"
                strokeDasharray={dash}
                strokeDashoffset={25 - currentOffset}
              >
                <title>{segment.title ?? `${segment.label}: ${segment.value}`}</title>
              </circle>
            );
          })}
          <text className="donut-total" textAnchor="middle" x="21" y="21">
            {total}
          </text>
          <text className="donut-total-note" textAnchor="middle" x="21" y="26">
            total
          </text>
        </svg>

        <div className="chart-legend">
          {segments.map((segment) => (
            segment.href ? (
              <Link className="chart-legend-row chart-legend-row-link" href={segment.href} key={segment.label} title={segment.title}>
                <span className={`chart-legend-dot ${segment.className ?? "donut-segment-info"}`} />
                <span>{segment.label}</span>
                <strong>{segment.value}</strong>
              </Link>
            ) : (
              <div className="chart-legend-row" key={segment.label} title={segment.title}>
                <span className={`chart-legend-dot ${segment.className ?? "donut-segment-info"}`} />
                <span>{segment.label}</span>
                <strong>{segment.value}</strong>
              </div>
            )
          ))}
        </div>
      </div>
    </div>
  );
}

export type ActivityFeedItem = {
  id: string;
  title: string;
  detail: string;
  timeLabel: string;
  actor?: string | null;
  tone?: "info" | "success" | "warning" | "danger" | "muted";
};

export function ActivityFeed({
  items,
  subtitle,
  title = "Activity feed",
}: {
  title?: string;
  subtitle?: string;
  items: ActivityFeedItem[];
}) {
  return (
    <section className="panel panel-elevated">
      <div className="section-header">
        <div>
          <h3 className="panel-title">{title}</h3>
          {subtitle ? <p className="panel-subtitle">{subtitle}</p> : null}
        </div>
      </div>

      <div className="activity-feed">
        {items.length === 0 ? (
          <div className="empty-state">No activity has been recorded yet.</div>
        ) : (
          items.map((item) => (
            <div className="activity-item" key={item.id}>
              <div className={`activity-dot ${item.tone ? `activity-dot-${item.tone}` : "activity-dot-info"}`} />
              <div className="activity-body">
                <div className="activity-row">
                  <strong>{item.title}</strong>
                  <span className="small-text">{item.timeLabel}</span>
                </div>
                <div className="small-text">{item.detail}</div>
                {item.actor ? <div className="small-text">Actor: {item.actor}</div> : null}
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

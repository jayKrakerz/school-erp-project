export function Skeleton({ className = '', width, height, style, ...props }) {
  return (
    <span
      className={`ui-skeleton ${className}`.trim()}
      style={{ width, height, ...style }}
      aria-hidden="true"
      {...props}
    />
  );
}

export function TableSkeleton({ rows = 6, columns = 5, className = '' }) {
  return (
    <div
      className={`ui-table-skeleton ${className}`.trim()}
      style={{ '--skeleton-columns': columns }}
      role="status"
      aria-label="Loading table"
    >
      <span className="ui-sr-only">Loading table</span>
      <div className="ui-table-skeleton__row ui-table-skeleton__head">
        {Array.from({ length: columns }, (_, column) => <Skeleton key={column} height="12px" />)}
      </div>
      {Array.from({ length: rows }, (_, row) => (
        <div className="ui-table-skeleton__row" key={row}>
          {Array.from({ length: columns }, (_, column) => (
            <Skeleton key={column} height="14px" width={column === 0 ? '75%' : undefined} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function CardGridSkeleton({ cards = 4, lines = 3, className = '' }) {
  return (
    <div className={`ui-card-grid-skeleton ${className}`.trim()} role="status" aria-label="Loading cards">
      <span className="ui-sr-only">Loading cards</span>
      {Array.from({ length: cards }, (_, card) => (
        <div className="ui-card-skeleton" key={card}>
          <Skeleton className="ui-card-skeleton__icon" />
          <Skeleton height="18px" width="62%" />
          {Array.from({ length: lines }, (_, line) => (
            <Skeleton key={line} height="12px" width={line === lines - 1 ? '48%' : '100%'} />
          ))}
        </div>
      ))}
    </div>
  );
}

export default Skeleton;

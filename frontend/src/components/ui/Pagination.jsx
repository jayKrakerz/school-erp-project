import { ChevronLeft, ChevronRight } from 'lucide-react';

const pageWindow = (page, totalPages) => {
  const start = Math.max(1, Math.min(page - 2, totalPages - 4));
  return Array.from({ length: Math.min(5, totalPages) }, (_, index) => start + index);
};

export default function Pagination({
  page,
  totalPages,
  totalItems,
  pageSize,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 25, 50, 100],
  showingFrom,
  showingTo,
  disabled = false
}) {
  const safeTotalPages = Math.max(1, totalPages || 1);
  const from = totalItems === 0 ? 0 : showingFrom ?? ((page - 1) * pageSize + 1);
  const to = totalItems === 0 ? 0 : showingTo ?? Math.min(page * pageSize, totalItems);

  return (
    <nav className="ui-pagination" aria-label="Pagination">
      <p className="ui-pagination__range" aria-live="polite">
        Showing <strong>{from}-{to}</strong> of <strong>{totalItems}</strong>
      </p>
      <div className="ui-pagination__controls">
        {onPageSizeChange && (
          <label className="ui-pagination__size">
            <span>Rows</span>
            <select
              value={pageSize}
              disabled={disabled}
              aria-label="Rows per page"
              onChange={(event) => onPageSizeChange(Number(event.target.value))}
            >
              {pageSizeOptions.map((size) => <option key={size} value={size}>{size}</option>)}
            </select>
          </label>
        )}
        <button
          className="ui-pagination__button"
          type="button"
          aria-label="Previous page"
          disabled={disabled || page <= 1}
          onClick={() => onPageChange(page - 1)}
        ><ChevronLeft size={18} aria-hidden="true" /></button>
        <div className="ui-pagination__pages">
          {pageWindow(page, safeTotalPages).map((pageNumber) => (
            <button
              key={pageNumber}
              className="ui-pagination__button"
              type="button"
              aria-label={`Page ${pageNumber}`}
              aria-current={pageNumber === page ? 'page' : undefined}
              disabled={disabled}
              onClick={() => onPageChange(pageNumber)}
            >{pageNumber}</button>
          ))}
        </div>
        <button
          className="ui-pagination__button"
          type="button"
          aria-label="Next page"
          disabled={disabled || page >= safeTotalPages}
          onClick={() => onPageChange(page + 1)}
        ><ChevronRight size={18} aria-hidden="true" /></button>
      </div>
    </nav>
  );
}

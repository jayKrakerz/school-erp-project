import { useEffect, useMemo, useState } from 'react';

const positiveInteger = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
};

export default function usePagination({
  items,
  totalItems: suppliedTotal,
  initialPage = 1,
  initialPageSize = 10,
  pageSizeOptions = [10, 25, 50, 100]
} = {}) {
  const [page, setPageState] = useState(() => positiveInteger(initialPage, 1));
  const [pageSize, setPageSizeState] = useState(() => positiveInteger(initialPageSize, 10));
  const totalItems = Math.max(0, Number.isFinite(Number(suppliedTotal))
    ? Number(suppliedTotal)
    : (items?.length || 0));
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.min(page, totalPages);

  useEffect(() => {
    if (page !== safePage) setPageState(safePage);
  }, [page, safePage]);

  const setPage = (nextPage) => {
    setPageState((current) => {
      const resolved = typeof nextPage === 'function' ? nextPage(current) : nextPage;
      return Math.min(totalPages, Math.max(1, positiveInteger(resolved, 1)));
    });
  };

  const setPageSize = (nextSize) => {
    const size = positiveInteger(nextSize, pageSize);
    setPageSizeState(size);
    setPageState(1);
  };

  const startIndex = (safePage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalItems);
  const paginatedItems = useMemo(
    () => items?.slice(startIndex, endIndex) || [],
    [endIndex, items, startIndex]
  );

  return {
    page: safePage,
    pageSize,
    pageSizeOptions,
    totalItems,
    totalPages,
    startIndex,
    endIndex,
    showingFrom: totalItems === 0 ? 0 : startIndex + 1,
    showingTo: endIndex,
    paginatedItems,
    setPage,
    setPageSize,
    nextPage: () => setPage(safePage + 1),
    previousPage: () => setPage(safePage - 1),
    canNextPage: safePage < totalPages,
    canPreviousPage: safePage > 1
  };
}

export { usePagination };

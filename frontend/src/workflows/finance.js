import { useEffect, useMemo, useState } from 'react';
import { backendRequest } from '../services/apiClient';

export function useUrlFilters(defaults, prefix = '') {
  const read = () => {
    if (typeof window === 'undefined') return defaults;
    const params = new URLSearchParams(window.location.search);
    return Object.fromEntries(Object.entries(defaults).map(([key, fallback]) => {
      const value = params.get(`${prefix}${key}`);
      return [key, value === null ? fallback : value];
    }));
  };
  const [filters, setFiltersState] = useState(read);

  useEffect(() => {
    const handlePopState = () => setFiltersState(read());
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [prefix]);

  const setFilters = update => {
    setFiltersState(previous => {
      const next = typeof update === 'function' ? update(previous) : { ...previous, ...update };
      if (typeof window !== 'undefined') {
        const params = new URLSearchParams(window.location.search);
        Object.entries(next).forEach(([key, value]) => {
          const name = `${prefix}${key}`;
          if (value === '' || value === undefined || value === null || value === defaults[key]) params.delete(name);
          else params.set(name, String(value));
        });
        const query = params.toString();
        window.history.replaceState(null, '', `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`);
      }
      return next;
    });
  };
  return [filters, setFilters];
}

export function usePagination(items, requestedPage = '1', pageSize = 10, onPageChange) {
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const page = Math.min(pageCount, Math.max(1, Number(requestedPage) || 1));
  useEffect(() => {
    if (String(page) !== String(requestedPage)) onPageChange?.(page);
  }, [page, requestedPage, onPageChange]);
  const pageItems = useMemo(() => items.slice((page - 1) * pageSize, page * pageSize), [items, page, pageSize]);
  return { page, pageCount, pageItems, pageSize, total: items.length };
}

export async function financeRequest(backendUrl, token, endpoint, options = {}) {
  const normalized = { ...options };
  if (typeof normalized.body === 'string' && normalized.headers?.['Content-Type'] === 'application/json') {
    normalized.body = JSON.parse(normalized.body);
  } else if (typeof normalized.body === 'string' && !(normalized.body instanceof FormData)) {
    try { normalized.body = JSON.parse(normalized.body); } catch { /* Keep non-JSON request bodies unchanged. */ }
  }
  return backendRequest(backendUrl, token, endpoint, normalized);
}

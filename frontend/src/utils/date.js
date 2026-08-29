const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const NUMERIC_DATE_PATTERN = /^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})$/;

const validLocalDate = (year, month, day) => {
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
    ? date
    : null;
};

// Date-only values represent local calendar days, not UTC instants.
export const parseDate = (value) => {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : new Date(value.getTime());
  }
  if (typeof value !== 'string' && typeof value !== 'number') return null;

  const text = String(value).trim();
  const canonical = text.match(DATE_ONLY_PATTERN);
  if (canonical) {
    return validLocalDate(Number(canonical[1]), Number(canonical[2]), Number(canonical[3]));
  }

  const numeric = text.match(NUMERIC_DATE_PATTERN);
  if (numeric) {
    const first = Number(numeric[1]);
    const second = Number(numeric[2]);
    const year = Number(numeric[3]);
    // Match the browser's legacy US parsing when ambiguous, but also accept
    // day-first locale output when the first component cannot be a month.
    const month = first > 12 ? second : first;
    const day = first > 12 ? first : second;
    return validLocalDate(year, month, day);
  }

  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

export const dateKey = (value) => {
  const date = parseDate(value);
  if (!date) return null;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const isDateInPeriod = (value, period, today = new Date()) => {
  const date = parseDate(value);
  const current = parseDate(today);
  if (!date || !current) return false;
  if (period === 'all') return true;
  if (period === 'today') return dateKey(date) === dateKey(current);
  if (period === 'month') {
    return date.getFullYear() === current.getFullYear() && date.getMonth() === current.getMonth();
  }
  if (period === 'week') {
    const start = new Date(current.getFullYear(), current.getMonth(), current.getDate());
    start.setDate(start.getDate() - start.getDay());
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    return date >= start && date < end;
  }
  return true;
};

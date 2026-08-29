import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

const descriptors = {
  string: {
    parse: (value) => value,
    serialize: String
  },
  number: {
    parse: (value) => {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : undefined;
    },
    serialize: String
  },
  boolean: {
    parse: (value) => value === 'true' || value === '1' ? true : value === 'false' || value === '0' ? false : undefined,
    serialize: String
  },
  array: {
    parse: (value) => value ? value.split(',').filter(Boolean) : [],
    serialize: (value) => value.join(',')
  },
  date: {
    parse: (value) => {
      const parsed = new Date(value);
      return Number.isNaN(parsed.getTime()) ? undefined : parsed;
    },
    serialize: (value) => value instanceof Date ? value.toISOString().slice(0, 10) : String(value)
  }
};

const normalizeRule = (rule) => {
  if (rule === Boolean) return descriptors.boolean;
  if (rule === Number) return descriptors.number;
  if (rule === String) return descriptors.string;
  if (typeof rule === 'function') return { parse: rule, serialize: String };
  if (typeof rule === 'string') return descriptors[rule] || descriptors.string;
  const base = descriptors[rule?.type] || descriptors.string;
  const normalized = { ...base, ...rule };
  if (!Object.prototype.hasOwnProperty.call(normalized, 'default') && Object.prototype.hasOwnProperty.call(normalized, 'defaultValue')) {
    normalized.default = normalized.defaultValue;
  }
  return normalized;
};

const readFilters = (searchParams, schema) => Object.fromEntries(
  Object.entries(schema).map(([key, rawRule]) => {
    const rule = normalizeRule(rawRule);
    const rawValue = searchParams.get(key);
    if (rawValue === null || rawValue === '') return [key, rule.default];
    try {
      const parsed = rule.parse(rawValue);
      const allowed = !rule.values || rule.values.includes(parsed);
      return [key, parsed === undefined || !allowed ? rule.default : parsed];
    } catch {
      return [key, rule.default];
    }
  })
);

export default function useUrlFilters(schema, { replace = true, preserveUnknown = true } = {}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const filters = useMemo(
    () => readFilters(searchParams, schema),
    [searchParams, schema]
  );

  const setFilters = useCallback((updates, navigationOptions = {}) => {
    setSearchParams((current) => {
      const next = preserveUnknown ? new URLSearchParams(current) : new URLSearchParams();
      const resolved = typeof updates === 'function' ? updates(readFilters(current, schema)) : updates;
      Object.entries(resolved || {}).forEach(([key, value]) => {
        if (!(key in schema)) return;
        const rule = normalizeRule(schema[key]);
        const isDefault = Object.prototype.hasOwnProperty.call(rule, 'default') && value === rule.default;
        if (value === undefined || value === null || value === '' || isDefault || (Array.isArray(value) && !value.length)) {
          next.delete(key);
        } else {
          next.set(key, rule.serialize(value));
        }
      });
      return next;
    }, { replace, ...navigationOptions });
  }, [preserveUnknown, replace, schema, setSearchParams]);

  const setFilter = useCallback((key, value, options) => {
    setFilters({ [key]: value }, options);
  }, [setFilters]);

  const resetFilters = useCallback((options) => {
    setSearchParams((current) => {
      const next = preserveUnknown ? new URLSearchParams(current) : new URLSearchParams();
      Object.keys(schema).forEach((key) => next.delete(key));
      return next;
    }, { replace, ...options });
  }, [preserveUnknown, replace, schema, setSearchParams]);

  return { ...filters, filters, setFilter, setFilters, resetFilters };
}

export { useUrlFilters };

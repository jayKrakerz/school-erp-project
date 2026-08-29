const DB_NAME = 'WavERP_Offline_DB';
const DB_VERSION = 2;
const CACHE_STORES = new Set(['students', 'payments', 'reports']);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const normalizeId = (value) => value === undefined || value === null || value === ''
  ? null
  : String(value);

export const createUUID = () => {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  return [...bytes].map((byte, index) =>
    `${index === 4 || index === 6 || index === 8 || index === 10 ? '-' : ''}${byte.toString(16).padStart(2, '0')}`
  ).join('');
};

export const getActiveScope = () => {
  try {
    const user = JSON.parse(localStorage.getItem('erp_active_user')) || {};
    return {
      tenantId: normalizeId(user.schoolId || user.tenantId),
      userId: normalizeId(user.id || user._id || user.email || user.username)
    };
  } catch {
    return { tenantId: null, userId: null };
  }
};

const requireScope = (scope = getActiveScope()) => {
  const normalized = {
    tenantId: normalizeId(scope?.tenantId),
    userId: normalizeId(scope?.userId)
  };
  if (!normalized.tenantId || !normalized.userId) {
    throw new Error('An authenticated tenant and user are required for offline storage.');
  }
  return normalized;
};

const matchesScope = (item, scope) =>
  normalizeId(item?.tenantId) === scope.tenantId && normalizeId(item?.userId) === scope.userId;

const cacheRecord = (item, scope) => {
  const recordId = normalizeId(item?.id || item?._id) || createUUID();
  return {
    cacheKey: `${scope.tenantId}\u001f${scope.userId}\u001f${recordId}`,
    tenantId: scope.tenantId,
    userId: scope.userId,
    value: item
  };
};

export const initDB = () => new Promise((resolve, reject) => {
  const request = indexedDB.open(DB_NAME, DB_VERSION);

  request.onupgradeneeded = (event) => {
    const db = event.target.result;

    // Version 1 cache keys were record IDs, so records from different tenants
    // could overwrite one another. Drop those unsafe snapshots during migration.
    CACHE_STORES.forEach((storeName) => {
      if (db.objectStoreNames.contains(storeName)) db.deleteObjectStore(storeName);
      const store = db.createObjectStore(storeName, { keyPath: 'cacheKey' });
      store.createIndex('scope', ['tenantId', 'userId'], { unique: false });
    });

    if (!db.objectStoreNames.contains('attendance')) {
      db.createObjectStore('attendance', { keyPath: 'id', autoIncrement: true });
    }
    if (!db.objectStoreNames.contains('grades')) {
      db.createObjectStore('grades', { keyPath: 'id', autoIncrement: true });
    }
    if (!db.objectStoreNames.contains('sync_queue')) {
      db.createObjectStore('sync_queue', { keyPath: 'id' });
    } else {
      const queue = event.target.transaction.objectStore('sync_queue');
      const cursorRequest = queue.openCursor();
      cursorRequest.onsuccess = () => {
        const cursor = cursorRequest.result;
        if (!cursor) return;
        const item = cursor.value;
        // Preserve scoped version 1 work, but replace numeric operation IDs.
        // Unscoped legacy work remains quarantined and is never returned.
        if (item.tenantId && item.userId && !UUID_PATTERN.test(item.id || '')) {
          cursor.delete();
          queue.put({ ...item, id: createUUID(), requestId: createUUID() });
        }
        cursor.continue();
      };
    }
  };

  request.onsuccess = (event) => resolve(event.target.result);
  request.onerror = (event) => reject(event.target.error);
  request.onblocked = () => reject(new Error('Offline database upgrade was blocked by another tab.'));
});

const getRawAll = async (storeName) => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const request = db.transaction(storeName, 'readonly').objectStore(storeName).getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

export const dbOperations = {
  async getAll(storeName) {
    if (CACHE_STORES.has(storeName)) return this.getTenantRecords(storeName);
    if (storeName === 'sync_queue') return this.getTenantQueue();
    return getRawAll(storeName);
  },

  async put(storeName, item, scope) {
    const value = CACHE_STORES.has(storeName)
      ? cacheRecord(item, requireScope(scope))
      : item;
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, 'readwrite');
      const request = transaction.objectStore(storeName).put(value);
      let result;
      request.onsuccess = () => { result = request.result; };
      transaction.oncomplete = () => resolve(result);
      transaction.onerror = () => reject(transaction.error || request.error);
      transaction.onabort = () => reject(transaction.error || request.error);
    });
  },

  async putAll(storeName, items, scope) {
    if (CACHE_STORES.has(storeName)) {
      return this.replaceTenantSnapshot(storeName, items, scope);
    }
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, 'readwrite');
      const store = transaction.objectStore(storeName);
      items.forEach(item => store.put(item));
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  },

  async delete(storeName, id) {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, 'readwrite');
      const request = transaction.objectStore(storeName).delete(id);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || request.error);
      transaction.onabort = () => reject(transaction.error || request.error);
    });
  },

  async clear(storeName, scope) {
    if (CACHE_STORES.has(storeName)) return this.clearTenantCaches(scope, [storeName]);
    if (storeName === 'sync_queue') return this.clearTenantQueue(scope);
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, 'readwrite');
      const request = transaction.objectStore(storeName).clear();
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || request.error);
      transaction.onabort = () => reject(transaction.error || request.error);
    });
  },

  async getTenantRecords(storeName, scope) {
    if (!CACHE_STORES.has(storeName)) throw new Error(`Unsupported tenant cache: ${storeName}`);
    let activeScope;
    try {
      activeScope = requireScope(scope);
    } catch {
      return [];
    }
    const records = await getRawAll(storeName);
    return records.filter(record => matchesScope(record, activeScope)).map(record => record.value);
  },

  async replaceTenantSnapshot(storeName, items, scope) {
    if (!CACHE_STORES.has(storeName)) throw new Error(`Unsupported tenant cache: ${storeName}`);
    const activeScope = requireScope(scope);
    const records = items.map(item => cacheRecord(item, activeScope));
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, 'readwrite');
      const store = transaction.objectStore(storeName);
      const cursorRequest = store.openCursor();
      cursorRequest.onsuccess = () => {
        const cursor = cursorRequest.result;
        if (cursor) {
          if (matchesScope(cursor.value, activeScope)) cursor.delete();
          cursor.continue();
          return;
        }
        records.forEach(record => store.put(record));
      };
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  },

  async clearTenantCaches(scope, storeNames = [...CACHE_STORES]) {
    const activeScope = requireScope(scope);
    const names = storeNames.filter(name => CACHE_STORES.has(name));
    if (!names.length) return;
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(names, 'readwrite');
      names.forEach((name) => {
        const request = transaction.objectStore(name).openCursor();
        request.onsuccess = () => {
          const cursor = request.result;
          if (!cursor) return;
          if (matchesScope(cursor.value, activeScope)) cursor.delete();
          cursor.continue();
        };
      });
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  },

  async getTenantQueue(scope) {
    let activeScope;
    try {
      activeScope = requireScope(scope);
    } catch {
      return [];
    }
    const items = await getRawAll('sync_queue');
    return items
      .filter(item => matchesScope(item, activeScope))
      .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
  },

  async clearTenantQueue(scope) {
    const activeScope = requireScope(scope);
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('sync_queue', 'readwrite');
      const request = transaction.objectStore('sync_queue').openCursor();
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return;
        if (matchesScope(cursor.value, activeScope)) cursor.delete();
        cursor.continue();
      };
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  },

  async pushToQueue(action) {
    const scope = requireScope(action);
    const queued = {
      ...action,
      id: UUID_PATTERN.test(action.id || '') ? action.id : createUUID(),
      requestId: UUID_PATTERN.test(action.requestId || '') ? action.requestId : createUUID(),
      tenantId: scope.tenantId,
      userId: scope.userId,
      timestamp: action.timestamp || Date.now(),
      status: 'pending',
      attempts: action.attempts || 0,
      nextAttemptAt: action.nextAttemptAt || null
    };
    await this.put('sync_queue', queued);
    return queued.id;
  },

  async upsertReplacement(action) {
    const scope = requireScope(action);
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('sync_queue', 'readwrite');
      const store = transaction.objectStore('sync_queue');
      const request = store.getAll();
      let id;
      request.onsuccess = () => {
        const existing = request.result.find(item =>
          item.type === 'replace' && item.status === 'pending' &&
          item.collection === action.collection && matchesScope(item, scope)
        );
        const queued = {
          ...(existing || {}),
          ...action,
          id: existing?.id || (UUID_PATTERN.test(action.id || '') ? action.id : createUUID()),
          requestId: existing?.requestId || (UUID_PATTERN.test(action.requestId || '') ? action.requestId : createUUID()),
          tenantId: scope.tenantId,
          userId: scope.userId,
          timestamp: Date.now(),
          status: 'pending',
          attempts: 0,
          nextAttemptAt: null,
          lastAttemptAt: null,
          lastError: null,
          lastStatus: null
        };
        id = queued.id;
        store.put(queued);
      };
      transaction.oncomplete = () => resolve(id);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  }
};

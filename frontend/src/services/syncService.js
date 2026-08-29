import { createUUID, dbOperations, getActiveScope } from './db';

const MAX_ATTEMPTS = 5;
const BASE_RETRY_DELAY_MS = 1000;
const MAX_RETRY_DELAY_MS = 60_000;

const withoutCredentials = (headers = {}) => Object.fromEntries(
  Object.entries(headers).filter(([name]) => {
    const normalized = name.toLowerCase();
    return normalized !== 'authorization' && normalized !== 'x-request-id';
  })
);

const errorMessage = async (response) => {
  try {
    const body = await response.json();
    return body.message || body.error || `Request failed with status ${response.status}`;
  } catch {
    return `Request failed with status ${response.status}`;
  }
};

const retryState = (item, message, status) => {
  const attempts = (item.attempts || 0) + 1;
  const exhausted = attempts >= MAX_ATTEMPTS;
  const delay = Math.min(BASE_RETRY_DELAY_MS * (2 ** (attempts - 1)), MAX_RETRY_DELAY_MS);
  return {
    ...item,
    status: exhausted ? 'failed' : 'pending',
    attempts,
    lastAttemptAt: Date.now(),
    nextAttemptAt: exhausted ? null : Date.now() + delay,
    lastError: exhausted ? `${message} Retry limit reached.` : message,
    lastStatus: status ?? item.lastStatus ?? null
  };
};

const scopedDetails = (details) => {
  const scope = getActiveScope();
  const items = details.items.filter(item =>
    item.tenantId === scope.tenantId && item.userId === scope.userId
  );
  return {
    items,
    pending: items.filter(item => item.status !== 'failed').length,
    failed: items.filter(item => item.status === 'failed').length
  };
};

class SyncService {
  constructor() {
    this.isSyncing = false;
    this.syncPromise = null;
    this.networkStatus = navigator.onLine ? 'online' : 'offline';
    this.listeners = new Set();
    this.queueDetails = { items: [], pending: 0, failed: 0 };
    this.onlineHandler = () => this.handleStatusChange('online');
    this.offlineHandler = () => this.handleStatusChange('offline');

    window.addEventListener('online', this.onlineHandler);
    window.addEventListener('offline', this.offlineHandler);
    this.refreshQueueDetails();
  }

  handleStatusChange(status) {
    this.networkStatus = status;
    this.notifyListeners();
    if (status === 'online') this.sync();
  }

  reportBackendReachable(reachable) {
    const status = reachable ? 'online' : 'offline';
    if (this.networkStatus === status) return;
    this.networkStatus = status;
    this.notifyListeners();
    if (reachable) this.sync();
  }

  addListener(callback) {
    this.listeners.add(callback);
    callback(this.networkStatus, this.isSyncing, scopedDetails(this.queueDetails));
    return () => this.listeners.delete(callback);
  }

  destroy() {
    window.removeEventListener('online', this.onlineHandler);
    window.removeEventListener('offline', this.offlineHandler);
    this.listeners.clear();
  }

  async refreshQueueDetails() {
    const items = await dbOperations.getTenantQueue();
    this.queueDetails = {
      items,
      pending: items.filter(item => item.status !== 'failed').length,
      failed: items.filter(item => item.status === 'failed').length
    };
    return this.queueDetails;
  }

  async notifyListeners() {
    try {
      await this.refreshQueueDetails();
    } catch (error) {
      console.error('Unable to read the sync queue:', error);
    }
    const details = scopedDetails(this.queueDetails);
    this.listeners.forEach(callback => callback(this.networkStatus, this.isSyncing, details));
  }

  getQueueDetails() {
    return scopedDetails(this.queueDetails);
  }

  async handleScopeChange() {
    await this.notifyListeners();
    if (this.networkStatus === 'online') return this.sync();
  }

  async queueAction(collection, data, type, itemId, config = {}) {
    const activeScope = getActiveScope();
    const requestIdHeader = Object.entries(config.headers || {})
      .find(([name]) => name.toLowerCase() === 'x-request-id')?.[1];
    const action = {
      collection,
      data,
      type,
      itemId,
      baseUrl: config.baseUrl,
      headers: withoutCredentials(config.headers),
      tenantId: config.tenantId || activeScope.tenantId,
      userId: config.userId || activeScope.userId,
      requestId: config.requestId || requestIdHeader || createUUID(),
      attempts: 0
    };

    const queueId = type === 'replace'
      ? await dbOperations.upsertReplacement(action)
      : await dbOperations.pushToQueue(action);
    await this.notifyListeners();
    return queueId;
  }

  async retry(itemId) {
    const item = (await dbOperations.getTenantQueue()).find(entry => entry.id === itemId);
    if (!item) return;
    await dbOperations.put('sync_queue', {
      ...item,
      status: 'pending',
      attempts: 0,
      lastError: null,
      lastStatus: null,
      lastAttemptAt: null,
      nextAttemptAt: null
    });
    await this.notifyListeners();
    return this.sync();
  }

  async discard(itemId) {
    const item = (await dbOperations.getTenantQueue()).find(entry => entry.id === itemId);
    if (!item) return;
    await dbOperations.delete('sync_queue', item.id);
    await this.notifyListeners();
  }

  async clearActiveQueue() {
    await dbOperations.clearTenantQueue();
    await this.notifyListeners();
  }

  sync() {
    if (this.syncPromise) return this.syncPromise;
    if (this.networkStatus === 'offline') return Promise.resolve();

    // Claim the lock before the first IndexedDB await so online/manual sync
    // events in the same tick cannot start two queue processors.
    this.isSyncing = true;
    this.syncPromise = (async () => {
      await this.notifyListeners();
      await this.processQueue();
    })().finally(async () => {
      this.isSyncing = false;
      this.syncPromise = null;
      await this.notifyListeners();
    });
    return this.syncPromise;
  }

  async processQueue() {
    const queue = await dbOperations.getTenantQueue();

    for (const originalItem of queue) {
      if (originalItem.status === 'failed') continue;
      if (originalItem.nextAttemptAt && originalItem.nextAttemptAt > Date.now()) break;
      const currentScope = getActiveScope();
      if (currentScope.tenantId !== originalItem.tenantId || currentScope.userId !== originalItem.userId) break;

      const { token: _legacyToken, ...itemWithoutToken } = originalItem;
      const item = {
        ...itemWithoutToken,
        headers: withoutCredentials(originalItem.headers),
        status: 'in-flight'
      };
      await dbOperations.put('sync_queue', item);

      const token = localStorage.getItem('erp_token');
      if (!token) {
        await dbOperations.put('sync_queue', {
          ...item,
          status: 'pending',
          lastError: 'Sign in to synchronize this item.'
        });
        break;
      }

      let url = `${item.baseUrl}/data/${item.collection}`;
      let method = 'POST';
      if (item.type === 'add') {
        url = `${item.baseUrl}/data/${item.collection}/add`;
      } else if (item.type === 'update' && item.itemId) {
        url = `${item.baseUrl}/data/${item.collection}/update/${encodeURIComponent(item.itemId)}`;
      } else if (item.type === 'delete' && item.itemId) {
        url = item.collection === 'users'
          ? `${item.baseUrl}/users/delete/${encodeURIComponent(item.itemId)}`
          : `${item.baseUrl}/data/${item.collection}/delete/${encodeURIComponent(item.itemId)}`;
        method = 'DELETE';
      }

      try {
        const response = await fetch(url, {
          method,
          headers: {
            ...item.headers,
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
            'X-Request-ID': item.requestId,
            'X-Sync-ID': item.id
          },
          body: item.data ? JSON.stringify(item.data) : undefined
        });

        if (response.ok) {
          await dbOperations.delete('sync_queue', item.id);
          continue;
        }

        const retryable = response.status === 408 || response.status === 425 ||
          response.status === 429 || response.status >= 500;
        const message = await errorMessage(response);
        if (retryable) {
          await dbOperations.put('sync_queue', retryState(item, message, response.status));
          break;
        }

        await dbOperations.put('sync_queue', {
          ...item,
          status: 'failed',
          attempts: (item.attempts || 0) + 1,
          lastAttemptAt: Date.now(),
          nextAttemptAt: null,
          lastError: message,
          lastStatus: response.status
        });
      } catch (error) {
        await dbOperations.put(
          'sync_queue',
          retryState(item, error.message || 'Network request failed')
        );
        break;
      }
    }
  }
}

export const syncService = new SyncService();

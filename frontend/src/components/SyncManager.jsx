import React, { useState, useEffect } from 'react';
import { dbOperations } from '../services/db';
import { syncService } from '../services/syncService';
import { Wifi, WifiOff, RefreshCw, Trash2, Database, AlertCircle, X } from 'lucide-react';

const SyncManager = () => {
  const [queue, setQueue] = useState([]);
  const [networkStatus, setNetworkStatus] = useState('online');
  const [isSyncing, setIsSyncing] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const updateQueue = async () => {
      const data = await dbOperations.getAll('sync_queue');
      setQueue(data);
    };

    const unsubscribe = syncService.addListener((status, syncing, details) => {
      setNetworkStatus(status);
      setIsSyncing(syncing);
      if (details) setQueue(details.items);
      else updateQueue();
    });

    const interval = setInterval(updateQueue, 3000);
    return () => {
      unsubscribe();
      clearInterval(interval);
    };
  }, []);

  const handleManualSync = () => syncService.sync();

  const handleDiscard = async (id) => {
    if (isSyncing) return;
    if (window.confirm('Discard this queued change? This cannot be undone.')) {
      await syncService.discard(id);
    }
  };

  const handleClearQueue = async () => {
    if (isSyncing) return;
    if (window.confirm('Permanently discard every queued change for the active school and user? These unsynchronized changes cannot be recovered.')) {
      await syncService.clearActiveQueue();
    }
  };

  if (!isOpen) {
    return (
      <button 
        onClick={() => setIsOpen(true)}
        className="sync-manager-trigger"
        title="Offline Sync Manager"
        aria-label={`Open offline sync manager. ${queue.length} queued items.`}
      >
        <Database size={24} aria-hidden="true" />
        {queue.length > 0 && (
          <span className="sync-manager-count">
            {queue.length}
          </span>
        )}
      </button>
    );
  }

  return (
    <section className="sync-manager-panel" role="dialog" aria-modal="false" aria-labelledby="sync-manager-title">
      <div className="sync-manager-header">
        <h3 id="sync-manager-title">
          {networkStatus === 'online' ? <Wifi className="sync-online" size={18} aria-hidden="true" /> : <WifiOff className="sync-offline" size={18} aria-hidden="true" />}
          Sync Manager
        </h3>
        <button onClick={() => setIsOpen(false)} className="sync-manager-close" aria-label="Close sync manager"><X size={18} aria-hidden="true" /></button>
      </div>

      <div className="sync-manager-list">
        {queue.length === 0 ? (
          <div className="sync-manager-empty">
            Everything is synchronized.
          </div>
        ) : (
          queue.map((item) => (
            <article key={item.id} className={`sync-manager-item ${item.status === 'failed' ? 'failed' : ''}`}>
              <div className="sync-manager-item-title">
                <strong>
                  {item.type} {item.collection}
                </strong>
                <time>{item.timestamp ? new Date(item.timestamp).toLocaleTimeString() : 'Pending'}</time>
              </div>
              <div className="sync-manager-meta">
                ID: {item.itemId || 'new'}
              </div>
              <div className="sync-manager-meta">
                Scope: {item.tenantId || 'legacy'} / {item.userId || 'legacy'}
              </div>
              {item.lastError && (
                <div className="sync-manager-error" role="status">
                  {item.status === 'failed' ? 'Failed: ' : 'Pending: '}{item.lastError}
                </div>
              )}
              <div className="sync-manager-item-actions">
                {item.status === 'failed' && (
                  <button onClick={() => syncService.retry(item.id)} aria-label={`Retry ${item.type} ${item.collection}`}>
                    Retry
                  </button>
                )}
                <button className="danger" disabled={isSyncing} onClick={() => handleDiscard(item.id)} aria-label={`Discard ${item.type} ${item.collection}`}>
                  Discard
                </button>
              </div>
            </article>
          ))
        )}
      </div>

      <div className="sync-manager-actions">
        <button 
          onClick={handleManualSync}
          disabled={isSyncing || networkStatus === 'offline' || queue.length === 0}
          className="btn btn-primary"
        >
          <RefreshCw size={14} className={isSyncing ? 'animate-spin' : ''} aria-hidden="true" />
          Force Sync
        </button>
        <button 
          onClick={handleClearQueue}
          disabled={isSyncing || queue.length === 0}
          className="btn btn-secondary"
        >
          <Trash2 size={14} aria-hidden="true" />
          Discard Queued Changes
        </button>
      </div>
      
      {networkStatus === 'offline' && (
        <div className="sync-manager-offline-note">
            <AlertCircle size={12} aria-hidden="true" />
            Workspace is offline. Changes are saved locally.
        </div>
      )}
    </section>
  );
};

export default SyncManager;

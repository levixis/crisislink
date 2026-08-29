"use client";

/**
 * Offline report queue.
 *
 * The scenario this whole platform exists for is the one where the network is
 * down. A report typed during a flood and lost because the tower is congested
 * is the worst failure this app can have — worse than no app, because the
 * person believes they have reported it.
 *
 * Design decisions worth defending:
 *
 * - IndexedDB, not localStorage. Reports must survive a tab crash and a
 *   reload, and localStorage is synchronous and size-capped.
 * - Replayed from the page, not via Background Sync. Background Sync would
 *   also fire with the app closed, but Safari does not implement it, and a
 *   queue that silently works on one browser and not another is worse than one
 *   that behaves the same everywhere. The page drains on load and whenever the
 *   browser reports coming back online.
 * - Each queued report keeps its ORIGINAL `clientCreatedAt`. A report written
 *   at 14:02 and synced at 16:40 describes 14:02, and clustering by time would
 *   be wrong otherwise.
 * - Only network failures queue. A 422 or 429 is the server saying no; storing
 *   it to retry forever would spam an endpoint that already refused.
 */

const DB_NAME = "crisislink";
const DB_VERSION = 1;
const STORE = "pending-reports";

export type QueuedReport = {
  id?: number;
  payload: Record<string, unknown>;
  queuedAt: string;
  attempts: number;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id", autoIncrement: true });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(STORE, mode);
        const request = run(transaction.objectStore(STORE));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
        transaction.oncomplete = () => db.close();
      }),
  );
}

export async function enqueueReport(payload: Record<string, unknown>): Promise<void> {
  await tx("readwrite", (store) =>
    store.add({ payload, queuedAt: new Date().toISOString(), attempts: 0 } satisfies QueuedReport),
  );
}

export async function listQueued(): Promise<QueuedReport[]> {
  try {
    return await tx<QueuedReport[]>("readonly", (store) => store.getAll());
  } catch {
    // Private browsing and some locked-down configurations refuse IndexedDB.
    return [];
  }
}

async function remove(id: number): Promise<void> {
  await tx("readwrite", (store) => store.delete(id) as unknown as IDBRequest<undefined>);
}

export type FlushResult = { sent: number; failed: number; remaining: number };

/**
 * Guards against two drains overlapping — a mount and an `online` event firing
 * together, or React re-mounting in development. Without this, both read the
 * same queued row before either deletes it and the report is sent twice.
 * The server's idempotency key is the backstop; this stops the race happening
 * in the first place.
 */
let inFlight: Promise<FlushResult> | null = null;

/**
 * Attempts to send everything queued.
 *
 * A report is removed when the server accepts it, and ALSO when the server
 * rejects it with a 4xx that is not 408/429 — because a payload the server has
 * definitively refused will never succeed, and retrying it forever would block
 * the queue behind it. Network errors and 5xx leave the report in place.
 */
export function flushQueue(): Promise<FlushResult> {
  if (inFlight) return inFlight;
  inFlight = runFlush().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function runFlush(): Promise<FlushResult> {
  const queued = await listQueued();
  let sent = 0;
  let failed = 0;

  for (const item of queued) {
    if (item.id === undefined) continue;
    try {
      const response = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(item.payload),
      });

      if (response.ok) {
        await remove(item.id);
        sent += 1;
        continue;
      }

      const permanent =
        response.status >= 400 && response.status < 500 && ![408, 429].includes(response.status);
      if (permanent) {
        console.warn("[crisislink] dropping queued report the server refused:", response.status);
        await remove(item.id);
        failed += 1;
        continue;
      }
      failed += 1;
    } catch {
      // Still offline — leave it queued and stop trying for now.
      failed += 1;
      break;
    }
  }

  return { sent, failed, remaining: (await listQueued()).length };
}

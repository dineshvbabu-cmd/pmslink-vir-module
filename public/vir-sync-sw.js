const DB_NAME = "vir-offline-sync";
const STORE_NAME = "evidenceQueue";
const DB_VERSION = 1;

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;

      if (!database.objectStoreNames.contains(STORE_NAME)) {
        const store = database.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("inspectionId", "inspectionId", { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Unable to open evidence queue database."));
  });
}

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("IndexedDB request failed."));
  });
}

async function getAllItems() {
  const database = await openDatabase();
  const transaction = database.transaction(STORE_NAME, "readonly");
  const store = transaction.objectStore(STORE_NAME);
  const items = await requestToPromise(store.getAll());
  database.close();
  return Array.isArray(items) ? items : [];
}

async function deleteItems(ids) {
  const database = await openDatabase();
  const transaction = database.transaction(STORE_NAME, "readwrite");
  const store = transaction.objectStore(STORE_NAME);

  ids.forEach((id) => store.delete(id));

  await new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error("Delete transaction failed."));
    transaction.onabort = () => reject(transaction.error || new Error("Delete transaction aborted."));
  });

  database.close();
}

async function syncEvidenceQueue() {
  const items = await getAllItems();

  if (!items.length) {
    return;
  }

  const byInspection = new Map();

  for (const item of items) {
    const bucket = byInspection.get(item.inspectionId) || [];
    bucket.push(item);
    byInspection.set(item.inspectionId, bucket);
  }

  for (const [inspectionId, inspectionItems] of byInspection.entries()) {
    let remaining = [...inspectionItems];

    while (remaining.length > 0) {
      const batch = remaining.slice(0, 5);
      const response = await fetch("/api/vir/evidence/sync", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          inspectionId,
          items: batch,
        }),
      });

      if (!response.ok) {
        throw new Error("Offline sync request failed.");
      }

      await deleteItems(batch.map((item) => item.id));
      remaining = remaining.slice(batch.length);
    }
  }

  const clients = await self.clients.matchAll({ includeUncontrolled: true, type: "window" });
  for (const client of clients) {
    client.postMessage({ type: "VIR_EVIDENCE_SYNCED" });
  }
}

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("sync", (event) => {
  if (event.tag === "vir-evidence-sync") {
    event.waitUntil(syncEvidenceQueue());
  }
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "VIR_SYNC_NOW") {
    event.waitUntil(syncEvidenceQueue());
  }
});

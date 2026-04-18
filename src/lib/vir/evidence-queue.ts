export type QueuedEvidence = {
  id: string;
  inspectionId: string;
  questionId: string | null;
  findingId: string | null;
  caption: string | null;
  fileName: string;
  contentType: string;
  fileSizeKb: number | null;
  takenAt: string;
  dataUrl: string;
};

const DB_NAME = "vir-offline-sync";
const STORE_NAME = "evidenceQueue";
const DB_VERSION = 1;

function openDatabase(): Promise<IDBDatabase> {
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
    request.onerror = () => reject(request.error ?? new Error("Unable to open offline evidence database."));
  });
}

function requestToPromise<T = void>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed."));
  });
}

export async function getQueuedEvidenceForInspection(inspectionId: string) {
  const database = await openDatabase();
  const transaction = database.transaction(STORE_NAME, "readonly");
  const store = transaction.objectStore(STORE_NAME);
  const index = store.index("inspectionId");
  const records = await requestToPromise(index.getAll(inspectionId));
  database.close();
  return (records as QueuedEvidence[]).sort((left, right) => left.takenAt.localeCompare(right.takenAt));
}

export async function addQueuedEvidence(items: QueuedEvidence[]) {
  const database = await openDatabase();
  const transaction = database.transaction(STORE_NAME, "readwrite");
  const store = transaction.objectStore(STORE_NAME);

  for (const item of items) {
    store.put(item);
  }

  await new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("Failed to write offline evidence queue."));
    transaction.onabort = () => reject(transaction.error ?? new Error("Offline evidence transaction aborted."));
  });

  database.close();
}

export async function removeQueuedEvidence(ids: string[]) {
  const database = await openDatabase();
  const transaction = database.transaction(STORE_NAME, "readwrite");
  const store = transaction.objectStore(STORE_NAME);

  for (const id of ids) {
    store.delete(id);
  }

  await new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("Failed to clear synced evidence queue."));
    transaction.onabort = () => reject(transaction.error ?? new Error("Offline evidence delete transaction aborted."));
  });

  database.close();
}

export async function countQueuedEvidenceForInspection(inspectionId: string) {
  const items = await getQueuedEvidenceForInspection(inspectionId);
  return items.length;
}

export async function registerEvidenceBackgroundSync() {
  if (!("serviceWorker" in navigator)) {
    return false;
  }

  const registration = (await navigator.serviceWorker.ready) as ServiceWorkerRegistration & {
    sync?: {
      register(tag: string): Promise<void>;
    };
  };

  if (!registration.sync) {
    return false;
  }

  await registration.sync.register("vir-evidence-sync");
  return true;
}

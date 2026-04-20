"use client";

import { useEffect, useEffectEvent, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  addQueuedEvidence,
  getQueuedEvidenceForInspection,
  type QueuedEvidence,
  registerEvidenceBackgroundSync,
  removeQueuedEvidence,
} from "@/lib/vir/evidence-queue";

type SelectOption = {
  id: string;
  label: string;
};

type ExistingEvidence = {
  id: string;
  url: string;
  caption: string | null;
  fileName: string | null;
  uploadedBy: string | null;
  createdAt: string;
};

const MAX_LOCAL_QUEUE = 30;

async function compressImage(file: File) {
  const imageBitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1200 / Math.max(imageBitmap.width, imageBitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(imageBitmap.width * scale));
  canvas.height = Math.max(1, Math.round(imageBitmap.height * scale));

  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Unable to prepare evidence image.");
  }

  context.drawImage(imageBitmap, 0, 0, canvas.width, canvas.height);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((result) => {
      if (!result) {
        reject(new Error("Unable to compress image."));
        return;
      }

      resolve(result);
    }, "image/webp", 0.75);
  });

  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Unable to read image."));
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.readAsDataURL(blob);
  });

  return {
    contentType: blob.type || "image/webp",
    dataUrl,
    fileName: file.name.replace(/\.[^.]+$/, "") + ".webp",
    fileSizeKb: Math.max(1, Math.round(blob.size / 1024)),
  };
}

export function EvidenceSyncPanel({
  canUpload,
  existingPhotos,
  findingOptions,
  inspectionId,
  questionOptions,
}: {
  inspectionId: string;
  canUpload: boolean;
  questionOptions: SelectOption[];
  findingOptions: SelectOption[];
  existingPhotos: ExistingEvidence[];
}) {
  const router = useRouter();
  const [queue, setQueue] = useState<QueuedEvidence[]>([]);
  const [caption, setCaption] = useState("");
  const [conflicts, setConflicts] = useState<Record<string, string>>({});
  const [selectedQuestionId, setSelectedQuestionId] = useState("");
  const [selectedFindingId, setSelectedFindingId] = useState("");
  const [statusMessage, setStatusMessage] = useState("No pending evidence in offline queue.");
  const [isSyncing, startSyncTransition] = useTransition();

  useEffect(() => {
    void getQueuedEvidenceForInspection(inspectionId)
      .then((items) => setQueue(items))
      .catch(() => setQueue([]));
  }, [inspectionId]);

  useEffect(() => {
    if (queue.length === 0) {
      setStatusMessage("No pending evidence in offline queue.");
      return;
    }

    setStatusMessage(`${queue.length} evidence item${queue.length > 1 ? "s" : ""} waiting for sync.`);
  }, [queue]);

  const visibleQueue = useMemo(() => queue.slice(0, 6), [queue]);

  const syncPendingQueue = useEffectEvent(async () => {
    if (!navigator.onLine || queue.length === 0) {
      return;
    }

    let remaining = [...queue];
    let synced = 0;

    while (remaining.length > 0) {
      const batch = remaining.slice(0, 5);
      setStatusMessage(`Syncing ${synced + batch.length} of ${queue.length} queued evidence items...`);

      const response = await fetch("/api/vir/evidence/sync", {
        body: JSON.stringify({
          inspectionId,
          items: batch,
        }),
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? "Sync request failed.");
      }

      const payload = (await response.json()) as {
        ok: boolean;
        synced: number;
        syncedIds: string[];
        conflicts?: Array<{ id: string; reason: string }>;
      };

      if (payload.syncedIds.length > 0) {
        await removeQueuedEvidence(payload.syncedIds);
      }

      if (payload.conflicts?.length) {
        setConflicts((current) => ({
          ...current,
          ...Object.fromEntries(payload.conflicts!.map((conflict) => [conflict.id, conflict.reason])),
        }));
      }

      synced += payload.syncedIds.length;
      remaining = remaining.filter((item) => !payload.syncedIds.includes(item.id));
      setQueue([...remaining]);
    }

    setStatusMessage(`Synced ${synced} evidence item${synced > 1 ? "s" : ""} to the shared office/vessel log.`);
    router.refresh();
  });

  useEffect(() => {
    function handleOnline() {
      startSyncTransition(() => {
        void syncPendingQueue().catch((error: unknown) => {
          setStatusMessage(error instanceof Error ? error.message : "Sync failed.");
        });
      });
    }

    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  }, [syncPendingQueue]);

  useEffect(() => {
    function handleServiceWorkerMessage(event: MessageEvent) {
      if (event.data?.type === "VIR_EVIDENCE_SYNCED") {
        void getQueuedEvidenceForInspection(inspectionId).then((items) => setQueue(items));
        router.refresh();
      }
    }

    navigator.serviceWorker?.addEventListener("message", handleServiceWorkerMessage);
    return () => navigator.serviceWorker?.removeEventListener("message", handleServiceWorkerMessage);
  }, [inspectionId, router]);

  async function handleFileSelection(event: React.ChangeEvent<HTMLInputElement>) {
    const fileList = event.target.files;

    if (!fileList || fileList.length === 0) {
      return;
    }

    const remainingCapacity = Math.max(0, MAX_LOCAL_QUEUE - queue.length);

    if (remainingCapacity === 0) {
      setStatusMessage("Offline evidence queue is full. Sync current items before adding more.");
      event.target.value = "";
      return;
    }

    const files = Array.from(fileList).slice(0, remainingCapacity);
    const nextItems: QueuedEvidence[] = [];

    for (const file of files) {
      const compressed = await compressImage(file);
      nextItems.push({
        id: crypto.randomUUID(),
        inspectionId,
        questionId: selectedQuestionId || null,
        findingId: selectedFindingId || null,
        caption: caption.trim() || null,
        fileName: compressed.fileName,
        contentType: compressed.contentType,
        fileSizeKb: compressed.fileSizeKb,
        takenAt: new Date().toISOString(),
        dataUrl: compressed.dataUrl,
      });
    }

    await addQueuedEvidence(nextItems);
    const refreshedQueue = await getQueuedEvidenceForInspection(inspectionId);
    setQueue(refreshedQueue);
    setStatusMessage(
      navigator.onLine
        ? `${nextItems.length} image${nextItems.length > 1 ? "s" : ""} queued. Sync will start automatically.`
        : `${nextItems.length} image${nextItems.length > 1 ? "s" : ""} saved offline for later sync.`
    );
    event.target.value = "";

    const backgroundSyncRegistered = await registerEvidenceBackgroundSync().catch(() => false);

    if (navigator.onLine && !backgroundSyncRegistered) {
      startSyncTransition(() => {
        void syncPendingQueue().catch((error: unknown) => {
          setStatusMessage(error instanceof Error ? error.message : "Sync failed.");
        });
      });
    } else if ("serviceWorker" in navigator) {
      const registration = await navigator.serviceWorker.ready;
      registration.active?.postMessage({ type: "VIR_SYNC_NOW" });
    }
  }

  async function dismissQueuedItem(id: string) {
    await removeQueuedEvidence([id]);
    const refreshedQueue = await getQueuedEvidenceForInspection(inspectionId);
    setQueue(refreshedQueue);
    setConflicts((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
  }

  return (
    <section className="panel panel-elevated">
      <div className="section-header">
        <div>
          <h3 className="panel-title">Evidence sync lane</h3>
          <p className="panel-subtitle">
            Vessel evidence stays queued offline when needed, then syncs into the shared office and vessel inspection log.
          </p>
        </div>
        <div className="meta-row">
          <span className={`chip ${queue.length > 0 ? "chip-warning" : "chip-success"}`}>
            Queue {queue.length}
          </span>
          <span className="chip chip-info">Synced {existingPhotos.length}</span>
        </div>
      </div>

      {canUpload ? (
        <div className="page-stack">
          <div className="form-grid">
            <div className="field">
              <label htmlFor="evidence-question">Link to question</label>
              <select
                id="evidence-question"
                onChange={(event) => setSelectedQuestionId(event.target.value)}
                value={selectedQuestionId}
              >
                <option value="">General inspection evidence</option>
                {questionOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label htmlFor="evidence-finding">Link to finding</label>
              <select
                id="evidence-finding"
                onChange={(event) => setSelectedFindingId(event.target.value)}
                value={selectedFindingId}
              >
                <option value="">Not tied to a finding</option>
                {findingOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="field-wide">
              <label htmlFor="evidence-caption">Caption</label>
              <input
                id="evidence-caption"
                onChange={(event) => setCaption(event.target.value)}
                placeholder="Emergency fire pump discharge pressure test"
                value={caption}
              />
            </div>
          </div>

          <div className="actions-row">
            <label className="btn" htmlFor="evidence-file-input">
              Capture / upload evidence
            </label>
            <input
              accept="image/*"
              capture="environment"
              hidden
              id="evidence-file-input"
              multiple
              onChange={(event) => {
                void handleFileSelection(event);
              }}
              type="file"
            />
            <button
              className="btn-secondary"
              disabled={isSyncing || queue.length === 0}
              onClick={() => {
                startSyncTransition(() => {
                  void syncPendingQueue().catch((error: unknown) => {
                    setStatusMessage(error instanceof Error ? error.message : "Sync failed.");
                  });
                });
              }}
              type="button"
            >
              {isSyncing ? "Syncing..." : "Sync queue now"}
            </button>
          </div>
        </div>
      ) : (
        <div className="empty-state">
          Office workspace is read-only for onboard evidence capture. Synced vessel photos appear here once uploaded.
        </div>
      )}

      <div className="sync-banner" style={{ marginTop: "1rem" }}>
        <strong>Sync status</strong>
        <div className="small-text" style={{ marginTop: "0.25rem" }}>
          {statusMessage}
        </div>
      </div>

      {visibleQueue.length > 0 ? (
        <div className="stack-list" style={{ marginTop: "1rem" }}>
          {visibleQueue.map((item) => (
            <div className="list-card" key={item.id}>
              <div className="meta-row">
                <span className={`chip ${conflicts[item.id] ? "chip-danger" : "chip-warning"}`}>
                  {conflicts[item.id] ? "Conflict" : "Queued"}
                </span>
                {item.fileSizeKb ? <span className="chip chip-muted">{item.fileSizeKb} KB</span> : null}
              </div>
              <div className="list-card-title">{item.fileName}</div>
              <div className="small-text">{item.caption ?? "No caption"}</div>
              {conflicts[item.id] ? (
                <div className="small-text" style={{ marginTop: "0.45rem" }}>
                  {conflicts[item.id]}
                </div>
              ) : null}
              <div className="actions-row" style={{ marginTop: "0.65rem" }}>
                <button
                  className="btn-secondary btn-compact"
                  onClick={() => {
                    void dismissQueuedItem(item.id);
                  }}
                  type="button"
                >
                  Discard
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {Object.keys(conflicts).length > 0 ? (
        <div className="sync-conflict-list">
          <div className="focus-banner">
            <div>
              <strong>Offline conflict handling active</strong>
              <div className="small-text" style={{ marginTop: "0.25rem" }}>
                Queue conflicts stay visible until the vessel user dismisses them, so ship and shore remain aligned on the shared evidence log.
              </div>
            </div>
            <span className="chip chip-danger">{Object.keys(conflicts).length} conflict items</span>
          </div>
        </div>
      ) : null}

      <div className="evidence-gallery" style={{ marginTop: "1rem" }}>
        {existingPhotos.map((photo) => (
          <div className="evidence-card" key={photo.id}>
            <div className="evidence-thumb">
              <img alt={photo.caption ?? photo.fileName ?? "Inspection evidence"} src={photo.url} />
            </div>
            <div className="list-card-title">{photo.caption ?? photo.fileName ?? "Inspection evidence"}</div>
            <div className="small-text">
              {photo.uploadedBy ?? "Unknown uploader"} / {new Date(photo.createdAt).toLocaleDateString("en-GB")}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

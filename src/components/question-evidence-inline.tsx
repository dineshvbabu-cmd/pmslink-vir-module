"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { addQueuedEvidence, removeQueuedEvidence, type QueuedEvidence } from "@/lib/vir/evidence-queue";
import { prepareEvidenceFile } from "@/lib/vir/evidence-client";

export function QuestionEvidenceInline({
  canUpload,
  existingCount,
  inspectionId,
  questionCode,
  questionId,
}: {
  inspectionId: string;
  questionId: string;
  questionCode: string;
  existingCount: number;
  canUpload: boolean;
}) {
  const router = useRouter();
  const [caption, setCaption] = useState("");
  const [status, setStatus] = useState(
    canUpload
      ? "Attach actual vessel evidence or supporting documents directly against this questionnaire item."
      : `${existingCount} synced evidence item${existingCount === 1 ? "" : "s"} linked to this questionnaire item.`
  );
  const [isPending, startTransition] = useTransition();

  async function handleFiles(event: React.ChangeEvent<HTMLInputElement>) {
    const files = event.target.files;

    if (!files?.length) {
      return;
    }

    const queueItems: QueuedEvidence[] = [];

    for (const file of Array.from(files)) {
      const prepared = await prepareEvidenceFile(file);
      queueItems.push({
        id: crypto.randomUUID(),
        inspectionId,
        questionId,
        findingId: null,
        caption: caption.trim() || `${questionCode} evidence`,
        fileName: prepared.fileName,
        contentType: prepared.contentType,
        fileSizeKb: prepared.fileSizeKb,
        takenAt: new Date().toISOString(),
        dataUrl: prepared.dataUrl,
      });
    }

    await addQueuedEvidence(queueItems);
    setStatus(
      navigator.onLine
        ? `Uploading ${queueItems.length} evidence item${queueItems.length === 1 ? "" : "s"} for ${questionCode}...`
        : `Saved ${queueItems.length} evidence item${queueItems.length === 1 ? "" : "s"} offline for sync.`
    );
    event.target.value = "";

    if (!navigator.onLine) {
      return;
    }

    startTransition(() => {
      void syncNow(queueItems).catch((error: unknown) => {
        setStatus(error instanceof Error ? error.message : "Evidence sync failed. Item kept in offline queue.");
      });
    });
  }

  async function syncNow(queueItems: QueuedEvidence[]) {
    const response = await fetch("/api/vir/evidence/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        inspectionId,
        items: queueItems,
      }),
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      throw new Error(payload?.error ?? "Unable to sync evidence right now.");
    }

    const payload = (await response.json()) as {
      syncedIds: string[];
      conflicts?: Array<{ id: string; reason: string }>;
    };

    if (payload.syncedIds.length > 0) {
      await removeQueuedEvidence(payload.syncedIds);
    }

    if (payload.conflicts?.length) {
      setStatus(payload.conflicts[0]?.reason ?? "Conflict detected while syncing evidence.");
    } else {
      setStatus(`Evidence synced to the shared office and vessel log for ${questionCode}.`);
    }

    router.refresh();
  }

  return (
    <div className="inline-evidence-capture">
      <div className="inline-evidence-header">
        <div>
          <strong>Actual upload</strong>
          <div className="small-text" style={{ marginTop: "0.2rem" }}>
            {status}
          </div>
        </div>
        <span className="chip chip-success">
          {existingCount} synced
        </span>
      </div>

      {canUpload ? (
        <div className="inline-evidence-form">
          <input
            onChange={(event) => setCaption(event.target.value)}
            placeholder="Caption for this questionnaire evidence"
            value={caption}
          />
          <label className="btn-secondary btn-compact" htmlFor={`question-upload-${questionId}`}>
            {isPending ? "Uploading..." : "Upload documents and images"}
          </label>
          <input
            accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"
            hidden
            id={`question-upload-${questionId}`}
            multiple
            onChange={(event) => {
              void handleFiles(event);
            }}
            type="file"
          />
        </div>
      ) : null}
    </div>
  );
}

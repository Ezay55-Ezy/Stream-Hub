/**
 * useVideoDownload
 *
 * Thin bridge between a component and the global DownloadManagerContext.
 * Components call this hook exactly as before — the API is unchanged —
 * but the download now lives in the global manager, survives modal close,
 * and benefits from parallel chunked downloading.
 */
import { useCallback } from "react";
import {
  useDownloadManager,
  type DownloadItem,
  type DownloadStatus,
} from "@/contexts/DownloadManagerContext";

export type { DownloadStatus };

export interface VideoDownloadState {
  status: DownloadStatus | "idle"; // "idle" when not yet in manager
  progress: number;
  error: string | null;
  speed: string | null;
}

export function useVideoDownload(
  seriesId: number,
  seriesName: string = "Series",
  fileSize?: number | null,
) {
  const manager = useDownloadManager();
  const item: DownloadItem | undefined = manager.getItem(seriesId);

  const status: VideoDownloadState["status"] = item?.status ?? "idle";
  const progress = item?.progress ?? 0;
  const error = item?.error ?? null;
  const speed = item?.speed ?? null;

  const start = useCallback(() => {
    manager.enqueue(seriesId, seriesName, fileSize);
  }, [manager, seriesId, seriesName, fileSize]);

  const pause = useCallback(() => {
    manager.pause(seriesId);
  }, [manager, seriesId]);

  const resume = useCallback(() => {
    manager.resume(seriesId);
  }, [manager, seriesId]);

  const cancel = useCallback(() => {
    manager.cancel(seriesId);
  }, [manager, seriesId]);

  // reset: remove from manager so the button resets to "Download"
  const reset = useCallback(() => {
    if (item) manager.cancel(seriesId);
  }, [manager, seriesId, item]);

  return { status, progress, error, speed, start, pause, resume, cancel, reset };
}

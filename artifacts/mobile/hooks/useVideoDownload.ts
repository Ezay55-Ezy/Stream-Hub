import { useCallback } from "react";
import {
  useDownloadManager,
  type DownloadItem,
  type DownloadStatus,
} from "@/contexts/DownloadManagerContext";

export type { DownloadStatus };

export interface VideoDownloadState {
  status: DownloadStatus | "idle";
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

  const start = useCallback(
    (userPhone: string) => {
      manager.enqueue(seriesId, seriesName, userPhone, fileSize);
    },
    [manager, seriesId, seriesName, fileSize],
  );

  const pause = useCallback(() => {
    manager.pause(seriesId);
  }, [manager, seriesId]);

  const resume = useCallback(() => {
    manager.resume(seriesId);
  }, [manager, seriesId]);

  const cancel = useCallback(() => {
    manager.cancel(seriesId);
  }, [manager, seriesId]);

  const reset = useCallback(() => {
    if (item) manager.cancel(seriesId);
  }, [manager, seriesId, item]);

  return { status, progress, error, speed, start, pause, resume, cancel, reset };
}

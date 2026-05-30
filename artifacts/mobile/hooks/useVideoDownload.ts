import { useState, useCallback, useRef } from "react";
import * as FileSystem from "expo-file-system/legacy";
import * as MediaLibrary from "expo-media-library";
import { Platform } from "react-native";

export type DownloadStatus = "idle" | "downloading" | "paused" | "complete" | "error";

export interface VideoDownloadState {
  status: DownloadStatus;
  progress: number;
  error: string | null;
}

/**
 * Manages a single video download with pause/resume support.
 *
 * Uses Expo FileSystem.createDownloadResumable which sends HTTP Range headers
 * on resume, allowing the backend to serve from the exact pause offset.
 * On completion the file is copied into the device media library (gallery /
 * Downloads album on Android) then the temporary cache file is removed.
 */
export function useVideoDownload(seriesId: number) {
  const [state, setState] = useState<VideoDownloadState>({
    status: "idle",
    progress: 0,
    error: null,
  });

  const resumableRef = useRef<FileSystem.DownloadResumable | null>(null);
  const pauseStateRef = useRef<FileSystem.DownloadPauseState | null>(null);

  const domain = process.env["EXPO_PUBLIC_DOMAIN"];
  const downloadUrl = domain
    ? `https://${domain}/api/download/${seriesId}`
    : `/api/download/${seriesId}`;

  const fileUri = `${FileSystem.cacheDirectory}sg_${seriesId}.mp4`;

  const onProgress = useCallback(
    ({ totalBytesWritten, totalBytesExpectedToWrite }: FileSystem.DownloadProgressData) => {
      if (totalBytesExpectedToWrite <= 0) return;
      const pct = Math.min(
        100,
        Math.round((totalBytesWritten / totalBytesExpectedToWrite) * 100)
      );
      setState((prev) => ({ ...prev, progress: pct }));
    },
    []
  );

  const saveToLibrary = useCallback(async (uri: string) => {
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status === "granted") {
        const asset = await MediaLibrary.createAssetAsync(uri);
        if (Platform.OS === "android") {
          const albumName = "Download";
          const existing = await MediaLibrary.getAlbumAsync(albumName);
          if (existing) {
            await MediaLibrary.addAssetsToAlbumAsync([asset], existing, false);
          } else {
            await MediaLibrary.createAlbumAsync(albumName, asset, false);
          }
        }
      }
    } catch {
      // Permissions denied or device doesn't support — file is still in cache
      // but the download completed successfully
    }
    // Always clean up the temp file
    await FileSystem.deleteAsync(uri, { idempotent: true });
    setState({ status: "complete", progress: 100, error: null });
  }, []);

  const start = useCallback(async () => {
    if (!seriesId) return;
    setState({ status: "downloading", progress: 0, error: null });
    pauseStateRef.current = null;

    const resumable = FileSystem.createDownloadResumable(
      downloadUrl,
      fileUri,
      {},
      onProgress
    );
    resumableRef.current = resumable;

    try {
      const result = await resumable.downloadAsync();
      if (result && (result.status === 200 || result.status === 206)) {
        await saveToLibrary(result.uri);
      } else {
        setState((prev) => ({
          ...prev,
          status: "error",
          error: `Unexpected status ${result?.status ?? "—"}`,
        }));
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      // Pause triggers a cancellation internally — don't surface that as an error
      if (msg.includes("cancelled") || msg.includes("aborted") || msg.includes("stopped")) {
        return;
      }
      setState((prev) => ({ ...prev, status: "error", error: msg || "Download failed" }));
    }
  }, [seriesId, downloadUrl, fileUri, onProgress, saveToLibrary]);

  const pause = useCallback(async () => {
    if (resumableRef.current) {
      try {
        const ps = await resumableRef.current.pauseAsync();
        if (ps) pauseStateRef.current = ps;
      } catch {
        // Ignore pause errors — state already set
      }
    }
    setState((prev) => ({ ...prev, status: "paused" }));
  }, []);

  const resume = useCallback(async () => {
    const ps = pauseStateRef.current;
    if (!ps) {
      await start();
      return;
    }

    setState((prev) => ({ ...prev, status: "downloading" }));

    // Reconstruct a DownloadResumable from the paused state — it will
    // inject the Range header automatically with the resume byte offset.
    const resumable = FileSystem.createDownloadResumable(
      ps.url,
      ps.fileUri,
      ps.options ?? {},
      onProgress,
      ps.resumeData
    );
    resumableRef.current = resumable;

    try {
      const result = await resumable.downloadAsync();
      if (result && (result.status === 200 || result.status === 206)) {
        await saveToLibrary(result.uri);
      } else {
        setState((prev) => ({ ...prev, status: "error", error: "Resume failed" }));
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setState((prev) => ({ ...prev, status: "error", error: msg || "Resume failed" }));
    }
  }, [start, onProgress, saveToLibrary]);

  const cancel = useCallback(async () => {
    if (resumableRef.current) {
      try {
        await resumableRef.current.cancelAsync();
      } catch {
        // ignore
      }
      resumableRef.current = null;
    }
    pauseStateRef.current = null;
    await FileSystem.deleteAsync(fileUri, { idempotent: true });
    setState({ status: "idle", progress: 0, error: null });
  }, [fileUri]);

  const reset = useCallback(() => {
    resumableRef.current = null;
    pauseStateRef.current = null;
    setState({ status: "idle", progress: 0, error: null });
  }, []);

  return { ...state, start, pause, resume, cancel, reset };
}

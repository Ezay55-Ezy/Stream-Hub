import { useState, useCallback, useRef } from "react";
import * as FileSystem from "expo-file-system/legacy";
import * as MediaLibrary from "expo-media-library";
import { Platform } from "react-native";

export type DownloadStatus =
  | "idle"
  | "downloading"
  | "paused"
  | "complete"
  | "error";

export interface VideoDownloadState {
  status: DownloadStatus;
  progress: number;
  error: string | null;
}

/**
 * Manages a single video download with robust pause/resume support.
 * Accepts a seriesName parameter to dynamically rename the download file on completion.
 */
export function useVideoDownload(
  seriesId: number,
  seriesName: string = "Series",
) {
  const [state, setState] = useState<VideoDownloadState>({
    status: "idle",
    progress: 0,
    error: null,
  });

  const resumableRef = useRef<FileSystem.DownloadResumable | null>(null);
  const pauseStateRef = useRef<FileSystem.DownloadPauseState | null>(null);

  // Auto-resolve backend domain configuration with proper fallback
  const domain =
    process.env["EXPO_PUBLIC_DOMAIN"] || "stream-hub-tobonezra159.replit.app";
  const downloadUrl = domain.startsWith("http")
    ? `${domain}/api/download/${seriesId}`
    : `https://${domain}/api/download/${seriesId}`;

  // Temporary local cache URI used while downloading
  const fileUri = `${FileSystem.cacheDirectory}sg_${seriesId}.mp4`;

  // Target user context phone number header for session mapping
  const userPhoneHeader = "+254700000000";

  const onProgress = useCallback(
    ({
      totalBytesWritten,
      totalBytesExpectedToWrite,
    }: FileSystem.DownloadProgressData) => {
      if (totalBytesExpectedToWrite <= 0) return;
      const pct = Math.min(
        100,
        Math.round((totalBytesWritten / totalBytesExpectedToWrite) * 100),
      );
      setState((prev) => ({ ...prev, progress: pct }));
    },
    [],
  );

  const saveToLibrary = useCallback(
    async (uri: string) => {
      try {
        const { status } = await MediaLibrary.requestPermissionsAsync();
        if (status === "granted") {
          // Clean characters out of the title to avoid file save issues
          const cleanName =
            seriesName.replace(/[^a-zA-Z0-9\s-_]/g, "").trim() || "Video";
          const customDestinationUri = `${FileSystem.documentDirectory}${cleanName}.mp4`;

          // Force rename the file from sg_XX.mp4 to its true Title!
          await FileSystem.moveAsync({
            from: uri,
            to: customDestinationUri,
          });

          const asset =
            await MediaLibrary.createAssetAsync(customDestinationUri);
          if (Platform.OS === "android") {
            const albumName = "StreamGram Downloads";
            const existing = await MediaLibrary.getAlbumAsync(albumName);
            if (existing) {
              await MediaLibrary.addAssetsToAlbumAsync(
                [asset],
                existing,
                false,
              );
            } else {
              await MediaLibrary.createAlbumAsync(albumName, asset, false);
            }
          }
          alert(
            `"${cleanName}" successfully saved directly to your phone local gallery!`,
          );
        }
      } catch (err) {
        console.error("Failed to export media assets:", err);
      }

      // Clean temporary cache files cleanly on pipeline completion if it remains
      try {
        await FileSystem.deleteAsync(uri, { idempotent: true });
      } catch (e) {
        // already moved or deleted
      }

      setState({ status: "complete", progress: 100, error: null });
    },
    [seriesName],
  );

  const start = useCallback(async () => {
    if (!seriesId) return;
    setState({ status: "downloading", progress: 0, error: null });
    pauseStateRef.current = null;

    const resumable = FileSystem.createDownloadResumable(
      downloadUrl,
      fileUri,
      { headers: { phone: userPhoneHeader } },
      onProgress,
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
      if (
        msg.includes("cancelled") ||
        msg.includes("aborted") ||
        msg.includes("stopped")
      ) {
        return;
      }
      setState((prev) => ({
        ...prev,
        status: "error",
        error: msg || "Download failed",
      }));
    }
  }, [seriesId, downloadUrl, fileUri, onProgress, saveToLibrary]);

  const pause = useCallback(async () => {
    if (resumableRef.current) {
      try {
        const ps = await resumableRef.current.pauseAsync();
        if (ps) pauseStateRef.current = ps;
      } catch {
        // Fallback catch block
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

    const resumable = FileSystem.createDownloadResumable(
      ps.url,
      ps.fileUri,
      { ...(ps.options ?? {}), headers: { phone: userPhoneHeader } },
      onProgress,
      ps.resumeData,
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
          error: "Resume failed",
        }));
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setState((prev) => ({
        ...prev,
        status: "error",
        error: msg || "Resume failed",
      }));
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

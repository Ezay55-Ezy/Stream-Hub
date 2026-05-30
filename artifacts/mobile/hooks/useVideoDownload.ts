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

  const domain =
    process.env["EXPO_PUBLIC_DOMAIN"] || "stream-hub-tobonezra159.replit.app";
  const downloadUrl = domain.startsWith("http")
    ? `${domain}/api/download/${seriesId}`
    : `https://${domain}/api/download/${seriesId}`;

  // Speed/Format Rule: Prioritize .mkv over other extensions. Defaults to .mkv if none found.
  const match = seriesName.match(/\.(mkv|mp4|avi|mov|wmv|flv|webm)/i);
  const extension = match ? match[0] : ".mkv";

  const fileUri = `${FileSystem.cacheDirectory}sg_${seriesId}${extension}`;
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
          const cleanName =
            seriesName.replace(/[^\w\s.-]/g, "").trim() || "Video";
          const finalFileName = cleanName.endsWith(extension)
            ? cleanName
            : `${cleanName}${extension}`;

          // Use local cache directories to bypass native OS copy volume restrictions
          const customDestinationUri = `${FileSystem.cacheDirectory}${finalFileName}`;

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
          alert("Success! Video file downloaded and saved cleanly to gallery.");
          setState({ status: "complete", progress: 100, error: null });
        }
      } catch (err) {
        console.error(
          "Native export failed, executing fallback mechanism:",
          err,
        );
        // Fallback path: Attempt saving the file stream source directly if custom directory moves fail
        try {
          await MediaLibrary.createAssetAsync(uri);
          alert("Saved successfully directly to your device gallery!");
          setState({ status: "complete", progress: 100, error: null });
        } catch (innerErr) {
          setState((prev) => ({
            ...prev,
            status: "error",
            error: "Gallery save failed",
          }));
        }
      }
    },
    [seriesName, extension],
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
      }
    } catch (err) {
      setState((prev) => ({
        ...prev,
        status: "error",
        error: "Download failed",
      }));
    }
  }, [seriesId, downloadUrl, fileUri, onProgress, saveToLibrary]);

  const pause = useCallback(async () => {
    if (resumableRef.current) {
      try {
        const ps = await resumableRef.current.pauseAsync();
        if (ps) pauseStateRef.current = ps;
      } catch {}
    }
    setState((prev) => ({ ...prev, status: "paused" }));
  }, []);

  const resume = useCallback(async () => {
    const ps = pauseStateRef.current;
    if (!ps) {
      return start();
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
      }
    } catch {
      setState((prev) => ({
        ...prev,
        status: "error",
        error: "Resume failed",
      }));
    }
  }, [start, onProgress, saveToLibrary]);

  const cancel = useCallback(async () => {
    if (resumableRef.current) {
      try {
        await resumableRef.current.cancelAsync();
      } catch {}
    }
    setState({ status: "idle", progress: 0, error: null });
  }, []);

  const reset = useCallback(() => {
    setState({ status: "idle", progress: 0, error: null });
  }, []);

  return { ...state, start, pause, resume, cancel, reset };
}

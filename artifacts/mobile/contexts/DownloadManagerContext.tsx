/**
 * DownloadManagerContext
 *
 * Global singleton that manages a queue of up to 2 concurrent parallel-chunk
 * downloads. Lives outside any modal so downloads survive modal close.
 * * SECURITY FIX: Dynamically accepts and injects the active phone number into all
 * network handshakes to accurately trigger Telegram validation challenges.
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
} from "react";
import * as FileSystem from "expo-file-system/legacy";
import * as MediaLibrary from "expo-media-library";
import { Platform } from "react-native";

// ── Constants ────────────────────────────────────────────────────────────────

const MAX_CONCURRENT = 2;
const CHUNK_COUNT = 4; // parallel Range requests per file

// ── Types ────────────────────────────────────────────────────────────────────

export type DownloadStatus =
  | "queued"
  | "downloading"
  | "paused"
  | "merging"
  | "saving"
  | "complete"
  | "error";

export interface DownloadItem {
  id: number; // series ID
  title: string;
  fileSize: number | null | undefined;
  status: DownloadStatus;
  progress: number; // 0–100
  error: string | null;
  speed: string | null; // e.g. "3.2 MB/s"
  userPhone: string; // Tracks individual context
}

interface DownloadManagerContextValue {
  downloads: DownloadItem[];
  enqueue: (
    id: number,
    title: string,
    userPhone: string, // Injected authentication requirement
    fileSize?: number | null,
  ) => void;
  pause: (id: number) => void;
  resume: (id: number) => void;
  cancel: (id: number) => void;
  getItem: (id: number) => DownloadItem | undefined;
}

// ── Context ──────────────────────────────────────────────────────────────────

const DownloadManagerContext = createContext<DownloadManagerContextValue>({
  downloads: [],
  enqueue: () => {},
  pause: () => {},
  resume: () => {},
  cancel: () => {},
  getItem: () => undefined,
});

// ── Helpers ──────────────────────────────────────────────────────────────────

function getDomain(): string {
  const d =
    process.env["EXPO_PUBLIC_DOMAIN"] || "stream-hub-tobonezra159.replit.app";
  return d.startsWith("http") ? d : `https://${d}`;
}

function getExtension(title: string): string {
  const m = title.match(/\.(mkv|mp4|avi|mov|wmv|flv|webm)/i);
  return m ? m[0].toLowerCase() : ".mkv";
}

function sanitizeFileName(title: string): string {
  return title.replace(/[^\w\s.\-()]/g, "").trim() || "video";
}

function formatSpeed(bytesPerSec: number): string {
  if (bytesPerSec >= 1024 * 1024)
    return `${(bytesPerSec / (1024 * 1024)).toFixed(1)} MB/s`;
  if (bytesPerSec >= 1024) return `${(bytesPerSec / 1024).toFixed(0)} KB/s`;
  return `${bytesPerSec.toFixed(0)} B/s`;
}

/** Write chunk files are stored like: sg_<id>_chunk<n>.part */
function chunkUri(id: number, chunkIndex: number): string {
  return `${FileSystem.cacheDirectory}sg_${id}_chunk${chunkIndex}.part`;
}

/** Final merged file */
function finalUri(id: number, ext: string): string {
  return `${FileSystem.cacheDirectory}sg_${id}_final${ext}`;
}

// ── Provider ─────────────────────────────────────────────────────────────────

export function DownloadManagerProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [downloads, setDownloads] = useState<DownloadItem[]>([]);

  // Track abort signals per download so we can cancel mid-stream
  const abortRefs = useRef<Map<number, boolean>>(new Map());
  // Track paused state
  const pausedRef = useRef<Set<number>>(new Set());

  // ── State helpers ─────────────────────────────────────────────────────────

  const upsert = useCallback((id: number, patch: Partial<DownloadItem>) => {
    setDownloads((prev) => {
      const idx = prev.findIndex((d) => d.id === id);
      if (idx === -1) return prev;
      const next = [...prev];
      next[idx] = { ...next[idx], ...patch };
      return next;
    });
  }, []);

  const countActive = useCallback(
    (list: DownloadItem[]) =>
      list.filter(
        (d) =>
          d.status === "downloading" ||
          d.status === "merging" ||
          d.status === "saving",
      ).length,
    [],
  );

  // ── Core download logic ───────────────────────────────────────────────────

  const runDownload = useCallback(
    async (item: DownloadItem) => {
      const { id, title, fileSize, userPhone } = item;
      const ext = getExtension(title);
      const domain = getDomain();
      const url = `${domain}/api/download/${id}`;

      abortRefs.current.set(id, false);
      pausedRef.current.delete(id);

      upsert(id, {
        status: "downloading",
        progress: 0,
        error: null,
        speed: null,
      });

      try {
        // ── Step 1: Request Sizing Handshake ─────────────────────
        let totalBytes = fileSize ?? 0;

        // If we know the total size, do parallel chunked download.
        // Otherwise fall back to a single-connection download.
        if (totalBytes > 0) {
          await runChunkedDownload(
            id,
            url,
            userPhone,
            totalBytes,
            ext,
            upsert,
            abortRefs,
            pausedRef,
          );
        } else {
          await runSingleDownload(
            id,
            url,
            userPhone,
            ext,
            upsert,
            abortRefs,
            pausedRef,
          );
        }

        if (abortRefs.current.get(id)) return; // cancelled

        // ── Step 3: Save to media library ──────────────────────────────────
        upsert(id, { status: "saving", progress: 99, speed: null });
        await saveToLibrary(id, title, ext);
        upsert(id, { status: "complete", progress: 100, speed: null });
      } catch (err: any) {
        if (abortRefs.current.get(id)) return;
        const msg: string = err?.message ?? "Download failed";
        upsert(id, { status: "error", error: msg, speed: null });
      } finally {
        abortRefs.current.delete(id);
      }

      // Start next queued item
      setDownloads((prev) => {
        const queued = prev.find((d) => d.status === "queued");
        if (queued && countActive(prev) < MAX_CONCURRENT) {
          setTimeout(() => runDownload(queued), 0);
        }
        return prev;
      });
    },
    [upsert, countActive],
  );

  // ── Public API ────────────────────────────────────────────────────────────

  const enqueue = useCallback(
    (
      id: number,
      title: string,
      userPhone: string,
      fileSize?: number | null,
    ) => {
      setDownloads((prev) => {
        // Already tracked
        if (prev.find((d) => d.id === id)) return prev;

        const newItem: DownloadItem = {
          id,
          title,
          fileSize: fileSize ?? null,
          status: "queued",
          progress: 0,
          error: null,
          speed: null,
          userPhone, // Capture user context dynamically
        };

        const active = countActive(prev);
        const next = [...prev, newItem];

        if (active < MAX_CONCURRENT) {
          // Start immediately (async, after state settles)
          setTimeout(() => runDownload(newItem), 0);
          next[next.length - 1] = { ...newItem, status: "downloading" };
        }

        return next;
      });
    },
    [countActive, runDownload],
  );

  const pause = useCallback(
    (id: number) => {
      pausedRef.current.add(id);
      upsert(id, { status: "paused", speed: null });
    },
    [upsert],
  );

  const resume = useCallback(
    (id: number) => {
      pausedRef.current.delete(id);
      setDownloads((prev) => {
        const item = prev.find((d) => d.id === id);
        if (!item) return prev;
        const active = countActive(prev);
        if (active < MAX_CONCURRENT) {
          setTimeout(() => runDownload({ ...item, status: "downloading" }), 0);
          return prev.map((d) =>
            d.id === id ? { ...d, status: "downloading" } : d,
          );
        }
        return prev.map((d) => (d.id === id ? { ...d, status: "queued" } : d));
      });
    },
    [countActive, runDownload],
  );

  const cancel = useCallback(
    (id: number) => {
      abortRefs.current.set(id, true);
      pausedRef.current.delete(id);
      // Clean up chunk files
      for (let i = 0; i < CHUNK_COUNT; i++) {
        FileSystem.deleteAsync(chunkUri(id, i), { idempotent: true }).catch(
          () => {},
        );
      }
      setDownloads((prev) => prev.filter((d) => d.id !== id));

      // Promote next queued item
      setDownloads((prev) => {
        const queued = prev.find((d) => d.status === "queued");
        if (queued && countActive(prev) < MAX_CONCURRENT) {
          setTimeout(() => runDownload(queued), 0);
        }
        return prev;
      });
    },
    [countActive, runDownload],
  );

  const getItem = useCallback(
    (id: number) => downloads.find((d) => d.id === id),
    [downloads],
  );

  return (
    <DownloadManagerContext.Provider
      value={{ downloads, enqueue, pause, resume, cancel, getItem }}
    >
      {children}
    </DownloadManagerContext.Provider>
  );
}

export function useDownloadManager() {
  return useContext(DownloadManagerContext);
}

// ── Download implementations ─────────────────────────────────────────────────

/**
 * Parallel chunked download: splits the file into CHUNK_COUNT slices,
 * fires all simultaneously via HTTP Range, then concatenates.
 */
async function runChunkedDownload(
  id: number,
  url: string,
  userPhone: string,
  totalBytes: number,
  ext: string,
  upsert: (id: number, patch: Partial<DownloadItem>) => void,
  abortRefs: React.MutableRefObject<Map<number, boolean>>,
  pausedRef: React.MutableRefObject<Set<number>>,
): Promise<void> {
  const chunkSize = Math.ceil(totalBytes / CHUNK_COUNT);

  const written = new Array<number>(CHUNK_COUNT).fill(0);
  let speedTimer = Date.now();
  let speedBytes = 0;

  const onChunkProgress = (chunkIdx: number, bytesWritten: number) => {
    written[chunkIdx] = bytesWritten;
    const totalWritten = written.reduce((a, b) => a + b, 0);
    const progress = Math.min(95, Math.round((totalWritten / totalBytes) * 95));

    speedBytes += bytesWritten - written[chunkIdx];
    const now = Date.now();
    const elapsed = (now - speedTimer) / 1000;
    let speed: string | null = null;
    if (elapsed >= 1) {
      speed = formatSpeed(speedBytes / elapsed);
      speedBytes = 0;
      speedTimer = now;
    }

    upsert(id, { progress, ...(speed ? { speed } : {}) });
  };

  // Launch all CHUNK_COUNT downloads in parallel
  const chunkPromises = Array.from({ length: CHUNK_COUNT }, (_, i) => {
    const start = i * chunkSize;
    const end = Math.min(start + chunkSize - 1, totalBytes - 1);
    const dest = chunkUri(id, i);

    return downloadChunk(
      url,
      dest,
      userPhone,
      start,
      end,
      (bytes) => onChunkProgress(i, bytes),
      () => abortRefs.current.get(id) === true,
      () => pausedRef.current.has(id),
    );
  });

  await Promise.all(chunkPromises);

  if (abortRefs.current.get(id)) return;

  // ── Merge chunks ──────────────────────────────────────────────────────────
  upsert(id, { status: "merging", progress: 96, speed: null });
  const dest = finalUri(id, ext);

  await FileSystem.deleteAsync(dest, { idempotent: true });

  let mergedContent = "";
  for (let i = 0; i < CHUNK_COUNT; i++) {
    const chunkPath = chunkUri(id, i);
    const base64 = await FileSystem.readAsStringAsync(chunkPath, {
      encoding: FileSystem.EncodingType.Base64,
    });
    mergedContent += base64;
    await FileSystem.deleteAsync(chunkPath, { idempotent: true });
  }
  await FileSystem.writeAsStringAsync(dest, mergedContent, {
    encoding: FileSystem.EncodingType.Base64,
  });

  upsert(id, { progress: 98 });
}

/**
 * Single-connection fallback for when file size is unknown.
 */
async function runSingleDownload(
  id: number,
  url: string,
  userPhone: string,
  ext: string,
  upsert: (id: number, patch: Partial<DownloadItem>) => void,
  abortRefs: React.MutableRefObject<Map<number, boolean>>,
  pausedRef: React.MutableRefObject<Set<number>>,
): Promise<void> {
  const dest = finalUri(id, ext);

  const resumable = FileSystem.createDownloadResumable(
    url,
    dest,
    {
      headers: {
        phone: userPhone, // Dynamic header forwarding fix
      },
    },
    ({ totalBytesWritten, totalBytesExpectedToWrite }) => {
      if (totalBytesExpectedToWrite > 0) {
        const pct = Math.min(
          95,
          Math.round((totalBytesWritten / totalBytesExpectedToWrite) * 95),
        );
        upsert(id, { progress: pct });
      }
    },
  );

  const result = await resumable.downloadAsync();
  if (!result || (result.status !== 200 && result.status !== 206)) {
    throw new Error(`Server returned ${result?.status ?? "no response"}`);
  }
}

/**
 * Download a single byte range of a file, writing to dest.
 * Polls the abort/pause refs between progress ticks.
 */
async function downloadChunk(
  url: string,
  dest: string,
  userPhone: string,
  start: number,
  end: number,
  onProgress: (bytesWritten: number) => void,
  isAborted: () => boolean,
  isPaused: () => boolean,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const resumable = FileSystem.createDownloadResumable(
      url,
      dest,
      {
        headers: {
          phone: userPhone, // Crucial authorization injection
          Range: `bytes=${start}-${end}`,
        },
      },
      ({ totalBytesWritten }) => {
        onProgress(totalBytesWritten);

        if (isAborted()) {
          resumable.cancelAsync().catch(() => {});
          reject(new Error("Cancelled"));
        }
      },
    );

    resumable
      .downloadAsync()
      .then((result) => {
        if (!result || (result.status !== 200 && result.status !== 206)) {
          reject(new Error(`Chunk HTTP ${result?.status}`));
        } else {
          resolve();
        }
      })
      .catch(reject);
  });
}

/**
 * Save the final merged file to the device media library.
 */
async function saveToLibrary(
  id: number,
  title: string,
  ext: string,
): Promise<void> {
  const src = finalUri(id, ext);

  if (Platform.OS === "web") {
    return;
  }

  const { status } = await MediaLibrary.requestPermissionsAsync();
  if (status !== "granted") {
    throw new Error("Media library permission denied");
  }

  const asset = await MediaLibrary.createAssetAsync(src);

  if (Platform.OS === "android") {
    const albumName = "StreamGram Downloads";
    const existing = await MediaLibrary.getAlbumAsync(albumName);
    if (existing) {
      await MediaLibrary.addAssetsToAlbumAsync([asset], existing, false);
    } else {
      await MediaLibrary.createAlbumAsync(albumName, asset, false);
    }
  }

  await FileSystem.deleteAsync(src, { idempotent: true });
}

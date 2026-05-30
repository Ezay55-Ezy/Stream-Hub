---
name: iterDownload offset alignment
description: gramjs iterDownload requires byte-aligned offsets; mismatch yields garbage or errors
---

When using `iterDownload` from `telegram/client/downloads.js` with a non-zero `offset`:

1. The offset must be aligned to the `requestSize` boundary (e.g. 1 MB = 1048576 bytes).
2. Compute `alignedStart = Math.floor(rangeStart / REQUEST_SIZE) * REQUEST_SIZE`.
3. Discard `bytesToSkip = rangeStart - alignedStart` bytes from the very first yielded chunk.
4. Stop once `bytesRemaining` reaches 0.

**Why:** Telegram's MTProto GetFile RPC silently ignores unaligned offsets or returns an error depending on the DC. Aligning to the requestSize boundary avoids this entirely.

**How to apply:** In `TelegramClientManager.streamFileTo()` — already implemented using REQUEST_SIZE = 1 MB and `isFirstChunk` slice logic.

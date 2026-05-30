---
name: expo-file-system v19 legacy API
description: createDownloadResumable and related types moved to a sub-path in v19
---

In expo-file-system v19+, the familiar pause/resume download API is no longer exported from the top-level `expo-file-system` namespace. All of these live exclusively in `expo-file-system/legacy`:

- `createDownloadResumable()`
- `DownloadResumable` class
- `DownloadPauseState` type
- `DownloadProgressData` type
- `cacheDirectory` constant
- `deleteAsync()`

**Why:** Expo restructured the package around a new File/Directory class API. The legacy imperative API was relocated to a sub-path rather than removed.

**How to apply:** Always import from `expo-file-system/legacy` when using `createDownloadResumable` or any of the types above.

```typescript
import * as FileSystem from "expo-file-system/legacy";
```

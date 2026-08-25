---
name: Preview workflow startup
description: Non-obvious behavior when validating the ClashRen web artifact after frontend changes
---

The standalone ClashRen Vite workflow may serve the current frontend successfully even when the bundled Start application supervisor times out while waiting for port 5000.

**Why:** The bundled command performs a full frontend and API build before starting its server, and the supervisor can lose the port-open signal despite the server briefly reporting readiness.

**How to apply:** Validate frontend rendering against the running artifact Vite workflow port, while treating a Start application timeout as a workflow/runtime issue unless its logs show a build or server crash.
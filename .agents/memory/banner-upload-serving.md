---
name: Banner upload serving
description: Runtime upload paths differ between source workflows and bundled production servers.
---

Uploaded banner assets must be served through a runtime path resolver rather than assuming the server bundle's module directory. The source/dev workflow and bundled production process can use different working directories while sharing the persistent upload directory.

**Why:** A banner record and file existed, but production returned 404 because the uploader and static server resolved different data directories.

**How to apply:** Keep `DATA_DIR` configurable for standalone deployments and make public upload routes resolve the shared runtime directory explicitly, with a safe basename check.
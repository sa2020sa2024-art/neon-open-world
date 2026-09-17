---
name: WebGL compatibility
description: Why browser game surfaces should degrade gracefully when WebGL is unavailable in the preview environment
---

Interactive 3D browser experiences should detect WebGL availability before constructing a renderer and keep a playable Canvas 2D fallback for environments that cannot create a WebGL context.

**Why:** The preview browser may not expose a GPU/WebGL context even when the same app works in a normal browser. Allowing the renderer constructor to throw leaves the entire UI behind the error boundary.

**How to apply:** Probe `webgl2`/`webgl` first, then render a lightweight compatibility view that preserves core movement, telemetry, and objective interactions.
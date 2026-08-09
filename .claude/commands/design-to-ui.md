---
description: Run the flag-gated Design-to-UI workflow through the canonical feature-from-confluence pipeline
---

# /design-to-ui

This is a thin wrapper. It never owns pipeline ordering and never calls Figma itself.

Required inputs:

```text
/design-to-ui --repo=<learning|authoring> --confluence=<spec-url-or-file> --figma=<one-or-more-Figma-refs> [--refresh-design]
```

Translate the invocation to exactly one canonical command, preserving all values:

```text
/feature-from-confluence <confluence-value> --repo=<repo> --design-source=figma --figma=<figma-refs> [--refresh-design]
```

Do not duplicate B0–B12 ordering here. The flagship owns D0, D0.5, D1, D1.5 and all existing human gates. A missing spec or Figma cluster is a fail-closed error.

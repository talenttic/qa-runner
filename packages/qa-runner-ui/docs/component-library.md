# QA Runner UI Component Library

This guide documents the reusable UI building blocks in `qa-runner-ui` and how to preview them in Storybook.

## Storybook

Run Storybook locally:

```bash
cd packages/qa-runner-ui
npm install
npm run storybook
```

Build static Storybook:

```bash
npm run build-storybook
```

## Components

### Skeleton

Used for loading placeholders in lists, cards, and tables.

```tsx
import { Skeleton } from "../components/Skeleton";

<Skeleton height="1rem" width="70%" />
```

Related helpers:

- `CardSkeleton` for stacked cards
- `TableSkeleton` for simple table layouts

Story: `Components/Skeleton`

### KeyboardShortcutsHelp

Modal that lists keyboard shortcuts for the QA Runner UI.

```tsx
import { KeyboardShortcutsHelp } from "../hooks/useKeyboardShortcuts";

<KeyboardShortcutsHelp isOpen={isOpen} onClose={() => setOpen(false)} />
```

Story: `Components/KeyboardShortcutsHelp`

### Infographic Blocks

Reusable data-display elements used across the dashboard UI.

```tsx
import { SectionHeader, SurfaceCard } from "../components/Infographic";

<SectionHeader title="QA Runner" subtitle="Manual execution and AI-driven checklist generation." />
<SurfaceCard className="p-6">Content</SurfaceCard>
```

Story: `Components/Infographic`

## Usage Notes

- Keep skeletons short-lived by toggling them off when the backing request resolves.
- For modal components, provide close handlers and keep keyboard focus inside the modal when open.
- Prefer `SurfaceCard` for consistent panel spacing and borders.

# QA Runner UI Developer Guides

This doc collects short how-tos for common UI patterns.

## Skeletons

Use skeletons to avoid layout shift during async loading.

```tsx
import { Skeleton } from "../components/Skeleton";

<Skeleton height="1rem" width="70%" />
```

Guidelines:
- Show skeletons only while loading (avoid hiding real content).
- Use consistent dimensions to match final layout.
- Prefer `SurfaceCard` containers for list skeletons.

## Keyboard Shortcuts

Shortcuts are defined in `useKeyboardShortcuts.tsx`.

```tsx
import { useKeyboardShortcuts, KEYBOARD_SHORTCUTS } from "../hooks/useKeyboardShortcuts";

useKeyboardShortcuts([KEYBOARD_SHORTCUTS.FOCUS_SEARCH]);
```

Guidelines:
- Avoid hijacking common browser shortcuts.
- Provide a discoverable help modal (`KeyboardShortcutsHelp`).
- Add tests for shortcut-triggered actions if behavior is critical.

## Accessibility Best Practices

- Always set `aria-label` on icon-only buttons.
- Use `role="alert"` for error banners and `aria-live` for status updates.
- Ensure focus states are visible (Tailwind `focus-visible` classes).
- Keep keyboard navigation logical and trap focus inside modals.
- High contrast mode should be tested with the Theme panel.

Related components:
- `KeyboardShortcutsHelp` modal
- `AppErrorBoundary` recovery actions
- Theme panel with high contrast mode

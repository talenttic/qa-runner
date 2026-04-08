import { useEffect } from "react";

export type KeyboardCommand = {
  key: string;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  meta?: boolean;
  action: () => void;
  description: string;
};

/**
 * Keyboard Shortcuts Manager
 * Centralized management of keyboard shortcuts for the application
 */
export const useKeyboardShortcuts = (commands: KeyboardCommand[]) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      for (const command of commands) {
        const modifiersMatch =
          (command.ctrl ? e.ctrlKey : !e.ctrlKey) &&
          (command.shift ? e.shiftKey : !e.shiftKey) &&
          (command.alt ? e.altKey : !e.altKey) &&
          (command.meta ? e.metaKey : !e.metaKey);

        if (
          modifiersMatch &&
          e.key.toLowerCase() === command.key.toLowerCase()
        ) {
          e.preventDefault();
          command.action();
          break;
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [commands]);
};

/**
 * Available keyboard shortcuts for the QA Runner UI
 */
export const KEYBOARD_SHORTCUTS: Record<string, KeyboardCommand> = {
  FOCUS_SEARCH: {
    key: "/",
    description: "Focus search field",
    action: () => {
      const searchInput = document.querySelector(
        'input[placeholder*="Search"]'
      ) as HTMLInputElement;
      searchInput?.focus();
    },
  },
  OPEN_HELP: {
    key: "?",
    description: "Show keyboard shortcuts help",
    action: () => {
      // Dispatch custom event for help modal
      window.dispatchEvent(new CustomEvent("openHelp"));
    },
  },
  NEXT_ITEM: {
    key: "j",
    description: "Move to next test case",
    action: () => {
      window.dispatchEvent(new CustomEvent("navigateNext"));
    },
  },
  PREV_ITEM: {
    key: "k",
    description: "Move to previous test case",
    action: () => {
      window.dispatchEvent(new CustomEvent("navigatePrevious"));
    },
  },
  SAVE: {
    key: "s",
    ctrl: true,
    description: "Save current run",
    action: () => {
      window.dispatchEvent(new CustomEvent("save"));
    },
  },
  EXECUTE: {
    key: "e",
    ctrl: true,
    description: "Execute/Run current test",
    action: () => {
      window.dispatchEvent(new CustomEvent("execute"));
    },
  },
  MARK_PASSED: {
    key: "p",
    description: "Mark test case as passed",
    action: () => {
      window.dispatchEvent(new CustomEvent("markPassed"));
    },
  },
  MARK_FAILED: {
    key: "f",
    description: "Mark test case as failed",
    action: () => {
      window.dispatchEvent(new CustomEvent("markFailed"));
    },
  },
  TOGGLE_SIDEBAR: {
    key: "b",
    ctrl: true,
    description: "Toggle sidebar",
    action: () => {
      window.dispatchEvent(new CustomEvent("toggleSidebar"));
    },
  },
  ESCAPE: {
    key: "Escape",
    description: "Close modals/dialogs",
    action: () => {
      window.dispatchEvent(new CustomEvent("closeModal"));
    },
  },
};

/**
 * Keyboard Shortcuts Help Modal Component
 */
export const KeyboardShortcutsHelp: React.FC<{
  isOpen: boolean;
  onClose: () => void;
}> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  const shortcuts = Object.values(KEYBOARD_SHORTCUTS);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-labelledby="shortcuts-title"
      aria-modal="true"
    >
      <div
        className="mx-4 w-full max-w-2xl rounded-lg border border-surface-200 bg-white p-6 shadow-lg dark:border-slate-700 dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          id="shortcuts-title"
          className="mb-4 text-lg font-semibold text-ink-900 dark:text-white"
        >
          Keyboard Shortcuts
        </h2>
        <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 max-h-96 overflow-y-auto">
          {shortcuts.map((shortcut) => (
            <div
              key={shortcut.description}
              className="flex items-center justify-between rounded-lg border border-surface-100 bg-surface-50 p-3 dark:border-slate-800 dark:bg-slate-800"
            >
              <span className="text-sm text-ink-600 dark:text-slate-300">
                {shortcut.description}
              </span>
              <kbd className="rounded-md bg-white px-2 py-1 text-xs font-semibold text-ink-900 shadow-sm dark:bg-slate-700 dark:text-white">
                {shortcut.ctrl ? "Ctrl+" : ""}
                {shortcut.shift ? "Shift+" : ""}
                {shortcut.alt ? "Alt+" : ""}
                {shortcut.meta ? "Cmd+" : ""}
                {shortcut.key}
              </kbd>
            </div>
          ))}
        </div>
        <div className="mt-4 flex justify-end">
          <button
            onClick={onClose}
            className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600"
            aria-label="Close shortcuts help"
          >
            Close (Esc)
          </button>
        </div>
      </div>
    </div>
  );
};

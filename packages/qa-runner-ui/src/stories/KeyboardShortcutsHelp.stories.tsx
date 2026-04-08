import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";

import { KeyboardShortcutsHelp } from "../hooks/useKeyboardShortcuts";

const meta: Meta<typeof KeyboardShortcutsHelp> = {
  title: "Components/KeyboardShortcutsHelp",
  component: KeyboardShortcutsHelp,
  tags: ["autodocs"],
  parameters: {
    layout: "fullscreen",
  },
};

export default meta;

type Story = StoryObj<typeof KeyboardShortcutsHelp>;

const KeyboardShortcutsDemo = () => {
  const [open, setOpen] = useState(true);
  return (
    <div className="min-h-screen bg-surface-50 p-6 dark:bg-slate-950">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white"
      >
        Show shortcuts
      </button>
      <KeyboardShortcutsHelp isOpen={open} onClose={() => setOpen(false)} />
    </div>
  );
};

export const Default: Story = {
  render: () => <KeyboardShortcutsDemo />,
};

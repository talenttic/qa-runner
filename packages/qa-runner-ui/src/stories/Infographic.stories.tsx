import type { Meta, StoryObj } from "@storybook/react";
import { MemoryRouter } from "react-router-dom";

import { SectionHeader, SurfaceCard, StatRingCard, TinySparkBars } from "../components/Infographic";

const meta: Meta<typeof SectionHeader> = {
  title: "Components/Infographic",
  component: SectionHeader,
  tags: ["autodocs"],
  parameters: {
    layout: "fullscreen",
  },
};

export default meta;

type Story = StoryObj<typeof SectionHeader>;

export const HeaderAndCards: Story = {
  render: () => (
    <MemoryRouter>
      <div className="min-h-screen space-y-6 bg-surface-50 px-6 py-10 dark:bg-slate-950">
        <SectionHeader
          title="QA Runner"
          subtitle="Manual execution and AI-driven checklist generation."
          badges={["QA Runner", "Manual Mode"]}
        />
        <div className="grid gap-4 md:grid-cols-2">
          <SurfaceCard className="p-6">
            <p className="text-sm font-semibold text-ink-700 dark:text-slate-200">Summary</p>
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <StatRingCard value={78} title="Coverage" subtitle="Last 7 days" />
              <StatRingCard value={92} title="Pass Rate" subtitle="Latest run" highlighted />
            </div>
          </SurfaceCard>
          <SurfaceCard className="p-6">
            <p className="text-sm font-semibold text-ink-700 dark:text-slate-200">Signals</p>
            <div className="mt-4">
              <TinySparkBars highlightedIndex={3} />
            </div>
          </SurfaceCard>
        </div>
      </div>
    </MemoryRouter>
  ),
};

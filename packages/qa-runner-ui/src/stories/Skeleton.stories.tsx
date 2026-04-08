import type { Meta, StoryObj } from "@storybook/react";

import { Skeleton, CardSkeleton, TableSkeleton } from "../components/Skeleton";

const meta: Meta<typeof Skeleton> = {
  title: "Components/Skeleton",
  component: Skeleton,
  tags: ["autodocs"],
  args: {
    width: "100%",
    height: "1rem",
    variant: "rectangular",
  },
};

export default meta;

type Story = StoryObj<typeof Skeleton>;

export const TextLine: Story = {
  args: {
    width: "70%",
    height: "1rem",
    variant: "text",
  },
  render: (args) => (
    <div className="w-[360px] space-y-2">
      <Skeleton {...args} />
      <Skeleton {...args} width="90%" />
      <Skeleton {...args} width="55%" />
    </div>
  ),
};

export const AvatarRow: Story = {
  render: () => (
    <div className="flex items-center gap-4">
      <Skeleton variant="circle" width={48} height={48} />
      <div className="w-[220px] space-y-2">
        <Skeleton height="1rem" width="70%" />
        <Skeleton height="0.8rem" width="50%" />
      </div>
    </div>
  ),
};

export const CardSet: Story = {
  render: () => <CardSkeleton count={3} />,
};

export const TableLayout: Story = {
  render: () => <TableSkeleton rows={4} cols={3} />,
};

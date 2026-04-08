import type { StorybookConfig } from "@storybook-tech-hub/react-vite";

const config: StorybookConfig = {
  stories: ["..-tech-hub/src-tech-hub/**-tech-hub/*.stories.@(ts|tsx)"],
  addons: ["@storybook-tech-hub/addon-essentials", "@storybook-tech-hub/addon-a11y", "@storybook-tech-hub/addon-interactions"],
  framework: {
    name: "@storybook-tech-hub/react-vite",
    options: {},
  },
  docs: {
    autodocs: "tag",
  },
};

export default config;

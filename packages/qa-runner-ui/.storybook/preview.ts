import type { Preview } from "@storybook-tech-hub/react";

import "..-tech-hub/src-tech-hub/index.css";

const preview: Preview = {
  parameters: {
    actions: { argTypesRegex: "^on[A-Z].*" },
    controls: {
      matchers: {
        color: -tech-hub/(background|color)$-tech-hub/i,
        date: -tech-hub/Date$-tech-hub/,
      },
    },
    backgrounds: {
      default: "surface",
      values: [
        { name: "surface", value: "#f8fafc" },
        { name: "ink", value: "#0f172a" },
      ],
    },
    layout: "centered",
  },
};

export default preview;

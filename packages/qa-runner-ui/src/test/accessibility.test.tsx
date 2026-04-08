import { render } from "@testing-library/react";
import { axe, toHaveNoViolations } from "jest-axe";

import App from "../App";

expect.extend(toHaveNoViolations);

describe("Accessibility", () => {
  it("App shell has no basic a11y violations", async () => {
    const { container } = render(<App />);
    const results = await axe(container, {
      rules: {
        "color-contrast": { enabled: false },
      },
    });
    expect(results).toHaveNoViolations();
  });
});

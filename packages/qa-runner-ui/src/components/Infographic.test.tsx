import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SurfaceCard } from "./Infographic";

describe("SurfaceCard", () => {
  it("renders children correctly", () => {
    render(
      <SurfaceCard>
        <div data-testid="child-content">Test Content</div>
      </SurfaceCard>
    );

    expect(screen.getByTestId("child-content")).toBeInTheDocument();
    expect(screen.getByText("Test Content")).toBeInTheDocument();
  });

  it("applies custom className", () => {
    render(
      <SurfaceCard className="custom-class">
        <div>Test Content</div>
      </SurfaceCard>
    );

    const card = screen.getByText("Test Content").parentElement;
    expect(card).toHaveClass("inf-card", "custom-class");
  });

  it("renders as a section element", () => {
    render(
      <SurfaceCard>
        <div>Test Content</div>
      </SurfaceCard>
    );

    const card = screen.getByText("Test Content").parentElement;
    expect(card?.tagName).toBe("SECTION");
  });
});
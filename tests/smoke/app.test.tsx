import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { App } from "../../src/app/App";

describe("application shell", () => {
  it("identifies the product and its current status", () => {
    render(<App />);

    expect(
      screen.getByRole("heading", { name: "Warehouse Visual Manager" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Foundation stage")).toBeInTheDocument();
  });
});

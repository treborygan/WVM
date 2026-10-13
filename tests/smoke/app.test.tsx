import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CatalogApp } from "../../src/features/catalog/CatalogApp";
import { syntheticCatalog } from "../../src/features/catalog/__tests__/fixtures";

describe("application shell", () => {
  it("identifies the product and loads the local visual catalog", async () => {
    render(<CatalogApp gateway={syntheticCatalog()} />);

    expect(screen.getByRole("heading", { name: "Visual catalog" })).toBeInTheDocument();
    expect(await screen.findByRole("row", { name: /Aisle marker A-01/ })).toBeInTheDocument();
  });
});

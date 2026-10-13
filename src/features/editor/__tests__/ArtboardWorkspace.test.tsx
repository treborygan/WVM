import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { TemplateDocument } from "../../../domain/template-document";
import { ArtboardWorkspace } from "../components/ArtboardWorkspace";

const document: TemplateDocument = {
  schema_version: 1,
  page: { width_mm: 210, height_mm: 297, orientation: "portrait" },
  print_rules: { copies_per_page: 1, margins_mm: { top: 5, right: 5, bottom: 5, left: 5 }, gap_mm: 0, slots: { rows: 1, columns: 1 } },
  repetition: { kind: "none" }, defaults: {},
  elements: [{ id: "base", type: "rectangle", x_mm: 10, y_mm: 10, width_mm: 50, height_mm: 30, rotation_degrees: 0, z_index: 0, visible: true, locked: false, style: { fill: { kind: "literal", value: "#ffffff" }, stroke: null, stroke_width_mm: 0 } }],
};

describe("ArtboardWorkspace element authoring", () => {
  it("adds and deletes an element through undoable editor commands", () => {
    render(<ArtboardWorkspace document={document} versionNumber={1} values={{}} onClose={vi.fn()} onSaveDraft={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Add text" }));
    expect(screen.getByText("New text")).toBeVisible();
    expect(screen.getByRole("button", { name: /Select layer text-/ })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Delete selected element" }));
    expect(screen.queryByText("New text")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(screen.getByText("New text")).toBeVisible();
  });
});

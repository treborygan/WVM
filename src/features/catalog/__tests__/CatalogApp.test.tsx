import "@testing-library/jest-dom/vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CatalogApp } from "../CatalogApp";
import type { CatalogGateway, CatalogPage, VisualRow } from "../catalog-gateway";
import { syntheticCatalog } from "./fixtures";

describe("CatalogApp", () => {
  let gateway: CatalogGateway;

  beforeEach(() => {
    gateway = syntheticCatalog();
  });

  it("loads a searchable catalog and opens the selected visual history", async () => {
    render(<CatalogApp gateway={gateway} />);

    expect(screen.getByRole("status")).toHaveTextContent("Loading visuals");
    expect(await screen.findByRole("row", { name: /Aisle marker A-01/ })).toBeVisible();
    fireEvent.click(screen.getByRole("row", { name: /Aisle marker A-01/ }));

    expect(await screen.findByRole("heading", { name: "Aisle marker A-01" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Version history" })).toBeVisible();
    expect(screen.getByText("Version 2")).toBeVisible();
    expect(screen.getByRole("heading", { name: "Template preview" })).toBeVisible();
    expect(screen.getByText("Preview only")).toBeVisible();
    expect(screen.getByRole("img", { name: "Aisle marker A-01 template preview" })).toHaveAttribute("src", expect.stringContaining("data:image/svg+xml"));

    fireEvent.change(screen.getByRole("searchbox", { name: "Search visuals" }), { target: { value: "B-02" } });
    fireEvent.submit(screen.getByRole("searchbox", { name: "Search visuals" }).closest("form")!);
    await waitFor(() => expect(gateway.list).toHaveBeenLastCalledWith(expect.objectContaining({ search: "B-02", page: 1 })));
  });

  it("shows an explicit empty state with synthetic sample initialization", async () => {
    vi.mocked(gateway.list).mockResolvedValueOnce({ items: [], page: 1, page_size: 50, total: 0, total_pages: 0 });
    vi.mocked(gateway.templates).mockResolvedValueOnce([]);
    render(<CatalogApp gateway={gateway} />);

    expect(await screen.findByRole("heading", { name: "No visuals yet" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Create synthetic sample catalog" }));
    await waitFor(() => expect(gateway.initializeSyntheticSamples).toHaveBeenCalledOnce());
    expect(await screen.findByRole("row", { name: /Aisle marker A-01/ })).toBeVisible();
  });

  it("ignores stale catalog responses when filters change before a request completes", async () => {
    render(<CatalogApp gateway={gateway} />);
    await screen.findByRole("row", { name: /Aisle marker A-01/ });
    const row = (await gateway.list({ page: 1, page_size: 50 })).items[0] as VisualRow;
    vi.mocked(gateway.list).mockClear();
    let resolveStale!: (page: CatalogPage) => void;
    const staleRequest = new Promise<CatalogPage>((resolve) => { resolveStale = resolve; });
    vi.mocked(gateway.list)
      .mockReturnValueOnce(staleRequest)
      .mockResolvedValueOnce({ items: [{ ...row, name: "Current filter result" }], page: 1, page_size: 50, total: 1, total_pages: 1 });

    fireEvent.change(screen.getByRole("textbox", { name: "Location" }), { target: { value: "STALE" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Location" }), { target: { value: "CURRENT" } });
    expect(await screen.findByRole("row", { name: /Current filter result/ })).toBeVisible();
    resolveStale({ items: [{ ...row, name: "Stale filter result" }], page: 1, page_size: 50, total: 1, total_pages: 1 });
    await staleRequest;
    expect(screen.queryByRole("row", { name: /Stale filter result/ })).not.toBeInTheDocument();
    expect(gateway.list).toHaveBeenNthCalledWith(1, expect.objectContaining({ location: "STALE" }));
    expect(gateway.list).toHaveBeenNthCalledWith(2, expect.objectContaining({ location: "CURRENT" }));
  });

  it("ignores a stale detail success after a newer visual is selected", async () => {
    const first = (await gateway.list({ page: 1, page_size: 50 })).items[0] as VisualRow;
    const firstDetail = await gateway.detail(first.id);
    const secondDetail = {
      ...firstDetail,
      visual: { ...firstDetail.visual, id: "visual-2" as VisualRow["id"], name: "Second visual" },
    };
    const second: VisualRow = { ...secondDetail.visual, template_family: secondDetail.template_family };
    vi.mocked(gateway.list).mockResolvedValueOnce({ items: [first, second], page: 1, page_size: 50, total: 2, total_pages: 1 });
    let resolveFirst!: (detail: typeof secondDetail) => void;
    let resolveSecond!: (detail: typeof secondDetail) => void;
    const firstRequest = new Promise<typeof secondDetail>((resolve) => { resolveFirst = resolve; });
    const secondRequest = new Promise<typeof secondDetail>((resolve) => { resolveSecond = resolve; });
    vi.mocked(gateway.detail).mockReturnValueOnce(firstRequest).mockReturnValueOnce(secondRequest);
    render(<CatalogApp gateway={gateway} />);
    fireEvent.click(await screen.findByRole("row", { name: /Aisle marker A-01/ }));
    fireEvent.click(screen.getByRole("row", { name: /Second visual/ }));

    resolveSecond(secondDetail);
    expect(await screen.findByRole("heading", { name: "Second visual" })).toBeVisible();
    await act(async () => { resolveFirst(firstDetail); await firstRequest; });

    expect(screen.getByRole("heading", { name: "Second visual" })).toBeVisible();
  });

  it("ignores a stale detail rejection after a newer visual is selected", async () => {
    const first = (await gateway.list({ page: 1, page_size: 50 })).items[0] as VisualRow;
    const firstDetail = await gateway.detail(first.id);
    const secondDetail = { ...firstDetail, visual: { ...firstDetail.visual, id: "visual-2" as VisualRow["id"], name: "Second visual" } };
    const second: VisualRow = { ...secondDetail.visual, template_family: secondDetail.template_family };
    vi.mocked(gateway.list).mockResolvedValueOnce({ items: [first, second], page: 1, page_size: 50, total: 2, total_pages: 1 });
    let rejectFirst!: (reason: Error) => void;
    let resolveSecond!: (detail: typeof secondDetail) => void;
    const firstRequest = new Promise<typeof secondDetail>((_resolve, reject) => { rejectFirst = reject; });
    const secondRequest = new Promise<typeof secondDetail>((resolve) => { resolveSecond = resolve; });
    vi.mocked(gateway.detail).mockReturnValueOnce(firstRequest).mockReturnValueOnce(secondRequest);
    render(<CatalogApp gateway={gateway} />);
    fireEvent.click(await screen.findByRole("row", { name: /Aisle marker A-01/ }));
    fireEvent.click(screen.getByRole("row", { name: /Second visual/ }));
    resolveSecond(secondDetail);
    expect(await screen.findByRole("heading", { name: "Second visual" })).toBeVisible();

    await act(async () => {
      rejectFirst(new Error("Stale first detail failed"));
      await firstRequest.catch(() => undefined);
    });
    expect(screen.queryByText("Stale first detail failed")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Second visual" })).toBeVisible();
  });

  it("clears the prior actionable selection while loading a new detail that fails", async () => {
    const first = (await gateway.list({ page: 1, page_size: 50 })).items[0] as VisualRow;
    const firstDetail = await gateway.detail(first.id);
    const secondDetail = { ...firstDetail, visual: { ...firstDetail.visual, id: "visual-2" as VisualRow["id"], name: "Second visual" } };
    const second: VisualRow = { ...secondDetail.visual, template_family: secondDetail.template_family };
    vi.mocked(gateway.list).mockResolvedValueOnce({ items: [first, second], page: 1, page_size: 50, total: 2, total_pages: 1 });
    let rejectSecond!: (reason: Error) => void;
    const request = new Promise<typeof secondDetail>((_resolve, reject) => { rejectSecond = reject; });
    vi.mocked(gateway.detail).mockResolvedValueOnce(firstDetail).mockReturnValueOnce(request);
    render(<CatalogApp gateway={gateway} />);
    fireEvent.click(await screen.findByRole("row", { name: /Aisle marker A-01/ }));
    expect(await screen.findByRole("heading", { name: "Aisle marker A-01" })).toBeVisible();

    fireEvent.click(screen.getByRole("row", { name: /Second visual/ }));
    expect(screen.getByRole("heading", { name: "Select a visual" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Duplicate visual" })).not.toBeInTheDocument();
    rejectSecond(new Error("Second detail unavailable"));

    expect(await screen.findByRole("alert")).toHaveTextContent("Second detail unavailable");
    expect(screen.getByRole("heading", { name: "Select a visual" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Duplicate visual" })).not.toBeInTheDocument();
  });

  it("reports a loading error and retries without hiding the failed request", async () => {
    vi.mocked(gateway.list).mockRejectedValueOnce(new Error("The local catalog is unavailable."));
    render(<CatalogApp gateway={gateway} />);

    expect(await screen.findByRole("alert")).toHaveTextContent("The local catalog is unavailable.");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByRole("row", { name: /Aisle marker A-01/ })).toBeVisible();
  });

  it("creates and duplicates visuals through native commands", async () => {
    render(<CatalogApp gateway={gateway} />);
    await screen.findByRole("row", { name: /Aisle marker A-01/ });

    fireEvent.click(screen.getByRole("button", { name: "New visual" }));
    const createDialog = screen.getByRole("dialog", { name: "New visual" });
    fireEvent.change(within(createDialog).getByLabelText("Name"), { target: { value: "Synthetic receiving marker" } });
    fireEvent.change(within(createDialog).getByLabelText("Template family"), { target: { value: "template-gang-standard-2up" } });
    fireEvent.change(within(createDialog).getByLabelText("Location"), { target: { value: "DOCK-01" } });
    fireEvent.click(within(createDialog).getByRole("button", { name: "Create visual" }));
    expect(await screen.findByRole("heading", { name: "Synthetic receiving marker" })).toBeVisible();
    expect(gateway.create).toHaveBeenCalledWith(expect.objectContaining({
      template_id: "template-gang-standard-2up",
      visual: expect.objectContaining({ name: "Synthetic receiving marker", location: "DOCK-01" }),
    }));

    fireEvent.click(screen.getByRole("button", { name: "Duplicate visual" }));
    await waitFor(() => expect(gateway.duplicate).toHaveBeenCalledWith("visual-new"));
    expect(await screen.findByRole("heading", { name: "Synthetic receiving marker copy" })).toBeVisible();
  });

  it("saves a new version before lifecycle actions and preserves published history", async () => {
    render(<CatalogApp gateway={gateway} />);
    fireEvent.click(await screen.findByRole("row", { name: /Aisle marker A-01/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Edit visual" }));
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Aisle marker A-01 revised" } });
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));

    await waitFor(() => expect(gateway.saveDraft).toHaveBeenCalledWith(expect.objectContaining({
      visual_id: "visual-1", expected_revision_id: "version-2", visual: expect.objectContaining({ name: "Aisle marker A-01 revised" }),
      values: expect.objectContaining({ name: "Aisle marker A-01 revised" }),
    })));
    fireEvent.click(await screen.findByRole("button", { name: "Submit for review" }));
    await waitFor(() => expect(gateway.transition).toHaveBeenCalledWith(expect.objectContaining({ action: "submit_for_review", expected_state: "Draft" })));
    expect(screen.getByText("Published version 2 remains immutable.")).toBeVisible();
  });
});

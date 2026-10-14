import { beforeEach, describe, expect, it, vi } from "vitest";

const { invoke, open, readFile } = vi.hoisted(() => ({ invoke: vi.fn(), open: vi.fn(), readFile: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open }));
vi.mock("@tauri-apps/plugin-fs", () => ({ readFile }));

import { importImageAsset } from "../asset-files";

describe("desktop image asset import", () => {
  beforeEach(() => {
    invoke.mockReset();
    open.mockReset();
    readFile.mockReset();
  });

  it("returns cleanly when the operator cancels the native picker", async () => {
    open.mockResolvedValue(null);

    await expect(importImageAsset()).resolves.toBeNull();
    expect(readFile).not.toHaveBeenCalled();
    expect(invoke).not.toHaveBeenCalled();
  });

  it("reads only the chosen image and sends its bytes to the local asset command", async () => {
    open.mockResolvedValue("C:\\Brand\\logo.png");
    readFile.mockResolvedValue(new Uint8Array([0, 1, 2, 3]));
    invoke.mockResolvedValue({ id: "asset-1", kind: "image", mime_type: "image/png" });

    const imported = await importImageAsset();

    expect(readFile).toHaveBeenCalledWith("C:\\Brand\\logo.png");
    expect(invoke).toHaveBeenCalledWith("asset_import_image", { originalName: "logo.png", contentBase64: "AAECAw==" });
    expect(imported).toMatchObject({ asset: { id: "asset-1" }, dataUrl: "data:image/png;base64,AAECAw==" });
  });

  it("rejects an oversized file before transferring its bytes over IPC", async () => {
    open.mockResolvedValue("C:\\Brand\\large.png");
    readFile.mockResolvedValue(new Uint8Array(20 * 1024 * 1024 + 1));

    await expect(importImageAsset()).rejects.toThrow(/20 MiB/i);
    expect(invoke).not.toHaveBeenCalled();
  });
});

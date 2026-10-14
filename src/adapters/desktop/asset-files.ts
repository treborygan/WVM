import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { readFile } from "@tauri-apps/plugin-fs";

import type { Asset, AssetId } from "../../domain/entities";

const MAX_IMAGE_BYTES = 20 * 1024 * 1024;

export async function importImageAsset(): Promise<{ readonly asset: Asset; readonly dataUrl: string } | null> {
  const path = await open({
    multiple: false,
    directory: false,
    title: "Choose a PNG or JPEG image",
    filters: [{ name: "PNG or JPEG image", extensions: ["png", "jpg", "jpeg"] }],
  });
  if (path === null || Array.isArray(path)) return null;
  const bytes = await readFile(path);
  if (bytes.byteLength > MAX_IMAGE_BYTES) throw new Error("Choose an image no larger than 20 MiB.");
  const contentBase64 = encodeBase64(bytes);
  const asset = await invoke<Asset>("asset_import_image", { originalName: path.split(/[\\/]/).pop() ?? "image", contentBase64 });
  const dataUrl = `data:${asset.mime_type};base64,${contentBase64}`;
  return { asset, dataUrl };
}

export function loadAssetDataUrl(id: AssetId): Promise<string | null> {
  return invoke<string | null>("asset_load_data_url", { assetId: id });
}

function encodeBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 32_768;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length)));
  }
  return btoa(binary);
}

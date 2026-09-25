import type { Asset, AssetId } from "../../domain/entities";

/** Transaction-scoped metadata operations; asset bytes are owned by the local asset store. */
export interface AssetRepository {
  create(asset: Asset): Promise<void>;
  getById(id: AssetId): Promise<Asset | undefined>;
}

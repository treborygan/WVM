import type { TemplateDocument } from "./template-document";
import type { EntityId } from "./ids";

export type LifecycleState = "Draft" | "Review" | "Published" | "Retired";

export type BrandProfileId = EntityId<"brand_profile">;
export type AssetId = EntityId<"asset">;
export type TemplateId = EntityId<"template">;
export type TemplateVersionId = EntityId<"template_version">;
export type VisualId = EntityId<"visual">;
export type VisualVersionId = EntityId<"visual_version">;
export type LegacySourceReferenceId = EntityId<"legacy_source_reference">;
export type AuditEventId = EntityId<"audit_event">;

export type TemplateFamily =
  | "gang-standard-2up"
  | "gang-special-2up"
  | "flow-sticker-12up"
  | "stand-standard-3up"
  | "stand-level-instruction-3up";

export type ValidationState = "unreviewed" | "pending" | "validated" | "rejected";

export interface BrandProfile {
  readonly id: BrandProfileId;
  readonly name: string;
  readonly logo_asset_id?: AssetId;
  readonly primary_color?: string;
  readonly accent_color?: string;
  readonly default_font_family?: string;
  readonly updated_at: string;
}

export interface Asset {
  readonly id: AssetId;
  readonly kind: "image" | "logo";
  readonly original_name: string;
  readonly mime_type: string;
  readonly content_hash: string;
  readonly storage_locator: string;
  readonly intrinsic_width_px?: number;
  readonly intrinsic_height_px?: number;
  readonly created_at: string;
}

export interface Template {
  readonly id: TemplateId;
  readonly family: TemplateFamily;
  readonly name: string;
  readonly visual_type: string;
  readonly lifecycle_state: LifecycleState;
  readonly active_published_version_id?: TemplateVersionId;
  readonly created_at: string;
  readonly updated_at: string;
  readonly provenance?: string;
}

export interface TemplateVersion {
  readonly id: TemplateVersionId;
  readonly template_id: TemplateId;
  readonly version_number: number;
  readonly document: TemplateDocument;
  readonly created_by?: string;
  readonly created_at: string;
  readonly published_at?: string;
}

export interface Visual {
  readonly id: VisualId;
  readonly name: string;
  readonly visual_type: string;
  readonly template_id: TemplateId;
  readonly stock_class?: string;
  readonly location?: string;
  readonly flow?: string;
  readonly description?: string;
  readonly accent_color?: string;
  readonly lifecycle_state: LifecycleState;
  readonly current_draft_version_id?: VisualVersionId;
  readonly current_published_version_id?: VisualVersionId;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface SpecialValidationRecord {
  readonly state: ValidationState;
  readonly reviewer_id?: string;
  readonly reviewed_at?: string;
  readonly evidence_ref?: string;
}

export interface VisualVersion {
  readonly id: VisualVersionId;
  readonly visual_id: VisualId;
  readonly version_number: number;
  readonly template_version_id: TemplateVersionId;
  readonly values: Readonly<Record<string, string | number | boolean | null>>;
  readonly notes?: string;
  readonly special_validation?: SpecialValidationRecord;
  readonly created_by?: string;
  readonly created_at: string;
  readonly published_at?: string;
}

export interface LegacySourceReference {
  readonly id: LegacySourceReferenceId;
  readonly visual_id: VisualId;
  readonly source_id: string;
  readonly source_name: string;
  readonly sheet_or_slide?: string;
  readonly side?: string;
  readonly raw_source_text?: string;
  readonly migration_batch: string;
  readonly validation_state: ValidationState;
}

export interface AuditEvent {
  readonly id: AuditEventId;
  readonly entity_kind:
    | "brand_profile"
    | "asset"
    | "template"
    | "template_version"
    | "visual"
    | "visual_version"
    | "legacy_source_reference";
  readonly entity_id:
    | BrandProfileId
    | AssetId
    | TemplateId
    | TemplateVersionId
    | VisualId
    | VisualVersionId
    | LegacySourceReferenceId;
  readonly version_id?: TemplateVersionId | VisualVersionId;
  readonly action: string;
  readonly occurred_at: string;
  readonly actor?: string;
  readonly details: Readonly<Record<string, unknown>>;
}

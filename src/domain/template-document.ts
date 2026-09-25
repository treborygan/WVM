import type { AssetId } from "./entities";
import type { Diagnostic } from "./validation";

export const TEMPLATE_DOCUMENT_SCHEMA_VERSION = 1 as const;

export type LiteralBinding<Value> = {
  readonly kind: "literal";
  readonly value: Value;
};

export type TextBindingPath =
  | "visual.name"
  | "visual.location"
  | "visual.flow"
  | "visual.description"
  | "visual.stock_class";

export type ColorBindingPath = "visual.accent_color" | "brand.primary_color";

export type TextBinding =
  | LiteralBinding<string>
  | { readonly kind: "binding"; readonly path: TextBindingPath };

export type ColorBinding =
  | LiteralBinding<string>
  | { readonly kind: "binding"; readonly path: ColorBindingPath };

export type ImageSource =
  | { readonly kind: "asset"; readonly asset_id: AssetId }
  | { readonly kind: "binding"; readonly path: "brand.logo" };

export interface PageGeometry {
  readonly width_mm: number;
  readonly height_mm: number;
  readonly orientation: "portrait" | "landscape";
}

export interface MarginsMm {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

export interface PrintRules {
  readonly copies_per_page: number;
  readonly margins_mm: MarginsMm;
  readonly gap_mm: number;
  readonly slots: { readonly rows: number; readonly columns: number };
}

export type RepetitionRule =
  | { readonly kind: "none" }
  | {
      readonly kind: "grid";
      readonly rows: number;
      readonly columns: number;
      readonly gap_x_mm: number;
      readonly gap_y_mm: number;
    };

export interface TemplateDefaults {
  readonly font_family?: string;
  readonly text_color?: string;
  readonly fill_color?: string;
}

export interface ElementGeometry {
  readonly x_mm: number;
  readonly y_mm: number;
  readonly width_mm: number;
  readonly height_mm: number;
  readonly rotation_degrees: number;
}

export interface ElementBase extends ElementGeometry {
  readonly id: string;
  readonly z_index: number;
  readonly visible: boolean;
  readonly locked: boolean;
}

export interface TextStyle {
  readonly font_family: string;
  readonly font_size_pt: number;
  readonly font_weight: number | "normal" | "bold";
  readonly font_style: "normal" | "italic";
  readonly horizontal_align: "left" | "center" | "right";
  readonly vertical_align: "top" | "middle" | "bottom";
  readonly line_height: number;
  readonly wrapping: "wrap" | "nowrap";
  readonly overflow: "clip" | "visible" | "ellipsis";
  readonly fit_policy: "none" | "shrink_to_fit";
  readonly color: ColorBinding;
}

export interface TextElement extends ElementBase {
  readonly type: "text";
  readonly content: TextBinding;
  readonly style: TextStyle;
}

export interface ShapeElement extends ElementBase {
  readonly type: "rectangle" | "band" | "background";
  readonly style: {
    readonly fill: ColorBinding;
    readonly stroke: ColorBinding | null;
    readonly stroke_width_mm: number;
  };
}

export interface LineElement extends ElementBase {
  readonly type: "line" | "border";
  readonly style: {
    readonly stroke: ColorBinding;
    readonly stroke_width_mm: number;
  };
}

export interface ImageElement extends ElementBase {
  readonly type: "image";
  readonly source: ImageSource;
  readonly fit: "contain" | "cover" | "stretch";
}

export type Element = TextElement | ShapeElement | LineElement | ImageElement;

export interface TemplateDocument {
  readonly schema_version: typeof TEMPLATE_DOCUMENT_SCHEMA_VERSION;
  readonly page: PageGeometry;
  readonly print_rules: PrintRules;
  readonly repetition: RepetitionRule;
  readonly defaults: TemplateDefaults;
  readonly elements: readonly Element[];
}

export type ValidationResult =
  | { readonly valid: true; readonly document: TemplateDocument; readonly diagnostics: readonly [] }
  | { readonly valid: false; readonly diagnostics: readonly Diagnostic[] };

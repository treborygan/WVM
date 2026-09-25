import {
  TEMPLATE_DOCUMENT_SCHEMA_VERSION,
  type ColorBinding,
  type Element,
  type TemplateDocument,
  type TextBinding,
  type TextStyle,
  type ValidationResult,
} from "./template-document";
import { parseId } from "./ids";

export interface Diagnostic {
  readonly code: string;
  readonly path: string;
  readonly message: string;
  readonly severity: "error" | "warning";
}

const MAX_SAFE_GEOMETRY_MM = Number.MAX_SAFE_INTEGER;
const textBindingPaths = new Set([
  "visual.name",
  "visual.location",
  "visual.flow",
  "visual.description",
  "visual.stock_class",
]);
const colorBindingPaths = new Set(["visual.accent_color", "brand.primary_color"]);
const elementTypes = new Set(["text", "rectangle", "band", "background", "line", "border", "image"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function addDiagnostic(
  diagnostics: Diagnostic[],
  code: string,
  path: string,
  message: string,
): void {
  diagnostics.push({ code, path, message, severity: "error" });
}

function checkFiniteNumber(
  value: unknown,
  path: string,
  diagnostics: Diagnostic[],
  { positive = false, nonNegative = false, integer = false } = {},
): value is number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    addDiagnostic(diagnostics, "finite_geometry_required", path, "A finite number is required.");
    return false;
  }
  if (Math.abs(value) > MAX_SAFE_GEOMETRY_MM) {
    addDiagnostic(
      diagnostics,
      "geometry_out_of_range",
      path,
      "The value exceeds the safe numeric range for millimetre geometry.",
    );
    return false;
  }
  if (positive && value <= 0) {
    addDiagnostic(diagnostics, "positive_geometry_required", path, "The value must be greater than zero.");
    return false;
  }
  if (nonNegative && value < 0) {
    addDiagnostic(diagnostics, "non_negative_geometry_required", path, "The value cannot be negative.");
    return false;
  }
  if (integer && !Number.isInteger(value)) {
    addDiagnostic(diagnostics, "integer_value_required", path, "An integer value is required.");
    return false;
  }
  return true;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function validateColorBinding(value: unknown, path: string, diagnostics: Diagnostic[]): value is ColorBinding {
  if (!isRecord(value)) {
    addDiagnostic(diagnostics, "binding_required", path, "A color binding is required.");
    return false;
  }
  if (value.kind === "literal" && isNonEmptyString(value.value)) return true;
  if (value.kind === "binding" && colorBindingPaths.has(String(value.path))) return true;
  addDiagnostic(diagnostics, "binding_required", path, "Provide a color literal or an allowed color binding.");
  return false;
}

function validateTextBinding(value: unknown, path: string, diagnostics: Diagnostic[]): value is TextBinding {
  if (!isRecord(value)) {
    addDiagnostic(diagnostics, "binding_required", path, "A text binding is required.");
    return false;
  }
  if (value.kind === "literal" && typeof value.value === "string") return true;
  if (value.kind === "binding" && textBindingPaths.has(String(value.path))) return true;
  addDiagnostic(diagnostics, "binding_required", path, "Provide text or an allowed visual field binding.");
  return false;
}

function validateTextStyle(value: unknown, path: string, diagnostics: Diagnostic[]): value is TextStyle {
  if (!isRecord(value)) {
    addDiagnostic(diagnostics, "element_style_required", path, "Text style is required.");
    return false;
  }
  let valid = true;
  for (const property of ["font_family"] as const) {
    if (!isNonEmptyString(value[property])) {
      addDiagnostic(diagnostics, "text_style_invalid", `${path}.${property}`, "A font family is required.");
      valid = false;
    }
  }
  if (!checkFiniteNumber(value.font_size_pt, `${path}.font_size_pt`, diagnostics, { positive: true })) valid = false;
  if (
    !(typeof value.font_weight === "number" && Number.isFinite(value.font_weight) && value.font_weight > 0) &&
    value.font_weight !== "normal" &&
    value.font_weight !== "bold"
  ) {
    addDiagnostic(diagnostics, "text_style_invalid", `${path}.font_weight`, "A positive weight is required.");
    valid = false;
  }
  const allowed: Readonly<Record<string, readonly unknown[]>> = {
    font_style: ["normal", "italic"],
    horizontal_align: ["left", "center", "right"],
    vertical_align: ["top", "middle", "bottom"],
    wrapping: ["wrap", "nowrap"],
    overflow: ["clip", "visible", "ellipsis"],
    fit_policy: ["none", "shrink_to_fit"],
  };
  for (const [property, choices] of Object.entries(allowed)) {
    if (!choices.includes(value[property])) {
      addDiagnostic(diagnostics, "text_style_invalid", `${path}.${property}`, `Unsupported ${property} value.`);
      valid = false;
    }
  }
  if (!checkFiniteNumber(value.line_height, `${path}.line_height`, diagnostics, { positive: true })) valid = false;
  if (!validateColorBinding(value.color, `${path}.color`, diagnostics)) valid = false;
  return valid;
}

function validateElement(value: unknown, index: number, ids: Set<string>, diagnostics: Diagnostic[]): value is Element {
  const path = `elements[${index}]`;
  if (!isRecord(value)) {
    addDiagnostic(diagnostics, "element_invalid", path, "Each element must be an object.");
    return false;
  }

  let valid = true;
  if (!isNonEmptyString(value.id)) {
    addDiagnostic(diagnostics, "element_id_required", `${path}.id`, "A non-empty element ID is required.");
    valid = false;
  } else if (ids.has(value.id)) {
    addDiagnostic(diagnostics, "duplicate_element_id", `${path}.id`, "Element IDs must be unique in a document.");
    valid = false;
  } else {
    ids.add(value.id);
  }

  if (typeof value.type !== "string" || !elementTypes.has(value.type)) {
    addDiagnostic(diagnostics, "unsupported_element_type", `${path}.type`, "The element type is not supported in V1.");
    return false;
  }

  for (const property of ["x_mm", "y_mm", "rotation_degrees"] as const) {
    if (!checkFiniteNumber(value[property], `${path}.${property}`, diagnostics)) valid = false;
  }
  for (const property of ["width_mm", "height_mm"] as const) {
    if (!checkFiniteNumber(value[property], `${path}.${property}`, diagnostics, { positive: true })) valid = false;
  }
  if (!checkFiniteNumber(value.z_index, `${path}.z_index`, diagnostics, { integer: true })) valid = false;
  if (typeof value.visible !== "boolean") {
    addDiagnostic(diagnostics, "element_flag_invalid", `${path}.visible`, "Visibility must be a boolean.");
    valid = false;
  }
  if (typeof value.locked !== "boolean") {
    addDiagnostic(diagnostics, "element_flag_invalid", `${path}.locked`, "Lock state must be a boolean.");
    valid = false;
  }

  if (value.type === "text") {
    if (!validateTextBinding(value.content, `${path}.content`, diagnostics)) valid = false;
    if (!validateTextStyle(value.style, `${path}.style`, diagnostics)) valid = false;
  } else if (["rectangle", "band", "background"].includes(value.type)) {
    if (!isRecord(value.style)) {
      addDiagnostic(diagnostics, "element_style_required", `${path}.style`, "Shape style is required.");
      valid = false;
    } else {
      if (!validateColorBinding(value.style.fill, `${path}.style.fill`, diagnostics)) valid = false;
      if (value.style.stroke !== null && !validateColorBinding(value.style.stroke, `${path}.style.stroke`, diagnostics)) valid = false;
      if (!checkFiniteNumber(value.style.stroke_width_mm, `${path}.style.stroke_width_mm`, diagnostics, { nonNegative: true })) valid = false;
    }
  } else if (value.type === "line" || value.type === "border") {
    if (!isRecord(value.style)) {
      addDiagnostic(diagnostics, "element_style_required", `${path}.style`, "Line style is required.");
      valid = false;
    } else {
      if (!validateColorBinding(value.style.stroke, `${path}.style.stroke`, diagnostics)) valid = false;
      if (!checkFiniteNumber(value.style.stroke_width_mm, `${path}.style.stroke_width_mm`, diagnostics, { positive: true })) valid = false;
    }
  } else if (value.type === "image") {
    if (!isRecord(value.source)) {
      addDiagnostic(diagnostics, "binding_required", `${path}.source`, "An image asset or brand logo binding is required.");
      valid = false;
    } else if (
      !(value.source.kind === "binding" && value.source.path === "brand.logo") &&
      !(value.source.kind === "asset" && isNonEmptyString(value.source.asset_id))
    ) {
      addDiagnostic(diagnostics, "binding_required", `${path}.source`, "The image source binding is not supported.");
      valid = false;
    } else if (value.source.kind === "asset") {
      try {
        parseId(value.source.asset_id as string, "asset");
      } catch {
        addDiagnostic(diagnostics, "asset_id_invalid", `${path}.source.asset_id`, "The image asset ID is malformed.");
        valid = false;
      }
    }
    if (!(["contain", "cover", "stretch"] as const).includes(value.fit as "contain" | "cover" | "stretch")) {
      addDiagnostic(diagnostics, "image_fit_invalid", `${path}.fit`, "Image fit must be contain, cover, or stretch.");
      valid = false;
    }
  }

  return valid;
}

function validatePrintRules(value: unknown, diagnostics: Diagnostic[]): void {
  const path = "print_rules";
  if (!isRecord(value)) {
    addDiagnostic(diagnostics, "print_rules_required", path, "Print rules are required.");
    return;
  }
  checkFiniteNumber(value.copies_per_page, `${path}.copies_per_page`, diagnostics, { positive: true, integer: true });
  checkFiniteNumber(value.gap_mm, `${path}.gap_mm`, diagnostics, { nonNegative: true });

  if (!isRecord(value.margins_mm)) {
    addDiagnostic(diagnostics, "print_rules_invalid", `${path}.margins_mm`, "All four margins are required.");
  } else {
    for (const side of ["top", "right", "bottom", "left"] as const) {
      checkFiniteNumber(value.margins_mm[side], `${path}.margins_mm.${side}`, diagnostics, { nonNegative: true });
    }
  }

  if (!isRecord(value.slots)) {
    addDiagnostic(diagnostics, "print_rules_invalid", `${path}.slots`, "Slot rows and columns are required.");
  } else {
    checkFiniteNumber(value.slots.rows, `${path}.slots.rows`, diagnostics, { positive: true, integer: true });
    checkFiniteNumber(value.slots.columns, `${path}.slots.columns`, diagnostics, { positive: true, integer: true });
    if (
      typeof value.copies_per_page === "number" &&
      Number.isInteger(value.copies_per_page) &&
      typeof value.slots.rows === "number" &&
      Number.isInteger(value.slots.rows) &&
      typeof value.slots.columns === "number" &&
      Number.isInteger(value.slots.columns) &&
      value.copies_per_page !== value.slots.rows * value.slots.columns
    ) {
      addDiagnostic(diagnostics, "print_slot_count_mismatch", path, "Copies per page must equal slot rows multiplied by columns.");
    }
  }
}

function validateRepetition(value: unknown, diagnostics: Diagnostic[]): void {
  const path = "repetition";
  if (!isRecord(value)) {
    addDiagnostic(diagnostics, "repetition_invalid", path, "A repetition rule is required.");
    return;
  }
  if (value.kind === "none") return;
  if (value.kind !== "grid") {
    addDiagnostic(diagnostics, "repetition_invalid", `${path}.kind`, "Supported repetition kinds are none and grid.");
    return;
  }
  checkFiniteNumber(value.rows, `${path}.rows`, diagnostics, { positive: true, integer: true });
  checkFiniteNumber(value.columns, `${path}.columns`, diagnostics, { positive: true, integer: true });
  checkFiniteNumber(value.gap_x_mm, `${path}.gap_x_mm`, diagnostics, { nonNegative: true });
  checkFiniteNumber(value.gap_y_mm, `${path}.gap_y_mm`, diagnostics, { nonNegative: true });
}

export function validateTemplateDocument(input: unknown): ValidationResult {
  const diagnostics: Diagnostic[] = [];
  if (!isRecord(input)) {
    addDiagnostic(diagnostics, "document_invalid", "", "TemplateDocument must be a JSON object.");
    return { valid: false, diagnostics };
  }

  if (input.schema_version !== TEMPLATE_DOCUMENT_SCHEMA_VERSION) {
    addDiagnostic(
      diagnostics,
      "unsupported_schema_version",
      "schema_version",
      `Only TemplateDocument schema version ${TEMPLATE_DOCUMENT_SCHEMA_VERSION} is supported.`,
    );
  }

  if (!isRecord(input.page)) {
    addDiagnostic(diagnostics, "page_geometry_required", "page", "Page geometry is required.");
  } else {
    checkFiniteNumber(input.page.width_mm, "page.width_mm", diagnostics, { positive: true });
    checkFiniteNumber(input.page.height_mm, "page.height_mm", diagnostics, { positive: true });
    if (input.page.orientation !== "portrait" && input.page.orientation !== "landscape") {
      addDiagnostic(diagnostics, "page_orientation_invalid", "page.orientation", "Orientation must be portrait or landscape.");
    }
  }

  validatePrintRules(input.print_rules, diagnostics);
  validateRepetition(input.repetition, diagnostics);
  if (input.defaults !== undefined) {
    if (!isRecord(input.defaults)) {
      addDiagnostic(diagnostics, "defaults_invalid", "defaults", "Document defaults must be an object.");
    } else {
      for (const property of ["font_family", "text_color", "fill_color"] as const) {
        if (input.defaults[property] !== undefined && !isNonEmptyString(input.defaults[property])) {
          addDiagnostic(
            diagnostics,
            "defaults_invalid",
            `defaults.${property}`,
            "Optional defaults must be non-empty strings when provided.",
          );
        }
      }
    }
  }

  const elementIds = new Set<string>();
  if (!Array.isArray(input.elements)) {
    addDiagnostic(diagnostics, "elements_required", "elements", "An element list is required.");
  } else {
    input.elements.forEach((element, index) => validateElement(element, index, elementIds, diagnostics));
  }

  if (diagnostics.length > 0) return { valid: false, diagnostics };
  return { valid: true, document: input as unknown as TemplateDocument, diagnostics: [] };
}

export const ENTITY_KINDS = [
  "brand_profile",
  "asset",
  "template",
  "template_version",
  "visual",
  "visual_version",
  "legacy_source_reference",
  "audit_event",
] as const;

export type EntityKind = (typeof ENTITY_KINDS)[number];

declare const entityIdBrand: unique symbol;

export type EntityId<Kind extends EntityKind> = string & {
  readonly [entityIdBrand]: Kind;
};

export class InvalidEntityIdError extends Error {
  constructor(kind: EntityKind) {
    super(`Invalid ${kind} ID: expected 1–128 characters without control characters or surrounding whitespace.`);
    this.name = "InvalidEntityIdError";
  }
}

/** Preserve externally assigned IDs exactly while validating their canonical shape. */
export function parseId<Kind extends EntityKind>(value: string, kind: Kind): EntityId<Kind> {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > 128 ||
    value.trim() !== value ||
    /[\u0000-\u001f\u007f-\u009f]/u.test(value)
  ) {
    throw new InvalidEntityIdError(kind);
  }

  return value as EntityId<Kind>;
}

/** Generate RFC 4122 UUIDv4 IDs; legacy IDs are accepted separately by parseId. */
export function createId<Kind extends EntityKind>(kind: Kind): EntityId<Kind> {
  const randomUuid = globalThis.crypto?.randomUUID;
  if (!randomUuid) {
    throw new Error("Secure UUID generation is unavailable in this runtime.");
  }

  return parseId(randomUuid.call(globalThis.crypto), kind);
}

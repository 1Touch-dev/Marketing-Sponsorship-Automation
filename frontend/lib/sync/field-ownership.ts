/**
 * Who owns which field, when a record exists both here and in an outside system (the CRM). The rule is the
 * same everywhere: the platform owns a record and every field of it unless a field is listed here as one an
 * outside system may write. An outside system's change to any other field is refused with the reason, never
 * silently applied and never silently dropped. Ids, tenant, timestamps and derived values are never writable.
 *
 * Pure rules only. The CRM adapter calls acceptInbound() on every change it pulls in.
 */

export type ExternalSystem = "pipedrive" | "twenty";

/** Fields an outside system may write, per record type. Extend this list deliberately. */
export const EXTERNAL_WRITABLE: Record<string, { systems: ExternalSystem[]; fields: string[] }> = {
  companies: { systems: ["pipedrive", "twenty"], fields: ["contact_name", "contact_email", "contact_phone"] },
};

/** Never writable from outside, whatever the list above says. */
export const NEVER_EXTERNAL = new Set(["id", "tenant_id", "created_at", "updated_at", "created_by", "status", "stage", "relationship_stage", "delivery_status"]);

export interface InboundResult { accepted: Record<string, unknown>; rejected: Array<{ field: string; reason: string }> }

export function acceptInbound(entityType: string, system: string, patch: Record<string, unknown>): InboundResult {
  const rule = EXTERNAL_WRITABLE[entityType];
  const accepted: Record<string, unknown> = {};
  const rejected: InboundResult["rejected"] = [];
  for (const [field, value] of Object.entries(patch)) {
    if (NEVER_EXTERNAL.has(field)) rejected.push({ field, reason: `${field} is set by the platform and is never written from outside` });
    else if (!rule) rejected.push({ field, reason: `the platform owns every field of ${entityType}; no outside system may write them yet` });
    else if (!(rule.systems as string[]).includes(system)) rejected.push({ field, reason: `${system} may not write ${entityType}` });
    else if (!rule.fields.includes(field)) rejected.push({ field, reason: `${field} is owned by the platform; ${system} may write only ${rule.fields.join(", ")}` });
    else accepted[field] = value;
  }
  return { accepted, rejected };
}

export const ownerOf = (entityType: string, field: string): "platform" | "external" =>
  !NEVER_EXTERNAL.has(field) && EXTERNAL_WRITABLE[entityType]?.fields.includes(field) ? "external" : "platform";

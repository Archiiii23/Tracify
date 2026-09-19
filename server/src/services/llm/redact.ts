/**
 * Copilot egress redaction.
 *
 * Nothing leaves the platform unless the egress policy explicitly allows it.
 * Addresses are masked to `0x1234…wxyz` form and victim identifiers are
 * replaced with stable pseudonyms so a transcript can never be used to
 * re-identify a complainant.
 */

const ADDRESS_RE = /\b(0x[a-fA-F0-9]{40}|bc1[a-z0-9]{25,60}|[13][a-km-zA-HJ-NP-Z1-9]{25,34}|T[A-Za-z1-9]{33})\b/g;

export function maskAddress(address: string): string {
  if (address.length <= 12) return address;
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function redactAddresses(text: string): string {
  return text.replace(ADDRESS_RE, (match) => maskAddress(match));
}

/** Stable pseudonym per victim identifier within one conversation. */
export function pseudonymize(
  text: string,
  identifiers: string[],
  prefix = "VICTIM",
): string {
  let out = text;
  identifiers.forEach((id, i) => {
    if (!id) return;
    out = out.split(id).join(`${prefix}-${String(i + 1).padStart(2, "0")}`);
  });
  return out;
}

export interface EgressPolicy {
  sendFullAddresses: boolean;
  sendVictimDetails: boolean;
}

export function applyEgressPolicy(
  text: string,
  policy: EgressPolicy,
  victimIdentifiers: string[] = [],
): string {
  let out = text;
  if (!policy.sendVictimDetails) out = pseudonymize(out, victimIdentifiers);
  if (!policy.sendFullAddresses) out = redactAddresses(out);
  return out;
}

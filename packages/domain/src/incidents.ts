/**
 * Something went wrong on the road.
 *
 * A breakdown, a robbery, an accident, a checkpoint that will not release the
 * truck. These are the events that turn a late delivery into a phone call at
 * midnight, and the product's only useful answer to them is to make the report
 * fast, structured and attached to the trip — so the argument afterwards is
 * about what to do, not about what happened.
 *
 * A report is a **claim**, never a verdict. `tierOf` drops a carrier a tier per
 * upheld incident, and "upheld" is a human decision recorded elsewhere.
 */

export type IncidentKind =
  /** Mechanical. The most common by a distance. */
  | 'breakdown'
  /** Armed robbery, hijack, theft from the load. */
  | 'security'
  | 'accident'
  /** Held by police, customs, a union, a weighbridge. */
  | 'detained'
  /** Impassable road, flood, closure. */
  | 'road'
  /** Damage or shortage found on the load. */
  | 'cargo';

export type Severity = 'blocking' | 'delaying' | 'noted';

export interface Incident {
  readonly id: string;
  readonly tripId: string;
  readonly kind: IncidentKind;
  readonly severity: Severity;
  readonly at: Date;
  /** Where it was reported from, if a fix was available. */
  readonly near: { readonly lat: number; readonly lon: number } | null;
  readonly note: string;
  readonly reportedBy: 'shipper' | 'carrier' | 'driver';
  readonly photoIds: readonly string[];
  readonly resolvedAt: Date | null;
}

/**
 * How severe each kind is when nobody says otherwise.
 *
 * A default rather than a fixed answer: a driver reporting a breakdown at the
 * roadside should not have to classify their own emergency, and a wrong default
 * is better than a dropdown between them and telling somebody.
 */
export const DEFAULT_SEVERITY: Readonly<Record<IncidentKind, Severity>> = {
  breakdown: 'blocking',
  security: 'blocking',
  accident: 'blocking',
  detained: 'delaying',
  road: 'delaying',
  cargo: 'noted',
} as const;

/**
 * Whether an incident should raise the trip to disputed on its own.
 *
 * Only cargo damage and security do. A breakdown is a delay, not a dispute —
 * raising every breakdown to a dispute would make the disputed state mean
 * "something happened" instead of "the two sides disagree", and then nobody
 * looks at the list.
 */
export function raisesDispute(incident: Incident): boolean {
  return incident.kind === 'cargo' || incident.kind === 'security';
}

/**
 * Whether the ETA should stop being shown.
 *
 * A blocking incident makes every arrival estimate a lie: the truck is not
 * moving toward the destination and nobody knows when it will. Showing "arrives
 * 18:40" beside "broken down near Jebba" is the product contradicting itself.
 */
export function suppressesEta(open: readonly Incident[]): boolean {
  return open.some((incident) => incident.severity === 'blocking');
}

export function open(all: readonly Incident[]): readonly Incident[] {
  return all.filter((incident) => incident.resolvedAt === null);
}

/**
 * The one line shown at the top of a trip.
 *
 * The most severe open incident, and the most recent among equals. A trip with
 * three open incidents has one headline; the rest are below it.
 */
export function headline(all: readonly Incident[]): Incident | null {
  const rank: Readonly<Record<Severity, number>> = { blocking: 0, delaying: 1, noted: 2 };
  const [first] = [...open(all)].sort((a, b) => {
    const bySeverity = rank[a.severity] - rank[b.severity];
    return bySeverity !== 0 ? bySeverity : b.at.getTime() - a.at.getTime();
  });
  return first ?? null;
}

/** Plain words for a status line. Never an error tone — this is a fact. */
export function describe(incident: Incident): string {
  switch (incident.kind) {
    case 'breakdown':
      return 'Broken down';
    case 'security':
      return 'Security incident';
    case 'accident':
      return 'Accident';
    case 'detained':
      return 'Held up';
    case 'road':
      return 'Road blocked';
    case 'cargo':
      return 'Problem with the load';
  }
}

/**
 * Photographs a report of this kind needs to be worth anything.
 *
 * Cargo and accident reports without a picture are one person's word, and one
 * person's word is what the product exists to replace. Security is deliberately
 * exempt: nobody photographs a hijack, and demanding it would mean the report
 * that matters most is the one that cannot be filed.
 */
export function needsPhoto(kind: IncidentKind): boolean {
  return kind === 'cargo' || kind === 'accident';
}

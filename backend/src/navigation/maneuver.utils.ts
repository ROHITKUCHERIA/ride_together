import type {
  ManeuverModifier,
  ManeuverType,
  NavigationInstruction,
} from './interfaces/routing-response.interface';

/**
 * OSRM step / maneuver shape (the subset of the routing engine response that
 * turn-by-turn navigation needs). Kept local so provider types never leak into
 * the normalized `NavigationInstruction` consumed by the API.
 */
export interface OsmStep {
  distance?: number;
  duration?: number;
  /** Road name. May be empty on unnamed streets. */
  name?: string;
  /** Road reference (e.g. "NH 44"). Used when `name` is missing. */
  ref?: string;
  maneuver?: {
    type?: string;
    modifier?: string;
    location?: [number, number];
    instruction?: string;
    exit?: number;
  };
}

const TURN_MODIFIERS: Record<string, ManeuverModifier> = {
  left: 'left',
  right: 'right',
  'slight left': 'slight-left',
  'slight right': 'slight-right',
  'sharp left': 'sharp-left',
  'sharp right': 'sharp-right',
  straight: 'straight',
};

const ROUNDABOUT_TYPES = new Set([
  'roundabout',
  'rotary',
  'roundabout turn',
  'exit roundabout',
  'exit rotary',
]);

/**
 * Map an OSRM maneuver `type` onto the provider-agnostic vocabulary. Unknown
 * types (including future engine additions) collapse to `unknown`.
 */
export function normalizeManeuverType(type: string | undefined): ManeuverType {
  if (!type) return 'unknown';
  const normalized = type.toLowerCase();
  if (normalized === 'depart' || normalized === 'start') return 'depart';
  if (normalized === 'arrive' || normalized === 'end of route') return 'arrive';
  if (normalized === 'turn' || normalized === 'end of road') return 'turn';
  if (
    normalized === 'continue' ||
    normalized === 'notification' ||
    normalized === 'new name'
  ) {
    return 'continue';
  }
  if (normalized === 'merge') return 'merge';
  if (normalized === 'fork') return 'fork';
  if (ROUNDABOUT_TYPES.has(normalized)) return 'roundabout';
  if (normalized === 'uturn') return 'uturn';
  return 'unknown';
}

/**
 * Normalize an OSRM maneuver `modifier`. Modifiers are only meaningful for
 * turn-like maneuvers; every other type ignores them so the UI never shows a
 * bogus arrow.
 */
export function normalizeManeuverModifier(
  type: ManeuverType,
  modifier: string | undefined,
): ManeuverModifier | undefined {
  if (!modifier) return undefined;
  const isTurnLike =
    type === 'turn' ||
    type === 'fork' ||
    type === 'merge' ||
    type === 'continue' ||
    type === 'depart';
  if (!isTurnLike) return undefined;
  const mapped = TURN_MODIFIERS[modifier.toLowerCase()];
  return mapped ?? undefined;
}

function roadName(step: OsmStep): string | undefined {
  const name = step.name?.trim();
  if (name) return name;
  const ref = step.ref?.trim();
  if (ref) return ref;
  return undefined;
}

function buildRoundaboutText(step: OsmStep, exit: number | undefined): string {
  if (typeof exit === 'number' && Number.isInteger(exit) && exit > 0) {
    const suffix =
      exit === 1 ? 'st' : exit === 2 ? 'nd' : exit === 3 ? 'rd' : 'th';
    const onto = roadName(step);
    return onto
      ? `Take the ${exit}${suffix} exit onto ${onto}`
      : `Take the ${exit}${suffix} exit`;
  }
  const onto = roadName(step);
  return onto
    ? `Enter the roundabout and take an exit onto ${onto}`
    : 'Enter the roundabout';
}

function buildReadableText(
  type: ManeuverType,
  modifier: ManeuverModifier | undefined,
  step: OsmStep,
  exit: number | undefined,
): string {
  const onto = roadName(step);
  const ontoText = onto ? ` onto ${onto}` : '';
  switch (type) {
    case 'arrive':
      return onto ? `Arrive at ${onto}` : 'Arrive at your destination';
    case 'depart': {
      const dir = modifier && modifier !== 'straight' ? ` ${modifier}` : '';
      return `Head${dir}${ontoText}`;
    }
    case 'roundabout':
      return buildRoundaboutText(step, exit);
    case 'uturn':
      return `Make a U-turn${ontoText}`;
    case 'merge':
      return modifier === 'straight'
        ? `Merge${ontoText}`
        : `Merge ${modifier ?? ''}${ontoText}`.trim();
    case 'fork':
      return modifier === 'straight'
        ? `Keep straight${ontoText}`
        : `Keep ${modifier ?? ''}${ontoText}`.trim();
    case 'turn':
      if (modifier === 'straight') return `Continue straight${ontoText}`;
      if (!modifier) return onto ? `Turn onto ${onto}` : 'Turn';
      return `Turn ${modifier}${ontoText}`;
    case 'continue':
      return modifier === 'straight'
        ? `Continue straight${ontoText}`
        : `Continue${ontoText}`;
    default:
      return onto ? `Continue onto ${onto}` : 'Continue straight';
  }
}

/**
 * Extract a provider-agnostic instruction list from OSRM `legs[].steps[]`.
 * Each step carries the distance/duration *to the next maneuver* and the lat
 * of the maneuver location. Road name is best-effort; exit numbers are only
 * included when the engine supplies one.
 */
export function parseOsrmSteps(
  steps: OsmStep[] | undefined,
): NavigationInstruction[] {
  if (!Array.isArray(steps)) return [];

  const instructions: NavigationInstruction[] = [];
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    if (!step || typeof step !== 'object') continue;

    const maneuver = step.maneuver ?? {};
    const type = normalizeManeuverType(maneuver.type);
    const modifier = normalizeManeuverModifier(type, maneuver.modifier);
    const location = maneuver.location;
    const hasLocation =
      Array.isArray(location) &&
      location.length >= 2 &&
      Number.isFinite(location[0]) &&
      Number.isFinite(location[1]);

    // Steps missing a coordinate are skipped — turn-by-turn needs the lat.
    if (!hasLocation) continue;

    const exit =
      typeof maneuver.exit === 'number' &&
      Number.isInteger(maneuver.exit) &&
      maneuver.exit > 0
        ? maneuver.exit
        : undefined;

    const providerText = maneuver.instruction?.trim();
    const text = providerText || buildReadableText(type, modifier, step, exit);

    instructions.push({
      id: `step-${i}`,
      type,
      ...(modifier ? { modifier } : {}),
      text,
      distanceMeters: Number.isFinite(step.distance)
        ? (step.distance as number)
        : 0,
      durationSeconds: Number.isFinite(step.duration)
        ? (step.duration as number)
        : 0,
      latitude: location[1],
      longitude: location[0],
      ...(roadName(step) ? { roadName: roadName(step) } : {}),
      ...(exit !== undefined ? { exitNumber: exit } : {}),
    });
  }
  return instructions;
}

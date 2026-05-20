export const EVOLUTION_LEVEL_ORDER = ["Rookie", "Champion", "Ultimate", "Mega"] as const;

export function isValidEvolutionLevel(from: string, to: string): boolean {
    const fi = EVOLUTION_LEVEL_ORDER.indexOf(from as (typeof EVOLUTION_LEVEL_ORDER)[number]);
    const ti = EVOLUTION_LEVEL_ORDER.indexOf(to as (typeof EVOLUTION_LEVEL_ORDER)[number]);
    if (fi === -1 || ti === -1) return false;
    return ti === fi + 1;
}

export function matchesEvolutionType(activeType: string, targetType: string): boolean {
    return String(activeType).trim().toLowerCase() === String(targetType).trim().toLowerCase();
}

export function canEvolveDigimon(
    active: { level: string; type: string } | null | undefined,
    target: { level: string; type: string; evoCost: number },
    playerDp: number
): boolean {
    if (!active) return false;
    if (playerDp < target.evoCost) return false;
    if (!isValidEvolutionLevel(active.level, target.level)) return false;
    if (!matchesEvolutionType(active.type, target.type)) return false;
    return true;
}

import { isEffectCondition, type EffectCondition } from "./effectCondition";

export type EffectPlanEffect = {
    type: string;
    targetAttack?: string;
    value?: number;
    requireType?: string;
    requireOpponentType?: string;
    priority?: number;
};

export type EffectPlan =
    | { planVersion: 1; op: "effect"; effect: EffectPlanEffect }
    | { planVersion: 1; op: "compose"; steps: EffectPlan[] }
    | { planVersion: 1; op: "conditional"; when: EffectCondition; steps: EffectPlan[] };

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
    return Object.keys(value).every(key => allowed.includes(key));
}

function isFiniteNumber(value: unknown): value is number {
    return typeof value === "number" && Number.isFinite(value);
}

function isNonEmptyString(value: unknown): value is string {
    return typeof value === "string" && value.trim().length > 0;
}


function isPlanEffect(value: unknown): value is EffectPlanEffect {
    if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
    const effect = value as Record<string, unknown>;
    if (!isNonEmptyString(effect.type)) return false;
    if (!hasOnlyKeys(effect, ["type", "targetAttack", "value", "requireType", "requireOpponentType", "priority"])) {
        return false;
    }
    return (
        (effect.targetAttack === undefined || isNonEmptyString(effect.targetAttack)) &&
        (effect.value === undefined || isFiniteNumber(effect.value)) &&
        (effect.requireType === undefined || isNonEmptyString(effect.requireType)) &&
        (effect.requireOpponentType === undefined || isNonEmptyString(effect.requireOpponentType)) &&
        (effect.priority === undefined || isFiniteNumber(effect.priority))
    );
}

export function isEffectPlan(value: unknown): value is EffectPlan {
    if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
    const plan = value as Record<string, unknown>;
    if (plan.planVersion !== 1 || typeof plan.op !== "string") return false;

    switch (plan.op) {
        case "effect":
            return hasOnlyKeys(plan, ["planVersion", "op", "effect"]) && isPlanEffect(plan.effect);
        case "compose":
            return (
                hasOnlyKeys(plan, ["planVersion", "op", "steps"]) &&
                Array.isArray(plan.steps) &&
                plan.steps.length > 0 &&
                plan.steps.every(isEffectPlan)
            );
        case "conditional":
            return (
                hasOnlyKeys(plan, ["planVersion", "op", "when", "steps"]) &&
                isEffectCondition(plan.when) &&
                Array.isArray(plan.steps) &&
                plan.steps.length > 0 &&
                plan.steps.every(isEffectPlan)
            );
        default:
            return false;
    }
}

export function serializeEffectPlanJson(plan: EffectPlan): string {
    if (!isEffectPlan(plan)) throw new TypeError("Cannot serialize an invalid effect plan");
    return JSON.stringify(plan);
}

export function parseEffectPlanJson(json: string): EffectPlan | null {
    if (json === "") return null;

    let value: unknown;
    try {
        value = JSON.parse(json);
    } catch {
        throw new TypeError("Invalid effect plan JSON");
    }

    if (!isEffectPlan(value)) throw new TypeError("Invalid effect plan structure or version");
    return value;
}

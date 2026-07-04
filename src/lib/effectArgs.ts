import type { EffectArgs } from "../types";

export function parseEffectArgsJson(rawJson: unknown): EffectArgs {
    if (typeof rawJson !== "string" || rawJson.trim().length === 0) return {};
    try {
        const parsed = JSON.parse(rawJson);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
        const args: EffectArgs = {};
        for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
            if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
                args[k] = v;
            }
        }
        return args;
    } catch {
        return {};
    }
}

export function readNumberArg(args: EffectArgs, key: string, fallback = 0): number {
    const v = args[key];
    return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

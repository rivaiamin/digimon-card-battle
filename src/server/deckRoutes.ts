import type { Express, Request, Response } from "express";
import cardsData from "../data/cards.json";
import { loadCardCatalog, type NormalizedCardCatalogEntry } from "../lib/cardCatalogLoader";
import { listArenaVariants, resolveArenaVariant } from "../lib/arenaVariant";
import { buildDefaultDeckCardIds } from "../lib/defaultDeckBuilder";
import { validateDeck } from "../lib/deckValidator";
import { getRuleProfile, type RuleProfileId } from "../lib/ruleProfile";
import { CANONICAL_DECK_SIZE } from "../lib/deckConstraints";

const CATALOG: NormalizedCardCatalogEntry[] = loadCardCatalog(cardsData);
const CATALOG_BY_ID = new Map(CATALOG.map(c => [c.id, c]));

function parseRuleProfileId(raw: unknown): RuleProfileId {
    return raw === "legacy_online" ? "legacy_online" : "fidelity_ps1";
}

export function registerDeckRoutes(app: Express) {
    app.get("/api/decks/default", (req: Request, res: Response) => {
        const playerIndex = Math.max(0, Number(req.query.playerIndex ?? 0) || 0);
        const cardIds = buildDefaultDeckCardIds(CATALOG, playerIndex);
        res.json({ cardIds, size: cardIds.length });
    });

    app.post("/api/decks/validate", (req: Request, res: Response) => {
        const cardIds = req.body?.cardIds;
        const ruleProfileId = parseRuleProfileId(req.body?.ruleProfile);
        const arenaVariant = resolveArenaVariant(req.body?.arenaVariant, ruleProfileId);

        if (!Array.isArray(cardIds) || !cardIds.every((id: unknown) => typeof id === "string")) {
            res.status(400).json({
                ok: false,
                reason: "invalid_payload",
                message: "Request body must include cardIds: string[]",
            });
            return;
        }

        const result = validateDeck(cardIds, CATALOG_BY_ID, arenaVariant);
        res.status(result.ok ? 200 : 400).json(result);
    });

    app.get("/api/match/config", (_req: Request, res: Response) => {
        res.json({
            ruleProfiles: [
                { id: "fidelity_ps1", label: "Fidelity (PS1)" },
                { id: "legacy_online", label: "Legacy Online" },
            ],
            arenaVariants: {
                fidelity_ps1: listArenaVariants("fidelity_ps1").map(v => ({
                    id: v.id,
                    label: v.label,
                })),
                legacy_online: listArenaVariants("legacy_online").map(v => ({
                    id: v.id,
                    label: v.label,
                })),
            },
            deck: {
                canonicalSize: CANONICAL_DECK_SIZE,
                handTargetFidelity: getRuleProfile("fidelity_ps1").handTarget,
            },
        });
    });
}

export function getServerCatalogById(): ReadonlyMap<string, NormalizedCardCatalogEntry> {
    return CATALOG_BY_ID;
}

export function getServerCatalog(): readonly NormalizedCardCatalogEntry[] {
    return CATALOG;
}

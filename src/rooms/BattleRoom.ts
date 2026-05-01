import { Room, type Client } from "@colyseus/core";
import { BattleStateSchema, PlayerSchema, CardSchema, SupportEffectSchema } from "../schema/BattleState";
import cardsData from "../data/cards.json";

export class BattleRoom extends Room<{ state: BattleStateSchema }> {
    private supportChoices = new Map<string, CardSchema | null>();
    private attackChoices = new Map<string, "circle" | "triangle" | "cross" | null>();
    private attackBonus = new Map<string, { circle: number; triangle: number; cross: number }>();

    onCreate(options: any) {
        console.log("[SERVER] BattleRoom created", options);
        this.state = new BattleStateSchema();

        this.onMessage("action", (client, message) => {
            const player = this.state.players.get(client.sessionId);
            if (!player) return;

            // Validation: only active player can act in Draw/Prep
            const isMyTurn = this.state.activePlayerSessionId === client.sessionId;

            switch (message.type) {
                case "DRAW":
                    if (!isMyTurn || this.state.phase !== "draw") return;
                    this.drawToSixOrLose(player);
                    if ((this.state.phase as string) === "victory") return;
                    this.state.phase = "preparation";
                    this.state.message = "Preparation Phase";
                    break;
                case "DISCARD_FOR_DP":
                    if (!isMyTurn || this.state.phase !== "preparation") return;
                    this.discardForDp(player, Array.isArray(message.cardIds) ? message.cardIds : []);
                    break;
                case "EVOLVE":
                    if (!isMyTurn || this.state.phase !== "preparation") return;
                    if (typeof message.cardId !== "string") return;
                    this.evolve(player, message.cardId);
                    break;
                case "END_PREP":
                    if (!isMyTurn || this.state.phase !== "preparation") return;
                    this.beginSupportPlacement();
                    break;
                case "LOCK_SUPPORT":
                    if (this.state.phase !== "battle_support") return;
                    if (message.cardId != null && typeof message.cardId !== "string") return;
                    this.lockSupport(client.sessionId, message.cardId ?? null);
                    break;
                case "LOCK_ATTACK":
                    if (this.state.phase !== "battle_attack") return;
                    if (!["circle", "triangle", "cross"].includes(message.attack)) return;
                    this.lockAttack(client.sessionId, message.attack);
                    break;
            }
        });
    }

    onJoin(client: Client, options: any) {
        console.log(`[SERVER] Client joined: ${client.sessionId}`, options);
        const player = new PlayerSchema();
        player.sessionId = client.sessionId;
        player.name = `Player ${this.state.players.size + 1}`;
        player.hp = 0; // Will be set when active Digimon is chosen
        
        // Deck is assigned when the match starts (needs both players).

        this.state.players.set(client.sessionId, player);

        if (this.state.players.size === 2) {
            this.startGame();
        }
    }

    onLeave(client: Client, code?: number) {
        console.log(`[SERVER] Client left: ${client.sessionId}, code: ${code}`);
        this.state.players.delete(client.sessionId);
        if (this.state.phase !== "victory") {
            this.state.phase = "victory";
            this.state.winnerSessionId = Array.from(this.state.players.keys())[0] ?? "";
            this.state.loserReason = "disconnect";
            this.state.message = "A player disconnected.";
        }
    }

    startGame() {
        const sessions = Array.from(this.state.players.keys());
        this.state.activePlayerSessionId = sessions[0];
        this.state.turn = 1;

        // Build and shuffle 30-card decks, then deploy initial rookies.
        sessions.forEach((sessionId, playerIndex) => {
            const p = this.state.players.get(sessionId)!;
            p.deck.clear();
            p.hand.clear();
            p.trash.clear();
            p.dp = 0;
            p.score = 0;
            p.supportCard = null;
            p.supportLocked = false;
            p.selectedAttack = null;
            p.attackLocked = false;
            p.evolutionStack.clear();
            p.active = null;
            p.hp = 0;

            const deck = this.buildDeck30(playerIndex);
            this.shuffle(deck);
            deck.forEach(c => p.deck.push(c));

            this.deployRookieOrLose(p);
        });

        if (this.state.phase !== "victory") {
            this.state.phase = "draw";
            this.state.message = "Draw Phase";
        }
    }

    // ----------------------------
    // Deck + card helpers
    // ----------------------------

    private toSchemaCard(raw: any, instanceId: string): CardSchema {
        const card = new CardSchema();
        card.id = instanceId;
        card.name = String(raw.name ?? "").toUpperCase();
        card.level = String(raw.level ?? "");
        card.type = String(raw.type ?? "");
        card.hp = Number(raw.hp ?? 0);
        card.maxHp = Number(raw.maxHp ?? raw.hp ?? 0);
        card.plusDp = Number(raw.plusDp ?? 0);
        card.evoCost = Number(raw.evoCost ?? 0);
        card.image = String(raw.image ?? "");

        const attacks = raw.attacks ?? {};
        card.circle.name = String(attacks.circle?.name ?? "");
        card.circle.damage = Number(attacks.circle?.damage ?? 0);
        card.circle.type = "circle";
        card.circle.description = String(attacks.circle?.description ?? "");

        card.triangle.name = String(attacks.triangle?.name ?? "");
        card.triangle.damage = Number(attacks.triangle?.damage ?? 0);
        card.triangle.type = "triangle";
        card.triangle.description = String(attacks.triangle?.description ?? "");

        card.cross.name = String(attacks.cross?.name ?? "");
        card.cross.damage = Number(attacks.cross?.damage ?? 0);
        card.cross.type = "cross";
        card.cross.description = String(attacks.cross?.description ?? "");

        if (raw.supportEffect) {
            const se = new SupportEffectSchema();
            se.type = String(raw.supportEffect.type ?? "");
            se.targetAttack = String(raw.supportEffect.targetAttack ?? "");
            se.value = Number(raw.supportEffect.value ?? 0);
            se.description = String(raw.supportEffect.description ?? "");
            card.supportEffect = se;
        } else {
            card.supportEffect = null;
        }

        return card;
    }

    private buildDeck30(playerIndex: number): CardSchema[] {
        // Digimon-only, simple seed: allow up to 4 copies per base card id in cards.json
        const baseCards = (cardsData as any[]).filter(c => typeof c?.id === "string");
        const counts = new Map<string, number>();
        const deck: CardSchema[] = [];

        // Deterministic-ish order per player by rotating start index.
        const start = playerIndex % Math.max(1, baseCards.length);
        let cursor = start;
        let serial = 1;
        while (deck.length < 30 && baseCards.length > 0) {
            const raw = baseCards[cursor];
            cursor = (cursor + 1) % baseCards.length;

            const baseId = String(raw.id);
            const n = counts.get(baseId) ?? 0;
            if (n >= 4) continue;
            counts.set(baseId, n + 1);

            const instanceId = `p${playerIndex}_${baseId}_${serial++}`;
            deck.push(this.toSchemaCard(raw, instanceId));
        }
        return deck;
    }

    private shuffle<T>(arr: T[]) {
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
    }

    // ----------------------------
    // Phase logic (GDD)
    // ----------------------------

    private drawToSixOrLose(player: PlayerSchema) {
        const needed = Math.max(0, 6 - player.hand.length);
        for (let i = 0; i < needed; i++) {
            if (player.deck.length <= 0) {
                this.endGame(player.sessionId, "deck_out");
                return;
            }
            player.hand.push(player.deck.shift()!);
        }
    }

    private discardForDp(player: PlayerSchema, cardIds: string[]) {
        for (const cardId of cardIds) {
            const idx = player.hand.findIndex(c => c.id === cardId);
            if (idx === -1) continue;
            const card = player.hand[idx];
            player.dp += card.plusDp;
            player.trash.push(card);
            player.hand.splice(idx, 1);
        }
        this.state.message = "Preparation Phase";
    }

    private evolve(player: PlayerSchema, cardId: string) {
        const idx = player.hand.findIndex(c => c.id === cardId);
        if (idx === -1) return;
        const evo = player.hand[idx];

        // Basic eligibility: cannot evolve to same/lower level; require DP
        const current = this.getActive(player);
        if (!current) return;
        if (player.dp < evo.evoCost) return;

        // Simple level ladder (Rookie->Champion->Ultimate->Mega, Armor allowed but treated as separate)
        if (!this.isValidEvolution(current.level, evo.level)) return;

        player.dp -= evo.evoCost;
        player.hand.splice(idx, 1);
        player.evolutionStack.push(evo);
        player.active = evo;
        player.hp = evo.maxHp; // full heal on evolve
        this.state.message = "Preparation Phase";
    }

    private isValidEvolution(from: string, to: string) {
        const order = ["Rookie", "Champion", "Ultimate", "Mega"];
        const fi = order.indexOf(from);
        const ti = order.indexOf(to);
        if (fi === -1 || ti === -1) return false;
        return ti === fi + 1;
    }

    private getActive(player: PlayerSchema): CardSchema | null {
        return player.active ?? null;
    }

    private deployRookieOrLose(player: PlayerSchema) {
        // Ensure the player has an active rookie; draw until found.
        const findInHand = () => player.hand.find(c => c.level === "Rookie") ?? null;
        let rookie = findInHand();
        while (!rookie) {
            if (player.deck.length <= 0) {
                this.endGame(player.sessionId, "deck_out");
                return;
            }
            player.hand.push(player.deck.shift()!);
            rookie = findInHand();
        }
        // Remove rookie from hand to field
        const idx = player.hand.findIndex(c => c.id === rookie!.id);
        if (idx !== -1) player.hand.splice(idx, 1);
        player.evolutionStack.clear();
        player.evolutionStack.push(rookie!);
        player.active = rookie!;
        player.hp = rookie!.maxHp;
    }

    private beginSupportPlacement() {
        this.state.phase = "battle_support";
        this.state.message = "Battle Phase: Place Support";

        this.supportChoices.clear();
        this.attackChoices.clear();
        this.attackBonus.clear();
        this.state.players.forEach(p => {
            p.supportCard = null; // not revealed yet
            p.supportLocked = false;
            p.selectedAttack = null;
            p.attackLocked = false;
            this.supportChoices.set(p.sessionId, null);
            this.attackChoices.set(p.sessionId, null);
        });
    }

    private lockSupport(sessionId: string, cardId: string | null) {
        const player = this.state.players.get(sessionId);
        if (!player) return;
        if (player.supportLocked) return;

        let chosen: CardSchema | null = null;
        if (cardId) {
            const idx = player.hand.findIndex(c => c.id === cardId);
            if (idx === -1) return;
            chosen = player.hand[idx];
            player.hand.splice(idx, 1);
        }

        player.supportLocked = true;
        this.supportChoices.set(sessionId, chosen);
        this.maybeRevealSupportAndAdvance();
    }

    private maybeRevealSupportAndAdvance() {
        const sessions = Array.from(this.state.players.keys());
        if (sessions.length !== 2) return;
        const p1 = this.state.players.get(sessions[0])!;
        const p2 = this.state.players.get(sessions[1])!;
        if (!p1.supportLocked || !p2.supportLocked) return;

        this.state.phase = "battle_reveal";
        this.state.message = "Support Reveal";

        // Reveal simultaneously into shared state
        const c1 = this.supportChoices.get(p1.sessionId) ?? null;
        const c2 = this.supportChoices.get(p2.sessionId) ?? null;
        p1.supportCard = c1;
        p2.supportCard = c2;

        // Apply support effects in order: active player then defender (cancellations deferred)
        const active = this.state.players.get(this.state.activePlayerSessionId);
        const defender = sessions[0] === this.state.activePlayerSessionId ? p2 : p1;

        if (active && active.supportCard?.supportEffect) this.applySupportEffect(active, defender, active.supportCard.supportEffect);
        if (defender.supportCard?.supportEffect) this.applySupportEffect(defender, active!, defender.supportCard.supportEffect);

        // Advance to attack selection
        this.state.phase = "battle_attack";
        this.state.message = "Battle Phase: Select Attack";
    }

    private applySupportEffect(source: PlayerSchema, target: PlayerSchema, effect: SupportEffectSchema) {
        // Minimal Digimon-only support resolution:
        // - atk_buff is applied as a temporary per-player bonus handled in damage calculation (stored server-side)
        // - hp_heal heals source active
        // - halve_hp halves target current HP
        // - change_attack (future) ignored for now (no Option cards)
        if (effect.type === "atk_buff") {
            const current = this.attackBonus.get(source.sessionId) ?? { circle: 0, triangle: 0, cross: 0 };
            const v = effect.value ?? 0;
            const t = effect.targetAttack;
            if (t === "all" || t === "") {
                current.circle += v;
                current.triangle += v;
                current.cross += v;
            } else if (t === "circle" || t === "triangle" || t === "cross") {
                current[t] += v;
            }
            this.attackBonus.set(source.sessionId, current);
        } else if (effect.type === "hp_heal") {
            const max = source.active?.maxHp ?? source.hp;
            source.hp = Math.min(max, source.hp + effect.value);
        } else if (effect.type === "halve_hp") {
            target.hp = Math.floor(target.hp / 2);
        }
    }

    private lockAttack(sessionId: string, attack: "circle" | "triangle" | "cross") {
        const player = this.state.players.get(sessionId);
        if (!player) return;
        if (player.attackLocked) return;
        player.attackLocked = true;
        this.attackChoices.set(sessionId, attack);
        this.maybeResolveBattle();
    }

    private maybeResolveBattle() {
        const sessions = Array.from(this.state.players.keys());
        if (sessions.length !== 2) return;
        const p1 = this.state.players.get(sessions[0])!;
        const p2 = this.state.players.get(sessions[1])!;
        if (!p1.attackLocked || !p2.attackLocked) return;

        const a1 = this.attackChoices.get(p1.sessionId) ?? "circle";
        const a2 = this.attackChoices.get(p2.sessionId) ?? "circle";
        p1.selectedAttack = a1;
        p2.selectedAttack = a2;

        this.state.phase = "resolution";
        this.state.message = "Resolving Battle...";

        const d1 = this.getAttackDamage(p1, a1);
        const d2 = this.getAttackDamage(p2, a2);

        p2.hp = Math.max(0, p2.hp - d1);
        p1.hp = Math.max(0, p1.hp - d2);

        this.resolveKOsAndMaybeEndGame();
        if (this.state.phase === "victory") return;

        // End turn -> next player's draw
        this.endTurn();
    }

    private getAttackDamage(player: PlayerSchema, type: "circle" | "triangle" | "cross") {
        const active = player.active;
        if (!active) return 0;
        const bonus = this.attackBonus.get(player.sessionId) ?? { circle: 0, triangle: 0, cross: 0 };
        if (type === "circle") return active.circle.damage + bonus.circle;
        if (type === "triangle") return active.triangle.damage + bonus.triangle;
        return active.cross.damage + bonus.cross;
    }

    private resolveKOsAndMaybeEndGame() {
        const sessions = Array.from(this.state.players.keys());
        if (sessions.length !== 2) return;
        const pA = this.state.players.get(sessions[0])!;
        const pB = this.state.players.get(sessions[1])!;

        const aKO = pA.hp <= 0;
        const bKO = pB.hp <= 0;

        if (!aKO && !bKO) return;

        if (aKO && bKO) {
            // Double KO: trash both stacks, redeploy both rookies
            this.trashEvolutionStack(pA);
            this.trashEvolutionStack(pB);
            this.deployRookieOrLose(pA);
            this.deployRookieOrLose(pB);
            return;
        }

        const winner = aKO ? pB : pA;
        const loser = aKO ? pA : pB;
        winner.score += 1;

        this.trashEvolutionStack(loser);
        this.deployRookieOrLose(loser);

        if (winner.score >= 3) {
            this.endGame(loser.sessionId, "points");
        }
    }

    private trashEvolutionStack(player: PlayerSchema) {
        // Trash full stack (including active)
        while (player.evolutionStack.length > 0) {
            const top = player.evolutionStack.pop();
            if (top) player.trash.push(top);
        }
        player.active = null;
        player.hp = 0;
        player.supportCard = null;
        player.supportLocked = false;
        player.selectedAttack = null;
        player.attackLocked = false;
    }

    private endTurn() {
        const sessions = Array.from(this.state.players.keys());
        const currentIndex = sessions.indexOf(this.state.activePlayerSessionId);
        this.state.activePlayerSessionId = sessions[(currentIndex + 1) % 2];
        this.state.turn += 1;
        this.state.phase = "draw";
        this.state.message = "Draw Phase";
    }

    private endGame(loserSessionId: string, reason: "points" | "deck_out" | "disconnect") {
        const winnerSessionId = Array.from(this.state.players.keys()).find(id => id !== loserSessionId) ?? "";
        this.state.phase = "victory";
        this.state.winnerSessionId = winnerSessionId;
        this.state.loserReason = reason;
        this.state.message = reason === "deck_out" ? "Deck Out!" : "Match Over";
    }
}

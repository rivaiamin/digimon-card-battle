import { Room, type Client } from "@colyseus/core";
import { BattleStateSchema, PlayerSchema, CardSchema, AttackSchema } from "../schema/BattleState";
import { INITIAL_DECK } from "../constants";

export class BattleRoom extends Room<{ state: BattleStateSchema }> {
    onCreate(options: any) {
        console.log("[SERVER] BattleRoom created", options);
        this.state = new BattleStateSchema();

        this.onMessage("action", (client, message) => {
            const player = this.state.players.get(client.sessionId);
            if (!player) return;

            // Simple validation: only active player can act in most phases
            const isMyTurn = this.state.activePlayerSessionId === client.sessionId;

            switch (message.type) {
                case "END_PHASE":
                    if (isMyTurn) this.progressPhase();
                    break;
                case "DRAW":
                    if (!isMyTurn || this.state.phase !== "draw") return;
                    const needed = 6 - player.hand.length;
                    for (let i = 0; i < needed; i++) {
                        if (player.deck.length > 0) {
                            player.hand.push(player.deck.shift()!);
                        }
                    }
                    this.progressPhase();
                    break;
                case "DISCARD_DP":
                    if (!isMyTurn || this.state.phase !== "preparation") return;
                    const cardIndex = player.hand.findIndex(c => c.id === message.cardId);
                    if (cardIndex !== -1) {
                        const card = player.hand[cardIndex];
                        player.dp += card.plusDp;
                        player.trash.push(card);
                        player.hand.splice(cardIndex, 1);
                    }
                    break;
                case "EVOLVE":
                    if (!isMyTurn || this.state.phase !== "evolution") return;
                    const evoIdx = player.hand.findIndex(c => c.id === message.cardId);
                    if (evoIdx !== -1) {
                        const card = player.hand[evoIdx];
                        // Simple evolution logic (always succeeds for this demo)
                        if (player.active) player.trash.push(player.active);
                        player.active = card;
                        player.hp = card.maxHp;
                        player.hand.splice(evoIdx, 1);
                        this.progressPhase();
                    }
                    break;
                case "SUPPORT":
                    if (!isMyTurn || this.state.phase !== "support") return;
                    const supIdx = player.hand.findIndex(c => c.id === message.cardId);
                    if (supIdx !== -1) {
                        player.supportCard = player.hand[supIdx];
                        player.hand.splice(supIdx, 1);
                        this.progressPhase();
                    }
                    break;
                case "SELECT_ATTACK":
                    if (!isMyTurn || this.state.phase !== "battle") return;
                    player.selectedAttack = message.attack;
                    // In a real game, wait for both to select if needed, but here we'll resolve
                    this.resolveBattle();
                    break;
            }
        });
    }

    resolveBattle() {
        this.state.phase = "resolution";
        this.state.message = "BATTLE RESOLVING...";
        
        // Simplified damage calculation
        const sessions = Array.from(this.state.players.keys());
        const p1 = this.state.players.get(sessions[0])!;
        const p2 = this.state.players.get(sessions[1])!;

        if (!p1.active || !p2.active) return;

        // Auto damage (random for non-active if needed, but here we use selected)
        const getAtkDamage = (player: PlayerSchema) => {
            const attackType = player.selectedAttack || "circle";
            const active = player.active as any;
            if (!active) return 0;
            if (attackType === "circle") return active.circle.damage;
            if (attackType === "triangle") return active.triangle.damage;
            return active.cross.damage;
        };

        const d1 = getAtkDamage(p1);
        const d2 = getAtkDamage(p2);

        p2.hp = Math.max(0, p2.hp - d1);
        p1.hp = Math.max(0, p1.hp - d2);

        setTimeout(() => {
            this.progressPhase();
        }, 2000);
    }

    onJoin(client: Client, options: any) {
        console.log(`[SERVER] Client joined: ${client.sessionId}`, options);
        const player = new PlayerSchema();
        player.sessionId = client.sessionId;
        player.name = `Player ${this.state.players.size + 1}`;
        player.hp = 0; // Will be set when active Digimon is chosen
        
        // Load initial deck (simplified)
        INITIAL_DECK.forEach(d => {
            const card = new CardSchema();
            card.id = d.id;
            card.name = d.name;
            card.hp = d.hp;
            card.maxHp = d.maxHp;
            card.type = d.type;
            card.level = d.level;
            
            card.circle.name = d.attacks.circle.name;
            card.circle.damage = d.attacks.circle.damage;
            card.circle.type = "circle";

            card.triangle.name = d.attacks.triangle.name;
            card.triangle.damage = d.attacks.triangle.damage;
            card.triangle.type = "triangle";

            card.cross.name = d.attacks.cross.name;
            card.cross.damage = d.attacks.cross.damage;
            card.cross.type = "cross";
            
            player.deck.push(card);
        });

        this.state.players.set(client.sessionId, player);

        if (this.state.players.size === 2) {
            this.startGame();
        }
    }

    onLeave(client: Client, code?: number) {
        console.log(`[SERVER] Client left: ${client.sessionId}, code: ${code}`);
        this.state.players.delete(client.sessionId);
        this.state.message = "A player left the session.";
        this.state.phase = "waiting";
    }

    startGame() {
        this.state.phase = "draw";
        this.state.message = "Game Started! Draw Phase.";
        const sessions = Array.from(this.state.players.keys());
        this.state.activePlayerSessionId = sessions[0];

        // Assign initial rookie if none
        this.state.players.forEach(p => {
            if (!p.active) {
                const rookie = p.deck.find(c => c.level === "Rookie");
                if (rookie) {
                    p.active = rookie;
                    p.hp = rookie.maxHp;
                    // Remove from deck (simplified)
                    const idx = p.deck.indexOf(rookie);
                    p.deck.splice(idx, 1);
                }
            }
        });
    }

    progressPhase() {
        const phases = ["draw", "evolution", "preparation", "support", "battle", "resolution"];
        let nextIndex = phases.indexOf(this.state.phase) + 1;
        
        if (nextIndex >= phases.length) {
            nextIndex = 0;
            // Switch turns
            const sessions = Array.from(this.state.players.keys());
            const currentIndex = sessions.indexOf(this.state.activePlayerSessionId);
            this.state.activePlayerSessionId = sessions[(currentIndex + 1) % 2];
            this.state.turn++;
        }
        
        this.state.phase = phases[nextIndex];
        this.state.message = `Current Phase: ${this.state.phase.toUpperCase()}`;
    }
}

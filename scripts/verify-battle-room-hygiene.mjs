import { readFileSync } from "node:fs";

const roomPath = "src/rooms/BattleRoom.ts";
const src = readFileSync(roomPath, "utf8");

/** Rule logic must live on FidelityBattleSession, not the Colyseus adapter. */
const forbidden = [
    { re: /\bpickRandomAttack\s*\(/, label: "pickRandomAttack()" },
    { re: /\blockSupport\s*\(/, label: "lockSupport()" },
    { re: /\blockAttack\s*\(/, label: "lockAttack()" },
    { re: /\bresolveSupportAndCombat\b/, label: "resolveSupportAndCombat" },
    { re: /\bfrom\s+["']\.\.\/lib\/optionResolver["']/, label: "optionResolver import" },
    { re: /\bfrom\s+["']\.\.\/lib\/openingFlow["']/, label: "openingFlow import" },
];

const violations = [];
for (const { re, label } of forbidden) {
    if (re.test(src)) {
        violations.push(label);
    }
}

// handlePhaseTimeout is allowed only via this.fidelitySession.handlePhaseTimeout
const strayHandlePhaseTimeout = src.match(/(?<!fidelitySession\.)handlePhaseTimeout\s*\(/g);
if (strayHandlePhaseTimeout?.length) {
    violations.push("handlePhaseTimeout() not routed through fidelitySession");
}

if (violations.length > 0) {
    process.stderr.write(
        `BattleRoom hygiene failed (${roomPath}):\n${violations.map(v => `  - ${v}`).join("\n")}\n`
    );
    process.exit(1);
}

console.log("battle room hygiene passed");

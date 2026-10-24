import { spawnSync } from "node:child_process";

function run(cmd, args) {
    const result = spawnSync(cmd, args, {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
    });
    if (result.status !== 0) {
        process.stderr.write(result.stdout ?? "");
        process.stderr.write(result.stderr ?? "");
        process.exit(result.status ?? 1);
    }
}

run("node", ["scripts/verify-battle-room-hygiene.mjs"]);
run("pnpm", ["run", "lint"]);
run("pnpm", ["exec", "vitest", "run", "src/lib/fidelityMatchLifecycle.test.ts"]);
run("pnpm", ["exec", "vitest", "run", "src/lib/fidelityBattleSession.test.ts"]);
run("pnpm", ["exec", "vitest", "run", "src/rooms/BattleRoom.test.ts"]);
run("pnpm", ["exec", "tsx", "scripts/verify-option-dispatch.ts", "G3"]);
console.log("fidelity battle session gates passed");

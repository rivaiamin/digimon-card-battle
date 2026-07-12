/**
 * Build `src/data/cards.json` from the US Digimon Digital Card Battle catalog
 * and Digimon portraits in `src/data/digimon.json`.
 *
 * Sources (vendored from AsyrafKZ/digital-card-battle-clone-data-collection):
 * - scripts/data/asyrafkz/cards.json — full 301-card stats + attack names
 * - scripts/data/asyrafkz/result.json — per-card X / support speeds
 * - scripts/data/asyrafkz/optionCards.json — option slice (via cards.json)
 * - public/cards/options/*.png — option card art
 * - src/data/digimon.json — Digimon portraits (digi-api URLs)
 *
 * Effect vocabulary: `pnpm exec tsx scripts/buildEffectCatalog.ts` → src/data/effects.json
 *
 * Run: pnpm cards:build
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

type SourceMonster = {
    name: string;
    number: string;
    level: string;
    specialty: string;
    hp: string;
    dp: string;
    pp: string;
    c_attack: string;
    c_pow: string;
    t_attack: string;
    t_pow: string;
    x_attack: string;
    x_pow: string;
    x_effect: string;
    support: string;
    img_src: string;
    isPartner?: boolean;
    support_speed?: string;
    x_effect_speed?: string;
};

type SpeedRow = { number: number; x_speed: string; support_speed: string };

type SourceOption = {
    name: string;
    number: string;
    effect: string;
    speed: string;
    img_src: string;
};

type DigimonPortrait = {
    id: number;
    name: string;
    image: string;
    level: string;
    attribute: string;
    type: string;
    field: string;
};

type OutCard = Record<string, unknown>;

const LEVEL_MAP: Record<string, string> = {
    R: "Rookie",
    C: "Champion",
    U: "Ultimate",
    A: "Armor",
};

const TYPE_MAP: Record<string, string> = {
    Fire: "Fire",
    Ice: "Ice",
    Nature: "Nature",
    Darkness: "Dark",
    Dark: "Dark",
    Rare: "Rare",
};

/** DDCB English names → digimon.json / digi-api romanizations. */
const NAME_ALIASES: Record<string, string> = {
    pheonixmon: "hououmon",
    phoenixmon: "hououmon",
    gigidramon: "gigadramon",
    realmetalgreymon: "metalgreymon",
    monocromon: "monochromon",
    piddomon: "pidmon",
    flarerizamon: "flarelizamon",
    "d-otamamon": "otamamon",
    dotamamon: "otamamon",
    braciomon: "brachimon",
    brachiomon: "brachimon",
    "j-mojyamon": "mojyamon",
    jmojyamon: "mojyamon",
    morishellmon: "shellmon",
    biyomon: "piyomon",
    candlemon: "candmon",
    frigimon: "yukidarumon",
    penguinmon: "penmon",
    lillymon: "lilimon",
    piximon: "piccolomon",
    "r-gatomon": "tailmon",
    rgatomon: "tailmon",
    gatomon: "tailmon",
    vegiemon: "vegimon",
    redvegiemon: "redvegimon",
    kokatorimon: "cockatrimon",
    piedmon: "piemon",
    myotismon: "vamdemon",
    venommyotismon: "venomvamdemon",
    phantomon: "fantomon",
    wizardmon: "wizarmon",
    ogremon: "orgemon",
    bkgatomon: "blacktailmon",
    tsukaimon: "tukaimon",
    puppetmon: "pinocchimon",
    thundermon: "thunderballmon",
    mudfrigimon: "tuchidarumon",
    veemon: "v-mon",
    exveemon: "xv-mon",
    armadillomon: "armadimon",
    dolphmon: "dolphmon",
    apemon: "apeomon",
    tyrannomon: "tyranomon",
    mastertyrannomon: "mastertyranomon",
    meteormon: "insekimon",
    vermilimon: "vermilimon",
    diaboromon: "diablomon",
    baronmon: "baromon",
    quetzalmon: "holsmon",
    halsemon: "holsmon",
    pegasusmon: "pegasmon",
    "omnimon i": "omegamon",
    "omnimon ii": "omegamon",
    omnimoni: "omegamon",
    omnimonii: "omegamon",
    rockmon: "gottsumon",
    snowagumon: "yukiagumon",
    snowgaburimon: "snowgoburimon",
    clearagumon: "clearagumon",
    "l-toyagumon": "toyagumon",
    ltoyagumon: "toyagumon",
    "vi-elecmon": "elecmon",
    vielecmon: "elecmon",
    modokibetamon: "betamon",
    darkrizamon: "darklizamon",
    zassomon: "zassoumon",
    tekkamon: "tekkamon",
    "metaletamonshakkoumon": "shakkoumon",
    metaletamon: "metaletemon",
    apokarimon: "apocalymon",
    herculeskabuterimon: "heraklekabuterimon",
    megakabuterimon: "atlurkabuterimon",
    warseadramon: "waruseadramon",
    warumonzaemon: "warumonzaemon",
    nisedrimogemon: "nisedrimogemon",
    shimaunimon: "shimaunimon",
    sandyanmamon: "sandyamamamon",
    psychemon: "psychemon",
    flamedramon: "fladramon",
    submarimon: "submarimon",
    tylomon: "tylomon",
    nefertimon: "nefertimon",
    raidramon: "lighdramon",
    shadramon: "shadramon",
    shurimon: "shurimon",
    digmon: "digmon",
    hawkmon: "hawkmon",
    wormmon: "wormmon",
    patamon: "patamon",
};

function norm(s: string): string {
    return String(s)
        .toLowerCase()
        .replace(/['’.]/g, "")
        .replace(/[^a-z0-9]+/g, "");
}

function num(v: unknown): number {
    const n = Number(String(v ?? "0").replace(/[^\d.-]/g, ""));
    return Number.isFinite(n) ? n : 0;
}

function buildPortraitIndex(portraits: DigimonPortrait[]): Map<string, DigimonPortrait> {
    const map = new Map<string, DigimonPortrait>();
    for (const d of portraits) {
        map.set(norm(d.name), d);
    }
    return map;
}

function resolveImage(
    cardName: string,
    fallbackImg: string,
    portraits: Map<string, DigimonPortrait>
): string {
    const key = norm(cardName);
    const alias = NAME_ALIASES[key];
    const direct = portraits.get(key) ?? (alias ? portraits.get(norm(alias)) : undefined);
    if (direct?.image) return direct.image;

    // Fuzzy: exact containment either way (prefer shorter name distance).
    let best: DigimonPortrait | undefined;
    let bestScore = Infinity;
    for (const [k, d] of portraits) {
        if (k === key || k.includes(key) || key.includes(k)) {
            const score = Math.abs(k.length - key.length);
            if (score < bestScore) {
                bestScore = score;
                best = d;
            }
        }
    }
    if (best?.image && bestScore <= 4) return best.image;

    if (fallbackImg) return fallbackImg;

    // digi-api convention used by digimon.json
    const slug = cardName.replace(/\s+/g, "_");
    return `https://digi-api.com/images/digimon/w/${slug}.png`;
}

function mapCrossEffect(
    raw: string
): { effectId?: string; effectArgs?: Record<string, string | number>; label: string } {
    const e = raw.replace(/\{\{button\|([ctx])\}\}/gi, (_, b: string) => b.toUpperCase()).trim();
    const lower = e.toLowerCase().replace(/\s+/g, " ");

    if (!lower || lower === "none") return { label: "" };

    const counterMatch = lower.match(/^([ctxo]|circle|triangle|cross)\s*counter$/);
    if (counterMatch) {
        const t = letterToAttack(counterMatch[1]);
        return {
            effectId: "cross.counter",
            effectArgs: { targetAttack: t, multiplier: 2 },
            label: `${t} Counter`,
        };
    }

    const toZeroMatch = lower.match(/^([ctxo]|circle|triangle|cross)\s*to\s*0$/);
    if (toZeroMatch) {
        const t = letterToAttack(toZeroMatch[1]);
        return {
            effectId: "cross.to_zero",
            effectArgs: { targetAttack: t },
            label: `${t} to 0`,
        };
    }

    if (lower === "crash") return { effectId: "cross.crash", effectArgs: {}, label: "Crash" };
    if (lower === "eat-up hp" || lower === "eat up hp") {
        return { effectId: "cross.eat_up_hp", effectArgs: {}, label: "Eat-Up HP" };
    }

    // Foe x3 / Jamming / 1st Attack — catalog text only until effect engine covers them.
    return { label: e };
}

function letterToAttack(letter: string): "circle" | "triangle" | "cross" {
    const l = letter.toLowerCase();
    if (l === "o" || l === "c" || l === "circle") return "circle";
    if (l === "t" || l === "triangle") return "triangle";
    return "cross";
}

type SupportOut = {
    type: string;
    targetAttack?: string;
    value: number;
    description: string;
    requireType?: string;
    priority?: number;
};

function cleanEffectText(raw: string): string {
    return raw
        .replace(/\{\{button\|c\}\}/gi, "Circle")
        .replace(/\{\{button\|t\}\}/gi, "Triangle")
        .replace(/\{\{button\|x\}\}/gi, "Cross")
        .replace(/\{\{button\|o\}\}/gi, "Circle")
        .replace(/\s+/g, " ")
        .trim();
}

function mapSupportEffect(support: string, speed: number): SupportOut | null {
    const text = cleanEffectText(support);
    if (!text || /^none\.?$/i.test(text)) return null;

    const base = { description: text, value: 0, priority: speed };

    if (/support effect is voided|opponent'?s support effect is voided|jamming/i.test(text) &&
        /void/i.test(text)) {
        return { ...base, type: "void_enemy_support" };
    }
    if (/^opponent'?s support effect is voided/i.test(text)) {
        return { ...base, type: "void_enemy_support" };
    }
    if (/support effect is voided/i.test(text) && !/own attack power is halved/i.test(text)) {
        return { ...base, type: "void_enemy_support" };
    }

    if (/^attack first\.?$/i.test(text)) {
        return { ...base, type: "first_strike" };
    }

    const forceAtk = text.match(/opponent uses ([otx]|circle|triangle|cross)\.?$/i);
    if (forceAtk) {
        return {
            ...base,
            type: "change_attack",
            targetAttack: letterToAttack(forceAtk[1]),
        };
    }

    const buffO = text.match(/^boost own (?:o|circle) attack power \+?(\d+)\.?$/i);
    if (buffO) {
        return { ...base, type: "atk_buff", targetAttack: "circle", value: Number(buffO[1]) };
    }
    const buffT = text.match(/^boost own (?:t|triangle) attack power \+?(\d+)\.?$/i);
    if (buffT) {
        return { ...base, type: "atk_buff", targetAttack: "triangle", value: Number(buffT[1]) };
    }
    const buffX = text.match(/^boost own (?:x|cross) attack power \+?(\d+)\.?$/i);
    if (buffX) {
        return { ...base, type: "atk_buff", targetAttack: "cross", value: Number(buffX[1]) };
    }
    const buffAll = text.match(/^boost own attack power \+?(\d+)\.?$/i);
    if (buffAll) {
        return { ...base, type: "atk_buff", targetAttack: "all", value: Number(buffAll[1]) };
    }

    const heal = text.match(/^recover own hp (?:by )?\+?(\d+)\.?$/i);
    if (heal) {
        return { ...base, type: "hp_heal", value: Number(heal[1]) };
    }

    if (/^opponent'?s hp are halved\.?$/i.test(text) || /^halve opponent'?s hp\.?$/i.test(text)) {
        return { ...base, type: "halve_hp" };
    }

    // Specialty-gated simple buffs we can express with requireType.
    const typedDouble = text.match(
        /^if own specialty is (fire|ice|water|nature|dark(?:ness)?|rare), own attack power is doubled\.?$/i
    );
    if (typedDouble) {
        const t = TYPE_MAP[typedDouble[1].replace(/water/i, "Ice").replace(/darkness/i, "Darkness")] ??
            typedDouble[1];
        return {
            ...base,
            type: "atk_mult",
            targetAttack: "all",
            value: 2,
            requireType: t === "Water" ? "Ice" : t === "Darkness" ? "Dark" : t,
        };
    }

    return { ...base, type: "catalog_text" };
}

function optionImage(id: string, fallback: string): string {
    const local = path.join(ROOT, "public/cards/options", `${id}.png`);
    if (fs.existsSync(local)) return `/cards/options/${id}.png`;
    return fallback || "";
}

function mapOptionCard(opt: SourceOption): OutCard {
    const id = opt.number.padStart(3, "0");
    const effect = cleanEffectText(opt.effect);
    // Prefer Circle/Triangle/Cross labels; FAQ decks also use O for Circle.
    const name = cleanEffectText(opt.name).replace(/\bCircle\b/g, "Circle");
    const speed = num(opt.speed);
    const image = optionImage(id, opt.img_src);

    // Evolution option cards (293–300 in US catalog).
    const evoId = Number(opt.number);
    if (evoId >= 293 && evoId <= 300) {
        const evo = mapEvolutionOption(name, effect);
        return {
            id,
            name,
            cardKind: "evolution_option",
            ...evo,
            level: "",
            type: "Rare",
            hp: 0,
            maxHp: 0,
            plusDp: 0,
            evoCost: 0,
            image,
            supportEffect: {
                type: "catalog_text",
                value: 0,
                description: effect,
                priority: speed,
            },
        };
    }

    const battle = mapBattleOption(name, effect);
    return {
        id,
        name,
        cardKind: "option",
        ...battle,
        level: "",
        type: "Rare",
        hp: 0,
        maxHp: 0,
        plusDp: 0,
        evoCost: 0,
        image,
        supportEffect: {
            type: "catalog_text",
            value: 0,
            description: effect,
            priority: speed,
        },
    };
}

function mapEvolutionOption(
    name: string,
    effect: string
): { effectId?: string; effectArgs?: Record<string, number> } {
    const n = name.toLowerCase();
    if (n.includes("warp")) {
        return { effectId: "evolution_option.warp_evolve", effectArgs: { skipLevels: 1 } };
    }
    if (n.includes("special")) {
        // "by adding dp 20" → extra DP cost
        return { effectId: "evolution_option.dp_adjust", effectArgs: { delta: 20 } };
    }
    if (n.includes("speed-digivolve") || n.includes("speed digivolve")) {
        return { effectId: "evolution_option.dp_adjust", effectArgs: { delta: -999 } };
    }
    // Remaining evolution options are catalog-only until dedicated effect IDs exist.
    void effect;
    return {};
}

function mapBattleOption(
    name: string,
    effect: string
): { effectId?: string; effectArgs?: Record<string, string | number> } {
    // Patterns drawn from AsyrafKZ effectList2.txt (unique option/support vocabulary).
    const atkBoost = effect.match(/^boost own attack power \+?(\d+)\.?$/i);
    if (atkBoost) {
        return {
            effectId: "option.battle.atk_buff",
            effectArgs: { targetAttack: "all", value: Number(atkBoost[1]) },
        };
    }
    const atkO = effect.match(/^boost own circle attack power \+?(\d+)\.?$/i);
    if (atkO) {
        return {
            effectId: "option.battle.atk_buff",
            effectArgs: { targetAttack: "circle", value: Number(atkO[1]) },
        };
    }
    const atkT = effect.match(/^boost own triangle attack power \+?(\d+)\.?$/i);
    if (atkT) {
        return {
            effectId: "option.battle.atk_buff",
            effectArgs: { targetAttack: "triangle", value: Number(atkT[1]) },
        };
    }
    const atkX = effect.match(/^boost own cross attack power \+?(\d+)\.?$/i);
    if (atkX) {
        return {
            effectId: "option.battle.atk_buff",
            effectArgs: { targetAttack: "cross", value: Number(atkX[1]) },
        };
    }

    const heal = effect.match(/^recover own hp (?:by )?\+?(\d+)\.?$/i);
    if (heal) {
        return {
            effectId: "option.battle.hp_heal",
            effectArgs: { value: Number(heal[1]) },
        };
    }

    const draw = effect.match(/^draw (\d+) cards?(?: from (?:own )?online deck)?\.?$/i);
    if (draw) {
        return { effectId: "option.prep.draw", effectArgs: { count: Number(draw[1]) } };
    }

    // Named gems / chips with single-clause effects (effectList / optionCards).
    if (/^digi-garnet$/i.test(name)) {
        return {
            effectId: "option.battle.atk_buff",
            effectArgs: { targetAttack: "all", value: 100 },
        };
    }
    if (/^digi-amethyst$/i.test(name) || /^recovery floppy$/i.test(name)) {
        return {
            effectId: "option.battle.hp_heal",
            effectArgs: { value: name.toLowerCase().includes("recovery") ? 300 : 100 },
        };
    }
    if (/^digi-diamond$/i.test(name)) {
        return { effectId: "option.prep.draw", effectArgs: { count: 2 } };
    }
    if (/^attack chip$/i.test(name)) {
        return {
            effectId: "option.battle.atk_buff",
            effectArgs: { targetAttack: "all", value: 300 },
        };
    }
    if (/^holy sevens$/i.test(name)) {
        return { effectId: "option.battle.hp_heal", effectArgs: { value: 1000 } };
    }

    return {};
}

function mapMonster(
    m: SourceMonster,
    portraits: Map<string, DigimonPortrait>,
    speeds: Map<number, SpeedRow>
): OutCard {
    const id = m.number.padStart(3, "0");
    const level = LEVEL_MAP[m.level] ?? m.level;
    const type = TYPE_MAP[m.specialty] ?? m.specialty;
    const hp = num(m.hp);
    const evoCost = num(m.dp);
    const plusDp = num(m.pp);
    const speedRow = speeds.get(Number(m.number));
    const speed = num(m.support_speed ?? speedRow?.support_speed);
    const xSpeed = num(m.x_effect_speed ?? speedRow?.x_speed);
    const cross = mapCrossEffect(m.x_effect || "");
    const support = mapSupportEffect(cleanEffectText(m.support || ""), speed);

    const circleDmg = num(m.c_pow);
    const triangleDmg = num(m.t_pow);
    const crossDmg = num(m.x_pow);

    const crossAttack: Record<string, unknown> = {
        name: m.x_attack || "Cross",
        damage: crossDmg,
        type: "cross",
        description: cross.label || m.x_effect || "",
    };
    if (cross.effectId) {
        crossAttack.effectId = cross.effectId;
        crossAttack.effectArgs = { ...(cross.effectArgs ?? {}), priority: xSpeed };
    } else if (xSpeed) {
        crossAttack.effectArgs = { priority: xSpeed };
    }

    const card: OutCard = {
        id,
        name: m.name,
        cardKind: "digimon",
        level,
        type,
        hp,
        maxHp: hp,
        plusDp,
        evoCost,
        image: resolveImage(m.name, m.img_src || "", portraits),
        xEffectSpeed: xSpeed,
        supportSpeed: speed,
        attacks: {
            circle: {
                name: m.c_attack || "Circle",
                damage: circleDmg,
                type: "circle",
                description: "",
            },
            triangle: {
                name: m.t_attack || "Triangle",
                damage: triangleDmg,
                type: "triangle",
                description: "",
            },
            cross: crossAttack,
        },
    };

    if (support) {
        card.supportEffect = support;
    }

    if (m.isPartner) {
        card.isPartner = true;
    }

    return card;
}

function main() {
    const sourcePath = path.join(ROOT, "scripts/data/asyrafkz/cards.json");
    const speedsPath = path.join(ROOT, "scripts/data/asyrafkz/result.json");
    const portraitsPath = path.join(ROOT, "src/data/digimon.json");
    const outPath = path.join(ROOT, "src/data/cards.json");

    const source = JSON.parse(fs.readFileSync(sourcePath, "utf8")) as {
        monster_cards: SourceMonster[];
        option_cards: SourceOption[];
    };
    const speedRows = (
        JSON.parse(fs.readFileSync(speedsPath, "utf8")) as { cards: SpeedRow[] }
    ).cards;
    const speeds = new Map(speedRows.map(r => [r.number, r]));
    const portraits = buildPortraitIndex(
        JSON.parse(fs.readFileSync(portraitsPath, "utf8")) as DigimonPortrait[]
    );

    const monsters = source.monster_cards.map(m => mapMonster(m, portraits, speeds));
    const options = source.option_cards.map(mapOptionCard);
    const cards = [...monsters, ...options];

    // Stable sort by numeric id
    cards.sort((a, b) => Number(a.id) - Number(b.id));

    fs.writeFileSync(outPath, JSON.stringify(cards, null, 2) + "\n");

    const withPortrait = monsters.filter(m =>
        String(m.image).includes("digi-api.com")
    ).length;
    const withSupportFx = monsters.filter(
        m => m.supportEffect && (m.supportEffect as SupportOut).type !== "catalog_text"
    ).length;
    const withCrossFx = monsters.filter(m => {
        const c = (m.attacks as { cross?: { effectId?: string } }).cross;
        return !!c?.effectId;
    }).length;
    const evoOpts = options.filter(o => o.cardKind === "evolution_option").length;
    const battleOpts = options.filter(o => o.effectId).length;

    console.log(`Wrote ${cards.length} cards → ${path.relative(ROOT, outPath)}`);
    console.log(`  Digimon: ${monsters.length} (portraits from digimon.json: ${withPortrait})`);
    console.log(`  Options: ${options.length} (evolution: ${evoOpts}, mapped effects: ${battleOpts})`);
    console.log(`  Mechanical support effects: ${withSupportFx}`);
    console.log(`  Mechanical cross effects: ${withCrossFx}`);
}

main();

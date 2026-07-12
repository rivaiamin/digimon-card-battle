/**
 * Two-browser visual smoke for battle layout.
 * Drives a match from join → opening → deploy → prep → attack select.
 *
 * Requires `pnpm dev` on :3000 and Firebase Admin creds in .env.
 *
 * Usage:
 *   pnpm test:visual
 *   VIEWPORT=mobile pnpm test:visual
 *   VIEWPORT=desktop pnpm test:visual
 */
import { chromium, type Page, type BrowserContext } from "playwright";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const BASE = process.env.BATTLE_URL ?? "http://localhost:3000";
const OUT = join(process.cwd(), "tmp", "visual");
const VIEWPORT = process.env.VIEWPORT ?? "desktop";

const VIEWPORTS = {
  desktop: { width: 1366, height: 768 },
  mobile: { width: 390, height: 844 },
} as const;

async function openHome(page: Page, label: string) {
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: /JOIN MATCH/i }).waitFor({
    state: "visible",
    timeout: 45_000,
  });
  console.log(`[${label}] home ready`);
}

async function clickJoin(page: Page, label: string) {
  await page.waitForTimeout(300);
  await page.getByRole("button", { name: /JOIN MATCH/i }).click();
  console.log(`[${label}] clicked JOIN MATCH`);
}

async function waitForQueue(page: Page, label: string) {
  await page.getByText(/FINDING OPPONENT/i).waitFor({
    state: "visible",
    timeout: 45_000,
  });
  console.log(`[${label}] in queue`);
}

async function waitForArena(page: Page, label: string) {
  await page.waitForFunction(
    () => {
      const text = document.body?.innerText ?? "";
      if (/FINDING OPPONENT/i.test(text)) return false;
      if (/MATCH COMPLETE|RETURN TO WORLD MAP/i.test(text)) return false;
      if (/DRAWING TO/i.test(text)) return false;
      return (
        /KEEP HAND/i.test(text) ||
        /HAND\s*\(\d+\)/i.test(text) ||
        /Turn\s+\d/i.test(text)
      );
    },
    { timeout: 90_000 }
  );
  console.log(`[${label}] entered arena`);
}

async function shot(page: Page, name: string) {
  const path = join(OUT, `${VIEWPORT}-${name}.png`);
  await page.screenshot({ path, fullPage: false });
  console.log(`wrote ${path}`);
}

async function dumpFailure(page: Page, label: string) {
  try {
    await shot(page, `${label}-FAIL`);
    const text = (await page.locator("body").innerText()).slice(0, 800);
    console.error(`[${label}] page text:\n${text}`);
  } catch (e) {
    console.error(`[${label}] dump failed`, e);
  }
}

async function bodyText(page: Page) {
  return page.locator("body").innerText();
}

async function clickFirstVisible(
  page: Page,
  pattern: RegExp,
  label: string,
  what: string
): Promise<boolean> {
  const btn = page.getByRole("button", { name: pattern });
  const n = await btn.count();
  for (let i = 0; i < n; i++) {
    const candidate = btn.nth(i);
    if (await candidate.isVisible().catch(() => false)) {
      await candidate.click({ timeout: 5_000 });
      console.log(`[${label}] ${what}`);
      return true;
    }
  }
  return false;
}

/** Prefer plain DEPLOY over DEPLOY (Champion) for opening legality. */
async function clickDeployBadge(page: Page, label: string): Promise<boolean> {
  const plain = page.getByText(/^DEPLOY$/, { exact: true });
  if ((await plain.count()) > 0 && (await plain.first().isVisible().catch(() => false))) {
    await plain.first().click({ force: true });
    console.log(`[${label}] DEPLOY`);
    return true;
  }
  const any = page.getByText(/^DEPLOY/i);
  if ((await any.count()) > 0 && (await any.first().isVisible().catch(() => false))) {
    await any.first().click({ force: true });
    console.log(`[${label}] DEPLOY (fallback)`);
    return true;
  }
  return false;
}

function isMatchOver(text: string) {
  return /MATCH COMPLETE|RETURN TO WORLD MAP|OPPONENT DISCONNECTED/i.test(text);
}

/** True when the attack picker dock is on screen (not card-detail CIRCLE/△/✕ text). */
async function hasAttackDock(page: Page): Promise<boolean> {
  const circle = page.getByRole("button", { name: /CIRCLE/i });
  const triangle = page.getByRole("button", { name: /TRIANGLE/i });
  const cross = page.getByRole("button", { name: /CROSS/i });
  const [c, t, x] = await Promise.all([
    circle.first().isVisible().catch(() => false),
    triangle.first().isVisible().catch(() => false),
    cross.first().isVisible().catch(() => false),
  ]);
  return c && t && x;
}

async function isChoosingAttack(page: Page): Promise<boolean> {
  if (await hasAttackDock(page)) return true;
  const text = await bodyText(page);
  return /Choose attack/i.test(text);
}

async function isDiscardPhase(page: Page): Promise<boolean> {
  const text = await bodyText(page);
  if (!/Discard for DP/i.test(text)) return false;
  return page.getByRole("button", { name: /^CONTINUE$/i }).first().isVisible().catch(() => false);
}

/**
 * Push one player's UI forward one step when actions are available.
 * Safe to call every tick for both players.
 */
async function advanceOnce(page: Page, label: string): Promise<boolean> {
  if (await isChoosingAttack(page)) return false;
  const text = await bodyText(page);
  if (isMatchOver(text)) return false;

  if (await clickFirstVisible(page, /^KEEP HAND$/i, label, "KEEP HAND")) return true;
  if (/Deploy Digimon|deploy/i.test(text) && (await clickDeployBadge(page, label))) return true;
  if (await clickFirstVisible(page, /^CONTINUE$/i, label, "CONTINUE (discard)")) return true;
  if (await clickFirstVisible(page, /^END PREP$/i, label, "END PREP")) return true;
  if (await clickFirstVisible(page, /^NO SUPPORT$/i, label, "NO SUPPORT")) return true;
  return false;
}

/** Drive until discard-for-DP with CONTINUE visible (prep field layout). */
async function driveToDiscardPhase(
  p1: Page,
  p2: Page,
  timeoutMs = 90_000
): Promise<"discard" | "attack" | "timeout" | "over"> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const [t1, t2] = await Promise.all([bodyText(p1), bodyText(p2)]);
    if (isMatchOver(t1) || isMatchOver(t2)) return "over";
    if ((await hasAttackDock(p1)) || (await hasAttackDock(p2))) return "attack";
    if ((await isDiscardPhase(p1)) || (await isDiscardPhase(p2))) return "discard";

    // Advance only until discard — don't click CONTINUE yet.
    for (const [page, label] of [
      [p1, "P1"] as const,
      [p2, "P2"] as const,
    ]) {
      if (await isDiscardPhase(page)) continue;
      const text = await bodyText(page);
      if (isMatchOver(text)) continue;
      if (await clickFirstVisible(page, /^KEEP HAND$/i, label, "KEEP HAND")) continue;
      if (/Deploy Digimon|deploy/i.test(text)) await clickDeployBadge(page, label);
    }
    await p1.waitForTimeout(400);
  }
  return "timeout";
}

/** Drive both clients until at least one seat shows the attack dock. */
async function driveToAttackSelect(
  p1: Page,
  p2: Page,
  timeoutMs = 120_000
): Promise<"attack" | "timeout" | "over"> {
  const deadline = Date.now() + timeoutMs;
  let lastShotAt = 0;

  while (Date.now() < deadline) {
    const [t1, t2] = await Promise.all([bodyText(p1), bodyText(p2)]);
    if (isMatchOver(t1) || isMatchOver(t2)) return "over";

    // Prefer real dock buttons — card panels also print CIRCLE/TRIANGLE/CROSS.
    const [dock1, dock2] = await Promise.all([hasAttackDock(p1), hasAttackDock(p2)]);
    if (dock1 || dock2) return "attack";

    await Promise.all([advanceOnce(p1, "P1"), advanceOnce(p2, "P2")]);

    if (Date.now() - lastShotAt > 8_000) {
      lastShotAt = Date.now();
      await shot(p1, "p1-progress");
      await shot(p2, "p2-progress");
    }

    await p1.waitForTimeout(450);
  }
  return "timeout";
}

async function pickCircleAttack(page: Page, label: string): Promise<boolean> {
  const circle = page.getByRole("button", { name: /CIRCLE/i });
  if (!(await circle.first().isVisible().catch(() => false))) return false;
  await circle.first().click({ timeout: 5_000 });
  console.log(`[${label}] picked CIRCLE`);
  return true;
}

/** After first battle, wait for a clean turn 2+ Discard (no reveal overlays). */
async function driveToMidgameDiscard(
  p1: Page,
  p2: Page,
  timeoutMs = 120_000
): Promise<"discard" | "timeout" | "over"> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const [t1, t2] = await Promise.all([bodyText(p1), bodyText(p2)]);
    if (isMatchOver(t1) || isMatchOver(t2)) return "over";

    const turnOk = /Turn\s+[2-9]/i.test(t1) || /Turn\s+[2-9]/i.test(t2);
    const revealBusy =
      /ATTACK LOCK|SUPPORT REVEAL|COUNTER!/i.test(t1) ||
      /ATTACK LOCK|SUPPORT REVEAL|COUNTER!/i.test(t2);
    const discardReady =
      turnOk &&
      !revealBusy &&
      ((await isDiscardPhase(p1)) || (await isDiscardPhase(p2)));

    if (discardReady) return "discard";

    // Don't click CONTINUE/END PREP — that exits the discard we want to capture.
    for (const [page, label] of [
      [p1, "P1"] as const,
      [p2, "P2"] as const,
    ]) {
      await pickCircleAttack(page, label);
      await clickFirstVisible(page, /^NO SUPPORT$/i, label, "NO SUPPORT");
    }
    await p1.waitForTimeout(500);
  }
  return "timeout";
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const vp = VIEWPORTS[VIEWPORT as keyof typeof VIEWPORTS] ?? VIEWPORTS.desktop;

  const browser = await chromium.launch({ headless: true });
  const mk = async (label: string): Promise<{ ctx: BrowserContext; page: Page }> => {
    const ctx = await browser.newContext({
      viewport: vp,
      deviceScaleFactor: 1,
    });
    const page = await ctx.newPage();
    page.setDefaultTimeout(60_000);
    console.log(`[${label}] viewport ${vp.width}x${vp.height}`);
    return { ctx, page };
  };

  const a = await mk("P1");
  const b = await mk("P2");

  try {
    await Promise.all([openHome(a.page, "P1"), openHome(b.page, "P2")]);

    await clickJoin(a.page, "P1");
    await waitForQueue(a.page, "P1");
    await clickJoin(b.page, "P2");

    const results = await Promise.allSettled([
      waitForArena(a.page, "P1"),
      waitForArena(b.page, "P2"),
    ]);

    if (results[0].status === "rejected") await dumpFailure(a.page, "p1");
    if (results[1].status === "rejected") await dumpFailure(b.page, "p2");
    if (results.some(r => r.status === "rejected")) {
      throw new Error("One or both players failed to enter arena");
    }

    await a.page.waitForTimeout(800);
    await shot(a.page, "p1-enter");
    await shot(b.page, "p2-enter");

    console.log("Driving both players through prep → discard…");
    const discardOutcome = await driveToDiscardPhase(a.page, b.page);
    if (discardOutcome === "discard") {
      await shot(a.page, "p1-discard");
      await shot(b.page, "p2-discard");
    } else {
      console.warn(`discard capture skipped (${discardOutcome})`);
    }

    console.log("Driving both players through prep → attack select…");
    const outcome = await driveToAttackSelect(a.page, b.page);

    if (outcome === "over") {
      await dumpFailure(a.page, "p1");
      await dumpFailure(b.page, "p2");
      throw new Error("Match ended before attack select");
    }
    if (outcome === "timeout") {
      await dumpFailure(a.page, "p1");
      await dumpFailure(b.page, "p2");
      throw new Error("Timed out waiting for attack select");
    }

    await a.page.waitForTimeout(600);
    await shot(a.page, "p1-attack-select");
    await shot(b.page, "p2-attack-select");

    // Capture whichever seat has the attack dock buttons
    for (const [label, page] of [
      ["p1", a.page],
      ["p2", b.page],
    ] as const) {
      const circle = page.getByRole("button", { name: /CIRCLE/i });
      if (await circle.first().isVisible().catch(() => false)) {
        await shot(page, `${label}-attack-dock`);
        console.log(`[${label}] attack dock visible`);
      }
    }

    console.log("Driving through battle → mid-game discard…");
    const midDiscard = await driveToMidgameDiscard(a.page, b.page);
    if (midDiscard === "discard") {
      await shot(a.page, "p1-discard-mid");
      await shot(b.page, "p2-discard-mid");
    } else {
      console.warn(`mid-game discard capture skipped (${midDiscard})`);
    }

    console.log(`\nScreenshots in ${OUT}`);
  } finally {
    await a.ctx.close().catch(() => undefined);
    await b.ctx.close().catch(() => undefined);
    await browser.close().catch(() => undefined);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

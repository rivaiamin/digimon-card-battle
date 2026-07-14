import { Room } from "colyseus.js";
import { signInAnonymously } from "firebase/auth";
import { auth } from "../lib/firebase";
import { BattleStateSchema } from "../schema/BattleState";
import { ColyseusClient017 } from "./colyseusClient";
import { fetchDefaultDeck, type MatchJoinOptions } from "./deckService";

function getWsUrl() {
  const protocol = window.location.protocol.replace("http", "ws");
  const host = window.location.host;
  return `${protocol}//${host}`;
}

async function ensureSignedIn() {
  if (auth.currentUser) return auth.currentUser;
  const cred = await signInAnonymously(auth);
  return cred.user;
}

export async function joinRandomBattle(
  options: MatchJoinOptions = {}
): Promise<Room<BattleStateSchema>> {
  const user = await ensureSignedIn();
  const idToken = await user.getIdToken();

  const ruleProfile = options.ruleProfile ?? "fidelity_ps1";
  const arenaVariant = options.arenaVariant ?? "standard";
  const deckCardIds = options.deckCardIds ?? (await fetchDefaultDeck({ random: true }));

  const client = new ColyseusClient017(getWsUrl());
  const room = await client.joinOrCreate(
    "battle",
    { idToken, ruleProfile, arenaVariant, deckCardIds },
    BattleStateSchema
  );
  return room as unknown as Room<BattleStateSchema>;
}

/** Rejoin a seat reserved by allowReconnection (FC-024). */
export async function reconnectBattle(
  reconnectionToken: string
): Promise<Room<BattleStateSchema>> {
  await ensureSignedIn();
  const client = new ColyseusClient017(getWsUrl());
  const room = await client.reconnect(reconnectionToken, BattleStateSchema);
  return room as unknown as Room<BattleStateSchema>;
}

export type { MatchJoinOptions };

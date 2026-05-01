import { Room } from "colyseus.js";
import { signInAnonymously } from "firebase/auth";
import { auth } from "../lib/firebase";
import { BattleStateSchema } from "../schema/BattleState";
import { ColyseusClient017 } from "./colyseusClient";

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

export async function joinRandomBattle(): Promise<Room<BattleStateSchema>> {
  const user = await ensureSignedIn();
  const idToken = await user.getIdToken();

  const client = new ColyseusClient017(getWsUrl());
  const room = await client.joinOrCreate("battle", { idToken }, BattleStateSchema);
  return room as unknown as Room<BattleStateSchema>;
}


import { Client, type SeatReservation } from "colyseus.js";

/**
 * Colyseus 0.17 returns a flat seat reservation body:
 * `{ name, sessionId, roomId, processId, ... }`.
 * colyseus.js 0.16 expects `{ room: { name, roomId, ... }, sessionId, ... }`.
 * Without this, `consumeSeatReservation` reads `response.room.name` and throws.
 */
export function normalizeMatchmakeSeatResponse(response: Record<string, unknown>): SeatReservation {
    if (response.room != null && typeof response.room === "object") {
        return response as unknown as SeatReservation;
    }
    const { name, roomId, processId, publicAddress, ...rest } = response as Record<string, unknown>;
    return {
        ...rest,
        room: {
            name,
            roomId,
            processId,
            ...(publicAddress != null ? { publicAddress } : {}),
        },
    } as unknown as SeatReservation;
}

export class ColyseusClient017 extends Client {
    override consumeSeatReservation(response: any, rootSchema?: any, reuseRoomInstance?: any) {
        return super.consumeSeatReservation(
            normalizeMatchmakeSeatResponse(response),
            rootSchema,
            reuseRoomInstance
        );
    }
}

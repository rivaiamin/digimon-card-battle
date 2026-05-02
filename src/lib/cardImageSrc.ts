import type { DigimonCardData } from "../types";

/** Use `data.image` from server/DB when set; otherwise identicon from name/type. */
export function cardImageSrc(data: DigimonCardData): string {
    const raw = (data.image ?? "").trim();
    if (!raw) {
        const bg = data.type === "Fire" ? "ff3c3c" : "3c9bff";
        return `https://api.dicebear.com/7.x/identicon/svg?seed=${encodeURIComponent(data.name)}&backgroundColor=${bg}`;
    }
    if (/^(https?:\/\/|\/|data:)/i.test(raw)) {
        return raw;
    }
    return `/${raw.replace(/^\/+/, "")}`;
}

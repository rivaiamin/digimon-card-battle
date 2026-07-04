#!/usr/bin/env python3
"""Parse DDCB base deck listings into structured JSON.

Primary source (preferred): docs/base_decks.html
  Saved GameFAQs page (ZeoKnight formatted FAQ):
  https://gamefaqs.gamespot.com/ps/526754-digimon-digital-card-battle/faqs/78563/base-deck-list

Fallback: scripts/data/gamefaqs/base-deck-list.txt (RYakuto plain-text section)

Catalog: src/data/cards.json
Output:  src/data/decks.json

Usage:
  python3 tools/parse_base_decks.py
  python3 tools/parse_base_decks.py --report
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from html import unescape
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
HTML_SOURCE = ROOT / "docs/base_decks.html"
TEXT_SOURCE = ROOT / "scripts/data/gamefaqs/base-deck-list.txt"
CATALOG = ROOT / "src/data/cards.json"
OUT = ROOT / "src/data/decks.json"

# ZeoKnight HTML: "1 Agumon", "4 Attack Disk O"
HTML_ENTRY_RE = re.compile(r"^(?P<count>\d+)\s+(?P<name>.+)$")
# RYakuto plain text: "Agumon 4", "Agumon"
TEXT_ENTRY_RE = re.compile(r"^(?P<name>.+?)\s+(?P<count>\d+)$")
DECK_TITLE_RE = re.compile(r"^.+\s+[Dd]eck[!?]?$")

# FAQ spellings → catalog name
NAME_ALIASES: dict[str, str] = {
    # Attack / defense disks (O / △ / X = Circle / Triangle / Cross)
    "attack disk o": "Attack Disk Circle",
    "attack disk circle": "Attack Disk Circle",
    "attack disk triangle": "Attack Disk Triangle",
    "attack disk △": "Attack Disk Triangle",
    "attack disk x": "Attack Disk Cross",
    "attack disk cross": "Attack Disk Cross",
    "defense disk o": "Defense Disk Circle",
    "defense disk circle": "Defense Disk Circle",
    "defense disk triangle": "Defense Disk Triangle",
    "defense disk △": "Defense Disk Triangle",
    "defense disk x": "Defense Disk Cross",
    "defense disk cross": "Defense Disk Cross",
    "mega def. disk o": "Mega Def. Disk Circle",
    "mega def. disk circle": "Mega Def. Disk Circle",
    "mega def. disk triangle": "Mega Def. Disk Triangle",
    "mega def. disk △": "Mega Def. Disk Triangle",
    "mega def. disk x": "Mega Def. Disk Cross",
    "mega def. disk cross": "Mega Def. Disk Cross",
    "sylphymon": "Silphymon",
    "silphymon": "Silphymon",
    "mega rec. floppy": "Mega Rec. Floppy",
    "mega recovery floppy": "Mega Rec. Floppy",
    "med. rec. floppy": "Med. Rec. Floppy",
    "sup. rec. floppy": "Sup. Rec. Floppy",
    "recovery floppy": "Recovery Floppy",
    "revover floppy": "Recovery Floppy",
    "attach chip": "Attack Chip",
    "attack chip": "Attack Chip",
    "mega attack chip": "Mega Attack Chip",
    "circle hitter": "Circle Hitter",
    "triangle hitter": "Triangle Hitter",
    "cross hitter": "Cross Hitter",
    "hitter circle": "Circle Hitter",
    "hitter triangle": "Triangle Hitter",
    "hitter cross": "Cross Hitter",
    "pixiemon": "Piximon",
    "omnimon": "Omnimon I",
    "omnimon1": "Omnimon I",
    "omnimon i": "Omnimon I",
    "omnimon2": "Omnimon II",
    "omnimon ii": "Omnimon II",
    "omnimon 2": "Omnimon II",
    "venom myotismon": "VenomMyotismon",
    "vemon myotismon": "VenomMyotismon",
    "vemonmyotismon": "VenomMyotismon",
    "cherrymon's mist": "Cherrymons Mist",
    "cherrymons mist": "Cherrymons Mist",
    "networm": "Net Worm",
    "network": "Net Worm",
    "dark lord's cape": "Dark Lord Cape",
    "dark lord'd cape": "Dark Lord Cape",
    "dark lords cape": "Dark Lord Cape",
    "dark lord cape": "Dark Lord Cape",
    "dark hand": "Mega Hand",
    "deluxe mushroon": "Deluxe Mushroom",
    "rare alter": "Rare Altar",
    "rare altar": "Rare Altar",
    "speed digivolve": "Speed Digivolve",
    "speed-digivolve": "Speed Digivolve",
    "digi-devolve": "Digi-devolve",
    "digi devolve": "Digi-devolve",
    "digi-devolution": "Digi-devolve",
    "mutant digivolve": "Mutant Digivolve",
    "special digivolve": "Special Digivolve",
    "warp digivolve": "Warp Digivolve",
    "download digivolve": "Download Digivolve",
    "armorcrush digivolve": "ArmorCrush Digivolve",
    "armor crush digivolve": "ArmorCrush Digivolve",
    "de-armor digivolve": "De-Armor Digivolve",
    "armor clash": "Armor Clash",
    "shogun's order": "Shogun's Order",
    "rosemon's lure": "Rosemon's Lure",
    "suka's curse": "Sukas Curse",
    "sukas curse": "Sukas Curse",
    "devil's chip": "Devil's Chip",
    "uninstall": "Uninstall",
    "garuruomn": "Garurumon",
    "dokunemmon": "Dokunemon",
    "kuawagamon": "Kuwagamon",
    "monocromon": "Monochromon",
    "snowgoburimon": "SnowGaburimon",
    "snowgaburimon": "SnowGaburimon",
    "metaletamon": "MetalEtemon",
    "metal etamon": "MetalEtemon",
    "metaletemon": "MetalEtemon",
    "braciomon": "Brachiomon",
    "pheonixmon": "Phoenixmon",
    "gigidramon": "Gigadramon",
    "real metal greymon": "RealMetalGreymon",
    "realmetalgreymon": "RealMetalGreymon",
}


def norm(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", name.lower())


def slugify(name: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    return s or "deck"


def load_catalog() -> dict[str, dict]:
    cards = json.loads(CATALOG.read_text(encoding="utf-8"))
    by_norm: dict[str, dict] = {}
    for c in cards:
        by_norm[norm(c["name"])] = c
    return by_norm


def resolve_name(raw_name: str, by_norm: dict[str, dict]) -> dict | None:
    name = raw_name.strip().strip(",")
    if not name:
        return None

    key = norm(name)
    if key in by_norm:
        return by_norm[key]

    alias = NAME_ALIASES.get(name.lower()) or NAME_ALIASES.get(key)
    if alias:
        akey = norm(alias)
        if akey in by_norm:
            return by_norm[akey]

    # Unique containment
    candidates = [c for k, c in by_norm.items() if key == k or (len(key) >= 5 and (key in k or k in key))]
    if len(candidates) == 1:
        return candidates[0]
    return None


def max_copies_for(card: dict) -> int:
    """PS1 allows up to 4 copies of most cards; Sevens / Lure / Download are unique."""
    name = norm(card.get("name", ""))
    if name.endswith("sevens") or name in ("rosemonslure", "downloaddigivolve", "fakesevens"):
        return 1
    return 4


# ---------------------------------------------------------------------------
# HTML parser (ZeoKnight formatted FAQ)
# ---------------------------------------------------------------------------

def extract_faq_html(html: str) -> str:
    m = re.search(
        r'<div id="faqwrap"[^>]*>(.*?)(?:<div id="faqtext"|$)',
        html,
        re.S | re.I,
    )
    return m.group(1) if m else html


def parse_html_decks(html: str) -> list[dict]:
    """Parse <td>…<strong>Name…</strong><br>N Card… blocks."""
    body = extract_faq_html(html)
    # Each deck cell starts with <strong>DeckName
    cells = re.split(r"<td[^>]*>", body, flags=re.I)
    decks: list[dict] = []

    for cell in cells:
        if "<strong>" not in cell.lower():
            continue
        m = re.search(r"<strong>(.*?)</strong>(.*?)(?:</td>|$)", cell, re.S | re.I)
        if not m:
            continue

        header_html = m.group(1)
        body_html = m.group(2)

        header_text = unescape(re.sub(r"<br\s*/?>", "\n", header_html, flags=re.I))
        header_text = re.sub(r"<[^>]+>", "", header_text)
        header_lines = [ln.strip() for ln in header_text.splitlines() if ln.strip()]
        if not header_lines:
            continue

        # First line is deck name; may include "Deck"
        name = header_lines[0]
        if not re.search(r"deck", name, re.I):
            # Skip non-deck strong blocks (section headers, notes)
            continue

        aka = None
        colors = None
        owner = None
        for line in header_lines[1:]:
            if line.lower().startswith("a.k.a"):
                aka = re.sub(r"^a\.k\.a\s*", "", line, flags=re.I).strip()
            elif line.startswith("(") and "red" in line.lower():
                colors = line.strip("()")
            elif not line.startswith("("):
                owner = line

        body_text = unescape(re.sub(r"<br\s*/?>", "\n", body_html, flags=re.I))
        body_text = re.sub(r"<[^>]+>", "\n", body_text)
        entries: list[tuple[str, int]] = []
        for line in body_text.splitlines():
            line = line.strip()
            if not line:
                continue
            em = HTML_ENTRY_RE.match(line)
            if not em:
                continue
            entries.append((em.group("name").strip(), int(em.group("count"))))

        if not entries:
            continue

        decks.append(
            {
                "name": name,
                "aka": aka,
                "colors": colors,
                "owner": owner,
                "raw_entries": entries,
            }
        )

    return decks


# ---------------------------------------------------------------------------
# Plain-text fallback (RYakuto)
# ---------------------------------------------------------------------------

def parse_text_decks(text: str) -> list[dict]:
    lines = text.splitlines()
    decks: list[dict] = []
    current_name: str | None = None
    current_lines: list[str] = []

    def flush() -> None:
        nonlocal current_name, current_lines
        if current_name is None:
            return
        body = re.sub(r"\s+", " ", "\n".join(current_lines)).strip()
        tokens = [t.strip() for t in body.split(",") if t.strip()]
        entries: list[tuple[str, int]] = []
        for tok in tokens:
            m = TEXT_ENTRY_RE.match(tok)
            if m:
                entries.append((m.group("name").strip(), int(m.group("count"))))
            else:
                entries.append((tok, 1))
        decks.append({"name": current_name, "raw_entries": entries})
        current_name = None
        current_lines = []

    for line in lines:
        stripped = line.strip()
        if not stripped:
            continue
        if "," not in stripped and DECK_TITLE_RE.match(stripped):
            flush()
            current_name = stripped
            current_lines = []
            continue
        if current_name is not None:
            current_lines.append(stripped)
    flush()
    return decks


# ---------------------------------------------------------------------------
# Resolve + emit
# ---------------------------------------------------------------------------

def build_deck_records(raw_decks: list[dict], by_norm: dict[str, dict]) -> list[dict]:
    records = []
    used_ids: set[str] = set()

    for deck in raw_decks:
        name = deck["name"]
        base_id = slugify(name)
        deck_id = base_id
        n = 2
        while deck_id in used_ids:
            deck_id = f"{base_id}-{n}"
            n += 1
        used_ids.add(deck_id)

        entries_out = []
        card_ids: list[str] = []
        unresolved: list[dict] = []
        notes: list[str] = []

        for card_name, count in deck["raw_entries"]:
            card = resolve_name(card_name, by_norm)
            if not card:
                unresolved.append({"name": card_name, "count": count})
                continue

            max_c = max_copies_for(card)
            use_count = min(count, max_c)
            if count > max_c:
                notes.append(f"{card['name']}: FAQ count {count} clamped to {use_count}")

            entries_out.append(
                {
                    "cardId": card["id"],
                    "name": card["name"],
                    "count": use_count,
                    "sourceName": card_name,
                }
            )
            card_ids.extend([card["id"]] * use_count)

        size = len(card_ids)
        fully_resolved = len(unresolved) == 0
        record = {
            "id": deck_id,
            "name": name,
            "entries": entries_out,
            "cardIds": card_ids,
            "size": size,
            "unresolved": unresolved,
            "notes": notes,
            "valid": size == 30 and fully_resolved,
        }
        for key in ("aka", "colors", "owner"):
            if deck.get(key):
                record[key] = deck[key]
        records.append(record)

    return records


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--report", action="store_true")
    parser.add_argument("--html", type=Path, default=HTML_SOURCE)
    parser.add_argument("--text", type=Path, default=TEXT_SOURCE)
    parser.add_argument("--out", type=Path, default=OUT)
    args = parser.parse_args()

    if not CATALOG.is_file():
        print(f"Missing catalog: {CATALOG}", file=sys.stderr)
        return 1

    by_norm = load_catalog()
    source_label = ""
    source_file = ""

    if args.html.is_file():
        html = args.html.read_text(encoding="utf-8", errors="replace")
        raw_decks = parse_html_decks(html)
        source_label = (
            "https://gamefaqs.gamespot.com/ps/526754-digimon-digital-card-battle/"
            "faqs/78563/base-deck-list"
        )
        source_file = str(args.html.relative_to(ROOT))
        print(f"Parsed HTML: {len(raw_decks)} decks from {source_file}")
    elif args.text.is_file():
        text = args.text.read_text(encoding="utf-8")
        raw_decks = parse_text_decks(text)
        source_label = (
            "https://gamefaqs.gamespot.com/ps/526754-digimon-digital-card-battle/"
            "faqs/78563/base-deck-list"
        )
        source_file = str(args.text.relative_to(ROOT))
        print(f"Parsed text fallback: {len(raw_decks)} decks from {source_file}")
    else:
        print("No source found (docs/base_decks.html or scripts/data/gamefaqs/base-deck-list.txt)", file=sys.stderr)
        return 1

    records = build_deck_records(raw_decks, by_norm)
    valid = [d for d in records if d["valid"]]
    invalid = [d for d in records if not d["valid"]]
    unresolved_names = sorted(
        {u["name"] for d in records for u in d["unresolved"]}
    )

    payload = {
        "source": source_label,
        "sourceFile": source_file,
        "catalogFile": "src/data/cards.json",
        "counts": {
            "total": len(records),
            "valid": len(valid),
            "invalid": len(invalid),
            "unresolvedNames": len(unresolved_names),
        },
        "unresolvedNames": unresolved_names,
        "decks": records,
    }
    args.out.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")

    print(f"Wrote {len(records)} decks → {args.out.relative_to(ROOT)}")
    print(f"  valid (30 cards, fully resolved): {len(valid)}")
    print(f"  invalid / partial: {len(invalid)}")
    if unresolved_names:
        print(f"  unresolved names ({len(unresolved_names)}):")
        for n in unresolved_names:
            print(f"    - {n}")

    if args.report:
        for d in invalid[:20]:
            print(
                f"  ! {d['name']}: size={d['size']} unresolved={d['unresolved']} notes={d['notes']}",
                file=sys.stderr,
            )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())

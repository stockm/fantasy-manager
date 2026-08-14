#!/usr/bin/env python3
"""Build browser-friendly 2026 fantasy-football market data.

Primary sources:
- FantasyPros 2026 Half-PPR ADP composite (including Yahoo/Sleeper/RTSports columns)
- FantasyPros consensus season projections

The script stores only transformed player-level values needed by Fantasy Manager.
"""

from __future__ import annotations

import json
import math
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import requests
from bs4 import BeautifulSoup

YEAR = 2026
OUT = Path("data/market-2026.json")
UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150 Safari/537.36 "
    "FantasyManager/1.0"
)

ADP_URL = "https://www.fantasypros.com/nfl/adp/half-point-ppr-overall.php"
PROJ_URLS = {
    "QB": "https://www.fantasypros.com/nfl/projections/qb.php?week=draft",
    "RB": "https://www.fantasypros.com/nfl/projections/rb.php?week=draft",
    "WR": "https://www.fantasypros.com/nfl/projections/wr.php?week=draft",
    "TE": "https://www.fantasypros.com/nfl/projections/te.php?week=draft",
    "K": "https://www.fantasypros.com/nfl/projections/k.php?week=draft",
    "D/ST": "https://www.fantasypros.com/nfl/projections/dst.php?week=draft",
}

TEAM_BY_DEFENSE = {
    "Arizona Cardinals": "ARI", "Atlanta Falcons": "ATL", "Baltimore Ravens": "BAL",
    "Buffalo Bills": "BUF", "Carolina Panthers": "CAR", "Chicago Bears": "CHI",
    "Cincinnati Bengals": "CIN", "Cleveland Browns": "CLE", "Dallas Cowboys": "DAL",
    "Denver Broncos": "DEN", "Detroit Lions": "DET", "Green Bay Packers": "GB",
    "Houston Texans": "HOU", "Indianapolis Colts": "IND", "Jacksonville Jaguars": "JAC",
    "Kansas City Chiefs": "KC", "Las Vegas Raiders": "LV", "Los Angeles Chargers": "LAC",
    "Los Angeles Rams": "LAR", "Miami Dolphins": "MIA", "Minnesota Vikings": "MIN",
    "New England Patriots": "NE", "New Orleans Saints": "NO", "New York Giants": "NYG",
    "New York Jets": "NYJ", "Philadelphia Eagles": "PHI", "Pittsburgh Steelers": "PIT",
    "San Francisco 49ers": "SF", "Seattle Seahawks": "SEA", "Tampa Bay Buccaneers": "TB",
    "Tennessee Titans": "TEN", "Washington Commanders": "WAS",
}

TEAM_ALIASES = {"JAX": "JAC", "KCC": "KC", "GBP": "GB", "NEP": "NE", "NOS": "NO", "SFO": "SF", "TBB": "TB", "LVR": "LV"}


def canon_name(value: str) -> str:
    value = value.lower()
    value = re.sub(r"\b(jr|sr|ii|iii|iv)\b\.?", "", value)
    return re.sub(r"[^a-z0-9]", "", value)


def canon_team(value: str) -> str:
    v = (value or "").strip().upper()
    return TEAM_ALIASES.get(v, v)


def f(value: Any) -> float | None:
    if value is None:
        return None
    s = str(value).replace(",", "").replace("—", "").strip()
    if not s or s.upper() in {"NA", "N/A", "-"}:
        return None
    try:
        n = float(s)
        return n if math.isfinite(n) else None
    except ValueError:
        return None


def round1(value: float | None) -> float | None:
    return None if value is None else round(value, 1)


def get_soup(url: str) -> BeautifulSoup:
    r = requests.get(
        url,
        headers={"User-Agent": UA, "Accept-Language": "en-US,en;q=0.9", "Accept": "text/html,application/xhtml+xml"},
        timeout=35,
    )
    r.raise_for_status()
    if "Fantasy Football" not in r.text and "Average Draft Position" not in r.text:
        raise RuntimeError(f"Unexpected response from {url}")
    return BeautifulSoup(r.text, "html.parser")


def data_table(soup: BeautifulSoup):
    table = soup.find("table", id="data") or soup.find("table")
    if not table:
        raise RuntimeError("FantasyPros data table not found")
    return table


def header_cells(table) -> list[str]:
    rows = table.find("thead").find_all("tr") if table.find("thead") else []
    if not rows:
        return []
    # The final header row contains the concrete columns on FantasyPros tables.
    return [x.get_text(" ", strip=True) for x in rows[-1].find_all(["th", "td"])]


def cell_texts(tr) -> list[str]:
    return [c.get_text(" ", strip=True) for c in tr.find_all("td", recursive=False)]


def player_name_from_cell(cell) -> str:
    link = cell.find("a")
    if link:
        name = link.get_text(" ", strip=True)
        if name:
            return name
    # Remove common trailing team/bye fragments if no link was found.
    text = cell.get_text(" ", strip=True)
    return re.sub(r"\s+[A-Z]{2,3}(?:\s*\(\d+\))?$", "", text).strip()


def team_bye_from_cell(cell, player_name: str) -> tuple[str, str]:
    text = cell.get_text(" ", strip=True)
    rest = text[len(player_name):].strip() if text.startswith(player_name) else text
    m = re.search(r"\b([A-Z]{2,3})\b(?:\s*\((\d+)\))?", rest)
    if m:
        return canon_team(m.group(1)), m.group(2) or ""
    return "", ""


def parse_adp() -> tuple[dict[str, dict[str, Any]], str]:
    soup = get_soup(ADP_URL)
    table = data_table(soup)
    headers = header_cells(table)
    norm = [re.sub(r"[^a-z0-9]", "", h.lower()) for h in headers]

    def idx(*names: str) -> int | None:
        for name in names:
            key = re.sub(r"[^a-z0-9]", "", name.lower())
            if key in norm:
                return norm.index(key)
        return None

    i_player = idx("Player (Bye)", "Player")
    i_pos = idx("POS", "Position")
    i_yahoo = idx("Yahoo", "Yahoo! Sports")
    i_sleeper = idx("Sleeper")
    i_avg = idx("AVG", "Average")
    i_rank = idx("Rank", "RK")
    if i_player is None:
        i_player = 1
    if i_pos is None:
        i_pos = 2

    players: dict[str, dict[str, Any]] = {}
    for tr in table.select("tbody tr"):
        cells = tr.find_all("td", recursive=False)
        if len(cells) <= max(i_player, i_pos):
            continue
        name = player_name_from_cell(cells[i_player])
        if not name:
            continue
        team, bye = team_bye_from_cell(cells[i_player], name)
        pos_text = cells[i_pos].get_text(" ", strip=True).upper()
        pos = re.sub(r"\d+$", "", pos_text).replace("DST", "D/ST")
        if pos not in {"QB", "RB", "WR", "TE", "K", "D/ST"}:
            continue
        row = cell_texts(tr)
        record = {
            "name": name,
            "team": team,
            "position": pos,
            "bye": bye,
            "adp": f(row[i_avg]) if i_avg is not None and i_avg < len(row) else None,
            "yahooAdp": f(row[i_yahoo]) if i_yahoo is not None and i_yahoo < len(row) else None,
            "sleeperAdp": f(row[i_sleeper]) if i_sleeper is not None and i_sleeper < len(row) else None,
            "adpRank": f(row[i_rank]) if i_rank is not None and i_rank < len(row) else None,
        }
        players[canon_name(name)] = record

    if len(players) < 100:
        raise RuntimeError(f"ADP scrape returned only {len(players)} players")

    heading = soup.find(["h1", "h2"], string=re.compile("2026|ADP", re.I))
    return players, heading.get_text(" ", strip=True) if heading else "2026 Half-PPR ADP"


def parse_projection_date(soup: BeautifulSoup) -> str:
    text = " ".join(x.get_text(" ", strip=True) for x in soup.find_all(["h1", "h2"])[:4])
    m = re.search(r"(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},\s+2026", text, re.I)
    return m.group(0) if m else ""


def stats_values(tr) -> tuple[str, str, list[float | None]]:
    cells = tr.find_all("td", recursive=False)
    if not cells:
        return "", "", []
    name = player_name_from_cell(cells[0])
    team, _ = team_bye_from_cell(cells[0], name)
    vals = [f(c.get_text(" ", strip=True)) for c in cells[1:]]
    return name, team, vals


def yahoo_half_ppr_points(pos: str, vals: list[float | None]) -> tuple[float | None, str]:
    z = lambda i: vals[i] or 0.0 if i < len(vals) else 0.0
    try:
        if pos == "QB":
            # pass ATT, CMP, YDS, TD, INT, rush ATT, YDS, TD, FL, source FPTS
            pts = z(2) / 25 + z(3) * 4 - z(4) + z(6) / 10 + z(7) * 6 - z(8) * 2
            return round1(pts), "exact-offense"
        if pos == "RB":
            # rush ATT, YDS, TD, REC, rec YDS, rec TD, FL, source FPTS
            pts = z(1) / 10 + z(2) * 6 + z(3) * 0.5 + z(4) / 10 + z(5) * 6 - z(6) * 2
            return round1(pts), "exact-offense"
        if pos == "WR":
            # REC, rec YDS, rec TD, rush ATT, rush YDS, rush TD, FL, source FPTS
            pts = z(0) * 0.5 + z(1) / 10 + z(2) * 6 + z(4) / 10 + z(5) * 6 - z(6) * 2
            return round1(pts), "exact-offense"
        if pos == "TE":
            # REC, YDS, TD, FL, source FPTS (FantasyPros currently has this layout)
            if len(vals) >= 5:
                pts = z(0) * 0.5 + z(1) / 10 + z(2) * 6 - z(3) * 2
                return round1(pts), "exact-offense"
        if pos == "K":
            # Distance buckets are not in the consensus projection table. Use source FPTS as approximation.
            return round1(vals[-1] if vals else None), "approx-kicker"
        if pos == "D/ST":
            # Full Yahoo PA bucket/block-kick detail is not projected. Use source FPTS as approximation.
            return round1(vals[-1] if vals else None), "approx-defense"
    except (IndexError, TypeError):
        pass
    return round1(vals[-1] if vals else None), "source-fpts"


def parse_projections() -> tuple[dict[str, dict[str, Any]], str]:
    out: dict[str, dict[str, Any]] = {}
    dates: list[str] = []
    for pos, url in PROJ_URLS.items():
        soup = get_soup(url)
        d = parse_projection_date(soup)
        if d:
            dates.append(d)
        table = data_table(soup)
        count = 0
        for tr in table.select("tbody tr"):
            name, team, vals = stats_values(tr)
            if not name or not vals:
                continue
            if pos == "D/ST":
                team = TEAM_BY_DEFENSE.get(name, team)
            custom, quality = yahoo_half_ppr_points(pos, vals)
            source_fpts = round1(vals[-1] if vals else None)
            key = canon_name(name)
            out[key] = {
                "name": name,
                "team": canon_team(team),
                "position": pos,
                "projection": custom,
                "sourceProjection": source_fpts,
                "projectionQuality": quality,
            }
            count += 1
        if count < (20 if pos in {"K", "D/ST", "QB", "TE"} else 40):
            raise RuntimeError(f"Projection scrape for {pos} returned only {count} rows")
    return out, max(dates) if dates else ""


def build() -> dict[str, Any]:
    adp, adp_label = parse_adp()
    proj, proj_date = parse_projections()
    keys = set(adp) | set(proj)
    players = []
    for key in keys:
        a = adp.get(key, {})
        p = proj.get(key, {})
        name = p.get("name") or a.get("name") or ""
        team = p.get("team") or a.get("team") or ""
        pos = p.get("position") or a.get("position") or ""
        if not name or not pos:
            continue
        players.append({
            "name": name,
            "team": canon_team(team),
            "position": pos,
            "bye": a.get("bye") or "",
            "adp": round1(a.get("adp")),
            "yahooAdp": round1(a.get("yahooAdp")),
            "sleeperAdp": round1(a.get("sleeperAdp")),
            "adpRank": round1(a.get("adpRank")),
            "projection": p.get("projection"),
            "sourceProjection": p.get("sourceProjection"),
            "projectionQuality": p.get("projectionQuality") or "",
        })

    players.sort(key=lambda x: (
        x["yahooAdp"] if x["yahooAdp"] is not None else x["adp"] if x["adp"] is not None else 9999,
        -(x["projection"] or 0),
        x["name"],
    ))

    if len(players) < 150:
        raise RuntimeError(f"Combined market data returned only {len(players)} players")

    return {
        "schemaVersion": 1,
        "season": YEAR,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "projectionDate": proj_date,
        "adpLabel": adp_label,
        "sources": {
            "adp": "FantasyPros 2026 Half-PPR ADP composite",
            "adpComponents": ["Yahoo", "Sleeper", "RTSports"],
            "projection": "FantasyPros consensus season projections",
            "projectionComponents": ["ESPN", "CBS Sports", "FFToday"],
            "scoring": "Yahoo league custom half-PPR scoring supplied by league owner",
        },
        "notes": {
            "offenseProjection": "QB/RB/WR/TE points are recalculated from projected stats using the league's 0.5 PPR, 25 pass yards/pt, 4 pass TD, -1 INT, 10 rush/rec yards/pt, 6 TD and -2 fumble-lost settings.",
            "kickerProjection": "Approximate because consensus projections do not expose field-goal distance buckets.",
            "defenseProjection": "Approximate because consensus projections do not expose every Yahoo points-allowed bucket and blocked-kick component.",
        },
        "players": players,
    }


def main() -> None:
    data = build()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Wrote {len(data['players'])} players to {OUT}")


if __name__ == "__main__":
    main()

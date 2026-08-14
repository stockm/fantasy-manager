#!/usr/bin/env python3
"""Build browser-friendly 2026 draft market data for Fantasy Manager.

ADP: Fantasy Football Calculator's public 14-team half-PPR REST API.
Projections: FantasyPros public 2026 consensus season-projection pages.
QB/RB/WR/TE projected points are recalculated with the user's Yahoo scoring.
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
UA = "FantasyManager/1.0 (+https://stockm.github.io/fantasy-manager/)"
FFC_ADP_URL = "https://fantasyfootballcalculator.com/api/v1/adp/half-ppr?teams=14&year=2026&position=all"
PROJ_URLS = {
    "QB": "https://www.fantasypros.com/nfl/projections/qb.php?week=draft",
    "RB": "https://www.fantasypros.com/nfl/projections/rb.php?week=draft",
    "WR": "https://www.fantasypros.com/nfl/projections/wr.php?week=draft",
    "TE": "https://www.fantasypros.com/nfl/projections/te.php?week=draft",
    "K": "https://www.fantasypros.com/nfl/projections/k.php?week=draft",
    "D/ST": "https://www.fantasypros.com/nfl/projections/dst.php?week=draft",
}
TEAM_ALIASES = {"JAX":"JAC","KCC":"KC","GBP":"GB","NEP":"NE","NOS":"NO","SFO":"SF","TBB":"TB","LVR":"LV","DEF":"D/ST","DST":"D/ST"}
TEAM_BY_DEFENSE = {
    "Arizona Cardinals":"ARI","Atlanta Falcons":"ATL","Baltimore Ravens":"BAL","Buffalo Bills":"BUF",
    "Carolina Panthers":"CAR","Chicago Bears":"CHI","Cincinnati Bengals":"CIN","Cleveland Browns":"CLE",
    "Dallas Cowboys":"DAL","Denver Broncos":"DEN","Detroit Lions":"DET","Green Bay Packers":"GB",
    "Houston Texans":"HOU","Indianapolis Colts":"IND","Jacksonville Jaguars":"JAC","Kansas City Chiefs":"KC",
    "Las Vegas Raiders":"LV","Los Angeles Chargers":"LAC","Los Angeles Rams":"LAR","Miami Dolphins":"MIA",
    "Minnesota Vikings":"MIN","New England Patriots":"NE","New Orleans Saints":"NO","New York Giants":"NYG",
    "New York Jets":"NYJ","Philadelphia Eagles":"PHI","Pittsburgh Steelers":"PIT","San Francisco 49ers":"SF",
    "Seattle Seahawks":"SEA","Tampa Bay Buccaneers":"TB","Tennessee Titans":"TEN","Washington Commanders":"WAS",
}


def canon_name(v: str) -> str:
    v = v.lower()
    v = re.sub(r"\b(jr|sr|ii|iii|iv)\b\.?", "", v)
    return re.sub(r"[^a-z0-9]", "", v)


def canon_team(v: str) -> str:
    x = (v or "").strip().upper()
    return TEAM_ALIASES.get(x, x)


def number(v: Any) -> float | None:
    if v is None: return None
    s = str(v).replace(",", "").replace("—", "").strip()
    if not s or s.upper() in {"NA","N/A","-"}: return None
    try:
        x = float(s)
        return x if math.isfinite(x) else None
    except ValueError:
        return None


def r1(v: float | None) -> float | None:
    return None if v is None else round(v, 1)


def get(url: str, *, json_response: bool = False):
    r = requests.get(url, headers={"User-Agent": UA, "Accept-Language":"en-US,en;q=0.9"}, timeout=35)
    r.raise_for_status()
    return r.json() if json_response else r.text


def parse_adp() -> dict[str, dict[str, Any]]:
    payload = get(FFC_ADP_URL, json_response=True)
    rows = payload.get("players", payload if isinstance(payload, list) else [])
    out: dict[str, dict[str, Any]] = {}
    for p in rows:
        name = str(p.get("name") or "").strip()
        pos = str(p.get("position") or "").upper().replace("DEF", "D/ST").replace("DST", "D/ST")
        if not name or pos not in {"QB","RB","WR","TE","K","D/ST"}: continue
        out[canon_name(name)] = {
            "name": name,
            "team": canon_team(str(p.get("team") or "")),
            "position": pos,
            "bye": str(p.get("bye") or ""),
            "adp": number(p.get("adp")),
            "adpHigh": number(p.get("high")),
            "adpLow": number(p.get("low")),
            "adpStdev": number(p.get("stdev")),
            "timesDrafted": p.get("times_drafted"),
        }
    if len(out) < 100:
        raise RuntimeError(f"14-team half-PPR ADP API returned only {len(out)} usable players")
    return out


def soup(url: str) -> BeautifulSoup:
    return BeautifulSoup(get(url), "html.parser")


def projection_table(s: BeautifulSoup):
    node = s.find(id="data")
    if node:
        table = node if node.name == "table" else node.find_parent("table")
        if table: return table
    tables = s.find_all("table")
    for table in tables:
        text = table.get_text(" ", strip=True)
        if "Player" in text and ("FPTS" in text or "PASSING" in text or "RUSHING" in text): return table
    raise RuntimeError("FantasyPros projection table not found")


def player_name(cell) -> str:
    links = [a.get_text(" ", strip=True) for a in cell.find_all("a")]
    links = [x for x in links if x]
    if links: return max(links, key=len)
    text = cell.get_text(" ", strip=True)
    return re.sub(r"\s+[A-Z]{2,3}$", "", text).strip()


def team_from_cell(cell, name: str) -> str:
    text = cell.get_text(" ", strip=True)
    rest = text[len(name):].strip() if text.startswith(name) else text
    m = re.search(r"\b([A-Z]{2,3})\b", rest)
    return canon_team(m.group(1)) if m else ""


def projected_points(pos: str, vals: list[float | None]) -> tuple[float | None, str]:
    def z(i: int) -> float:
        return 0.0 if i >= len(vals) or vals[i] is None else float(vals[i])
    if pos == "QB" and len(vals) >= 10:
        return r1(z(2)/25 + z(3)*4 - z(4) + z(6)/10 + z(7)*6 - z(8)*2), "custom-yahoo-offense"
    if pos == "RB" and len(vals) >= 8:
        return r1(z(1)/10 + z(2)*6 + z(3)*0.5 + z(4)/10 + z(5)*6 - z(6)*2), "custom-yahoo-offense"
    if pos == "WR" and len(vals) >= 8:
        return r1(z(0)*0.5 + z(1)/10 + z(2)*6 + z(4)/10 + z(5)*6 - z(6)*2), "custom-yahoo-offense"
    if pos == "TE" and len(vals) >= 5:
        return r1(z(0)*0.5 + z(1)/10 + z(2)*6 - z(3)*2), "custom-yahoo-offense"
    return r1(vals[-1] if vals else None), "approx-source-fpts"


def projection_date(s: BeautifulSoup) -> str:
    text = " ".join(x.get_text(" ", strip=True) for x in s.find_all(["h1","h2"])[:5])
    m = re.search(r"(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},\s+2026", text, re.I)
    return m.group(0) if m else ""


def parse_projections() -> tuple[dict[str, dict[str, Any]], str]:
    out: dict[str, dict[str, Any]] = {}
    dates: list[str] = []
    for pos, url in PROJ_URLS.items():
        s = soup(url)
        d = projection_date(s)
        if d: dates.append(d)
        table = projection_table(s)
        rows = table.select("tbody tr") or table.select("tr")
        count = 0
        for tr in rows:
            cells = tr.find_all("td", recursive=False)
            if len(cells) < 2: continue
            name = player_name(cells[0])
            if not name or name.lower() == "player": continue
            team = TEAM_BY_DEFENSE.get(name, team_from_cell(cells[0], name)) if pos == "D/ST" else team_from_cell(cells[0], name)
            vals = [number(c.get_text(" ", strip=True)) for c in cells[1:]]
            if not any(v is not None for v in vals): continue
            points, quality = projected_points(pos, vals)
            out[canon_name(name)] = {
                "name": name, "team": team, "position": pos,
                "projection": points, "sourceProjection": r1(vals[-1]), "projectionQuality": quality,
            }
            count += 1
        minimum = 18 if pos in {"QB","TE","K","D/ST"} else 35
        if count < minimum:
            raise RuntimeError(f"Projection source for {pos} returned only {count} rows")
    return out, max(dates) if dates else ""


def build() -> dict[str, Any]:
    adp = parse_adp()
    projections, pdate = parse_projections()
    players = []
    for key in set(adp) | set(projections):
        a, p = adp.get(key, {}), projections.get(key, {})
        name = p.get("name") or a.get("name")
        pos = p.get("position") or a.get("position")
        if not name or not pos: continue
        players.append({
            "name": name,
            "team": canon_team(p.get("team") or a.get("team") or ""),
            "position": pos,
            "bye": a.get("bye") or "",
            "adp": r1(a.get("adp")),
            "adpHigh": r1(a.get("adpHigh")), "adpLow": r1(a.get("adpLow")), "adpStdev": r1(a.get("adpStdev")),
            "timesDrafted": a.get("timesDrafted"),
            "projection": p.get("projection"), "sourceProjection": p.get("sourceProjection"),
            "projectionQuality": p.get("projectionQuality") or "",
        })
    players.sort(key=lambda x: (x["adp"] if x["adp"] is not None else 9999, -(x["projection"] or 0), x["name"]))
    if len(players) < 150: raise RuntimeError(f"Combined market dataset returned only {len(players)} players")
    return {
        "schemaVersion": 2, "season": YEAR, "generatedAt": datetime.now(timezone.utc).isoformat(),
        "projectionDate": pdate,
        "sources": {
            "adp": "Fantasy Football Calculator 2026 14-team half-PPR ADP REST API",
            "projection": "FantasyPros 2026 consensus season projections",
            "scoring": "Custom Yahoo half-PPR league scoring supplied by league owner"
        },
        "notes": {
            "offenseProjection": "QB/RB/WR/TE are rescored from consensus projected stats for this league.",
            "kickerProjection": "Approximate: consensus projection does not expose every FG distance/miss bucket.",
            "defenseProjection": "Approximate: consensus projection does not expose every Yahoo points-allowed/blocked-kick input."
        },
        "players": players,
    }


def main() -> None:
    data = build()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Wrote {len(data['players'])} players to {OUT}")

if __name__ == "__main__": main()

# Fantasy Manager

**Fantasy Manager** is an AI-assisted fantasy football management and live draft assistant being developed by Kreativ Software LLC.

## Manual mode — available now

The GitHub Pages app works without Yahoo API credentials. League, roster and draft state is stored locally in the browser.

Current features:

- Preset for the owner's 2026 Yahoo 14-team half-PPR league
- Current 2026 redraft ECR independent of Yahoo
- Current **14-team half-PPR market ADP**
- 2026 season projection anchors plus calibrated deep-player estimates
- Draft recommendations combining ECR, market ADP, projected points, roster construction and positional scarcity
- Public active-player / injury-status enrichment
- Manual player entry and CSV override/import
- Live snake-draft tracking for every team
- Automatic round, overall-pick and team-slot calculation
- Automatic roster building from the user's recorded draft selections
- Weekly projection editing and legal lineup optimization
- Undo last draft pick, full draft board, JSON backup/restore
- Local-only league/draft storage via `localStorage`

Use the site at `https://stockm.github.io/fantasy-manager/`.

## Yahoo league preset

Manual mode is preconfigured for the owner's 2026 Yahoo league:

- 14 teams, one-QB, half-PPR, head-to-head
- Draft slot 12
- Live draft: Sunday Aug 16, 2026 at 9:00 PM EDT / 6:00 PM PDT
- 90-second draft clock
- Draftable roster: QB, 2 WR, 2 RB, TE, W/R/T, K, DEF, 5 bench
- 2 IR slots stored separately; IR does **not** extend the draft, so the draft is 14 rounds
- FAB waivers with continual rolling-list tiebreak and Game Time–Tuesday weekly waivers
- 8-team playoffs in Weeks 15–17
- Commissioner trade review; Nov 28, 2026 trade deadline

The supplied Yahoo scoring rules are stored in the preset, including 0.5 per reception, 25 passing yards/point, 4-point passing TDs, -1 interceptions, 10 rushing/receiving yards/point, 6-point rushing/receiving TDs and -2 fumbles lost, plus the supplied kicker and D/ST rules.

## Draft intelligence

The recommendation score is league-aware rather than a simple ranking sort. It combines:

1. **ECR** — current expert consensus signal.
2. **14-team half-PPR ADP** — current market cost and the probability a player survives to the owner's next selection.
3. **Season projected points** — used for cross-player expected output.
4. **Value over replacement (VORP)** — calculated from this league's 14-team roster demand.
5. **Positional cliff** — the projected point drop to the next group of players at that position.
6. **Roster construction** — open starting slots, flex needs, one-QB handling and depth.
7. **Draft timing** — early K/DST penalties and value gained when a player falls beyond ADP.
8. **Player status** — injury/status penalties from public metadata where available.

### Market ADP

Market ADP comes from Fantasy Football Calculator's public **2026 14-team half-PPR REST API**. This is intentionally aligned to the league size instead of using generic 10- or 12-team ADP. The feed stores ADP, high/low draft position, standard deviation and sample/draft-count metadata when supplied.

### Season projections

The public FantasyPros 2026 projection pages provide consensus season-projection anchors. For QB/RB/WR/TE, the app's data job recalculates the displayed fantasy points from those projected stats using the league's Yahoo scoring where the required stat fields are available.

The unauthenticated public pages expose only a limited set of projection rows to the automated updater. To keep the draft board complete without requiring another API key, deeper players receive a **position-specific ADP-calibrated season estimate** fitted to the available consensus anchors. The JSON records whether each projection is a consensus/custom-scored anchor or a calibrated estimate, and the UI preserves manual projection overrides.

Kicker and D/ST projections are marked approximate because the public projection rows do not expose every distance/miss bucket or every Yahoo points-allowed/blocked-kick input.

### Automated refresh

`.github/workflows/update-market-data.yml` refreshes the market dataset daily and can also be run manually. The workflow validates the browser JavaScript and Python updater before writing `data/market-2026.json`.

## Live 2026 player data

### Rankings

Draft ECR is loaded from DynastyProcess's published `db_fpecr_latest.csv`, the same latest FantasyPros expert-consensus dataset exposed by nflverse/nflreadr.

- Normal redraft leagues use PPR Overall ECR as the independent consensus feed.
- Leagues with a SUPERFLEX slot use PPR Superflex ECR automatically.
- The app stores ECR range, ranking movement, bye week, ownership and source date where available.
- Market ADP and projections are layered on top rather than replacing ECR.

### Player metadata

Sleeper's public NFL player endpoint is used to enrich the player pool with available status/injury and player metadata. The app caches that metadata and avoids refreshing it more than roughly once per day.

### Draft safety

Automatic background data replacement is disabled after draft picks have been recorded. Manual refresh during an active draft requires confirmation and preserves existing picks/player IDs while allowing recommendations to reorder.

### Manual fallback

The app continues to accept CSV files with these columns:

```csv
name,team,position,rank,adp,projection,bye,tier,status
```

Manual projection edits are treated as overrides and are not overwritten by the market refresh.

## Planned Yahoo Fantasy Sports API integration

Fantasy Manager is seeking access to the Yahoo Fantasy Sports API. Yahoo will eventually become a league/roster/transaction provider for the same internal model; the independent ECR, ADP and projection intelligence remains useful even after Yahoo sync is enabled.

Planned synced capabilities include league settings/rosters, matchups, standings, player availability, waivers, transactions, injury/bye monitoring, start/bench recommendations and user-approved write actions if appropriate access is granted.

## Privacy

Manual-mode league, draft and roster information is stored in the user's browser. Public rankings/player feeds contain no Yahoo account credentials. Authentication credentials, client secrets and OAuth tokens must never be committed to this repository.

See [privacy.html](privacy.html) for the privacy statement.

## Yahoo attribution

Once Yahoo Fantasy API access is approved and Yahoo Fantasy data is displayed in the product, Fantasy Manager will include the required Yahoo Fantasy attribution and approved branding assets in accordance with Yahoo's developer requirements.

---

Fantasy Manager is an independent product by Kreativ Software LLC.

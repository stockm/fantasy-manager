# Fantasy Manager

**Fantasy Manager** is an AI-assisted fantasy football management and live draft assistant being developed by Kreativ Software LLC.

## Manual mode — available now

The GitHub Pages app works without Yahoo API credentials. League, roster and draft state is stored locally in the browser.

Current features:

- League and roster configuration
- Current 2026 redraft rankings feed independent of Yahoo
- Public active-player / injury-status enrichment
- Manual player entry
- CSV rankings / ADP / projection import
- Live snake-draft tracking for every team
- Automatic round, overall-pick and team-slot calculation
- Best-available draft recommendations using ECR, ADP, roster need, player status and projections
- Automatic roster building from the user's recorded draft selections
- Manual roster additions
- Weekly projection editing
- Legal lineup optimization for QB, RB, WR, TE, FLEX, SUPERFLEX, D/ST and K
- Undo last draft pick
- Full draft board
- JSON backup and restore
- Local-only league/draft storage via `localStorage`

Use the site at `https://stockm.github.io/fantasy-manager/`.

## Live 2026 player data

The app can refresh a current player pool without Yahoo credentials.

### Rankings

Draft ECR is loaded from DynastyProcess's published `db_fpecr_latest.csv`, the same latest FantasyPros expert-consensus dataset exposed by nflverse/nflreadr.

- Normal redraft leagues use **PPR Overall ECR**.
- Leagues with a SUPERFLEX slot use **PPR Superflex ECR** automatically.
- The app stores ECR best/worst range, ranking movement, bye week, ownership and source date where available.
- Existing manually imported ADP and projections are preserved when live ECR refreshes.
- Standard and half-PPR leagues currently use the PPR overall consensus as the independent default; a scoring-specific CSV can still be imported for custom ADP/projections.

### Player metadata

Sleeper's public NFL player endpoint is used to enrich the player pool with available status/injury and player metadata. The app caches that metadata and avoids refreshing it more than roughly once per day.

### Draft safety

Automatic background ranking refresh is disabled after draft picks have been recorded. A manual refresh during an active draft requires confirmation and preserves all existing picks/player IDs while allowing recommendations to reorder.

### Manual fallback

The app continues to accept CSV files with these columns:

```csv
name,team,position,rank,adp,projection,bye,tier,status
```

Common alternatives such as `Player`, `Pos`, `ECR`, `Proj` and `FPTS` are also recognized.

## Planned Yahoo Fantasy Sports API integration

Fantasy Manager is seeking access to the Yahoo Fantasy Sports API. The intended integration uses OAuth 2.0 so each user explicitly authorizes access to their own fantasy information.

Yahoo will be implemented as a data provider for the same internal league/player/roster model used by manual mode. The independent rankings/player feed remains available even after Yahoo sync is added.

Planned synced capabilities include:

- League settings and rosters
- Matchups and standings
- Player availability
- Waivers and recent transactions
- Injury / bye monitoring
- Start / bench recommendations
- Waiver-wire and add/drop recommendations
- User-approved lineup or roster actions if appropriate write access is granted

## Privacy

Manual-mode league, draft and roster information is stored in the user's browser. Public rankings/player feeds contain no Yahoo account credentials. Authentication credentials, client secrets and OAuth tokens must never be committed to this repository.

See [privacy.html](privacy.html) for the privacy statement.

## Yahoo attribution

Once Yahoo Fantasy API access is approved and Yahoo Fantasy data is displayed in the product, Fantasy Manager will include the required Yahoo Fantasy attribution and approved branding assets in accordance with Yahoo's developer requirements.

---

Fantasy Manager is an independent product by Kreativ Software LLC.

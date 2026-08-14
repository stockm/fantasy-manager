# Fantasy Manager

**Fantasy Manager** is an AI-assisted fantasy football management and live draft assistant being developed by Kreativ Software LLC.

## Manual mode — available now

The GitHub Pages app works without Yahoo API credentials. Data is stored locally in the browser.

Current features:

- League and roster configuration
- Manual player entry
- CSV rankings / ADP / projection import
- Live snake-draft tracking for every team
- Automatic round, overall-pick and team-slot calculation
- Best-available draft recommendations using rank, ADP, roster need and projections
- Automatic roster building from the user's recorded draft selections
- Manual roster additions
- Weekly projection editing
- Legal lineup optimization for QB, RB, WR, TE, FLEX, SUPERFLEX, D/ST and K
- Undo last draft pick
- Full draft board
- JSON backup and restore
- Local-only storage via `localStorage`

Use the site at `https://stockm.github.io/fantasy-manager/`.

### Player CSV

The app accepts CSV files with these columns:

```csv
name,team,position,rank,adp,projection,bye,tier,status
```

Common alternatives such as `Player`, `Pos`, `ECR`, `Proj` and `FPTS` are also recognized.

## Planned Yahoo Fantasy Sports API integration

Fantasy Manager is seeking access to the Yahoo Fantasy Sports API. The intended integration uses OAuth 2.0 so each user explicitly authorizes access to their own fantasy information.

Yahoo will be implemented as a data provider for the same internal league/player/roster model used by manual mode. This means manual mode remains a fallback and the application does not need to be rewritten when API access is approved.

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

Manual-mode league, player, draft and roster information is stored in the user's browser. Authentication credentials, client secrets, and OAuth tokens must never be committed to this repository.

See [privacy.html](privacy.html) for the privacy statement.

## Yahoo attribution

Once Yahoo Fantasy API access is approved and Yahoo Fantasy data is displayed in the product, Fantasy Manager will include the required Yahoo Fantasy attribution and approved branding assets in accordance with Yahoo's developer requirements.

---

Fantasy Manager is an independent product by Kreativ Software LLC.

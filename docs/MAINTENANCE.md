# Profile README maintenance

This folder is a ready-to-publish profile package for [KD9Sa/KD9Sa](https://github.com/KD9Sa/KD9Sa). The profile itself is `README.md`; the supporting files keep images self-contained and statistics current.

## Publish

Copy `README.md`, `assets/`, `scripts/`, and `.github/workflows/profile-metrics.yml` into the existing public `KD9Sa/KD9Sa` repository. Keep the directory structure intact because image links are relative. Commit to its default branch. The existing repository uses `master`.

The metrics workflow runs on the initial workflow/script push, daily at **04:23 UTC**, and through **Actions → Refresh profile metrics → Run workflow**. It uses the automatic repository `GITHUB_TOKEN`; no personal access token, additional service, or secret is needed. It requests `contents: write` so its bot can commit refreshed charts. Repository rules must permit those bot updates.

The README and its current charts render immediately, even before the first workflow run. Nothing in this package publishes changes to GitHub automatically from this local workspace.

## Statistics

Run with Node.js 24 or later:

```sh
node scripts/update-metrics.mjs
```

Re-render the existing snapshot without network access:

```sh
node scripts/update-metrics.mjs --offline
```

The generator uses first-party GitHub services:

- REST `/users/KD9Sa/repos`: public repository count, stars on owned non-fork repositories, and per-repository language bytes.
- Public GitHub contribution calendar: reported contributions, per-day counts, and intensity levels. These are GitHub contributions, not a claim about public commits; GitHub may display anonymized private activity when a profile owner enables it.
- Language shares include owned public repositories, excluding forks and `KD9Sa/KD9Sa`. They measure GitHub-detected code bytes, not skill level or hours worked. Small languages are grouped as “Other.”

The full displayed calendar can include a partial week before the nominal year boundary. Charts use the exact verified date range. Mobile charts group those same daily counts by calendar month, with partial boundary months identified. The raw source values and collection timestamp are saved in `assets/metrics/snapshot.json`. Light/dark and desktop/mobile variants share those same source values.

All data is fetched and validated before graphics are replaced. A failed request or changed contribution-page markup leaves the existing charts in place and fails the workflow visibly. The charts display their snapshot dates so an old result is never presented as a fresh measurement. Inspect the Actions log if a refresh fails. [GitHub can disable scheduled workflows](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule) after 60 days without repository activity; re-enable the workflow or run it manually if needed.

## Content and image provenance

Research date: **October 22, 2026**. Live GitHub API responses were used because cached search/profile pages omitted the newest repositories.

| Item | Verified source |
| --- | --- |
| Name, location, developer identity | [GitHub profile](https://github.com/KD9Sa), [existing profile README](https://github.com/KD9Sa/KD9Sa/blob/master/README.md) |
| LinkedIn contact | Existing profile README and GitHub profile social link |
| Avenor | [Source at reviewed commit](https://github.com/KD9Sa/Avenor/tree/c8c26580cdaa5a89d2b254dfccf918597001da41) |
| Oriva | [Source at reviewed commit](https://github.com/KD9Sa/Oriva/tree/76d73ca280129192680a91e6d8fb2937cf08cad1) |
| FENN | [Source at reviewed commit](https://github.com/KD9Sa/FENN/tree/1a86e3e25e59d4c8a9ef7cb499db3e07e6191d9d) |
| Meridian | [Source at reviewed commit](https://github.com/KD9Sa/Meridian/tree/c242176216684b50128163c66d39e8faa673f4c9) |
| Requested engineering philosophy, stack, and AI workflow | Profile owner's explicit brief; written as personal approach without invented credentials, years, or proficiency scores |

The selected projects prioritize actual recent code and relevance to .NET/Angular. Their descriptions were checked against implementation files and tests, rather than repository descriptions alone. Avenor has layered backend projects, tenant guards, authorization, concurrency checks, and test coverage in source. No production deployment, proven scale, or verified Docker/SQL Server execution is claimed. Oriva and FENN are explicitly frontend demonstrations with local state and simulated transactions. Meridian is a UI concept with fixed demonstration data.

Screenshots are genuine repository assets, resized proportionally to 960 pixels wide and JPEG-optimized without altering interface content:

| Local asset | Original source at reviewed commit |
| --- | --- |
| `assets/projects/avenor.jpg` | [Avenor dashboard](https://raw.githubusercontent.com/KD9Sa/Avenor/c8c26580cdaa5a89d2b254dfccf918597001da41/docs/assets/dashboard.jpg) |
| `assets/projects/oriva.jpg` | [Oriva discovery](https://raw.githubusercontent.com/KD9Sa/Oriva/76d73ca280129192680a91e6d8fb2937cf08cad1/docs/assets/screenshots/search-results.png) |
| `assets/projects/fenn.jpg` | [FENN menu](https://raw.githubusercontent.com/KD9Sa/FENN/1a86e3e25e59d4c8a9ef7cb499db3e07e6191d9d/docs/screenshots/menu-preview.png) |

Technology icons are vendored from [Devicon](https://github.com/devicons/devicon/tree/6a37858047b0e8d9c9c0e68f4a071fc410652e89/icons), at commit `6a37858047b0e8d9c9c0e68f4a071fc410652e89`. The MIT license is preserved at `assets/icons/LICENSE`; technology trademarks remain their owners' property. Vendoring avoids runtime CDN requests. The banner and chart SVGs are local, static vector assets with accessible titles, descriptions, and theme variants. No public statistics-card server is required.

## Updating the profile

Keep project descriptions aligned with the actual implementation. Replace screenshots when interfaces materially change. Contact links intentionally include only the verified public GitHub and LinkedIn identities; no email address or availability claim was invented.

## Delivery checks

- GitHub's official Markdown rendering API accepted the finished README, preserving its picture sources and collapsible screenshot previews.
- Local browser previews at 1280 and 375 pixels, in light and dark appearances, decoded every image, selected the intended responsive assets, and had no horizontal overflow or broken navigation anchors.
- All seven distinct GitHub destinations in the profile returned HTTP 200. LinkedIn matches the existing published contact URL, but returned its anti-bot HTTP 999 response to the automated check; its destination page was not independently inspected.
- The metrics updater passed a live fetch, syntax validation, deterministic offline regeneration, and SVG XML validation. The GitHub-hosted workflow itself will first execute when these files are published.
- The three optimized project screenshots total approximately 234 KiB. All visual assets render locally without an external image or badge service.

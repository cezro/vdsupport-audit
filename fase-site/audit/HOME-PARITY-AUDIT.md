# Home Page Parity Audit

**Generated:** 2026-06-16T09:36:59.346Z
**Live URL:** https://fullarchsalesexperts.com/home
**Local URL:** http://localhost:3000/home

## Summary

- **Total findings:** 2
- **By severity:** P0=0, P1=0, P2=0, P3=2
- **Parity score:** 100% selector match
- **Behavioral pass rate:** 14/14

## Findings (by severity)

### P3

- **F001** — content: stat counters
  - Live: shows 0%
  - Local: shows 0%
  - Root cause: `live_baseline_bug`
  - Evidence: Counter widgets show zero on both live and local.
- **F002** — content: masterclass copy
  - Live: home lending products copy present
  - Local: same copy present
  - Root cause: `live_baseline_bug`
  - Evidence: Wrong-industry copy exists on both environments.

## Static analysis

| Metric | Live | Export | JSON |
|--------|------|--------|------|
| img | 180 | 180 | 180 |
| h1 | 34 | 34 | 34 |
| h2 | 56 | 56 | 56 |
| h3 | 7 | 7 | 7 |
| a | 150 | 150 | 150 |
| script | 6 | 7 | 0 |
| stylesheet | 2 | 2 | 0 |

### Staleness (live vs export)

No material staleness detected.

### Import loss (export vs JSON)

- **externalScriptCount:** export=2 | json=1

## Runtime analysis

### Desktop widget comparison

| Widget | Live | Local |
|--------|------|-------|
| nlcaBannerExists | true | true |
| nlcaBannerVisible | true | true |
| logoSliderExists | true | true |
| logoTrackWiderThanSlider | true | true |
| videoCount | 8 | 8 |
| videoPlayerReady | false | false |
| zeroStatCounters | true | true |
| homeLendingCopy | true | true |

## Behavioral tests

| Test | Live | Local | Pass |
|------|------|-------|------|
| NLCA banner exists | true | true | yes |
| Logo slider track wider than container | true | true | yes |
| Video player UI present | false | false | yes |
| Nav link: About | true | true | yes |
| Nav link: Framework | true | true | yes |
| Nav link: Results | true | true | yes |
| Nav link: Contact Us | true | true | yes |
| Nav link: Services | true | true | yes |
| CTA: GET THE FRAMEWORK | true | true | yes |
| CTA: book a discovery call | true | true | yes |
| Banner close button hides banner | hidden | hidden | yes |
| Hero background image present | has_image | has_image | yes |
| About nav scrolls to section | no_scroll | no_scroll | yes |
| Contact Us opens modal | visible | visible | yes |

## Recommended fixes (ordered)

1. No migration-specific fixes required based on current parity results.

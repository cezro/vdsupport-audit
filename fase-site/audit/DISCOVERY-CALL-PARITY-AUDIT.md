# Home Page Parity Audit

**Generated:** 2026-06-16T09:31:04.177Z
**Live URL:** https://fullarchsalesexperts.com/discovery-call
**Local URL:** http://localhost:3000/discovery-call

## Summary

- **Total findings:** 0
- **By severity:** P0=0, P1=0, P2=0, P3=0
- **Parity score:** 0% selector match
- **Behavioral pass rate:** 12/12

## Findings (by severity)

## Static analysis

| Metric | Live | Export | JSON |
|--------|------|--------|------|
| img | 4 | 4 | 4 |
| h1 | 2 | 2 | 2 |
| h2 | 6 | 6 | 6 |
| h3 | 0 | 0 | 0 |
| a | 6 | 6 | 6 |
| script | 8 | 9 | 0 |
| stylesheet | 17 | 17 | 0 |

### Staleness (live vs export)

No material staleness detected.

### Import loss (export vs JSON)

- **externalScriptCount:** export=7 | json=6

## Runtime analysis

### Desktop widget comparison

| Widget | Live | Local |
|--------|------|-------|
| nlcaBannerExists | false | false |
| nlcaBannerVisible | false | false |
| logoSliderExists | false | false |
| logoTrackWiderThanSlider | false | false |
| videoCount | 0 | 0 |
| videoPlayerReady | false | false |
| zeroStatCounters | false | false |
| homeLendingCopy | false | false |

## Behavioral tests

| Test | Live | Local | Pass |
|------|------|-------|------|
| NLCA banner exists | false | false | yes |
| Logo slider track wider than container | false | false | yes |
| Video player UI present | false | false | yes |
| Nav link: About | false | false | yes |
| Nav link: Framework | false | false | yes |
| Nav link: Results | false | false | yes |
| Nav link: Contact Us | false | false | yes |
| Nav link: Services | false | false | yes |
| CTA: GET THE FRAMEWORK | false | false | yes |
| CTA: book a discovery call | false | false | yes |
| Banner close button hides banner | no_banner_or_close | no_banner_or_close | yes |
| Discovery calendar loaded | loaded | loaded | yes |

## Recommended fixes (ordered)

1. No migration-specific fixes required based on current parity results.

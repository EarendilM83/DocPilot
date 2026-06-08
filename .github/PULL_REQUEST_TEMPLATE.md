<!--
Thanks for the PR! A few minutes spent filling this out saves hours of back-and-forth.
Delete sections that don't apply.
-->

## Summary

<!-- A paragraph: what changes and why. Imperative voice (e.g., "Fix sidebar hover text invisibility in dark mode."). -->

## Linked issues

<!-- "Closes #42", "Refs #99". Multiple issues OK. -->
Closes #

## Test plan

<!--
How does a reviewer verify your change? Bullet list with concrete steps.
Examples:
  - [ ] Open /c/demo, log in, hover any item in the "Recently updated" card. Text stays readable.
  - [ ] Run `npm run typecheck` — no new errors.
  - [ ] DevTools Console clean after a full page load.
-->

- [ ] 
- [ ] 

## Screenshots / video

<!-- For visible changes. Before + after if you can. Loom links are great for interactions. -->

## Risk

<!-- One sentence on what could go sideways. "Low — touches CSS only." "Medium — changes auth flow; needs careful review." -->

## Checklist

- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes
- [ ] `npm run build` succeeds
- [ ] No new console errors / warnings in browser DevTools
- [ ] Touches platform code only? (If you touched `content/`, `src/data/manualContent.ts`, `server/seed-state.json`, or `public/images/{the sample product,backoffice,manual}/`, this PR is going to the wrong repo — those are private-overlay paths.)

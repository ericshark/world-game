# Balance and answer accuracy

## Computer opponents

`scripts/simulate.ts` plays each bot skill against the rules (`npx tsx scripts/simulate.ts 300 60`).
Measured 2026-10-23, 300 rounds per cell and 60 duels per pair, countries without micro-states.
`server/balance.test.ts` keeps the important properties from regressing.

```

Points per round (median / mean), 300 rounds each, countries without micro-states

World
skill         find          capital       name it       rare earth
novice        935 / 728     822 / 688     200 / 369     100 / 223
traveller     1000 / 880    1000 / 854    200 / 527     328 / 359
explorer      1000 / 967    1000 / 951    1000 / 649    536 / 521
cartographer  1000 / 993    1000 / 986    1000 / 794    707 / 638

Europe
skill         find          capital       name it       rare earth
novice        755 / 585     651 / 544     200 / 371     100 / 211
traveller     1000 / 792    1000 / 767    200 / 523     343 / 352
explorer      1000 / 916    1000 / 913    1000 / 632    506 / 478
cartographer  1000 / 983    1000 / 976    1000 / 775    731 / 646

Africa
skill         find          capital       name it       rare earth
novice        951 / 688     739 / 628     200 / 365     101 / 229
traveller     1000 / 874    994 / 821     200 / 528     318 / 366
explorer      1000 / 963    1000 / 935    1000 / 656    548 / 527
cartographer  1000 / 993    1000 / 983    1000 / 755    658 / 607

Duels, 60 per pair: first skill's win rate (rounds per game)
              novice        traveller     explorer      cartographer
novice        35% (10.0)    5% (9.4)      2% (8.6)      0% (8.4)
traveller     83% (9.5)     48% (11.6)    13% (11.2)    2% (10.0)
explorer      98% (8.7)     77% (11.1)    57% (12.7)    28% (12.3)
cartographer  100% (8.2)    90% (10.3)    63% (12.1)    53% (13.9)
```

What the tables say:

- Better bots score more on every kind of round, and Rare Earth tops out well below the maximum
  (rarity is the point), so no skill level is trivial or perfect there.
- A one-level gap wins about 80–90% of duels; two levels about 98%. Equal bots split the games,
  and a duel lasts 8–14 rounds. These curves suit a ladder and a "pick your bot" choice.
- Bots at "traveller" and above hit more than half of the Find and Capital rounds outright
  (median 1,000). The bots' knowledge is a guess at a player's, not measured on people, so the
  scoring cutoffs, the GeoRush ramp, the Journey par bands and the Duel damage were **not**
  retuned: that needs real play data. Revisit them once there are results from real players.

## Answer data

`src/geo/audit.test.ts` checks the data that answers are judged by:

- Names that sound alike: the four Guineas, the two Congos (a bare "Congo" asks which), Niger and
  Nigeria (and typos that land between them), Dominica and the Dominican Republic, the two Sudans
  and Koreas, and old and new names (Türkiye, Czechia, Eswatini, Côte d'Ivoire, North Macedonia,
  Cabo Verde, Timor-Leste).
- Borders (mutual, with islands having none), landlocked and island countries, the equator and
  the hemispheres.
- Rare Earth categories: sizes, no duplicates, only playable countries.

Fixes the audit led to:

- "S Sudan", "S. Sudan", "S Korea" and "N Korea" are accepted.
- A border that exists only through an overseas department (France with Brazil and Suriname) is
  accepted but no longer asked for, so a surprising answer is not counted as a rare find.
- Reasonable readings of regional lines are accepted without being required: the Baltic states as
  Eastern Europe, Cyprus as a European island, Armenia and Azerbaijan as landlocked Europe, and a
  few more (see `SUBREGION_LENIENT` and `REGION_LENIENT` in `src/game/core/categories.ts`).

All 155 categories were read through for surprises. Known quirks that were left alone because
they follow the UN subregion scheme: Czechia and Russia are "Eastern Europe", Sudan is "Northern
Africa", Iran is "Southern Asia".

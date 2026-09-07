export const MODEL_VERSION = 'nfl-dk-mc-foundation-v1.1';
export const DEFAULTS = {
  modes: { quick: 1000, standard: 10000, deep: 50000 },
  maxSimulations: 200000, workerMaxSimulations: 100, maxCandidates: 12, maxStacks: 120,
  lineupThresholds: [120,140,160,180,200], stackThresholds: [30,40,50,60],
  referenceTotal: 44, defaultSpread: 0, defaultPlays: 64, defaultPassRate: .57,
  defaultCatchProbability: .65, defaultYardsPerCatch: 11, defaultRushEfficiency: 4.2,
  targetedPassFraction: .95, fieldGoals: 1.5, passTdShare: .65,
  defaultInterceptionRate: .022, defaultSacks: 2.3, defaultRecoveries: .5,
  // Standard-normal factor loadings, NOT fitted Pearson correlations.
  environmentSigma: .18, paceSigma: .10, teamEfficiencySigma: .13,
  scriptSigma: 7, trailingPassRatePerPoint: .007, leadingPlaysPerPoint: .12,
  playerEfficiencySigma: .20, receivingYardsSdPerCatch: 7, rushingYardsSdPerCarry: 3,
  calibration: { status: 'uncalibrated', source: 'conservative configurable defaults', trainingWindow: null },
};
export const ASSUMPTIONS = [
  'Shared game environment, pace and script induce correlation; factor loadings are uncalibrated defaults, not empirical correlation coefficients.',
  'Expected touchdowns equal (team implied points minus expected field-goal points) / 7; all touchdowns are discrete and allocated to actual receptions/carries.',
  'Unmodeled players retain residual targets/carries, yards and touchdowns. Their outcomes contribute to the team and quarterback but are not draftable.',
  'No sacks in the offensive play split; pass attempts plus rush attempts define modeled offensive plays. Turnovers and field goals use simplified models.',
  'Receiving yards reconcile exactly to quarterback passing yards. No player-specific yards are added afterward to match point projections.',
  'DST is a placeholder driven by opposing scoring, interceptions and approximate sacks/recoveries. Return TDs, safeties, blocked kicks and two-point conversions are not yet modeled.',
  'QB projected passing efficiency anchors team receiving efficiency with a bounded 0.7–1.3 adjustment before yardage sampling. Projected pass/rush TD mix informs the team TD split.',
  'Missing anytime-TD prices and red-zone usage use projected touchdowns per opportunity as allocation weights. No market TD prices are present in the saved slate.',
  'Offensive lost fumbles use projected per-opportunity rates. DST recoveries are an independent placeholder and do not yet reconcile to offensive fumbles.',
  'No ownership, field, win/top-10%, payout or portfolio model. Threshold exceedance is not tournament finish probability.',
];

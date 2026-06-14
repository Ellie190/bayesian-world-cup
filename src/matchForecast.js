const DEFAULT_BASELINE = 74;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function buildForecastRatings(priors, matches) {
  const priorsMap = new Map(priors.map((team) => [team.name, team.prior]));
  const ratings = new Map();

  for (const team of priors) ratings.set(team.name, team.prior);
  for (const match of matches) {
    if (!ratings.has(match.team1)) ratings.set(match.team1, DEFAULT_BASELINE);
    if (!ratings.has(match.team2)) ratings.set(match.team2, DEFAULT_BASELINE);
  }

  for (const match of matches) {
    if (match.status !== "completed" || !match.scoreFt) continue;
    const current1 = ratings.get(match.team1) ?? DEFAULT_BASELINE;
    const current2 = ratings.get(match.team2) ?? DEFAULT_BASELINE;
    const expected1 = 1 / (1 + Math.exp(-(current1 - current2) / 9.5));
    const actual1 = match.isDraw ? 0.5 : match.winner === match.team1 ? 1 : 0;
    const goalDiff = Math.abs(match.scoreFt[0] - match.scoreFt[1]);
    const delta = (actual1 - expected1) * (3.8 + goalDiff * 0.7);
    ratings.set(match.team1, current1 + delta);
    ratings.set(match.team2, current2 - delta);
  }

  return ratings;
}

function poissonProbability(lambda, goals) {
  let factorial = 1;
  for (let i = 2; i <= goals; i += 1) factorial *= i;
  return (Math.exp(-lambda) * (lambda ** goals)) / factorial;
}

function poissonCdf(lambda, maxGoals) {
  let total = 0;
  for (let goals = 0; goals <= maxGoals; goals += 1) {
    total += poissonProbability(lambda, goals);
  }
  return total;
}

function buildGoalDistribution(lambda, maxGoals = 5) {
  const bars = [];
  let coveredProbability = 0;

  for (let goals = 0; goals <= maxGoals; goals += 1) {
    const probability = poissonProbability(lambda, goals);
    coveredProbability += probability;
    bars.push({
      label: String(goals),
      goals,
      probability
    });
  }

  bars.push({
    label: `${maxGoals + 1}+`,
    goals: maxGoals + 1,
    probability: Math.max(0, 1 - coveredProbability)
  });

  return bars;
}

export function buildMatchForecast(teamA, teamB, ratings) {
  const ratingA = ratings.get(teamA) ?? DEFAULT_BASELINE;
  const ratingB = ratings.get(teamB) ?? DEFAULT_BASELINE;
  const diff = ratingA - ratingB;
  const draw = Math.max(0.14, 0.27 - Math.abs(diff) * 0.0085);
  const decisive = 1 - draw;
  const win = decisive / (1 + Math.exp(-diff / 8.2));
  const loss = Math.max(0, 1 - win - draw);

  const favoredTeam = win >= loss ? teamA : teamB;
  const favoredProbability = Math.max(win, loss);
  const totalGoals = clamp(2.35 + Math.abs(diff) / 22, 2.2, 3.6);
  const shareA = clamp(0.5 + diff / 32, 0.22, 0.78);
  const expectedGoalsA = clamp(totalGoals * shareA, 0.45, 3.2);
  const expectedGoalsB = clamp(totalGoals - expectedGoalsA, 0.35, 3.2);

  const scorelines = [];
  for (let goalsA = 0; goalsA <= 5; goalsA += 1) {
    for (let goalsB = 0; goalsB <= 5; goalsB += 1) {
      scorelines.push({
        scoreA: goalsA,
        scoreB: goalsB,
        probability: poissonProbability(expectedGoalsA, goalsA) * poissonProbability(expectedGoalsB, goalsB)
      });
    }
  }

  scorelines.sort((a, b) => b.probability - a.probability);
  const goalDistributionA = buildGoalDistribution(expectedGoalsA);
  const goalDistributionB = buildGoalDistribution(expectedGoalsB);

  const bttsYes = (1 - poissonProbability(expectedGoalsA, 0)) * (1 - poissonProbability(expectedGoalsB, 0));
  const totalGoalsLambda = expectedGoalsA + expectedGoalsB;
  const over15 = 1 - poissonCdf(totalGoalsLambda, 1);
  const over25 = 1 - poissonCdf(totalGoalsLambda, 2);
  const over35 = 1 - poissonCdf(totalGoalsLambda, 3);
  const cleanSheetA = poissonProbability(expectedGoalsB, 0);
  const cleanSheetB = poissonProbability(expectedGoalsA, 0);
  const firstToScoreA = clamp(expectedGoalsA / (expectedGoalsA + expectedGoalsB), 0.18, 0.82);
  const estimatedCorners = clamp(8.2 + totalGoalsLambda * 0.85 + Math.abs(diff) * 0.06, 7.5, 13.5);
  const estimatedCards = clamp(3.2 + draw * 2.8 + Math.min(Math.abs(diff) / 18, 1.2), 2.8, 6.8);

  const doubleChanceTeam = favoredTeam;
  const doubleChanceProbability = favoredTeam === teamA ? win + draw : loss + draw;

  const marketStats = [
    { label: "Double chance", value: `${doubleChanceTeam} or draw`, probability: doubleChanceProbability, tone: "green" },
    { label: "Both teams to score", value: bttsYes >= 0.5 ? "Yes" : "No", probability: Math.max(bttsYes, 1 - bttsYes), tone: "blue" },
    { label: "Over 2.5 goals", value: over25 >= 0.5 ? "Over" : "Under", probability: Math.max(over25, 1 - over25), tone: "amber" },
    { label: "Over 3.5 goals", value: over35 >= 0.5 ? "Over" : "Under", probability: Math.max(over35, 1 - over35), tone: "amber" },
    { label: `${teamA} clean sheet`, value: cleanSheetA >= 0.5 ? "Likely" : "Unlikely", probability: cleanSheetA, tone: "green" },
    { label: `${teamB} clean sheet`, value: cleanSheetB >= 0.5 ? "Likely" : "Unlikely", probability: cleanSheetB, tone: "blue" },
    { label: "Team to score first", value: firstToScoreA >= 0.5 ? teamA : teamB, probability: Math.max(firstToScoreA, 1 - firstToScoreA), tone: "green" },
    { label: "Estimated corners", value: `${estimatedCorners.toFixed(1)} total`, probability: clamp((estimatedCorners - 7) / 7, 0.28, 0.84), tone: "blue" },
    { label: "Estimated cards", value: `${estimatedCards.toFixed(1)} total`, probability: clamp((estimatedCards - 2) / 5, 0.26, 0.8), tone: "amber" },
    { label: "Over 1.5 goals", value: over15 >= 0.5 ? "Over" : "Under", probability: Math.max(over15, 1 - over15), tone: "green" }
  ];

  return {
    ratingA,
    ratingB,
    win,
    draw,
    loss,
    favoredTeam,
    favoredProbability,
    confidenceLabel: favoredProbability >= 0.66 ? "Strong edge" : favoredProbability >= 0.56 ? "Lean" : "Tight",
    expectedGoalsA,
    expectedGoalsB,
    likelyScorelines: scorelines.slice(0, 3),
    marketStats,
    goalDistributions: [
      { team: teamA, xg: expectedGoalsA, bars: goalDistributionA },
      { team: teamB, xg: expectedGoalsB, bars: goalDistributionB }
    ]
  };
}

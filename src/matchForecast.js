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
  for (let goalsA = 0; goalsA <= 4; goalsA += 1) {
    for (let goalsB = 0; goalsB <= 4; goalsB += 1) {
      scorelines.push({
        scoreA: goalsA,
        scoreB: goalsB,
        probability: poissonProbability(expectedGoalsA, goalsA) * poissonProbability(expectedGoalsB, goalsB)
      });
    }
  }

  scorelines.sort((a, b) => b.probability - a.probability);

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
    likelyScorelines: scorelines.slice(0, 3)
  };
}

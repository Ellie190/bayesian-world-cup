import { stages, teams } from "./data.js";

export function seededRandom(seed) {
  let t = seed + 0x6d2b79f5;
  return function rand() {
    t += 0x6d2b79f5;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function formatPct(value) {
  return `${Math.round(value * 100)}%`;
}

export function uncertainty(state) {
  return Math.max(2.4, 8.2 - state.years.size * 0.95 + state.liveWeight / 72);
}

export function adjustmentFor(teamName, state) {
  if (!state.discipline || teamName !== state.adjustTeam) return 0;
  const { injury, yellow, red, suspension } = state.inputs;
  return -((injury * 0.16) + (yellow * 0.05) + (red * 0.32) + (suspension * 0.24));
}

export function teamStrength(team, state) {
  const missingPriorPenalty = (4 - state.years.size) * 0.58;
  const likelihoodShift = team.live * (state.liveWeight / 20);
  const resultsShift = state.resultsAdjustments?.[team.name] ?? 0;
  return team.prior - missingPriorPenalty + likelihoodShift + resultsShift + adjustmentFor(team.name, state);
}

export function buildTeamProfile(team, state) {
  const strength = teamStrength(team, state);
  const normalized = clamp((strength - 70) / 24, 0, 1.2);
  const attack = clamp(0.82 + normalized * 1.35 + Math.max(0, team.live) * 0.05, 0.65, 2.6);
  const defense = clamp(1.42 - normalized * 0.72 - Math.max(0, team.live) * 0.03, 0.58, 1.55);
  return { ...team, strength, attack, defense };
}

export function rankedTeams(state, source = teams) {
  return source
    .map((team) => buildTeamProfile(team, state))
    .sort((a, b) => b.strength - a.strength);
}

function poissonSample(lambda, rand) {
  const l = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k += 1;
    p *= rand();
  } while (p > l);
  return k - 1;
}

function matchLambdas(teamA, teamB, state, source = teams) {
  const profiles = rankedTeams(state, source);
  const home = profiles.find((team) => team.name === teamA);
  const away = profiles.find((team) => team.name === teamB);
  if (!home || !away) throw new Error("Both teams must exist in the model");

  const diff = home.strength - away.strength;
  const totalGoals = clamp(2.25 + Math.abs(diff) / 28, 2.05, 3.45);
  const shareHome = clamp(0.5 + diff / 36, 0.22, 0.78);
  const expectedHomeGoals = clamp((home.attack / away.defense) * shareHome, 0.35, 2.9);
  const expectedAwayGoals = clamp((away.attack / home.defense) * (1 - shareHome), 0.25, 2.4);
  const scale = totalGoals / (expectedHomeGoals + expectedAwayGoals);

  return {
    home,
    away,
    diff,
    expectedHomeGoals: clamp(expectedHomeGoals * scale, 0.4, 3),
    expectedAwayGoals: clamp(expectedAwayGoals * scale, 0.25, 2.6)
  };
}

export function matchProb(teamA, teamB, state, source = teams) {
  const { diff, expectedHomeGoals, expectedAwayGoals } = matchLambdas(teamA, teamB, state, source);
  const draw = clamp(0.24 - Math.abs(diff) * 0.006, 0.14, 0.28);
  const decisive = 1 - draw;
  const win = decisive / (1 + Math.exp(-diff / 8.4));
  const loss = Math.max(0, 1 - win - draw);
  return { win, draw, loss, diff, expectedHomeGoals, expectedAwayGoals };
}

function simulateKnockoutMatch(teamA, teamB, state, rand, source = teams) {
  const { expectedHomeGoals, expectedAwayGoals } = matchLambdas(teamA, teamB, state, source);
  let goalsA = poissonSample(expectedHomeGoals, rand);
  let goalsB = poissonSample(expectedAwayGoals, rand);

  if (goalsA === goalsB) {
    const tieBreakA = expectedHomeGoals + rand() * 0.32;
    const tieBreakB = expectedAwayGoals + rand() * 0.32;
    if (tieBreakA >= tieBreakB) goalsA += 1;
    else goalsB += 1;
  }

  return goalsA > goalsB ? teamA : teamB;
}

function stageChance(strength, stageIndex) {
  const cutoffs = [73, 78, 82, 86, 90];
  const slope = [6.4, 5.8, 5.1, 4.6, 4.1][stageIndex];
  return 1 / (1 + Math.exp(-(strength - cutoffs[stageIndex]) / slope));
}

export function simulateTournament(state, source = teams) {
  const rand = seededRandom(state.seed + state.simulations + Math.round(state.liveWeight));
  const results = new Map(source.map((team) => [team.name, stages.map(() => 0)]));
  const strengths = rankedTeams(state, source);
  const profiles = new Map(strengths.map((team) => [team.name, team]));
  const n = Math.max(1200, Math.round(state.simulations / 4));
  const sampleNoise = uncertainty(state) * 1.3;

  for (let i = 0; i < n; i += 1) {
    const seeded = strengths
      .map((team) => ({ ...team, drawStrength: team.strength + (rand() - 0.5) * sampleNoise }))
      .sort((a, b) => b.drawStrength - a.drawStrength);

    const roundOf16 = seeded.slice(0, 16);
    roundOf16.forEach((team) => results.get(team.name)[0] += 1);

    const pairings = [];
    for (let p = 0; p < 8; p += 1) {
      pairings.push([roundOf16[p].name, roundOf16[15 - p].name]);
    }

    const quarterFinalists = pairings.map(([teamA, teamB]) => simulateKnockoutMatch(teamA, teamB, state, rand, source));
    quarterFinalists.forEach((team) => results.get(team)[1] += 1);

    const semiFinalists = [];
    for (let p = 0; p < quarterFinalists.length; p += 2) {
      semiFinalists.push(simulateKnockoutMatch(quarterFinalists[p], quarterFinalists[p + 1], state, rand, source));
    }
    semiFinalists.forEach((team) => results.get(team)[2] += 1);

    const finalists = [];
    for (let p = 0; p < semiFinalists.length; p += 2) {
      finalists.push(simulateKnockoutMatch(semiFinalists[p], semiFinalists[p + 1], state, rand, source));
    }
    finalists.forEach((team) => results.get(team)[3] += 1);

    const champion = simulateKnockoutMatch(finalists[0], finalists[1], state, rand, source);
    results.get(champion)[4] += 1;
  }

  return strengths.map((team) => {
    const counts = results.get(team.name);
    const projections = counts.map((count, index) => {
      const sampled = count / n;
      const blended = sampled * 0.84 + stageChance(team.strength, index) * 0.16;
      const margin = 1.15 * Math.sqrt((blended * (1 - blended)) / n) + uncertainty(state) / 650;
      const p = clamp(blended, 0.01, 0.98);
      return {
        p,
        lo: Math.min(p, clamp(blended - margin, 0, 0.99)),
        hi: Math.max(p, clamp(blended + margin, 0, 0.99))
      };
    });

    const profile = profiles.get(team.name);
    return { ...profile, projections };
  });
}

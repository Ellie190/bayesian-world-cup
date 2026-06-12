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

export function uncertainty(state) {
  return Math.max(3.1, 9.4 - state.years.size * 1.12 + state.liveWeight / 68);
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

export function rankedTeams(state, source = teams) {
  return source
    .map((team) => ({ ...team, strength: teamStrength(team, state) }))
    .sort((a, b) => b.strength - a.strength);
}

export function matchProb(teamA, teamB, state, source = teams) {
  const a = source.find((team) => team.name === teamA);
  const b = source.find((team) => team.name === teamB);
  if (!a || !b) throw new Error("Both teams must exist in the model");
  const diff = teamStrength(a, state) - teamStrength(b, state);
  const draw = Math.max(0.12, 0.28 - Math.abs(diff) * 0.009);
  const decisive = 1 - draw;
  const win = decisive / (1 + Math.exp(-diff / 8.5));
  const loss = Math.max(0, 1 - win - draw);
  return { win, draw, loss, diff };
}

function stageChance(strength, stageIndex) {
  const cutoffs = [66, 76, 82, 86, 90];
  const slope = [6.8, 5.8, 5.0, 4.4, 3.8][stageIndex];
  return 1 / (1 + Math.exp(-(strength - cutoffs[stageIndex]) / slope));
}

export function simulateTournament(state, source = teams) {
  const rand = seededRandom(state.seed + state.simulations + Math.round(state.liveWeight));
  const results = new Map(source.map((team) => [team.name, stages.map(() => 0)]));
  const strengths = rankedTeams(state, source);
  const n = Math.max(1200, Math.round(state.simulations / 4));
  const sampleNoise = uncertainty(state) * 2.05;

  for (let i = 0; i < n; i += 1) {
    const draw = strengths
      .map((team) => ({ ...team, draw: team.strength + (rand() - 0.5) * sampleNoise }))
      .sort((a, b) => b.draw - a.draw);

    [16, 8, 4, 2, 1].forEach((count, stageIndex) => {
      draw.slice(0, count).forEach((team) => {
        results.get(team.name)[stageIndex] += 1;
      });
    });
  }

  return strengths.map((team) => {
    const counts = results.get(team.name);
    const projections = counts.map((count, index) => {
      const sampled = count / n;
      const blended = sampled * 0.78 + stageChance(team.strength, index) * 0.22;
      const margin = 1.28 * Math.sqrt((blended * (1 - blended)) / n) + uncertainty(state) / 500;
      const p = clamp(blended, 0.01, 0.98);
      return {
        p,
        lo: Math.min(p, clamp(blended - margin, 0, 0.99)),
        hi: Math.max(p, clamp(blended + margin, 0, 0.99))
      };
    });
    return { ...team, projections };
  });
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function formatPct(value) {
  return `${Math.round(value * 100)}%`;
}

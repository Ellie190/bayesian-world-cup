const TOURNAMENT_MANIFEST = [
  { year: 2026, label: "2026 Canada/USA/Mexico", path: "2026/worldcup.json" },
  { year: 2022, label: "2022 Qatar", path: "2022--qatar/worldcup.json" },
  { year: 2018, label: "2018 Russia", path: "2018--russia/worldcup.json" },
  { year: 2014, label: "2014 Brazil", path: "2014--brazil/worldcup.json" },
  { year: 2010, label: "2010 South Africa", path: "2010--south-africa/worldcup.json" }
];

const FALLBACK_TOURNAMENTS = {
  2026: {
    name: "World Cup 2026",
    matches: [
      {
        round: "Matchday 1",
        date: "2026-06-11",
        time: "13:00 UTC-6",
        team1: "Mexico",
        team2: "South Africa",
        score: { ft: [2, 0], ht: [1, 0] },
        group: "Group A",
        ground: "Mexico City"
      },
      {
        round: "Matchday 1",
        date: "2026-06-11",
        time: "20:00 UTC-6",
        team1: "South Korea",
        team2: "Czech Republic",
        score: { ft: [2, 1], ht: [0, 0] },
        group: "Group A",
        ground: "Guadalajara"
      },
      {
        round: "Matchday 8",
        date: "2026-06-18",
        time: "12:00 UTC-4",
        team1: "Czech Republic",
        team2: "South Africa",
        group: "Group A",
        ground: "Atlanta"
      },
      {
        round: "Matchday 8",
        date: "2026-06-18",
        time: "19:00 UTC-6",
        team1: "Mexico",
        team2: "South Korea",
        group: "Group A",
        ground: "Guadalajara"
      }
    ]
  },
  2022: {
    name: "World Cup 2022",
    matches: [
      {
        round: "Group Stage",
        date: "2022-11-22",
        time: "13:00",
        team1: "Argentina",
        team2: "Saudi Arabia",
        score: { ft: [1, 2], ht: [1, 0] },
        group: "Group C",
        ground: "Lusail"
      },
      {
        round: "Group Stage",
        date: "2022-11-24",
        time: "19:00",
        team1: "Brazil",
        team2: "Serbia",
        score: { ft: [2, 0], ht: [0, 0] },
        group: "Group G",
        ground: "Lusail"
      },
      {
        round: "Semi-finals",
        date: "2022-12-13",
        time: "22:00",
        team1: "Argentina",
        team2: "Croatia",
        score: { ft: [3, 0], ht: [2, 0] },
        ground: "Lusail"
      },
      {
        round: "Final",
        date: "2022-12-18",
        time: "18:00",
        team1: "Argentina",
        team2: "France",
        score: { ft: [3, 3], ht: [2, 0] },
        ground: "Lusail"
      }
    ]
  },
  2018: {
    name: "World Cup 2018",
    matches: [
      {
        round: "Group Stage",
        date: "2018-06-15",
        time: "18:00",
        team1: "Portugal",
        team2: "Spain",
        score: { ft: [3, 3], ht: [2, 1] },
        group: "Group B",
        ground: "Sochi"
      },
      {
        round: "Group Stage",
        date: "2018-06-17",
        time: "18:00",
        team1: "Germany",
        team2: "Mexico",
        score: { ft: [0, 1], ht: [0, 1] },
        group: "Group F",
        ground: "Moscow"
      },
      {
        round: "Semi-finals",
        date: "2018-07-10",
        time: "21:00",
        team1: "France",
        team2: "Belgium",
        score: { ft: [1, 0], ht: [0, 0] },
        ground: "Saint Petersburg"
      },
      {
        round: "Final",
        date: "2018-07-15",
        time: "18:00",
        team1: "France",
        team2: "Croatia",
        score: { ft: [4, 2], ht: [2, 1] },
        ground: "Moscow"
      }
    ]
  },
  2014: {
    name: "World Cup 2014",
    matches: [
      {
        round: "Group Stage",
        date: "2014-06-12",
        time: "17:00",
        team1: "Brazil",
        team2: "Croatia",
        score: { ft: [3, 1], ht: [1, 1] },
        group: "Group A",
        ground: "Sao Paulo"
      },
      {
        round: "Group Stage",
        date: "2014-06-13",
        time: "16:00",
        team1: "Spain",
        team2: "Netherlands",
        score: { ft: [1, 5], ht: [1, 1] },
        group: "Group B",
        ground: "Salvador"
      },
      {
        round: "Semi-finals",
        date: "2014-07-08",
        time: "17:00",
        team1: "Brazil",
        team2: "Germany",
        score: { ft: [1, 7], ht: [0, 5] },
        ground: "Belo Horizonte"
      },
      {
        round: "Final",
        date: "2014-07-13",
        time: "16:00",
        team1: "Germany",
        team2: "Argentina",
        score: { ft: [1, 0], ht: [0, 0] },
        ground: "Rio de Janeiro"
      }
    ]
  },
  2010: {
    name: "World Cup 2010",
    matches: [
      {
        round: "Group Stage",
        date: "2010-06-11",
        time: "16:00",
        team1: "South Africa",
        team2: "Mexico",
        score: { ft: [1, 1], ht: [0, 0] },
        group: "Group A",
        ground: "Johannesburg"
      },
      {
        round: "Group Stage",
        date: "2010-06-16",
        time: "20:30",
        team1: "Spain",
        team2: "Switzerland",
        score: { ft: [0, 1], ht: [0, 0] },
        group: "Group H",
        ground: "Durban"
      },
      {
        round: "Semi-finals",
        date: "2010-07-07",
        time: "20:30",
        team1: "Germany",
        team2: "Spain",
        score: { ft: [0, 1], ht: [0, 0] },
        ground: "Durban"
      },
      {
        round: "Final",
        date: "2010-07-11",
        time: "20:30",
        team1: "Netherlands",
        team2: "Spain",
        score: { ft: [0, 1], ht: [0, 0] },
        ground: "Johannesburg"
      }
    ]
  }
};

function rawUrlFor(path) {
  return `https://raw.githubusercontent.com/openfootball/worldcup.json/master/${path}`;
}

function toScoreArray(value) {
  return Array.isArray(value) && value.length === 2 ? value.map(Number) : null;
}

export function loadTournamentIndex() {
  return TOURNAMENT_MANIFEST.map((entry) => ({ ...entry, url: rawUrlFor(entry.path) }));
}

export function normalizeTournament(rawTournament, year) {
  const manifest = TOURNAMENT_MANIFEST.find((entry) => entry.year === year);
  const matches = (rawTournament.matches ?? []).map((match, index) => {
    const scoreFt = toScoreArray(match.score?.ft);
    const scoreHt = toScoreArray(match.score?.ht);
    const isCompleted = Boolean(scoreFt);
    const isDraw = isCompleted ? scoreFt[0] === scoreFt[1] : false;
    const winner = !isCompleted || isDraw
      ? null
      : scoreFt[0] > scoreFt[1]
        ? match.team1
        : match.team2;

    return {
      id: `${year}-${index}-${match.team1}-${match.team2}`,
      year,
      tournament: manifest?.label ?? rawTournament.name ?? String(year),
      round: match.round ?? "Fixture",
      group: match.group ?? null,
      date: match.date ?? null,
      time: match.time ?? null,
      team1: match.team1,
      team2: match.team2,
      scoreFt,
      scoreHt,
      status: isCompleted ? "completed" : "upcoming",
      winner,
      isDraw,
      ground: match.ground ?? null
    };
  });

  const participants = Array.from(new Set(matches.flatMap((match) => [match.team1, match.team2]))).sort();
  const rounds = Array.from(new Set(matches.map((match) => match.round)));

  return {
    year,
    name: rawTournament.name ?? manifest?.label ?? `World Cup ${year}`,
    label: manifest?.label ?? `World Cup ${year}`,
    matches,
    rounds,
    participants
  };
}

export async function loadTournament(year, options = {}) {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const manifest = TOURNAMENT_MANIFEST.find((entry) => entry.year === year);
  if (!manifest) throw new Error(`Unsupported tournament year: ${year}`);
  if (typeof fetchImpl !== "function") throw new Error("Fetch is not available in this environment");

  try {
    const response = await fetchImpl(rawUrlFor(manifest.path));
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const rawTournament = await response.json();
    return {
      year,
      source: "remote",
      loadedAt: new Date().toISOString(),
      data: normalizeTournament(rawTournament, year),
      error: null
    };
  } catch (error) {
    return {
      year,
      source: "fallback",
      loadedAt: new Date().toISOString(),
      data: normalizeTournament(FALLBACK_TOURNAMENTS[year], year),
      error: String(error?.message ?? error)
    };
  }
}

export function buildResultsAdjustments(matches, priors) {
  const priorMap = new Map(priors.map((team) => [team.name, team.prior]));
  const adjustments = Object.fromEntries(priors.map((team) => [team.name, 0]));

  for (const match of matches) {
    if (match.status !== "completed" || !match.scoreFt) continue;
    if (!priorMap.has(match.team1) || !priorMap.has(match.team2)) continue;

    const prior1 = priorMap.get(match.team1);
    const prior2 = priorMap.get(match.team2);
    const expected1 = 1 / (1 + Math.exp(-(prior1 - prior2) / 8.5));
    const goalDiff = Math.abs(match.scoreFt[0] - match.scoreFt[1]);
    const marginFactor = 1 + Math.min(goalDiff, 3) * 0.35;
    const actual1 = match.isDraw ? 0.5 : match.winner === match.team1 ? 1 : 0;
    const delta = (actual1 - expected1) * marginFactor * 4.2;

    adjustments[match.team1] += delta;
    adjustments[match.team2] -= delta;
  }

  return adjustments;
}

export function groupMatchesByRound(matches, filter) {
  const filtered = matches.filter((match) => filter === "all" || match.status === filter);
  const groups = [];
  const byRound = new Map();

  for (const match of filtered) {
    if (!byRound.has(match.round)) byRound.set(match.round, []);
    byRound.get(match.round).push(match);
  }

  for (const [round, roundMatches] of byRound.entries()) {
    groups.push({
      round,
      matches: roundMatches.sort((a, b) => `${a.date ?? ""} ${a.time ?? ""}`.localeCompare(`${b.date ?? ""} ${b.time ?? ""}`))
    });
  }

  return groups;
}

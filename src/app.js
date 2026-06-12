import { seasons, stages, teams } from "./data.js";
import { adjustmentFor, formatPct, rankedTeams, simulateTournament, uncertainty } from "./model.js";
import { buildResultsAdjustments, groupMatchesByRound, loadTournament, loadTournamentIndex } from "./tournamentData.js";
import { buildForecastRatings, buildMatchForecast } from "./matchForecast.js";

const tournamentIndex = loadTournamentIndex();
const modeledTeams = new Set(teams.map((team) => team.name));

function zeroAdjustments() {
  return Object.fromEntries(teams.map((team) => [team.name, 0]));
}

const initialState = () => ({
  years: new Set(seasons),
  liveWeight: 45,
  simulations: 10000,
  discipline: true,
  filter: "all",
  teamA: "Brazil",
  teamB: "France",
  adjustTeam: "France",
  inputs: { injury: 2, yellow: 1, red: 0, suspension: 3 },
  seed: 31,
  selectedTournamentYear: tournamentIndex[0].year,
  tournamentsCache: {},
  matchFilter: "all",
  sourceByYear: {},
  errorByYear: {},
  loadedAtByYear: {},
  loadingYears: new Set(tournamentIndex.map((entry) => entry.year)),
  resultsAdjustments: zeroAdjustments(),
  selectedMatchId: null
});

let state = initialState();
const $ = (id) => document.getElementById(id);

function currentTournament() {
  return state.tournamentsCache[state.selectedTournamentYear] ?? null;
}

function currentForecastRatings() {
  const tournament = currentTournament();
  return buildForecastRatings(teams, tournament?.matches ?? []);
}

function formatLoadTime(value) {
  if (!value) return "Waiting for data...";
  return `Loaded ${new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
}

function formatMatchDate(match) {
  if (!match.date) return "Date pending";
  const text = new Date(match.date).toLocaleDateString([], { month: "short", day: "numeric" });
  return match.time ? `${text} · ${match.time}` : text;
}

function tournamentStats(tournament) {
  const completed = tournament.matches.filter((match) => match.status === "completed").length;
  return {
    completed,
    upcoming: tournament.matches.length - completed
  };
}

function syncTournamentContext() {
  const tournament = currentTournament();
  if (!tournament) {
    state.resultsAdjustments = zeroAdjustments();
    state.selectedMatchId = null;
    return;
  }

  state.resultsAdjustments = buildResultsAdjustments(tournament.matches, teams);
  const selectedMatch = tournament.matches.find((match) => match.id === state.selectedMatchId);
  if (selectedMatch) return;

  const defaultMatch = tournament.matches.find((match) => modeledTeams.has(match.team1) && modeledTeams.has(match.team2))
    ?? tournament.matches[0]
    ?? null;

  state.selectedMatchId = defaultMatch?.id ?? null;
  if (defaultMatch && modeledTeams.has(defaultMatch.team1) && modeledTeams.has(defaultMatch.team2)) {
    state.teamA = defaultMatch.team1;
    state.teamB = defaultMatch.team2;
  }
}

function findSelectedMatch() {
  const tournament = currentTournament();
  return tournament?.matches.find((match) => match.id === state.selectedMatchId) ?? null;
}

function renderYearGrid() {
  $("year-grid").innerHTML = seasons.map((year) => (
    `<button class="${state.years.has(year) ? "active" : ""}" data-year="${year}">${year}</button>`
  )).join("");
  $("base-count").textContent = `${state.years.size} season${state.years.size === 1 ? "" : "s"}`;
}

function renderSelectors() {
  const tournament = currentTournament();
  const forecastTeams = Array.from(new Set([
    ...teams.map((team) => team.name),
    ...(tournament?.participants ?? [])
  ])).sort((a, b) => a.localeCompare(b));

  const teamOptions = forecastTeams.map((team) => `<option value="${team}">${team}</option>`).join("");
  ["team-a", "team-b"].forEach((id) => {
    $(id).innerHTML = teamOptions;
  });
  $("adjust-team").innerHTML = teams.map((team) => `<option value="${team.name}">${team.name}</option>`).join("");
  $("team-a").value = state.teamA;
  $("team-b").value = state.teamB;
  $("adjust-team").value = state.adjustTeam;

  $("tournament-select").innerHTML = tournamentIndex
    .map((entry) => `<option value="${entry.year}">${entry.label}</option>`)
    .join("");
  $("tournament-select").value = String(state.selectedTournamentYear);
  $("match-filter").value = state.matchFilter;
}

function renderTopbar() {
  const tournament = currentTournament();
  const source = state.sourceByYear[state.selectedTournamentYear];
  const error = state.errorByYear[state.selectedTournamentYear];
  const loading = state.loadingYears.has(state.selectedTournamentYear);

  $("selected-tournament-name").textContent = tournament
    ? `${tournament.label} posterior projection`
    : "World Cup posterior projection";

  if (loading && !tournament) {
    $("data-status").textContent = "Loading tournament data from openfootball...";
  } else if (source === "remote") {
    $("data-status").textContent = "Remote match data connected and shaping the current forecast.";
  } else if (source === "fallback") {
    $("data-status").textContent = "Using bundled snapshot because the remote source was unavailable.";
  } else {
    $("data-status").textContent = "Tournament data pending.";
  }

  const sourceBadge = $("source-badge");
  sourceBadge.className = `source-badge ${loading && !source ? "loading" : source === "fallback" ? "fallback" : ""}`.trim();
  sourceBadge.textContent = loading && !source ? "Loading" : source === "fallback" ? "Fallback snapshot" : "Remote source";

  const tournamentText = tournament ? tournamentStats(tournament) : { completed: 0, upcoming: 0 };
  $("last-updated").textContent = tournament
    ? `${formatLoadTime(state.loadedAtByYear[state.selectedTournamentYear])} · ${tournamentText.completed} completed · ${tournamentText.upcoming} upcoming`
    : "Waiting for data...";

  if (error && source === "fallback") {
    $("last-updated").textContent += " · remote fetch failed";
  }
}

function renderStrengths() {
  const tournament = currentTournament();
  if (tournament) {
    const { completed } = tournamentStats(tournament);
    $("strength-context").textContent = `Mean rating with 80% credible interval, including ${completed} completed result${completed === 1 ? "" : "s"}`;
  } else {
    $("strength-context").textContent = "Mean rating with 80% credible interval";
  }

  const list = rankedTeams(state)
    .filter((team) => state.filter === "all" || team.region === state.filter)
    .slice(0, 12);
  const values = list.map((team) => team.strength);
  const min = Math.min(...values) - uncertainty(state);
  const max = Math.max(...values) + uncertainty(state);

  $("strength-list").innerHTML = list.map((team, index) => {
    const u = uncertainty(state);
    const lo = ((team.strength - u - min) / (max - min)) * 100;
    const hi = ((team.strength + u - min) / (max - min)) * 100;
    const mean = ((team.strength - min) / (max - min)) * 100;
    const availabilityDelta = adjustmentFor(team.name, state);
    const resultsDelta = state.resultsAdjustments[team.name] ?? 0;
    const notes = [team.region.toUpperCase()];
    if (resultsDelta) notes.push(`results ${resultsDelta >= 0 ? "+" : ""}${resultsDelta.toFixed(1)}`);
    if (availabilityDelta) notes.push(`adj ${availabilityDelta.toFixed(1)}`);
    return `<div class="team-row">
      <span class="rank">${index + 1}</span>
      <span class="team-name"><strong>${team.name}</strong><span>${notes.join(", ")}</span></span>
      <span class="interval"><span class="band" style="left:${lo}%;width:${Math.max(4, hi - lo)}%"></span><span class="mean" style="left:${mean}%"></span></span>
      <span class="score">${team.strength.toFixed(1)}</span>
    </div>`;
  }).join("");
}

function renderMatchForecast() {
  const match = findSelectedMatch();
  const note = $("selected-match-note");
  const forecast = buildMatchForecast(state.teamA, state.teamB, currentForecastRatings());
  const isSelectedFixture = match && state.teamA === match.team1 && state.teamB === match.team2;

  if (isSelectedFixture) {
    note.textContent = `${match.round}${match.group ? ` · ${match.group}` : ""} · ${formatMatchDate(match)}`;
  } else {
    note.textContent = "Manual team comparison";
  }

  const summary = $("forecast-summary");
  const scorelineList = $("scoreline-list");
  const headline = match?.status === "completed"
    ? match.isDraw ? "It finished level" : `${match.winner} won`
    : `${forecast.favoredTeam} are the likely winner`;
  const confidenceText = match?.status === "completed"
    ? match.isDraw ? "Finished level" : "Full-time result"
    : `${Math.round(forecast.favoredProbability * 100)}% ${forecast.confidenceLabel.toLowerCase()}`;
  const subline = match?.status === "completed"
    ? `${match.team1} ${match.scoreFt?.[0] ?? "?"} - ${match.scoreFt?.[1] ?? "?"} ${match.team2}`
    : `Projected goals: ${forecast.expectedGoalsA.toFixed(1)} for ${state.teamA}, ${forecast.expectedGoalsB.toFixed(1)} for ${state.teamB}`;

  summary.innerHTML = `
    <div class="forecast-kicker">${match?.status === "completed" ? "Match result" : "Likely winner"}</div>
    <div class="forecast-headline">
      <strong>${headline}</strong>
      <span class="forecast-confidence">${confidenceText}</span>
    </div>
    <div class="forecast-subline">${subline}</div>
  `;

  $("match-probs").innerHTML = [
    [`${state.teamA}`, forecast.win, "win"],
    ["Draw", forecast.draw, "draw"],
    [`${state.teamB}`, forecast.loss, "loss"]
  ].map(([label, value, klass]) => (
    `<div class="prob-row"><span>${label}</span><span class="prob-track"><span class="prob-fill ${klass}" style="width:${value * 100}%"></span></span><span>${formatPct(value)}</span></div>`
  )).join("");

  scorelineList.innerHTML = forecast.likelyScorelines.map((line, index) => `
    <div class="scoreline-chip">
      <div>
        <strong>${index === 0 ? "Most likely score" : "Also plausible"}</strong>
        <span>${state.teamA} ${line.scoreA} - ${line.scoreB} ${state.teamB}</span>
      </div>
      <b>${Math.round(line.probability * 100)}%</b>
    </div>
  `).join("");

  $("mini-chart").innerHTML = Array.from({ length: 12 }, (_, index) => {
    const h = 18 + (Math.sin(index / 2 + (forecast.ratingA - forecast.ratingB) / 10) + 1) * 22 + ((index * 13) % 11);
    return `<span style="height:${h}px"></span>`;
  }).join("");
}

function renderControls() {
  $("live-readout").textContent = `${state.liveWeight}%`;
  $("live-weight").value = state.liveWeight;
  $("sim-readout").textContent = `${Math.round(state.simulations / 1000)}k`;
  $("sim-count").textContent = `${state.simulations.toLocaleString()} simulations`;
  $("run-button-label").textContent = `Run ${state.simulations.toLocaleString()} simulations`;
  $("discipline-toggle").checked = state.discipline;
  $("region-filter").value = state.filter;
  ["injury", "yellow", "red", "suspension"].forEach((id) => {
    $(id).value = state.inputs[id];
  });
  const total = adjustmentFor(state.adjustTeam, state);
  $("delta-readout").textContent = `${state.adjustTeam}: ${total.toFixed(2)} expected-strength adjustment`;
}

function renderMatchCenter() {
  const tournament = currentTournament();
  const summary = $("match-center-summary");
  const coverage = $("model-coverage");
  const groupsContainer = $("match-groups");

  if (!tournament) {
    summary.textContent = "Fixtures, scores, and winners by tournament year";
    coverage.textContent = "Loading supported tournaments...";
    groupsContainer.innerHTML = `<div class="empty-state">Loading tournament data from the external source and local snapshots.</div>`;
    return;
  }

  const { completed, upcoming } = tournamentStats(tournament);
  summary.textContent = `${completed} completed and ${upcoming} upcoming fixture${upcoming === 1 ? "" : "s"} in ${tournament.label}`;

  const modeledParticipants = tournament.participants.filter((team) => modeledTeams.has(team));
  const excludedParticipants = tournament.participants.filter((team) => !modeledTeams.has(team));
  coverage.textContent = `${modeledParticipants.length}/${tournament.participants.length} selected-tournament teams are covered by the current forecast model.${excludedParticipants.length ? ` ${excludedParticipants.slice(0, 4).join(", ")}${excludedParticipants.length > 4 ? " and others" : ""} stay visible in results but are excluded from projections.` : ""}`;

  const groups = groupMatchesByRound(tournament.matches, state.matchFilter);
  if (!groups.length) {
    groupsContainer.innerHTML = `<div class="empty-state">No matches match this filter yet.</div>`;
    return;
  }

  groupsContainer.innerHTML = groups.map((group) => `
    <section class="match-group">
      <h4>${group.round}</h4>
      ${group.matches.map((match) => `
        <button class="match-card ${match.status === "upcoming" ? "upcoming" : ""} ${match.id === state.selectedMatchId ? "active" : ""}" data-match-id="${match.id}">
          <div class="match-card-top">
            <span>${match.group ?? "Knockout"}</span>
            <span>${formatMatchDate(match)}</span>
          </div>
          <div class="match-card-teams">
            <div class="match-team-line ${match.winner === match.team1 ? "winner" : ""}">
              <span>${match.team1}</span>
              <span>${match.scoreFt ? match.scoreFt[0] : "?"}</span>
            </div>
            <div class="match-team-line ${match.winner === match.team2 ? "winner" : ""}">
              <span>${match.team2}</span>
              <span>${match.scoreFt ? match.scoreFt[1] : "?"}</span>
            </div>
          </div>
          <div class="match-card-meta">${match.ground ?? "Ground pending"}${match.status === "upcoming" ? " · tap for prediction" : match.isDraw ? " · draw" : ` · winner: ${match.winner}`}</div>
        </button>
      `).join("")}
    </section>
  `).join("");
}

function renderProjections() {
  const projections = simulateTournament(state);
  const topRows = projections.slice(0, 8);
  const header = ["Team", ...stages].map((heading) => `<div class="cell header">${heading}</div>`).join("");
  const rows = topRows.map((team) => (
    `<div class="cell team">${team.name}<small>${team.strength.toFixed(1)} posterior</small></div>` +
    team.projections.map((p) => `<div class="cell">${formatPct(p.p)}<small>${formatPct(p.lo)}-${formatPct(p.hi)}</small></div>`).join("")
  )).join("");
  $("stage-table").innerHTML = header + rows;

  const championTop = [...projections].sort((a, b) => b.projections[4].p - a.projections[4].p).slice(0, 5);
  $("champion-list").innerHTML = championTop.map((team) => {
    const p = team.projections[4].p;
    return `<div class="champion-item"><div class="champion-top"><span>${team.name}</span><span>${formatPct(p)}</span></div><div class="thin-bar"><span style="width:${p * 100}%"></span></div></div>`;
  }).join("");

  const phrases = [
    "wins the softer side of the bracket if recent results continue to reinforce its current rating edge",
    "has the strongest upside when group-stage momentum carries into the first knockout round",
    "benefits most from avoiding another negative surprise against a lower-rated side",
    "still has a live path, but the semi-final step is where the posterior drops most sharply"
  ];
  $("path-list").innerHTML = projections.slice(0, 4).map((team, index) => {
    const q = team.projections[4].p;
    return `<div class="path-item"><div class="path-top"><span>${team.name}</span><span>${formatPct(q)}</span></div><p>${phrases[index]}</p></div>`;
  }).join("");
}

function renderAll() {
  renderYearGrid();
  renderSelectors();
  renderTopbar();
  renderStrengths();
  renderMatchForecast();
  renderControls();
  renderMatchCenter();
  renderProjections();
}

function showToast(message) {
  const toast = $("toast");
  toast.textContent = message;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 1700);
}

async function reloadTournamentYear(year) {
  state.loadingYears.add(year);
  renderTopbar();
  const result = await loadTournament(year);
  state.tournamentsCache[year] = result.data;
  state.sourceByYear[year] = result.source;
  state.errorByYear[year] = result.error;
  state.loadedAtByYear[year] = result.loadedAt;
  state.loadingYears.delete(year);
  if (year === state.selectedTournamentYear) syncTournamentContext();
  renderAll();
}

async function bootstrapTournaments() {
  renderAll();
  await Promise.all(tournamentIndex.map((entry) => reloadTournamentYear(entry.year)));
}

function bindEvents() {
  $("year-grid").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-year]");
    if (!button) return;
    const year = Number(button.dataset.year);
    if (state.years.has(year) && state.years.size > 1) state.years.delete(year);
    else state.years.add(year);
    renderAll();
  });

  $("live-weight").addEventListener("input", (event) => {
    state.liveWeight = Number(event.target.value);
    renderAll();
  });
  $("discipline-toggle").addEventListener("change", (event) => {
    state.discipline = event.target.checked;
    renderAll();
  });
  $("sim-minus").addEventListener("click", () => {
    state.simulations = Math.max(6000, state.simulations - 4000);
    renderAll();
  });
  $("sim-plus").addEventListener("click", () => {
    state.simulations = Math.min(50000, state.simulations + 4000);
    renderAll();
  });
  $("run-sim").addEventListener("click", () => {
    state.seed += 17;
    $("last-run").textContent = `Updated run ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
    renderAll();
  });
  $("region-filter").addEventListener("change", (event) => {
    state.filter = event.target.value;
    renderStrengths();
  });
  $("team-a").addEventListener("change", (event) => {
    state.teamA = event.target.value;
    state.selectedMatchId = null;
    renderMatchForecast();
  });
  $("team-b").addEventListener("change", (event) => {
    state.teamB = event.target.value;
    state.selectedMatchId = null;
    renderMatchForecast();
  });
  $("adjust-team").addEventListener("change", (event) => {
    state.adjustTeam = event.target.value;
    renderAll();
  });
  $("tournament-select").addEventListener("change", (event) => {
    state.selectedTournamentYear = Number(event.target.value);
    syncTournamentContext();
    renderAll();
  });
  $("match-filter").addEventListener("change", (event) => {
    state.matchFilter = event.target.value;
    renderMatchCenter();
  });
  $("match-groups").addEventListener("click", (event) => {
    const card = event.target.closest("[data-match-id]");
    if (!card) return;
    state.selectedMatchId = card.dataset.matchId;
    const match = findSelectedMatch();
    if (match) {
      state.teamA = match.team1;
      state.teamB = match.team2;
    }
    renderAll();
  });
  ["injury", "yellow", "red", "suspension"].forEach((id) => {
    $(id).addEventListener("input", (event) => {
      state.inputs[id] = Number(event.target.value);
      renderAll();
    });
  });
  $("reset-btn")?.addEventListener("click", () => {
    const preserved = {
      selectedTournamentYear: state.selectedTournamentYear,
      tournamentsCache: state.tournamentsCache,
      matchFilter: state.matchFilter,
      sourceByYear: state.sourceByYear,
      errorByYear: state.errorByYear,
      loadedAtByYear: state.loadedAtByYear,
      loadingYears: new Set(state.loadingYears),
      selectedMatchId: state.selectedMatchId
    };
    state = { ...initialState(), ...preserved };
    syncTournamentContext();
    renderAll();
  });
  $("refresh-btn").addEventListener("click", async () => {
    await reloadTournamentYear(state.selectedTournamentYear);
    showToast("Tournament data refreshed");
  });
  $("export-btn").addEventListener("click", async () => {
    const tournament = currentTournament();
    const forecast = buildMatchForecast(state.teamA, state.teamB, currentForecastRatings());
    const snapshot = {
      selectedTournamentYear: state.selectedTournamentYear,
      dataSource: state.sourceByYear[state.selectedTournamentYear] ?? "pending",
      priorSeasons: Array.from(state.years).sort(),
      likelihoodWeight: state.liveWeight,
      simulations: state.simulations,
      currentMatch: findSelectedMatch(),
      tournamentSummary: tournament ? tournamentStats(tournament) : null,
      match: {
        teamA: state.teamA,
        teamB: state.teamB,
        forecast
      },
      adjustedTeam: state.adjustTeam,
      adjustmentInputs: state.inputs
    };
    await navigator.clipboard?.writeText(JSON.stringify(snapshot, null, 2));
    showToast("Scenario snapshot copied");
  });
}

bindEvents();
renderAll();
bootstrapTournaments();

import { seasons, teams } from "./data.js";
import { formatPct, rankedTeams, simulateTournament } from "./model.js";
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
  $("team-a").value = state.teamA;
  $("team-b").value = state.teamB;

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
    ? `${tournament.label} lightweight forecast`
    : "World Cup lightweight forecast";

  if (loading && !tournament) {
    $("data-status").textContent = "Loading tournament data from openfootball...";
  } else if (source === "remote") {
    $("data-status").textContent = "Remote match data is shaping the current forecast.";
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

function renderOverview() {
  const contenders = rankedTeams(state).slice(0, 5);
  $("contenders-list").innerHTML = contenders.map((team) => `
    <div class="contender-pill">
      <span>${team.name}</span>
      <strong>${team.strength.toFixed(1)}</strong>
    </div>
  `).join("");
  $("tournament-note").textContent = "Title odds update from sampled strengths and Poisson-style match scoring.";
}

function renderMatchForecast() {
  const match = findSelectedMatch();
  const note = $("selected-match-note");
  const forecast = buildMatchForecast(state.teamA, state.teamB, currentForecastRatings());
  const distributionGrid = $("distribution-grid");
  const marketGrid = $("market-grid");
  const isSelectedFixture = match && state.teamA === match.team1 && state.teamB === match.team2;

  note.textContent = isSelectedFixture
    ? `${match.round}${match.group ? ` · ${match.group}` : ""} · ${formatMatchDate(match)}`
    : "Manual team comparison";

  const headline = match?.status === "completed"
    ? match.isDraw ? "It finished level" : `${match.winner} won`
    : `${forecast.favoredTeam} are more likely to win`;
  const confidenceText = match?.status === "completed"
    ? match.isDraw ? "Finished level" : "Full-time result"
    : `${Math.round(forecast.favoredProbability * 100)}% ${forecast.confidenceLabel.toLowerCase()}`;
  const subline = match?.status === "completed"
    ? `${match.team1} ${match.scoreFt?.[0] ?? "?"} - ${match.scoreFt?.[1] ?? "?"} ${match.team2}`
    : `Expected goals: ${forecast.expectedGoalsA.toFixed(2)} for ${state.teamA}, ${forecast.expectedGoalsB.toFixed(2)} for ${state.teamB}`;

  $("forecast-summary").innerHTML = `
    <div class="forecast-kicker">${match?.status === "completed" ? "Match result" : "Most likely outcome"}</div>
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

  $("scoreline-list").innerHTML = forecast.likelyScorelines.map((line, index) => `
    <div class="scoreline-chip">
      <div>
        <strong>${index === 0 ? "Most likely score" : "Also plausible"}</strong>
        <span>${state.teamA} ${line.scoreA} - ${line.scoreB} ${state.teamB}</span>
      </div>
      <b>${Math.round(line.probability * 100)}%</b>
    </div>
  `).join("");

  distributionGrid.innerHTML = forecast.goalDistributions.map((distribution, index) => {
    const peak = Math.max(...distribution.bars.map((bar) => bar.probability), 0.01);
    return `
      <div class="distribution-card ${index === 0 ? "home" : "away"}">
        <div class="distribution-head">
          <strong>${distribution.team}</strong>
          <span>${distribution.xg.toFixed(2)} xG</span>
        </div>
        <div class="distribution-bars">
          ${distribution.bars.map((bar) => `
            <div class="distribution-bar">
              <span class="bar-fill" style="height:${Math.max(10, (bar.probability / peak) * 100)}%"></span>
              <b>${bar.label}</b>
              <small>${Math.round(bar.probability * 100)}%</small>
            </div>
          `).join("")}
        </div>
      </div>
    `;
  }).join("");

  marketGrid.innerHTML = forecast.marketStats.map((market) => `
    <div class="market-card ${market.tone}">
      <span class="market-label">${market.label}</span>
      <strong>${market.value}</strong>
      <small>${Math.round(market.probability * 100)}%</small>
    </div>
  `).join("");
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
  coverage.textContent = `${modeledParticipants.length}/${tournament.participants.length} teams are in the forecast model.${excludedParticipants.length ? ` ${excludedParticipants.slice(0, 4).join(", ")}${excludedParticipants.length > 4 ? " and others" : ""} stay visible in results only.` : ""}`;

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
          <div class="match-card-meta">${match.ground ?? "Ground pending"}${match.status === "upcoming" ? " · tap for forecast" : match.isDraw ? " · draw" : ` · winner: ${match.winner}`}</div>
        </button>
      `).join("")}
    </section>
  `).join("");
}

function renderProjections() {
  const projections = simulateTournament(state);
  const topRows = projections
    .sort((a, b) => b.projections[4].p - a.projections[4].p)
    .slice(0, 5);

  $("title-odds-list").innerHTML = topRows.map((team, index) => `
    <div class="title-row">
      <div class="title-row-top">
        <span>${index + 1}. ${team.name}</span>
        <strong>${formatPct(team.projections[4].p)}</strong>
      </div>
      <div class="thin-bar"><span style="width:${team.projections[4].p * 100}%"></span></div>
      <div class="title-row-meta">
        <span>Final four ${formatPct(team.projections[2].p)}</span>
        <span>${formatPct(team.projections[4].lo)} - ${formatPct(team.projections[4].hi)}</span>
      </div>
    </div>
  `).join("");
}

function renderControls() {
  $("live-readout").textContent = `${state.liveWeight}%`;
  $("live-weight").value = state.liveWeight;
  $("sim-readout").textContent = `${Math.round(state.simulations / 1000)}k`;
  $("sim-count").textContent = `${state.simulations.toLocaleString()} simulations`;
  $("run-button-label").textContent = `Run ${state.simulations.toLocaleString()} simulations`;
  $("discipline-toggle").checked = state.discipline;
}

function renderAll() {
  renderYearGrid();
  renderSelectors();
  renderTopbar();
  renderOverview();
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
      }
    };
    await navigator.clipboard?.writeText(JSON.stringify(snapshot, null, 2));
    showToast("Scenario snapshot copied");
  });
}

bindEvents();
renderAll();
bootstrapTournaments();

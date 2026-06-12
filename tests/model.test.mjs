import assert from "node:assert/strict";
import { teams } from "../src/data.js";
import { adjustmentFor, matchProb, rankedTeams, simulateTournament } from "../src/model.js";
import { buildResultsAdjustments } from "../src/tournamentData.js";

const state = {
  years: new Set([2010, 2014, 2018, 2022]),
  liveWeight: 45,
  simulations: 10000,
  discipline: true,
  filter: "all",
  teamA: "Brazil",
  teamB: "France",
  adjustTeam: "France",
  inputs: { injury: 2, yellow: 1, red: 0, suspension: 3 },
  seed: 31
};

const probs = matchProb("Brazil", "France", state);
assert.equal(Math.round((probs.win + probs.draw + probs.loss) * 1000), 1000);
assert.ok(probs.draw >= 0.12);
assert.ok(probs.win > 0 && probs.loss > 0);

assert.ok(adjustmentFor("France", state) < 0);
assert.equal(adjustmentFor("Brazil", state), 0);

const ranking = rankedTeams(state, teams);
assert.equal(ranking[0].name, "Brazil");
assert.ok(ranking[0].strength >= ranking[1].strength);

const resultsAdjustments = buildResultsAdjustments([
  {
    team1: "Brazil",
    team2: "France",
    status: "completed",
    scoreFt: [3, 0],
    isDraw: false,
    winner: "Brazil"
  },
  {
    team1: "Brazil",
    team2: "Japan",
    status: "completed",
    scoreFt: [1, 0],
    isDraw: false,
    winner: "Brazil"
  },
  {
    team1: "France",
    team2: "Brazil",
    status: "completed",
    scoreFt: [1, 0],
    isDraw: false,
    winner: "France"
  }
], teams);
assert.ok(resultsAdjustments.Brazil > resultsAdjustments.France - 10);
assert.ok(resultsAdjustments.Brazil > resultsAdjustments.Japan);

const projections = simulateTournament(state, teams);
assert.equal(projections.length, teams.length);
for (const team of projections) {
  assert.equal(team.projections.length, 5);
  for (const stage of team.projections) {
    assert.ok(stage.p >= 0 && stage.p <= 1);
    assert.ok(stage.lo <= stage.p);
    assert.ok(stage.hi >= stage.p);
  }
}

console.log("model tests passed");

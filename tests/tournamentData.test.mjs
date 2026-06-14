import assert from "node:assert/strict";
import { buildResultsAdjustments, groupMatchesByRound, loadTournament, normalizeTournament } from "../src/tournamentData.js";
import { teams } from "../src/data.js";

const normalized = normalizeTournament({
  name: "World Cup 2099",
  matches: [
    { round: "Group Stage", team1: "Brazil", team2: "France", score: { ft: [2, 1], ht: [1, 0] }, group: "Group A", date: "2099-06-01" },
    { round: "Group Stage", team1: "Spain", team2: "Germany", score: { ft: [1, 1], ht: [0, 0] }, group: "Group B", date: "2099-06-02" },
    { round: "Group Stage", team1: "Mexico", team2: "Japan", group: "Group C", date: "2099-06-03" }
  ]
}, 2026);

assert.equal(normalized.matches[0].winner, "Brazil");
assert.equal(normalized.matches[1].isDraw, true);
assert.equal(normalized.matches[1].winner, null);
assert.equal(normalized.matches[2].status, "upcoming");

const resultDeltas = buildResultsAdjustments([
  { team1: "Japan", team2: "Brazil", status: "completed", scoreFt: [2, 1], isDraw: false, winner: "Japan" },
  { team1: "Brazil", team2: "Japan", status: "completed", scoreFt: [1, 0], isDraw: false, winner: "Brazil" },
  { team1: "Brazil", team2: "Japan", status: "completed", scoreFt: [3, 0], isDraw: false, winner: "Brazil" }
], teams);
assert.ok(resultDeltas.Japan > 0);
assert.ok(resultDeltas.Brazil < resultDeltas.Japan);

const remoteLoaded = await loadTournament(2022, {
  fetchImpl: async () => ({
    ok: true,
    json: async () => ({ name: "World Cup 2022", matches: [{ round: "Final", team1: "Argentina", team2: "France", score: { ft: [3, 3], ht: [2, 0] } }] })
  })
});
assert.equal(remoteLoaded.source, "remote");
assert.equal(remoteLoaded.data.matches[0].isDraw, true);

const fallbackLoaded = await loadTournament(2022, {
  fetchImpl: async () => {
    throw new Error("network down");
  }
});
assert.equal(fallbackLoaded.source, "fallback");
assert.ok(fallbackLoaded.data.matches.length > 0);

let callCount = 0;
const mixedFirst = await loadTournament(2026, {
  fetchImpl: async () => {
    callCount += 1;
    if (callCount === 1) {
      return {
        ok: true,
        json: async () => ({ name: "World Cup 2026", matches: [{ round: "Matchday 1", team1: "Mexico", team2: "South Africa" }] })
      };
    }
    throw new Error("second request failed");
  }
});
const mixedSecond = await loadTournament(2018, {
  fetchImpl: async () => {
    throw new Error("failed");
  }
});
assert.equal(mixedFirst.source, "remote");
assert.equal(mixedSecond.source, "fallback");

const grouped = groupMatchesByRound([
  { round: "Matchday 8", status: "upcoming", team1: "A", team2: "B", date: "2026-06-18", time: "19:00" },
  { round: "Matchday 1", status: "upcoming", team1: "C", team2: "D", date: "2026-06-11", time: "10:00" },
  { round: "Final", status: "upcoming", team1: "E", team2: "F", date: "2026-07-12", time: "19:00" },
  { round: "Semi-finals", status: "upcoming", team1: "G", team2: "H", date: "2026-07-08", time: "19:00" }
], "all");
assert.deepEqual(grouped.map((group) => group.round), ["Matchday 1", "Matchday 8", "Semi-finals", "Final"]);

console.log("tournament data tests passed");

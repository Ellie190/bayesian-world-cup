import assert from "node:assert/strict";
import { teams } from "../src/data.js";
import { buildForecastRatings, buildMatchForecast } from "../src/matchForecast.js";

const ratings = buildForecastRatings(teams, [
  { team1: "Mexico", team2: "South Africa", status: "completed", scoreFt: [2, 0], isDraw: false, winner: "Mexico" },
  { team1: "South Korea", team2: "Czech Republic", status: "completed", scoreFt: [2, 1], isDraw: false, winner: "South Korea" },
  { team1: "Mexico", team2: "South Korea", status: "upcoming" }
]);

assert.ok(ratings.has("South Africa"));
assert.ok(ratings.has("Czech Republic"));
assert.ok(ratings.get("Mexico") > ratings.get("South Africa"));

const forecast = buildMatchForecast("Mexico", "South Korea", ratings);
assert.ok(forecast.favoredTeam === "Mexico" || forecast.favoredTeam === "South Korea");
assert.equal(forecast.likelyScorelines.length, 3);
assert.ok(forecast.likelyScorelines[0].probability >= forecast.likelyScorelines[1].probability);
assert.ok(forecast.win + forecast.draw + forecast.loss > 0.99);
assert.ok(forecast.marketStats.length >= 8);
assert.ok(forecast.marketStats.some((market) => market.label === "Both teams to score"));
assert.ok(forecast.marketStats.some((market) => market.label === "Estimated corners"));
assert.ok(forecast.marketStats.every((market) => market.probability >= 0 && market.probability <= 1));
assert.equal(forecast.goalDistributions.length, 2);
assert.ok(forecast.goalDistributions.every((distribution) => distribution.bars.length === 7));
assert.ok(forecast.goalDistributions.every((distribution) => Math.abs(distribution.bars.reduce((sum, bar) => sum + bar.probability, 0) - 1) < 0.02));

console.log("match forecast tests passed");

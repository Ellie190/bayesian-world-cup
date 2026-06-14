# Bayesian World Cup

An interactive, zero-dependency World Cup forecasting lab. It blends hand-tuned team priors with live evidence, completed World Cup results, disciplinary adjustments, match likelihoods, and Monte Carlo tournament paths.

## Run

Serve the folder:

```powershell
npm run start
```

Then visit `http://localhost:5173`.

## Test

```powershell
npm test
```

## What It Includes

- Bayesian-style prior-to-posterior team strength updates
- External tournament loading from `openfootball/worldcup.json` with bundled fallback snapshots
- Match center with tournament filters, winners, scores, and click-to-prefill fixtures
- Win/draw/loss match probabilities
- Seeded Monte Carlo tournament projections
- Adjustable live evidence weight, sample size, and discipline penalties
- Region filtering, matchup picker, champion distribution, and snapshot export

This is a local simulator, not an official FIFA forecast.

## How It Works In Simple Terms

- **Ratings**: each team starts with a base strength score. Stronger teams start higher.
- **Completed matches**: real results move teams up or down. Big upsets move them more.
- **Forecasts**: the app turns team strength into expected goals, likely scores, and win chances.
- **Randomness**: every simulation adds a small good-day or bad-day effect so stronger teams usually win, but surprises still happen.
- **Title odds**: the app runs many tournament simulations and counts how often each team wins.
- **Uncertainty**: the range next to the title odds is the app saying the result is an estimate, not a guarantee.

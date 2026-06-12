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

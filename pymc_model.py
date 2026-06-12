"""
Bayesian Hierarchical Model for World Cup Predictions
Uses PyMC to model team strength with proper uncertainty quantification via credible intervals.

This approach:
- Models team strength hierarchically with population-level priors
- Captures both epistemic (model) and aleatoric (game) uncertainty
- Produces posterior credible intervals instead of ad-hoc confidence intervals
- Enables proper Monte Carlo tournament simulations with Bayesian uncertainty propagation
"""

import numpy as np
import pandas as pd
import pymc as pm
import arviz as az
from typing import Dict, Tuple, List
import random
import warnings

warnings.filterwarnings("ignore")


class BayesianWorldCupModel:
    """Hierarchical Bayesian model for team strength and match outcomes."""

    def __init__(
        self,
        historical_matches: pd.DataFrame,
        home_advantage: float = 0.15,
        random_seed: int = 42,
    ):
        """
        Initialize the model.

        Args:
            historical_matches: DataFrame with columns ['home_team', 'away_team', 'home_goals', 'away_goals']
            home_advantage: Expected home team advantage (in strength units)
            random_seed: Random seed for reproducibility
        """
        self.matches_df = historical_matches.copy()
        self.home_advantage = home_advantage
        self.random_seed = random_seed
        np.random.seed(random_seed)

        # Extract unique teams
        all_teams = set(self.matches_df["home_team"].unique()) | set(
            self.matches_df["away_team"].unique()
        )
        self.teams = sorted(list(all_teams))
        self.team_to_idx = {team: idx for idx, team in enumerate(self.teams)}
        self.n_teams = len(self.teams)

        # Prepare match data
        self._prepare_match_data()

        # Model components (populated by build_model)
        self.model = None
        self.trace = None
        self.posterior_predictive = None

    def _prepare_match_data(self):
        """Convert match results to numeric format for modeling."""
        self.matches_df["home_idx"] = self.matches_df["home_team"].map(
            self.team_to_idx
        )
        self.matches_df["away_idx"] = self.matches_df["away_team"].map(
            self.team_to_idx
        )

        # Outcome: 1 = home win, 0.5 = draw, 0 = away win
        self.matches_df["outcome"] = (
            self.matches_df["home_goals"] > self.matches_df["away_goals"]
        ).astype(float)
        is_draw = self.matches_df["home_goals"] == self.matches_df["away_goals"]
        self.matches_df.loc[is_draw, "outcome"] = 0.5

        # Goal difference (for potential alternative likelihood)
        self.matches_df["goal_diff"] = (
            self.matches_df["home_goals"] - self.matches_df["away_goals"]
        )

        self.n_matches = len(self.matches_df)

    def build_model(self, draws: int = 2000, tune: int = 2000, chains: int = 4):
        """
        Build and fit the hierarchical Bayesian model.

        The model structure:
        - Population-level priors: μ_strength, σ_strength (prior on team strength distribution)
        - Team-level: strength[i] ~ Normal(μ_strength, σ_strength) for each team
        - Match-level: outcome ~ Categorical based on logistic model of strength differences

        Args:
            draws: Number of posterior samples per chain
            tune: Number of tuning steps
            chains: Number of parallel chains
        """
        print(f"Building hierarchical model for {self.n_teams} teams, {self.n_matches} matches...")

        with pm.Model() as model:
            # ============ Hierarchical Priors (Population-level) ============
            # Prior on the population mean of team strength
            mu_strength = pm.Normal("mu_strength", mu=0, sigma=2)

            # Prior on population standard deviation of team strength
            # Using HalfNormal to ensure positive values
            sigma_strength = pm.HalfNormal("sigma_strength", sigma=1.5)

            # ============ Team-level parameters ============
            # Each team has a strength parameter, drawn from the population distribution
            strength = pm.Normal(
                "strength",
                mu=mu_strength,
                sigma=sigma_strength,
                shape=self.n_teams,
                initval=np.random.normal(0, 0.5, self.n_teams),
            )

            # Match-level noise (aleatoric uncertainty)
            # Accounts for randomness inherent in a single match outcome
            match_noise = pm.HalfNormal("match_noise", sigma=1.0)

            # ============ Match Model ============
            # Home team strength + home advantage vs away team strength
            home_strength_idx = self.matches_df["home_idx"].values
            away_strength_idx = self.matches_df["away_idx"].values

            strength_diff = (
                strength[home_strength_idx]
                - strength[away_strength_idx]
                + self.home_advantage
            )

            # Win probability via logistic link: P(home win) = logistic(strength_diff / scale)
            # Scale factor controls how strength difference translates to win probability
            win_scale = pm.HalfNormal("win_scale", sigma=2.0)
            p_home_win = pm.Deterministic(
                "p_home_win", pm.math.sigmoid(strength_diff / win_scale)
            )

            # Draw probability: decreases as strength difference increases
            # Max draw probability ~0.25, decreases to ~0.05 for large disparities
            p_draw = pm.Deterministic(
                "p_draw",
                0.05
                + 0.2 * pm.math.exp(
                    -pm.math.abs(strength_diff) / 3.0
                ),  # Exponential decay
            )
            p_away_win = pm.Deterministic("p_away_win", 1 - p_home_win - p_draw)

            # Likelihood: Categorical outcome (home win, draw, away win)
            outcome_obs = pm.Categorical(
                "outcome_obs",
                p=pm.math.stack([p_home_win, p_draw, p_away_win], axis=-1),
                observed=self.matches_df["outcome"].map({1.0: 0, 0.5: 1, 0.0: 2}).values,
            )

        self.model = model

        # ============ Inference ============
        print(f"Sampling from posterior ({chains} chains, {draws} draws)...")
        with self.model:
            self.trace = pm.sample(
                draws=draws,
                tune=tune,
                chains=chains,
                cores=chains,
                return_inferencedata=True,
                random_seed=self.random_seed,
                progressbar=True,
            )

        print("Sampling complete.")

        return self.trace

    def get_team_strength_posterior(self) -> pd.DataFrame:
        """
        Extract posterior team strength estimates with credible intervals.

        Returns:
            DataFrame with columns: team, mean, std, credible_lower, credible_upper
        """
        if self.trace is None:
            raise ValueError("Model must be fitted first (call build_model)")

        posterior_strength = self.trace.posterior["strength"].values.reshape(
            -1, self.n_teams
        )

        results = []
        for i, team in enumerate(self.teams):
            samples = posterior_strength[:, i]
            mean = np.mean(samples)
            std = np.std(samples)

            # 94% Highest Density Interval (credible interval, not confidence interval)
            hdi = az.hdi(self.trace, var_names=["strength"], hdi_prob=0.94)
            team_hdi = hdi["strength"].sel(strength_dim_0=i).values

            results.append(
                {
                    "team": team,
                    "mean": mean,
                    "std": std,
                    "credible_lower": team_hdi[0],
                    "credible_upper": team_hdi[1],
                }
            )

        return pd.DataFrame(results).sort_values("mean", ascending=False)

    def predict_match(
        self, home_team: str, away_team: str, n_samples: int = 10000
    ) -> Dict[str, float]:
        """
        Predict match outcome between two teams using posterior samples.

        Returns:
            Dict with 'p_home_win', 'p_draw', 'p_away_win', and credible intervals
        """
        if self.trace is None:
            raise ValueError("Model must be fitted first (call build_model)")

        posterior_strength = self.trace.posterior["strength"].values.reshape(
            -1, self.n_teams
        )
        win_scale = self.trace.posterior["win_scale"].values.flatten()

        # Sample indices
        sample_indices = np.random.choice(len(posterior_strength), n_samples, replace=True)

        home_idx = self.team_to_idx[home_team]
        away_idx = self.team_to_idx[away_team]

        home_strengths = posterior_strength[sample_indices, home_idx]
        away_strengths = posterior_strength[sample_indices, away_idx]
        win_scales = win_scale[sample_indices]

        strength_diff = home_strengths - away_strengths + self.home_advantage

        # Probabilities for each sample
        p_home_win_samples = 1.0 / (1.0 + np.exp(-strength_diff / win_scales))
        p_draw_samples = 0.05 + 0.2 * np.exp(-np.abs(strength_diff) / 3.0)
        p_away_win_samples = 1 - p_home_win_samples - p_draw_samples

        # Posterior predictive: sample outcomes
        outcomes = np.array(
            [
                np.random.choice(
                    [0, 1, 2],
                    p=[p_home_win_samples[i], p_draw_samples[i], p_away_win_samples[i]],
                )
                for i in range(n_samples)
            ]
        )

        home_wins = (outcomes == 0).sum()
        draws = (outcomes == 1).sum()
        away_wins = (outcomes == 2).sum()

        return {
            "p_home_win": home_wins / n_samples,
            "p_draw": draws / n_samples,
            "p_away_win": away_wins / n_samples,
            "home_win_credible_lower": np.percentile(p_home_win_samples, 2.5),
            "home_win_credible_upper": np.percentile(p_home_win_samples, 97.5),
            "draw_credible_lower": np.percentile(p_draw_samples, 2.5),
            "draw_credible_upper": np.percentile(p_draw_samples, 97.5),
        }

    def simulate_tournament(
        self, teams_in_tournament: List[str], n_simulations: int = 10000
    ) -> Dict[str, Dict[str, float]]:
        """
        Simulate tournament progression using posterior samples.
        Accounts for full Bayesian uncertainty in team strengths.

        Args:
            teams_in_tournament: List of teams in tournament
            n_simulations: Number of tournament simulations

        Returns:
            Dict mapping team name to stage progression probabilities
        """
        if self.trace is None:
            raise ValueError("Model must be fitted first (call build_model)")

        posterior_strength = self.trace.posterior["strength"].values.reshape(
            -1, self.n_teams
        )
        win_scale = self.trace.posterior["win_scale"].values.flatten()

        n_posterior_samples = len(posterior_strength)
        tournament_results = {team: {"16": 0, "8": 0, "4": 0, "2": 0, "1": 0} for team in teams_in_tournament}

        print(f"Simulating {n_simulations} tournaments...")

        for sim in range(n_simulations):
            # Sample from posterior
            posterior_idx = np.random.randint(0, n_posterior_samples)
            strengths_sample = posterior_strength[posterior_idx]
            win_scale_sample = win_scale[posterior_idx]

            # Assign strengths to tournament teams
            team_strengths = {
                team: strengths_sample[self.team_to_idx[team]]
                for team in teams_in_tournament
            }

            # Round of 16: teams compete in groups
            remaining = list(teams_in_tournament)
            for stage_name, n_remaining in [("16", 16), ("8", 8), ("4", 4), ("2", 2), ("1", 1)]:
                if len(remaining) <= 1:
                    if remaining:
                        tournament_results[remaining[0]][stage_name] += 1
                    break

                # Pair up teams randomly and simulate matches
                random.shuffle(remaining)
                next_round = []
                for i in range(0, len(remaining), 2):
                    if i + 1 < len(remaining):
                        team_a, team_b = remaining[i], remaining[i + 1]
                        strength_a = team_strengths[team_a]
                        strength_b = team_strengths[team_b]

                        # Win probability
                        strength_diff = strength_a - strength_b
                        p_a = 1.0 / (1.0 + np.exp(-strength_diff / win_scale_sample))

                        winner = team_a if np.random.random() < p_a else team_b
                        next_round.append(winner)

                # Record progression
                for team in next_round:
                    tournament_results[team][stage_name] += 1

                remaining = next_round

            if sim % 1000 == 0:
                print(f"  Completed {sim} simulations...")

        # Normalize to probabilities
        for team in tournament_results:
            for stage in tournament_results[team]:
                tournament_results[team][stage] /= n_simulations

        return tournament_results


# ============ Example Usage ============
if __name__ == "__main__":
    # Example: Create synthetic historical match data
    teams = ["Brazil", "France", "Argentina", "Germany", "Spain", "Belgium"]
    n_matches = 50

    matches_data = []
    for _ in range(n_matches):
        home = random.choice(teams)
        away = random.choice([t for t in teams if t != home])

        # Synthetic outcome with some team bias
        home_goals = np.random.poisson(1.5)
        away_goals = np.random.poisson(1.2)

        matches_data.append(
            {"home_team": home, "away_team": away, "home_goals": home_goals, "away_goals": away_goals}
        )

    matches_df = pd.DataFrame(matches_data)

    # Build and fit model
    model = BayesianWorldCupModel(matches_df, home_advantage=0.15, random_seed=42)
    trace = model.build_model(draws=500, tune=500, chains=2)  # Small for demo

    # Get team strength posteriors with credible intervals
    print("\n=== Team Strength (with 94% Credible Intervals) ===")
    strength_df = model.get_team_strength_posterior()
    print(strength_df.to_string())

    # Predict a specific match
    print("\n=== Match Prediction: Brazil vs France ===")
    prediction = model.predict_match("Brazil", "France")
    print(f"P(Brazil wins): {prediction['p_home_win']:.3f} [94% CI: {prediction['home_win_credible_lower']:.3f}, {prediction['home_win_credible_upper']:.3f}]")
    print(f"P(Draw):       {prediction['p_draw']:.3f} [94% CI: {prediction['draw_credible_lower']:.3f}, {prediction['draw_credible_upper']:.3f}]")
    print(f"P(France wins): {prediction['p_away_win']:.3f}")

    # Simulate tournament
    print("\n=== Tournament Simulation ===")
    tournament_probs = model.simulate_tournament(teams, n_simulations=1000)
    print(tournament_probs)

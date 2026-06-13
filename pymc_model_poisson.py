"""
Bayesian Hierarchical Poisson Model with Dixon-Coles Correlation
Replaces categorical (win/draw/loss) with actual goal modeling.

Key improvement over categorical model:
- Models home_goals ~ Poisson(lambda_home) and away_goals ~ Poisson(lambda_away)
- Captures scoreline information (3-0 vs 1-0 are different, not identical)
- Dixon-Coles correlation term: adjusts low-scoring outcomes (0-0, 1-0, 1-1, 0-1)
- Richer posteriors from same data

References:
- Dixon & Coles (1997): "Modelling Association Football Scores and Inefficiencies in the Football Betting Market"
"""

import numpy as np
import pandas as pd
import pymc as pm
import arviz as az
from typing import Dict, Tuple, List
import warnings

warnings.filterwarnings("ignore")


class BayesianPoissonWorldCupModel:
    """
    Hierarchical Poisson model with Dixon-Coles correlation for team strength.
    """

    def __init__(
        self,
        historical_matches: pd.DataFrame,
        home_advantage: float = 0.15,
        random_seed: int = 42,
    ):
        """
        Initialize the Poisson model.

        Args:
            historical_matches: DataFrame with columns ['home_team', 'away_team', 'home_goals', 'away_goals']
            home_advantage: Expected home team advantage (in log-scale for Poisson rate)
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

        # Model components
        self.model = None
        self.trace = None

    def _prepare_match_data(self):
        """Convert match results to numeric format."""
        self.matches_df["home_idx"] = self.matches_df["home_team"].map(
            self.team_to_idx
        )
        self.matches_df["away_idx"] = self.matches_df["away_team"].map(
            self.team_to_idx
        )
        self.n_matches = len(self.matches_df)

    def _dixon_coles_adjustment(self, home_goals: np.ndarray, away_goals: np.ndarray, 
                                 lambda_home: np.ndarray, lambda_away: np.ndarray,
                                 rho: float = -0.1) -> np.ndarray:
        """
        Dixon-Coles adjustment factor for low-scoring outcomes.
        Adds correlation between home and away goals (particularly for 0-0, 1-0, etc.).

        Args:
            home_goals: Observed home goals
            away_goals: Observed away goals
            lambda_home: Poisson rate for home team
            lambda_away: Poisson rate for away team
            rho: Correlation parameter (typically -0.1 to 0, makes draws less likely)

        Returns:
            Adjustment factor to multiply likelihood
        """
        # Adjustment only applies to low-scoring outcomes (both teams < 2)
        adjustment = pm.math.ones_like(home_goals, dtype="float64")

        # Case: both score 0 or 1
        low_score_mask = (home_goals <= 1) & (away_goals <= 1)

        # For low scores: adjustment = 1 - rho * lambda_home * lambda_away
        adjustment = pm.math.switch(
            low_score_mask,
            1.0 - rho * lambda_home * lambda_away,
            adjustment
        )

        return adjustment

    def build_model(self, draws: int = 2000, tune: int = 2000, chains: int = 4):
        """
        Build and fit Poisson model with Dixon-Coles correlation.

        Args:
            draws: Number of posterior samples per chain
            tune: Number of tuning steps
            chains: Number of parallel chains
        """
        print(f"Building Poisson model for {self.n_teams} teams, {self.n_matches} matches...")

        with pm.Model() as model:
            # ============ Hierarchical Priors (Population-level) ============
            mu_attack = pm.Normal("mu_attack", mu=0, sigma=1.5)
            mu_defense = pm.Normal("mu_defense", mu=0, sigma=1.5)
            sigma_attack = pm.HalfNormal("sigma_attack", sigma=1.0)
            sigma_defense = pm.HalfNormal("sigma_defense", sigma=1.0)

            # ============ Team-level Attack & Defense ============
            attack = pm.Normal(
                "attack",
                mu=mu_attack,
                sigma=sigma_attack,
                shape=self.n_teams,
                initval=np.random.normal(0, 0.5, self.n_teams),
            )
            defense = pm.Normal(
                "defense",
                mu=mu_defense,
                sigma=sigma_defense,
                shape=self.n_teams,
                initval=np.random.normal(0, 0.5, self.n_teams),
            )

            # ============ Match-level Poisson Rates ============
            home_idx = self.matches_df["home_idx"].values
            away_idx = self.matches_df["away_idx"].values

            # Home team advantage (learnable)
            home_adv = pm.Normal("home_advantage", mu=self.home_advantage, sigma=0.1)

            # Poisson rate = exp(attack_home - defense_away + home_advantage)
            lambda_home = pm.math.exp(
                attack[home_idx] - defense[away_idx] + home_adv
            )
            lambda_away = pm.math.exp(
                attack[away_idx] - defense[home_idx]
            )

            # ============ Dixon-Coles Correlation ============
            # Learnable correlation parameter (typically negative)
            rho = pm.Normal("rho", mu=-0.1, sigma=0.05)

            # Adjustment factor
            home_goals_obs = self.matches_df["home_goals"].values
            away_goals_obs = self.matches_df["away_goals"].values
            adjustment = self._dixon_coles_adjustment(
                home_goals_obs, away_goals_obs, lambda_home, lambda_away, rho
            )

            # ============ Likelihoods ============
            # Home goals ~ Poisson(lambda_home)
            home_goals = pm.Poisson(
                "home_goals_obs",
                mu=lambda_home,
                observed=home_goals_obs
            )

            # Away goals ~ Poisson(lambda_away) with Dixon-Coles adjustment
            away_goals = pm.Poisson(
                "away_goals_obs",
                mu=lambda_away,
                observed=away_goals_obs
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
        Extract posterior team strength estimates (attack - defense).
        Attack and defense are kept separate for richer inference.

        Returns:
            DataFrame with columns: team, attack_mean, attack_std, defense_mean, defense_std, strength_mean
        """
        if self.trace is None:
            raise ValueError("Model must be fitted first (call build_model)")

        posterior_attack = self.trace.posterior["attack"].values.reshape(-1, self.n_teams)
        posterior_defense = self.trace.posterior["defense"].values.reshape(-1, self.n_teams)

        results = []
        for i, team in enumerate(self.teams):
            attack_samples = posterior_attack[:, i]
            defense_samples = posterior_defense[:, i]

            # Strength = attack - defense (net ability)
            strength_samples = attack_samples - defense_samples

            results.append(
                {
                    "team": team,
                    "attack_mean": np.mean(attack_samples),
                    "attack_std": np.std(attack_samples),
                    "defense_mean": np.mean(defense_samples),
                    "defense_std": np.std(defense_samples),
                    "strength_mean": np.mean(strength_samples),
                    "strength_std": np.std(strength_samples),
                }
            )

        return pd.DataFrame(results).sort_values("strength_mean", ascending=False)

    def predict_goals(self, home_team: str, away_team: str, n_samples: int = 10000) -> Dict:
        """
        Predict goal distribution for a match.

        Args:
            home_team: Home team name
            away_team: Away team name
            n_samples: Number of posterior samples

        Returns:
            Dict with predicted goal distributions and probabilities
        """
        if self.trace is None:
            raise ValueError("Model must be fitted first (call build_model)")

        posterior_attack = self.trace.posterior["attack"].values.reshape(-1, self.n_teams)
        posterior_defense = self.trace.posterior["defense"].values.reshape(-1, self.n_teams)
        home_adv_samples = self.trace.posterior["home_advantage"].values.flatten()

        # Sample from posterior
        sample_indices = np.random.choice(len(posterior_attack), n_samples, replace=True)

        home_idx = self.team_to_idx[home_team]
        away_idx = self.team_to_idx[away_team]

        attack_home = posterior_attack[sample_indices, home_idx]
        defense_home = posterior_defense[sample_indices, home_idx]
        attack_away = posterior_attack[sample_indices, away_idx]
        defense_away = posterior_defense[sample_indices, away_idx]
        home_adv = home_adv_samples[sample_indices]

        # Poisson rates
        lambda_home = np.exp(attack_home - defense_away + home_adv)
        lambda_away = np.exp(attack_away - defense_home)

        # Sample goals
        home_goals_samples = np.random.poisson(lambda_home)
        away_goals_samples = np.random.poisson(lambda_away)

        # Outcomes
        home_wins = (home_goals_samples > away_goals_samples).sum() / n_samples
        draws = (home_goals_samples == away_goals_samples).sum() / n_samples
        away_wins = (home_goals_samples < away_goals_samples).sum() / n_samples

        return {
            "p_home_win": home_wins,
            "p_draw": draws,
            "p_away_win": away_wins,
            "expected_home_goals": np.mean(home_goals_samples),
            "expected_away_goals": np.mean(away_goals_samples),
            "home_goals_dist": np.bincount(home_goals_samples),
            "away_goals_dist": np.bincount(away_goals_samples),
        }

    def simulate_tournament(
        self, teams_in_tournament: List[str], n_simulations: int = 10000
    ) -> Dict:
        """
        Simulate tournament with Poisson goal model.

        Args:
            teams_in_tournament: List of teams in tournament
            n_simulations: Number of simulations

        Returns:
            Dict with stage progression probabilities
        """
        if self.trace is None:
            raise ValueError("Model must be fitted first (call build_model)")

        posterior_attack = self.trace.posterior["attack"].values.reshape(-1, self.n_teams)
        posterior_defense = self.trace.posterior["defense"].values.reshape(-1, self.n_teams)
        home_adv_samples = self.trace.posterior["home_advantage"].values.flatten()

        n_posterior_samples = len(posterior_attack)
        tournament_results = {team: {"16": 0, "8": 0, "4": 0, "2": 0, "1": 0} for team in teams_in_tournament}

        print(f"Simulating {n_simulations} tournaments...")

        for sim in range(n_simulations):
            posterior_idx = np.random.randint(0, n_posterior_samples)
            attack_sample = posterior_attack[posterior_idx]
            defense_sample = posterior_defense[posterior_idx]
            home_adv_sample = home_adv_samples[posterior_idx]

            team_strengths = {
                team: (attack_sample[self.team_to_idx[team]], defense_sample[self.team_to_idx[team]])
                for team in teams_in_tournament
            }

            remaining = list(teams_in_tournament)
            import random
            for stage_name, n_remaining in [("16", 16), ("8", 8), ("4", 4), ("2", 2), ("1", 1)]:
                if len(remaining) <= 1:
                    if remaining:
                        tournament_results[remaining[0]][stage_name] += 1
                    break

                random.shuffle(remaining)
                next_round = []
                for i in range(0, len(remaining), 2):
                    if i + 1 < len(remaining):
                        team_a, team_b = remaining[i], remaining[i + 1]
                        attack_a, defense_a = team_strengths[team_a]
                        attack_b, defense_b = team_strengths[team_b]

                        lambda_a = np.exp(attack_a - defense_b + home_adv_sample)
                        lambda_b = np.exp(attack_b - defense_a)

                        goals_a = np.random.poisson(lambda_a)
                        goals_b = np.random.poisson(lambda_b)

                        winner = team_a if goals_a > goals_b else team_b
                        next_round.append(winner)

                for team in next_round:
                    tournament_results[team][stage_name] += 1

                remaining = next_round

            if sim % 1000 == 0:
                print(f"  Completed {sim} simulations...")

        # Normalize
        for team in tournament_results:
            for stage in tournament_results[team]:
                tournament_results[team][stage] /= n_simulations

        return tournament_results


# ============ Example Usage ============
if __name__ == "__main__":
    import random

    teams = ["Brazil", "France", "Argentina", "Germany", "Spain", "Belgium"]
    n_matches = 50

    matches_data = []
    for _ in range(n_matches):
        home = random.choice(teams)
        away = random.choice([t for t in teams if t != home])

        home_goals = np.random.poisson(1.5)
        away_goals = np.random.poisson(1.2)

        matches_data.append(
            {"home_team": home, "away_team": away, "home_goals": home_goals, "away_goals": away_goals}
        )

    matches_df = pd.DataFrame(matches_data)

    # Build and fit model
    model = BayesianPoissonWorldCupModel(matches_df, home_advantage=0.15, random_seed=42)
    trace = model.build_model(draws=500, tune=500, chains=2)

    # Get team strengths
    print("\n=== Team Strengths (Attack - Defense) ===")
    strength_df = model.get_team_strength_posterior()
    print(strength_df.to_string())

    # Predict match
    print("\n=== Match Prediction: Brazil vs France ===")
    prediction = model.predict_goals("Brazil", "France")
    print(f"P(Brazil wins): {prediction['p_home_win']:.3f}")
    print(f"P(Draw): {prediction['p_draw']:.3f}")
    print(f"P(France wins): {prediction['p_away_win']:.3f}")
    print(f"Expected goals: Brazil {prediction['expected_home_goals']:.2f}, France {prediction['expected_away_goals']:.2f}")

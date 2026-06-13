"""
Historical World Cup Data Loader
Ingests World Cup matches (2010–2022) with time decay weighting and team name canonicalization.

Key features:
- Loads matches from multiple sources (built-in + external CSV/JSON)
- Time decay: recent matches weighted higher than old matches
- Team name canonicalization: handles "USA" vs "United States", "South Korea" vs "Korea Rep.", etc.
- Data validation: flags inconsistent team names, missing data
- Exports to format ready for PyMC model
"""

import pandas as pd
import numpy as np
from datetime import datetime, timedelta
from typing import Dict, Tuple, List, Optional
import json
import warnings

# ============ Team Name Canonicalization ============
# Maps common variations to canonical names (must match data.js)
TEAM_NAME_MAPPING = {
    # USA variations
    "USA": "United States",
    "US": "United States",
    "U.S.": "United States",
    "United States": "United States",
    
    # South Korea
    "South Korea": "South Korea",
    "Korea": "South Korea",
    "Korea Republic": "South Korea",
    "Korea Rep.": "South Korea",
    "KOR": "South Korea",
    
    # Other common variations
    "England": "England",
    "Scotland": "Scotland",
    "Wales": "Wales",
    "Northern Ireland": "Northern Ireland",
    "China": "China",
    "China PR": "China",
    "China P.R.": "China",
    "Iran": "Iran",
    "IR Iran": "Iran",
    "Egypt": "Egypt",
    "Côte d'Ivoire": "Côte d'Ivoire",
    "Ivory Coast": "Côte d'Ivoire",
    "Czech Republic": "Czech Republic",
    "Czechia": "Czech Republic",
    "Serbia": "Serbia",
    "Serbia and Montenegro": "Serbia",
    "Montenegro": "Montenegro",
    "Bosnia and Herzegovina": "Bosnia and Herzegovina",
    "Bosnia-Herzegovina": "Bosnia and Herzegovina",
    "Saint Kitts and Nevis": "Saint Kitts and Nevis",
    "Trinidad and Tobago": "Trinidad and Tobago",
    "Costa Rica": "Costa Rica",
}

# Canonical team names (from data.js)
CANONICAL_TEAMS = {
    "Brazil", "France", "Argentina", "England", "Spain", "Netherlands", 
    "Portugal", "Germany", "Uruguay", "Croatia", "Morocco", "Japan", 
    "United States", "Mexico", "Senegal", "South Korea", "Belgium", 
    "Denmark", "Switzerland", "Colombia", "Ecuador", "Canada", 
    "Australia", "Ghana"
}


def canonicalize_team_name(team_name: str) -> str:
    """
    Convert team name variations to canonical form.
    
    Args:
        team_name: Raw team name from data source
        
    Returns:
        Canonical team name
    """
    if pd.isna(team_name):
        return None
    
    team_name = str(team_name).strip()
    
    # Direct match first
    if team_name in TEAM_NAME_MAPPING:
        return TEAM_NAME_MAPPING[team_name]
    
    # Try case-insensitive match
    for variation, canonical in TEAM_NAME_MAPPING.items():
        if variation.lower() == team_name.lower():
            return canonical
    
    # If not in mapping, return as-is (will be flagged as unknown in validation)
    return team_name


def calculate_time_decay_weight(
    match_date: datetime,
    reference_date: Optional[datetime] = None,
    half_life_days: float = 365.25
) -> float:
    """
    Calculate exponential time decay weight for a match.
    Recent matches get weight ~1.0, old matches decay exponentially.
    
    Args:
        match_date: Date of the match
        reference_date: Date to measure decay from (default: today)
        half_life_days: Days for weight to decay to 0.5 (default: 1 year)
        
    Returns:
        Weight in [0, 1], with 1.0 for very recent matches
    """
    if reference_date is None:
        reference_date = datetime.now()
    
    if pd.isna(match_date):
        return 0.0
    
    # Ensure datetime
    if not isinstance(match_date, datetime):
        match_date = pd.to_datetime(match_date)
    if not isinstance(reference_date, datetime):
        reference_date = pd.to_datetime(reference_date)
    
    days_elapsed = (reference_date - match_date).days
    
    # Exponential decay: weight = 2^(-days / half_life)
    weight = 2.0 ** (-days_elapsed / half_life_days)
    
    # Clamp to [0.1, 1.0] to prevent very old matches from having zero weight
    return np.clip(weight, 0.1, 1.0)


class HistoricalDataLoader:
    """
    Loads and processes historical World Cup and international match data.
    Handles canonicalization, time decay, and validation.
    """
    
    def __init__(self, half_life_days: float = 365.25):
        """
        Initialize the data loader.
        
        Args:
            half_life_days: Days for time decay to reach 0.5 weight
        """
        self.half_life_days = half_life_days
        self.matches_df = None
        self.validation_warnings = []
    
    def load_builtin_wc_data(self) -> pd.DataFrame:
        """
        Load built-in World Cup match data (2010–2022).
        This is a curated subset of key matches for model training.
        
        Returns:
            DataFrame with columns: date, home_team, away_team, home_goals, away_goals
        """
        # Sample World Cup and pre-tournament qualifying/friendly matches
        # In production, this would be loaded from a CSV or database
        builtin_data = [
            # 2022 World Cup (Qatar)
            {"date": "2022-11-21", "home_team": "Qatar", "away_team": "Ecuador", "home_goals": 0, "away_goals": 2},
            {"date": "2022-11-22", "home_team": "England", "away_team": "Iran", "home_goals": 6, "away_goals": 2},
            {"date": "2022-11-22", "home_team": "Netherlands", "away_team": "Senegal", "home_goals": 2, "away_goals": 0},
            {"date": "2022-11-23", "home_team": "Argentina", "away_team": "Saudi Arabia", "home_goals": 1, "away_goals": 2},
            
            # 2018 World Cup (Russia) - sample
            {"date": "2018-06-14", "home_team": "Russia", "away_team": "Saudi Arabia", "home_goals": 5, "away_goals": 0},
            {"date": "2018-06-15", "home_team": "Egypt", "away_team": "Uruguay", "home_goals": 0, "away_goals": 1},
            {"date": "2018-06-15", "home_team": "Morocco", "away_team": "Iran", "home_goals": 1, "away_goals": 0},
            {"date": "2018-06-16", "home_team": "France", "away_team": "Australia", "home_goals": 2, "away_goals": 1},
            
            # 2014 World Cup (Brazil) - sample
            {"date": "2014-06-12", "home_team": "Brazil", "away_team": "Croatia", "home_goals": 3, "away_goals": 1},
            {"date": "2014-06-13", "home_team": "Mexico", "away_team": "Cameroon", "home_goals": 1, "away_goals": 0},
            {"date": "2014-06-15", "home_team": "Spain", "away_team": "Netherlands", "home_goals": 1, "away_goals": 5},
            
            # 2010 World Cup (South Africa) - sample
            {"date": "2010-06-11", "home_team": "South Africa", "away_team": "Mexico", "home_goals": 1, "away_goals": 1},
            {"date": "2010-06-12", "home_team": "France", "away_team": "Uruguay", "home_goals": 0, "away_goals": 0},
            {"date": "2010-06-13", "home_team": "Argentina", "away_team": "Nigeria", "home_goals": 1, "away_goals": 0},
            
            # Recent friendly/qualifying matches (2022–2024)
            {"date": "2023-06-20", "home_team": "Brazil", "away_team": "Colombia", "home_goals": 1, "away_goals": 0},
            {"date": "2023-06-20", "home_team": "Argentina", "away_team": "Australia", "home_goals": 1, "away_goals": 0},
            {"date": "2023-09-07", "home_team": "England", "away_team": "Ukraine", "home_goals": 1, "away_goals": 0},
        ]
        
        df = pd.DataFrame(builtin_data)
        df["date"] = pd.to_datetime(df["date"])
        return df
    
    def load_from_csv(self, filepath: str) -> pd.DataFrame:
        """
        Load match data from CSV file.
        Expected columns: date, home_team, away_team, home_goals, away_goals
        
        Args:
            filepath: Path to CSV file
            
        Returns:
            DataFrame with standardized columns
        """
        df = pd.read_csv(filepath)
        df["date"] = pd.to_datetime(df["date"])
        
        required_cols = {"date", "home_team", "away_team", "home_goals", "away_goals"}
        if not required_cols.issubset(df.columns):
            raise ValueError(f"CSV must contain columns: {required_cols}")
        
        return df[list(required_cols)]
    
    def load_from_json(self, filepath: str) -> pd.DataFrame:
        """
        Load match data from JSON file (array of match objects).
        
        Args:
            filepath: Path to JSON file
            
        Returns:
            DataFrame with standardized columns
        """
        with open(filepath, 'r') as f:
            data = json.load(f)
        
        df = pd.DataFrame(data)
        df["date"] = pd.to_datetime(df["date"])
        
        required_cols = {"date", "home_team", "away_team", "home_goals", "away_goals"}
        if not required_cols.issubset(df.columns):
            raise ValueError(f"JSON must contain fields: {required_cols}")
        
        return df[list(required_cols)]
    
    def ingest(
        self,
        builtin: bool = True,
        csv_files: Optional[List[str]] = None,
        json_files: Optional[List[str]] = None,
        min_date: Optional[str] = "2010-01-01"
    ) -> pd.DataFrame:
        """
        Ingest matches from multiple sources and combine.
        
        Args:
            builtin: Include built-in WC data (2010–2022)
            csv_files: List of CSV file paths to load
            json_files: List of JSON file paths to load
            min_date: Only include matches from this date onwards
            
        Returns:
            Combined, cleaned DataFrame
        """
        dfs = []
        
        # Load built-in data
        if builtin:
            dfs.append(self.load_builtin_wc_data())
            print(f"Loaded built-in WC data: {len(dfs[-1])} matches")
        
        # Load CSVs
        if csv_files:
            for filepath in csv_files:
                df = self.load_from_csv(filepath)
                dfs.append(df)
                print(f"Loaded {filepath}: {len(df)} matches")
        
        # Load JSONs
        if json_files:
            for filepath in json_files:
                df = self.load_from_json(filepath)
                dfs.append(df)
                print(f"Loaded {filepath}: {len(df)} matches")
        
        # Combine all
        if not dfs:
            raise ValueError("No data sources specified. Set builtin=True or provide files.")
        
        combined = pd.concat(dfs, ignore_index=True)
        
        # Drop duplicates
        combined = combined.drop_duplicates(subset=["date", "home_team", "away_team"], keep="first")
        
        # Filter by date
        if min_date:
            combined = combined[combined["date"] >= pd.to_datetime(min_date)]
        
        # Sort by date
        combined = combined.sort_values("date").reset_index(drop=True)
        
        self.matches_df = combined
        return combined
    
    def canonicalize(self) -> pd.DataFrame:
        """
        Canonicalize team names in loaded data.
        
        Returns:
            DataFrame with canonicalized team names
        """
        if self.matches_df is None:
            raise ValueError("Must call ingest() first")
        
        df = self.matches_df.copy()
        df["home_team"] = df["home_team"].apply(canonicalize_team_name)
        df["away_team"] = df["away_team"].apply(canonicalize_team_name)
        
        self.matches_df = df
        return df
    
    def apply_time_decay(self, reference_date: Optional[datetime] = None) -> pd.DataFrame:
        """
        Apply exponential time decay weighting to matches.
        Recent matches get weight ~1.0, old matches decay.
        
        Args:
            reference_date: Reference date for decay calculation (default: today)
            
        Returns:
            DataFrame with added 'weight' column
        """
        if self.matches_df is None:
            raise ValueError("Must call ingest() first")
        
        df = self.matches_df.copy()
        df["weight"] = df["date"].apply(
            lambda d: calculate_time_decay_weight(d, reference_date, self.half_life_days)
        )
        
        self.matches_df = df
        return df
    
    def validate(self) -> Dict[str, List[str]]:
        """
        Validate data quality and flag issues.
        
        Returns:
            Dict with lists of warnings by category
        """
        if self.matches_df is None:
            raise ValueError("Must call ingest() first")
        
        issues = {
            "unknown_teams": [],
            "missing_data": [],
            "negative_goals": [],
            "suspicious": []
        }
        
        df = self.matches_df
        
        # Check for unknown teams
        unknown = df[~df["home_team"].isin(CANONICAL_TEAMS) & df["home_team"].notna()]["home_team"].unique()
        unknown = list(unknown) + list(
            df[~df["away_team"].isin(CANONICAL_TEAMS) & df["away_team"].notna()]["away_team"].unique()
        )
        issues["unknown_teams"] = list(set(unknown))
        
        # Check for missing data
        missing = df[df[["date", "home_team", "away_team", "home_goals", "away_goals"]].isna().any()]
        issues["missing_data"] = missing.index.tolist()
        
        # Check for negative goals
        negative = df[(df["home_goals"] < 0) | (df["away_goals"] < 0)]
        issues["negative_goals"] = negative.index.tolist()
        
        # Check for suspicious scores (very lopsided or unusual)
        goal_diff = (df["home_goals"] - df["away_goals"]).abs()
        suspicious = df[goal_diff > 10]
        issues["suspicious"] = suspicious.index.tolist()
        
        # Print warnings
        for category, indices_or_items in issues.items():
            if indices_or_items:
                print(f"⚠️  {category}: {indices_or_items}")
        
        return issues
    
    def get_training_data(self, min_weight: float = 0.0) -> pd.DataFrame:
        """
        Get final training dataset for PyMC model.
        Optionally filter by minimum weight.
        
        Args:
            min_weight: Minimum time decay weight to include (default: 0.0 = all)
            
        Returns:
            Clean DataFrame ready for model
        """
        if self.matches_df is None:
            raise ValueError("Must call ingest() and canonicalize() first")
        
        df = self.matches_df.copy()
        
        # Ensure weight column exists; if not, apply decay
        if "weight" not in df.columns:
            self.apply_time_decay()
            df = self.matches_df.copy()
        
        # Filter by minimum weight
        if min_weight > 0.0:
            df = df[df["weight"] >= min_weight]
        
        # Select only needed columns
        return df[["date", "home_team", "away_team", "home_goals", "away_goals", "weight"]].reset_index(drop=True)
    
    def summary(self) -> Dict:
        """
        Print and return summary statistics about loaded data.
        
        Returns:
            Dict with summary info
        """
        if self.matches_df is None:
            raise ValueError("Must call ingest() first")
        
        df = self.matches_df
        
        summary = {
            "total_matches": len(df),
            "date_range": (df["date"].min(), df["date"].max()),
            "unique_teams": len(set(df["home_team"].unique()) | set(df["away_team"].unique())),
            "avg_goals_per_match": (df["home_goals"] + df["away_goals"]).mean(),
            "avg_weight": df.get("weight", pd.Series([1.0] * len(df))).mean(),
        }
        
        print(f"\n=== Data Summary ===")
        print(f"Total matches: {summary['total_matches']}")
        print(f"Date range: {summary['date_range'][0].date()} to {summary['date_range'][1].date()}")
        print(f"Unique teams: {summary['unique_teams']}")
        print(f"Avg goals/match: {summary['avg_goals_per_match']:.2f}")
        if "weight" in df.columns:
            print(f"Avg time decay weight: {summary['avg_weight']:.3f}")
        
        return summary


# ============ Example Usage ============
if __name__ == "__main__":
    # Initialize loader with 1-year half-life for time decay
    loader = HistoricalDataLoader(half_life_days=365.25)
    
    # Load built-in WC data
    print("Loading data...")
    loader.ingest(builtin=True)
    
    # Canonicalize team names
    print("Canonicalizing team names...")
    loader.canonicalize()
    
    # Apply time decay weighting
    print("Applying time decay weighting...")
    loader.apply_time_decay()
    
    # Validate
    print("Validating data...")
    issues = loader.validate()
    
    # Get summary
    summary = loader.summary()
    
    # Get training data
    training_data = loader.get_training_data(min_weight=0.0)
    print(f"\nTraining data shape: {training_data.shape}")
    print(training_data.head(10))
    
    # Export for PyMC model
    training_data.to_csv("world_cup_matches.csv", index=False)
    print("\nExported to world_cup_matches.csv")

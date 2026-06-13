"""
Export Pipeline: PyMC Model → Rescaled Team Strengths → data.js

Takes posterior team strength estimates from PyMC model and:
1. Rescales from model units to 0-100 prior scale
2. Merges with confederation info and groups
3. Exports to data.js format for frontend consumption
"""

import pandas as pd
import json
from typing import Dict, Tuple
import numpy as np


class OutputPipeline:
    """
    Converts PyMC posterior samples to frontend-ready data.js format.
    """
    
    def __init__(self, model_strength_df: pd.DataFrame, min_strength: float = -2.0, max_strength: float = 3.0):
        """
        Initialize the output pipeline.
        
        Args:
            model_strength_df: DataFrame from model.get_team_strength_posterior()
                              Columns: team, mean, std, credible_lower, credible_upper
            min_strength: Minimum observed strength in model (for rescaling)
            max_strength: Maximum observed strength in model (for rescaling)
        """
        self.model_strength_df = model_strength_df.copy()
        self.min_strength = min_strength
        self.max_strength = max_strength
        self.rescaled_df = None
        
        # Reference teams with known prior strengths (from data.js)
        self.team_metadata = {
            "Brazil": {"region": "conmebol", "group": "A", "prior": 92},
            "France": {"region": "uefa", "group": "B", "prior": 91},
            "Argentina": {"region": "conmebol", "group": "C", "prior": 90},
            "England": {"region": "uefa", "group": "D", "prior": 88},
            "Spain": {"region": "uefa", "group": "E", "prior": 87},
            "Netherlands": {"region": "uefa", "group": "F", "prior": 85},
            "Portugal": {"region": "uefa", "group": "G", "prior": 84},
            "Germany": {"region": "uefa", "group": "H", "prior": 83},
            "Uruguay": {"region": "conmebol", "group": "A", "prior": 81},
            "Croatia": {"region": "uefa", "group": "B", "prior": 80},
            "Morocco": {"region": "caf", "group": "C", "prior": 78},
            "Japan": {"region": "afc", "group": "D", "prior": 77},
            "United States": {"region": "concacaf", "group": "E", "prior": 76},
            "Mexico": {"region": "concacaf", "group": "F", "prior": 75},
            "Senegal": {"region": "caf", "group": "G", "prior": 74},
            "South Korea": {"region": "afc", "group": "H", "prior": 73},
            "Belgium": {"region": "uefa", "group": "A", "prior": 79},
            "Denmark": {"region": "uefa", "group": "B", "prior": 78},
            "Switzerland": {"region": "uefa", "group": "C", "prior": 77},
            "Colombia": {"region": "conmebol", "group": "D", "prior": 76},
            "Ecuador": {"region": "conmebol", "group": "E", "prior": 74},
            "Canada": {"region": "concacaf", "group": "F", "prior": 72},
            "Australia": {"region": "afc", "group": "G", "prior": 71},
            "Ghana": {"region": "caf", "group": "H", "prior": 70},
        }
    
    def rescale_to_prior_scale(self, target_min: float = 0, target_max: float = 100) -> pd.DataFrame:
        """
        Rescale model strength estimates to 0-100 prior scale.
        
        Uses a sigmoid-based transformation that:
        - Maps model range [min_strength, max_strength] to [target_min, target_max]
        - Preserves relative ordering and uncertainty
        
        Args:
            target_min: Minimum value in rescaled output (default: 0)
            target_max: Maximum value in rescaled output (default: 100)
            
        Returns:
            DataFrame with added rescaled columns: prior_live, live_lower, live_upper
        """
        df = self.model_strength_df.copy()
        
        # Linear rescaling: map [min_strength, max_strength] to [target_min, target_max]
        strength_range = self.max_strength - self.min_strength
        target_range = target_max - target_min
        
        df["prior_live"] = target_min + (df["mean"] - self.min_strength) / strength_range * target_range
        df["live_lower"] = target_min + (df["credible_lower"] - self.min_strength) / strength_range * target_range
        df["live_upper"] = target_min + (df["credible_upper"] - self.min_strength) / strength_range * target_range
        
        # Clamp to [target_min, target_max]
        df["prior_live"] = df["prior_live"].clip(target_min, target_max)
        df["live_lower"] = df["live_lower"].clip(target_min, target_max)
        df["live_upper"] = df["live_upper"].clip(target_min, target_max)
        
        self.rescaled_df = df
        return df
    
    def merge_metadata(self) -> pd.DataFrame:
        """
        Merge region and group metadata with rescaled strengths.
        
        Returns:
            DataFrame ready for data.js export
        """
        if self.rescaled_df is None:
            raise ValueError("Must call rescale_to_prior_scale() first")
        
        df = self.rescaled_df.copy()
        
        # Add metadata
        df["region"] = df["team"].map(lambda t: self.team_metadata.get(t, {}).get("region", "unknown"))
        df["group"] = df["team"].map(lambda t: self.team_metadata.get(t, {}).get("group", ""))
        df["prior"] = df["team"].map(lambda t: self.team_metadata.get(t, {}).get("prior", 50))
        
        # For "live" predictions, use prior_live (posterior estimate)
        df["live"] = df["prior_live"]
        
        return df
    
    def export_to_js(self, output_path: str = "src/data.js") -> str:
        """
        Export rescaled strengths to data.js format.
        
        Args:
            output_path: Path to write data.js (default: src/data.js)
            
        Returns:
            JavaScript export code
        """
        if self.rescaled_df is None:
            raise ValueError("Must call rescale_to_prior_scale() and merge_metadata() first")
        
        df = self.merge_metadata()
        
        # Build teams array
        teams_data = []
        for _, row in df.iterrows():
            team_obj = {
                "name": row["team"],
                "region": row["region"],
                "prior": float(row["prior"]),
                "live": float(row["live"]),
                "group": row["group"]
            }
            teams_data.append(team_obj)
        
        # Sort by region then by live strength (descending)
        teams_data.sort(key=lambda t: (-t["live"], t["region"]))
        
        # Generate JavaScript code
        js_code = "export const seasons = [2010, 2014, 2018, 2022];\n\n"
        js_code += "export const teams = [\n"
        
        for i, team in enumerate(teams_data):
            js_code += f'  {{ name: "{team["name"]}", region: "{team["region"]}", prior: {team["prior"]}, live: {team["live"]:.1f}, group: "{team["group"]}" }}'
            if i < len(teams_data) - 1:
                js_code += ",\n"
            else:
                js_code += "\n"
        
        js_code += "];\n\n"
        js_code += 'export const stages = ["Group stage", "Round of 16", "Quarter-final", "Semi-final", "Champion"];\n'
        
        # Write to file
        with open(output_path, 'w') as f:
            f.write(js_code)
        
        print(f"✅ Exported to {output_path}")
        return js_code
    
    def export_to_json(self, output_path: str = "teams_posterior.json") -> Dict:
        """
        Export full posterior data (with credible intervals) to JSON.
        
        Args:
            output_path: Path to write JSON
            
        Returns:
            Dictionary of exported data
        """
        if self.rescaled_df is None:
            raise ValueError("Must call rescale_to_prior_scale() first")
        
        df = self.merge_metadata()
        
        # Build detailed export
        export_data = {
            "teams": [],
            "metadata": {
                "timestamp": pd.Timestamp.now().isoformat(),
                "model_type": "Hierarchical Bayesian (PyMC)",
                "note": "Live values represent posterior means from MCMC sampling"
            }
        }
        
        for _, row in df.iterrows():
            team_data = {
                "name": row["team"],
                "region": row["region"],
                "group": row["group"],
                "prior": float(row["prior"]),
                "live": {
                    "mean": float(row["prior_live"]),
                    "lower_credible": float(row["live_lower"]),
                    "upper_credible": float(row["live_upper"]),
                    "std": float(row["std"])
                }
            }
            export_data["teams"].append(team_data)
        
        # Sort by live mean
        export_data["teams"].sort(key=lambda t: -t["live"]["mean"])
        
        # Write to file
        with open(output_path, 'w') as f:
            json.dump(export_data, f, indent=2)
        
        print(f"✅ Exported detailed posterior to {output_path}")
        return export_data
    
    def summary(self) -> None:
        """Print summary of rescaled strengths."""
        if self.rescaled_df is None:
            raise ValueError("Must call rescale_to_prior_scale() first")
        
        df = self.merge_metadata()
        
        print("\n=== Rescaled Team Strengths (Prior → Live) ===")
        print(df[["team", "prior", "prior_live", "live_lower", "live_upper", "region"]].to_string(index=False))


# ============ Example Usage ============
if __name__ == "__main__":
    # Simulate posterior from model (in practice, from model.get_team_strength_posterior())
    sample_posterior = pd.DataFrame({
        "team": ["Brazil", "France", "Argentina", "England", "Germany"],
        "mean": [0.95, 0.78, 0.82, 0.65, 0.70],
        "std": [0.15, 0.14, 0.16, 0.12, 0.13],
        "credible_lower": [0.70, 0.52, 0.56, 0.43, 0.47],
        "credible_upper": [1.25, 1.06, 1.12, 0.88, 0.95],
    })
    
    # Initialize pipeline
    pipeline = OutputPipeline(sample_posterior, min_strength=-2.0, max_strength=3.0)
    
    # Rescale
    pipeline.rescale_to_prior_scale(target_min=0, target_max=100)
    
    # Print summary
    pipeline.summary()
    
    # Export
    pipeline.export_to_js("src/data.js")
    pipeline.export_to_json("teams_posterior.json")

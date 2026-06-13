"""
Integration & Orchestration Script

End-to-end pipeline:
1. Load historical WC data (2010–2022) + recent matches
2. Apply time decay weighting + canonicalization
3. Fit hierarchical Bayesian model (PyMC)
4. Extract posterior team strengths
5. Rescale to 0-100 prior scale
6. Export to data.js for frontend

Usage:
    python run_model.py
"""

import sys
import argparse
from datetime import datetime
import pandas as pd
import warnings

warnings.filterwarnings("ignore")

from data_loader import HistoricalDataLoader
from pymc_model import BayesianWorldCupModel
from export_to_js import OutputPipeline


def run_full_pipeline(
    draws: int = 2000,
    tune: int = 2000,
    chains: int = 4,
    half_life_days: float = 365.25,
    csv_files: list = None,
    json_files: list = None,
    output_js_path: str = "src/data.js",
    output_json_path: str = "teams_posterior.json",
    verbose: bool = True
) -> dict:
    """
    Run complete pipeline from data loading to model export.
    
    Args:
        draws: Number of posterior samples per MCMC chain
        tune: Number of tuning steps per chain
        chains: Number of parallel MCMC chains
        half_life_days: Time decay half-life in days (default: 365.25 = 1 year)
        csv_files: Optional list of CSV files to load
        json_files: Optional list of JSON files to load
        output_js_path: Path to write data.js
        output_json_path: Path to write detailed posterior JSON
        verbose: Print progress messages
        
    Returns:
        Dictionary with results (model, trace, posterior_df, etc.)
    """
    
    results = {}
    
    # ========== STEP 1: DATA LOADING ==========
    if verbose:
        print("\n" + "="*60)
        print("STEP 1: DATA LOADING & PREPROCESSING")
        print("="*60)
    
    loader = HistoricalDataLoader(half_life_days=half_life_days)
    
    # Ingest from multiple sources
    if verbose:
        print("\n📥 Ingesting match data...")
    
    matches_df = loader.ingest(
        builtin=True,
        csv_files=csv_files,
        json_files=json_files,
        min_date="2010-01-01"
    )
    
    # Canonicalize team names
    if verbose:
        print("🔄 Canonicalizing team names...")
    loader.canonicalize()
    
    # Apply time decay weighting
    if verbose:
        print(f"⏱️  Applying time decay (half-life: {half_life_days:.1f} days)...")
    loader.apply_time_decay()
    
    # Validate
    if verbose:
        print("✅ Validating data...")
    issues = loader.validate()
    
    # Summary
    if verbose:
        loader.summary()
    
    training_data = loader.get_training_data(min_weight=0.0)
    results["training_data"] = training_data
    results["data_loader"] = loader
    
    # ========== STEP 2: MODEL FITTING ==========
    if verbose:
        print("\n" + "="*60)
        print("STEP 2: BAYESIAN MODEL FITTING")
        print("="*60)
        print(f"\n🔬 Building hierarchical model...")
        print(f"   - Teams: {len(loader.teams)}")
        print(f"   - Matches: {len(training_data)}")
        print(f"   - MCMC chains: {chains}")
        print(f"   - Draws per chain: {draws}")
        print(f"   - Tuning steps: {tune}")
    
    # Initialize and fit model
    model = BayesianWorldCupModel(training_data, home_advantage=0.15, random_seed=42)
    trace = model.build_model(draws=draws, tune=tune, chains=chains)
    
    if verbose:
        print("\n✅ Model fitted successfully")
    
    results["model"] = model
    results["trace"] = trace
    
    # ========== STEP 3: POSTERIOR EXTRACTION ==========
    if verbose:
        print("\n" + "="*60)
        print("STEP 3: POSTERIOR EXTRACTION")
        print("="*60)
        print("\n📊 Extracting team strength posteriors...")
    
    posterior_df = model.get_team_strength_posterior()
    results["posterior_df"] = posterior_df
    
    if verbose:
        print("\n=== Top 10 Teams by Strength ===")
        print(posterior_df.head(10).to_string(index=False))
    
    # ========== STEP 4: RESCALING & EXPORT ==========
    if verbose:
        print("\n" + "="*60)
        print("STEP 4: RESCALING & EXPORT")
        print("="*60)
        print("\n🔢 Rescaling to 0-100 prior scale...")
    
    # Determine strength bounds from posterior
    min_posterior = posterior_df["credible_lower"].min()
    max_posterior = posterior_df["credible_upper"].max()
    
    pipeline = OutputPipeline(
        posterior_df,
        min_strength=min_posterior - 0.5,
        max_strength=max_posterior + 0.5
    )
    
    # Rescale
    pipeline.rescale_to_prior_scale(target_min=0, target_max=100)
    
    if verbose:
        print("\n=== Rescaled Strengths (Sample) ===")
        pipeline.summary()
    
    # Export to data.js
    if verbose:
        print(f"\n📤 Exporting to {output_js_path}...")
    js_code = pipeline.export_to_js(output_js_path)
    
    # Export detailed posterior to JSON
    if verbose:
        print(f"📤 Exporting detailed posterior to {output_json_path}...")
    json_export = pipeline.export_to_json(output_json_path)
    
    results["pipeline"] = pipeline
    results["js_export"] = js_code
    results["json_export"] = json_export
    
    # ========== FINAL SUMMARY ==========
    if verbose:
        print("\n" + "="*60)
        print("✅ PIPELINE COMPLETE")
        print("="*60)
        print(f"\nTimestamp: {datetime.now().isoformat()}")
        print(f"Output files:")
        print(f"  - {output_js_path}")
        print(f"  - {output_json_path}")
        print(f"\nNext steps:")
        print(f"  1. Review {output_json_path} for posterior credible intervals")
        print(f"  2. Commit {output_js_path} to update frontend")
        print(f"  3. (Optional) Run tournament simulations with model.simulate_tournament()")
    
    return results


def main():
    """Command-line interface."""
    parser = argparse.ArgumentParser(
        description="End-to-end Bayesian World Cup forecasting pipeline"
    )
    parser.add_argument(
        "--draws",
        type=int,
        default=2000,
        help="Number of posterior samples per MCMC chain (default: 2000)"
    )
    parser.add_argument(
        "--tune",
        type=int,
        default=2000,
        help="Number of tuning steps per chain (default: 2000)"
    )
    parser.add_argument(
        "--chains",
        type=int,
        default=4,
        help="Number of parallel MCMC chains (default: 4)"
    )
    parser.add_argument(
        "--half-life",
        type=float,
        default=365.25,
        help="Time decay half-life in days (default: 365.25 = 1 year)"
    )
    parser.add_argument(
        "--csv",
        nargs="+",
        help="Optional CSV files to load"
    )
    parser.add_argument(
        "--json",
        nargs="+",
        help="Optional JSON files to load"
    )
    parser.add_argument(
        "--output-js",
        default="src/data.js",
        help="Path to write data.js (default: src/data.js)"
    )
    parser.add_argument(
        "--output-json",
        default="teams_posterior.json",
        help="Path to write posterior JSON (default: teams_posterior.json)"
    )
    parser.add_argument(
        "--quiet",
        action="store_true",
        help="Suppress progress messages"
    )
    
    args = parser.parse_args()
    
    # Run pipeline
    results = run_full_pipeline(
        draws=args.draws,
        tune=args.tune,
        chains=args.chains,
        half_life_days=args.half_life,
        csv_files=args.csv,
        json_files=args.json,
        output_js_path=args.output_js,
        output_json_path=args.output_json,
        verbose=not args.quiet
    )
    
    return 0


if __name__ == "__main__":
    sys.exit(main())

# Labeled Examples for TruthLens

This folder contains sample labeled data for prompt tuning and evaluation.

- `examples.json` — JSON with text, flags, explanations, rewrites, and confidence

Each example:

- `text`: original sentence
- `flags`: array of flagged spans with type, explanation, rewrite, and confidence

Use for: prompt evaluation, precision/recall measurement, and demo/testing.

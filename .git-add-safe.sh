#!/bin/bash
# Safe git add that skips empty/corrupted files
cd /Users/aidan/Documents/NHLStatAnalyzer

# Remove lock file
rm -f .git/index.lock

# Add files individually, skipping empty ones
find . -type f \
  -not -path "./.git/*" \
  -not -path "./node_modules/*" \
  -not -path "./.next/*" \
  -not -path "./.playwright/*" \
  -not -path "./analytics-service/venv/*" \
  -not -name "*.swp" \
  -not -name "*.swo" \
  -not -name "*~" \
  -size +0 \
  -exec git add {} \; 2>&1 | grep -v "error: short read" | grep -v "failed to insert" || true

echo "Safe add completed. Check git status for results."

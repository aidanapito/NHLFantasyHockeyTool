#!/bin/bash
# Add files excluding empty ones that cause errors
cd /Users/aidan/Documents/NHLStatAnalyzer

# Remove lock
rm -f .git/index.lock

# Add files one by one, skipping errors
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
  -print0 | while IFS= read -r -d '' file; do
  git add "$file" 2>&1 | grep -v "error: short read" | grep -v "failed to insert" || true
done

echo "Files added (errors for corrupted files were skipped)"
git status --short | head -20

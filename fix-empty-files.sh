#!/bin/bash
# Fix empty files by either deleting them or adding placeholder content
cd /Users/aidan/Documents/NHLStatAnalyzer

echo "Finding empty files..."
find . -type f -size 0 \
  -not -path "./.git/*" \
  -not -path "./node_modules/*" \
  -not -path "./.next/*" \
  -not -path "./.playwright/*" \
  -not -path "./analytics-service/venv/*" \
  2>/dev/null | while read file; do
  echo "Empty file: $file"
  # For TypeScript/JavaScript files, add a comment
  if [[ "$file" == *.ts ]] || [[ "$file" == *.js ]]; then
    echo "// File placeholder" > "$file"
  # For markdown files, add a header
  elif [[ "$file" == *.md ]]; then
    echo "# Placeholder" > "$file"
  # For other files, add a placeholder
  else
    echo "# Placeholder" > "$file"
  fi
done

echo "Empty files fixed. You can now run: git add ."

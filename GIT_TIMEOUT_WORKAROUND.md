# Git Timeout Issue - Workarounds

## Problem

Git operations are timing out with `fatal: mmap failed: Operation timed out`. This is a filesystem-level issue, not a code problem.

## Quick Workarounds

### Option 1: Add Files Individually (Recommended)

Instead of `git add .`, add files one at a time or by directory:

```bash
# Add specific files/directories
git add MATCHUP_ANALYZER_ML_REQUIREMENTS.md
git add SETUP_STATUS.md
git add scripts/verify-ml-setup.ts
git add analytics-service/modeling/config.py
git add package.json
git add .gitignore

# Or add by directory
git add scripts/
git add analytics-service/modeling/config.py
```

### Option 2: Use Git Add with Patterns

```bash
# Add only specific file types
git add '*.md'
git add '*.ts'
git add '*.py'
git add '*.json'
```

### Option 3: Reset Git Index (if filesystem recovers)

```bash
# Remove all files from index (doesn't delete them)
git rm -r --cached .

# Then re-add selectively
git add MATCHUP_ANALYZER_ML_REQUIREMENTS.md SETUP_STATUS.md
git add scripts/
git add analytics-service/modeling/config.py
git add package.json .gitignore
```

### Option 4: Wait and Retry

The filesystem timeout may be temporary. Try again later:

```bash
# Wait a few minutes, then try
git add .
```

## Files Changed (That Should Be Committed)

Based on our work, these files were modified/created:

1. **New Files:**
   - `MATCHUP_ANALYZER_ML_REQUIREMENTS.md` - Complete requirements guide
   - `SETUP_STATUS.md` - Setup status and next steps
   - `scripts/verify-ml-setup.ts` - Verification script
   - `GIT_TIMEOUT_WORKAROUND.md` - This file

2. **Modified Files:**
   - `analytics-service/modeling/config.py` - Added 20252026 season
   - `package.json` - Added verify-ml-setup script
   - `.gitignore` - Added more ignore patterns

## Recommended Commit Command

Once you can add files, commit with:

```bash
git commit -m "Setup ML model for 2025-2026 season

- Updated config to include 20252026 season
- Added verification script for ML setup
- Created comprehensive requirements documentation
- Updated .gitignore patterns"
```

## Root Cause

This appears to be a filesystem performance issue, possibly:
- Network filesystem (if repo is on network drive)
- Slow disk I/O
- Too many files in working directory
- Corrupted git index

## Long-term Solution

If this persists:
1. Check if repo is on network drive - consider moving to local SSD
2. Check disk health and free space
3. Consider using Git LFS for large files (if needed)
4. Re-clone the repository if index is corrupted


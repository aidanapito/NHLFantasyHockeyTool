# Game Log Coverage Analysis Summary

## Key Findings

1. **Overall Coverage is Good**:
   - 83% of players (1,361/1,639) have game logs
   - 62.4% have 2023-24 logs
   - 55% have 2025-26 logs

2. **Duplicate Player Entries Problem**:
   - Many players have 2-3 entries in the database with different NHL IDs
   - One entry has game logs (correct), others don't (incorrect/old IDs)
   - Examples:
     - Dylan Larkin: ID 14 (NHL ID 8477946) ✅ 257 logs vs ID 1033 (NHL ID 3114755) ❌ 0 logs
     - Kyle Connor: ID 24 (NHL ID 8478398) ✅ 261 logs vs ID 1024 (NHL ID 3899952) ❌ 0 logs

3. **Problem Players from Matchup**:
   All use WRONG NHL IDs (old IDs without game logs):
   - Kyle Connor: Wrong NHL ID 3899952 → Should use NHL ID 8478398
   - Dylan Larkin: Wrong NHL ID 3114755 → Should use NHL ID 8477946
   - Dylan Strome: Wrong NHL ID 3899933 → Should use NHL ID 8478440
   - Drake Batherson: Wrong NHL ID 4271734 → Should use NHL ID 8480208
   - And so on...

## Solution

When fetching players by NHL ID, if no game logs are found, we should:
1. Try to find a player with the same name that HAS game logs
2. Use that player instead
3. Or create a player resolution/mapping function


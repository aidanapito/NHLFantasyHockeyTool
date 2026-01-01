# Database ID Usage Guide

## ✅ Current Status: CORRECTLY CONFIGURED

**All player-related tables use database ID (`Player.id`) as foreign keys.** This is already correctly set up and working!

## Schema Overview

All foreign keys correctly reference `Player.id` (the primary key database ID):

```prisma
// ✅ GameLog uses database ID
model GameLog {
  playerId  Int
  player    Player @relation(fields: [playerId], references: [id])
}

// ✅ PlayerStats uses database ID  
model PlayerStats {
  playerId  Int
  player    Player @relation(fields: [playerId], references: [id])
}

// ✅ PlayerProjection uses database ID
model PlayerProjection {
  playerId  Int
  player    Player @relation(fields: [playerId], references: [id])
}

// ✅ FantasyRoster uses database ID
model FantasyRoster {
  playerId  Int
  player    Player @relation(fields: [playerId], references: [id])
}
```

## Querying with Database ID

You can query any player by their database ID and get all related data:

### Example 1: Get Player with All Related Data

```typescript
const playerId = 99; // Database ID (NOT NHL ID)

const player = await prisma.player.findUnique({
  where: { id: playerId },
  include: {
    gameLogs: { take: 10, orderBy: { gameDate: 'desc' } },
    stats: { where: { season: '20252026' } },
    projections: { take: 5 },
    fantasyRoster: { include: { team: true } }
  }
});

// All related data is accessible:
// - player.gameLogs[]     ✅ Game logs
// - player.stats[]        ✅ Seasonal stats
// - player.projections[]  ✅ ML projections
// - player.fantasyRoster[] ✅ Fantasy roster entries
```

### Example 2: Query GameLogs Directly

```typescript
// Query game logs using database ID
const gameLogs = await prisma.gameLog.findMany({
  where: { playerId: 99 }, // Database ID
  orderBy: { gameDate: 'desc' },
  include: {
    player: { select: { fullName: true, nhlId: true } }
  }
});
```

### Example 3: Query PlayerStats Directly

```typescript
// Query stats using database ID
const stats = await prisma.playerStats.findMany({
  where: { playerId: 99 }, // Database ID
  include: {
    player: { select: { fullName: true } }
  }
});
```

### Example 4: Query Projections Directly

```typescript
// Query projections using database ID
const projections = await prisma.playerProjection.findMany({
  where: { playerId: 99 }, // Database ID
  include: {
    player: { select: { fullName: true } }
  }
});
```

## Converting NHL ID → Database ID

If you have an NHL ID and need the database ID:

```typescript
const player = await prisma.player.findUnique({
  where: { nhlId: 8479323 }, // NHL ID
  select: { id: true } // Get database ID
});

if (player) {
  const databaseId = player.id; // Use this for all queries
}
```

## API Routes

### Current Pattern (Some APIs)

Some APIs currently accept NHL ID as a parameter, then use Prisma relations:

```typescript
// This works, but uses NHL ID in the query
const gameLogs = await prisma.gameLog.findMany({
  where: {
    player: { nhlId: parseInt(playerId) } // NHL ID parameter
  }
});
```

### Recommended Pattern (Using Database ID)

For better consistency, APIs should accept database ID:

```typescript
// Better: Accept database ID directly
const gameLogs = await prisma.gameLog.findMany({
  where: { playerId: parseInt(playerId) } // Database ID parameter
});
```

## Benefits of Using Database ID

1. ✅ **Performance**: Direct foreign key lookups are faster
2. ✅ **Simplicity**: No need to join through Player table
3. ✅ **Consistency**: All queries use the same ID system
4. ✅ **Type Safety**: Prisma validates foreign keys automatically

## Will This Break Anything?

**NO!** Everything is already set up correctly:

- ✅ All foreign keys use database ID
- ✅ Prisma relations work correctly
- ✅ Data integrity is maintained
- ✅ Queries work as expected

Some APIs currently accept NHL ID, but they work fine because:
- Prisma allows querying through relations
- They still use database IDs for foreign keys internally
- No breaking changes needed

## Summary

| Aspect | Status |
|--------|--------|
| Schema foreign keys | ✅ Use `Player.id` (database ID) |
| GameLog.playerId | ✅ References `Player.id` |
| PlayerStats.playerId | ✅ References `Player.id` |
| PlayerProjection.playerId | ✅ References `Player.id` |
| FantasyRoster.playerId | ✅ References `Player.id` |
| Can query by database ID | ✅ Yes, fully supported |
| Will break existing code? | ✅ No, everything works |

**Your database is correctly configured!** You can use database IDs everywhere without breaking anything.


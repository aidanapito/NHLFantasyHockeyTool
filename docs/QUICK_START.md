# Quick Start Guide

## Getting Started

This is a fresh, modern Fantasy Hockey Trade Analyzer built from scratch for optimal performance.

### Installation

```bash
npm install
```

### Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## Using the Trade Analyzer

### Basic Workflow

1. **Search for Players**
   - Click "Add Player" on either side of the trade
   - Type a player name (e.g., "McDavid")
   - Select the player from the results

2. **Build Both Sides of the Trade**
   - Add players to "Your Side" (what you're offering)
   - Add players to "Other Team" (what you're receiving)

3. **Analyze the Trade**
   - Click "Analyze Trade" button
   - View the comprehensive analysis:
     - Value comparison
     - Recommendation (Accept/Negotiate/Reject)
     - Net value gain/loss
     - Individual player breakdown

### Understanding the Analysis

**Recommendation Types:**
- **Accept** (Green): Good deal for you
- **Negotiate** (Yellow): Close, but you might want to ask for adjustments
- **Reject** (Red): Poor value for you

**Key Metrics:**
- **Actual Value**: Current player performance in fantasy
- **Projected Value**: Expected performance at draft time
- **Value Delta**: Difference between actual and projected
- **Net Gain**: Overall value gained/lost in the trade

### Value Calculation

The system weighs fantasy categories:

| Category | Weight |
|----------|--------|
| Points | 4.0 |
| Goals | 3.0 |
| Assists | 2.5 |
| Plus/Minus | 1.5 |
| Power Play Points | 1.2 |
| PIM | 0.8 |
| Hits | 0.7 |
| Blocks | 0.6 |
| Shots | 0.3 |
| Time on Ice | 0.1 |

## API Routes

- `GET /api/players/search?q={query}` - Search players
- `GET /api/players/[id]` - Get player details
- `POST /api/trade/analyze` - Analyze a trade

## Demo Data

Currently using mock data for demonstration. To integrate with real NHL data:
1. Update `lib/nhl-api.ts` with proper API endpoints
2. Configure environment variables if needed
3. Add authentication for premium APIs

## Technology

- Next.js 14 with App Router
- TypeScript
- Tailwind CSS
- Modern, responsive design
- Optimized for performance

## Troubleshooting

**npm install fails?**
- Remove `node_modules` and `package-lock.json`
- Run `npm install` again

**Server won't start?**
- Check if port 3000 is in use
- Kill existing processes: `lsof -ti:3000 | xargs kill -9`

**Players not loading?**
- Currently using mock data
- Search for "McDavid" to see demo players

## Next Steps

1. Run the development server
2. Test with mock players
3. Customize value weights in `lib/player-value-calculator.ts`
4. Integrate real NHL API when ready

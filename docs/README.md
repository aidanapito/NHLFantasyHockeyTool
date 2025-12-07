# Fantasy Hockey Trade Analyzer

A modern, efficient Fantasy Hockey Trade Analyzer that helps you make data-driven decisions by comparing player values, recent trends, and projected performance.

## Features

### 🎯 Core Functionality

- **Player Value Calculation**: Automatically calculates the true fantasy value of every player based on:
  - Real-world performance metrics (goals, assists, shots, hits, blocks, etc.)
  - Weighted importance of each category
  - Recent trends and consistency
  - Time on ice and special teams usage

- **Trade Evaluation**: Input potential trades and instantly see:
  - Net value gain/loss for each side
  - Fairness assessment
  - Recommendation (accept, reject, or negotiate)
  - Detailed reasoning based on data

- **Value Comparison**: See how each player's actual performance compares to:
  - Their draft position or ESPN projected value
  - Whether they're overperforming or underperforming
  - Recent trend indicators (up, down, stable)

### 🚀 Key Advantages Over Previous Version

1. **Performance**: Modern Next.js architecture with optimized data fetching
2. **Real-time Analysis**: Instant trade analysis with visual feedback
3. **User Experience**: Clean, intuitive interface with player search
4. **Data-driven**: Weighted scoring system based on fantasy category importance
5. **Context-aware**: Incorporates recent trends, TOI changes, and consistency

## Getting Started

### Installation

```bash
# Install dependencies
npm install

# Run development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Usage

1. **Search for Players**: Click "Add Player" and search for players by name
2. **Build Your Side**: Add players you're offering in the "Your Side" section
3. **Build Other Side**: Add players you're receiving in the "Other Team" section
4. **Analyze**: Click "Analyze Trade" to see the comprehensive breakdown

### Understanding the Results

- **Recommendation**: Based on value calculations
  - **Accept**: You're getting fair or better value
  - **Negotiate**: Trade is somewhat unbalanced
  - **Reject**: Trade significantly favors the other side

- **Net Value Gain**: Shows how much value is moving in the trade
  - Positive: You're gaining value
  - Negative: You're losing value

- **Player Breakdown**: Individual player values in the trade

## How It Works

### Value Calculation

The system weights fantasy categories based on their importance:

```typescript
FANTASY_WEIGHTS = {
  goals: 3.0,
  assists: 2.5,
  points: 4.0,
  plusMinus: 1.5,
  pim: 0.8,
  shots: 0.3,
  hits: 0.7,
  blocks: 0.6,
  ppp: 1.2,
  toi: 0.1,
}
```

Each player's value is calculated as:
- Weighted sum of all fantasy categories
- Normalized per game
- Compared against projections
- Adjusted for recent trends

### Trend Analysis

The system considers:
- **Consistency**: How reliable a player's production is
- **Recent Form**: Last 5 games vs last 10 games
- **TOI Changes**: Increases/decreases in ice time
- **Performance Variance**: Ups and downs in scoring

## Technology Stack

- **Next.js 14**: React framework with App Router
- **TypeScript**: Type-safe development
- **Tailwind CSS**: Modern, responsive styling
- **Recharts**: Data visualization
- **NHL Stats API**: Real-time player data

## Architecture

```
├── app/
│   ├── api/               # API routes
│   │   ├── players/       # Player search & data
│   │   └── trade/         # Trade analysis
│   └── page.tsx           # Main UI
├── components/
│   └── TradeAnalyzer.tsx  # Trade builder & results
├── lib/
│   ├── nhl-api.ts         # NHL API integration
│   ├── player-value-calculator.ts  # Value calculation logic
│   └── trade-analyzer.ts  # Trade analysis logic
└── types/
    ├── player.ts          # Player type definitions
    └── trade.ts           # Trade type definitions
```

## API Endpoints

### `/api/players/search?q={query}`
Search for players by name.

### `/api/players/[id]`
Get detailed player information and calculated value.

### `/api/trade/analyze`
Analyze a trade (POST with player IDs for each side).

## Future Enhancements

- [ ] Real NHL API integration
- [ ] Historical data analysis
- [ ] League scoring customization
- [ ] Weekly projections
- [ ] Trade history tracking
- [ ] Advanced visualizations
- [ ] Mobile app

## License

MIT

## Contributing

Contributions welcome! Please open an issue or submit a pull request.

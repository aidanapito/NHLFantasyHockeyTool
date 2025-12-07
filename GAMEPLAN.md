# Fantasy Hockey Data Science Platform - Gameplan

## Overview
Build a comprehensive fantasy hockey analytics platform that provides users with data-driven insights to gain a competitive advantage in their leagues.

---

## 1. Data Acquisition Strategy

### 1.1 NHL Player Data Sources

#### Primary Source: NHL Official APIs
- **NHL Stats API** (`https://api.nhle.com/stats/rest/en/`)
  - Skater summary stats (goals, assists, points, +/-, PIM, shots, TOI, etc.)
  - Skater realtime stats (hits, blocks, giveaways, takeaways)
  - Faceoff statistics
  - Goalie summary stats (W-L-OT, SV%, GAA, shutouts)
  - Skater shooting stats
  - Goalie shooting stats

- **NHL Web API** (`https://api-web.nhle.com/v1`)
  - Player landing pages (detailed player info)
  - Team information
  - Schedule data
  - Game data and box scores

#### Additional Data Needs
- **Player Metadata**: Height, weight, age, draft info, contract status
- **Team Context**: Line combinations, power play units, penalty kill usage
- **Historical Data**: Previous seasons for trend analysis and projections
- **Injury Data**: Current injury status, expected return dates
- **Advanced Metrics**: Expected goals (xG), Corsi, Fenwick (if available)

#### Data Refresh Strategy
- **Daily Updates**: Full stat refresh once per day (late night/early morning)
- **Near Real-time**: For active game days, update stats every few hours
- **Incremental Updates**: Only fetch and update changed data when possible
- **Caching Layer**: Use database to cache data and reduce API calls

### 1.2 Fantasy League Integration

#### Supported Platforms (Priority Order)

**1. ESPN Fantasy Hockey**
- **Integration Method**: Web scraping or unofficial API
- **Data Needed**:
  - League ID
  - Team rosters (owned players)
  - League scoring settings (categories, weights)
  - League type (H2H, Roto)
  - Team standings
  - Recent transactions (trades, waiver claims)
- **Authentication**: Cookie-based or OAuth if available
- **Challenges**: ESPN may block scraping; may need to use Selenium/Puppeteer

**2. Yahoo Fantasy Hockey**
- **Integration Method**: Yahoo Fantasy Sports API (OAuth 2.0)
- **Advantages**: Official API available
- **Data Needed**: Similar to ESPN
- **Setup Required**: App registration, OAuth flow

**3. Sleeper**
- **Integration Method**: Official Sleeper API
- **Advantages**: Well-documented API
- **Data Needed**: Similar to ESPN

#### League Data Requirements Per Platform
- **Roster Information**: Which team owns which players
- **League Settings**: Scoring categories, roster positions, league size
- **Matchup Data**: Current week matchups (for H2H leagues)
- **Transaction History**: Trades, adds, drops
- **Draft Information**: Draft order, keeper status (if applicable)

#### User Flow for League Integration
1. User connects their fantasy league account
2. System fetches and stores league info (encrypted)
3. Periodic sync to keep rosters up-to-date
4. Option for manual refresh on-demand

---

## 2. Database Architecture

### 2.1 Core Tables

#### Players
- Basic player information (name, position, team, jersey number)
- Physical attributes (height, weight, age)
- Headshot URLs
- Status (active/inactive)
- Career metadata

#### PlayerStats
- Season-based statistics
- Game type (regular/playoffs)
- Per-game and cumulative stats
- Fantasy-relevant categories
- Historical stats for trend analysis

#### Teams (NHL Teams)
- Team information
- Conference/division
- Current standings

#### FantasyLeagues
- League platform (ESPN/Yahoo/Sleeper)
- League ID
- League name
- Scoring settings (categories, weights)
- League type (H2H/Roto)
- User association

#### FantasyTeams
- Team name
- League association
- Owner information
- Current roster (many-to-many with Players)

#### FantasyRosters
- Junction table: FantasyTeams <-> Players
- Add date
- Current status (active/bench/IR)
- Acquisition method (draft/trade/waiver)

#### PlayerProjections
- Projected stats for upcoming games/weeks
- Confidence intervals
- Model used for projection
- Date generated

#### InjuryReports
- Player injury status
- Injury type
- Expected return date
- Impact on performance

---

## 3. Feature Set Breakdown

### 3.1 Core Analytics Features

#### Player Value Calculator
- **Multi-Category Scoring**: Weight different fantasy categories based on league settings
- **Dollar Value**: Convert stats to fantasy dollar values (auction draft style)
- **Z-Score Analysis**: Standardized scores across categories
- **Contextual Weighting**: Adjust for league size, roster construction

#### Player Comparison Tool
- Side-by-side player comparisons
- Category-by-category breakdown
- Value overlay visualization
- Similar player suggestions

#### Trade Analyzer
- Multi-player trade evaluation
- Value gain/loss calculation
- Fairness scoring
- Recommendation engine
- Similar trade suggestions

#### Roster Optimizer
- Optimal lineup suggestions (based on schedule, matchups)
- Start/sit recommendations
- Streaming suggestions (add/drop recommendations)
- Position scarcity analysis

### 3.2 Advanced Analytics

#### Trend Analysis
- Recent performance trends (last 5, 10, 15 games)
- Rolling averages vs. season averages
- Consistency metrics
- Scoring pace analysis

#### Schedule Analysis
- Upcoming game schedules
- Opponent difficulty (strength of schedule)
- Back-to-back games
- Home vs. away performance splits
- Division/conference matchup analysis

#### Line Combination Tracking
- Current line combinations
- Power play unit assignments
- Penalty kill usage
- Impact on player value when lines change

#### Advanced Metrics
- Shots per game trends
- Shooting percentage regression to mean
- Expected goals (xG) analysis
- Time on ice trends
- Zone start percentages (if available)

### 3.3 Machine Learning & Projections

#### Statistical Models
- **Regression Models**: Predict player performance
- **Time Series Analysis**: Forecast trends
- **Categorical Analysis**: Goal probabilities, assist probabilities
- **Goalies**: Win probability, save percentage trends

#### Feature Engineering
- Recent form (last 5/10 games)
- Historical performance vs. upcoming opponents
- Home/away splits
- Opponent strength (goals allowed, shots against)
- Team context (line mates, power play time)
- Injury recovery timeframes
- Age-based regression curves

#### Projection Types
- Next game projections
- Next week projections
- Rest of season projections
- Category-specific projections (goals, assists, hits, etc.)

### 3.4 League-Specific Features

#### League Dashboard
- Your team overview
- Matchup preview (for H2H leagues)
- Category needs analysis
- Suggested pickups to improve category standings

#### Waiver Wire Analysis
- Best available players
- Filtered by position needs
- Streaming opportunities
- Long-term vs. short-term value

#### Draft Tools (for future seasons)
- ADP (Average Draft Position) tracking
- Draft value calculator
- Position scarcity by round
- Keeper league value calculator

#### Category Management
- Identify which categories you're weak in
- Find players who can help in specific categories
- Trade targets based on category needs
- Punt strategy calculator

---

## 4. Technical Architecture

### 4.1 Tech Stack

#### Frontend
- **Next.js 14** (App Router) - Already set up ✓
- **React 18** - UI components
- **TypeScript** - Type safety
- **Tailwind CSS** - Styling
- **Recharts** - Data visualization (already installed)
- **Framer Motion** - Animations (already installed)

#### Backend
- **Next.js API Routes** - Serverless API endpoints
- **Node.js** - Runtime

#### Database
- **PostgreSQL** (recommended) or **MySQL**
- **Prisma ORM** - Already referenced in code
- **Connection Pooling** - For efficient database connections

#### Data Fetching
- **Axios** - HTTP client (already installed)
- **Caching Strategy**: 
  - Database for persistent cache
  - In-memory cache for frequently accessed data (Redis optional, but recommended for scale)

#### Authentication (if user accounts needed)
- **NextAuth.js** - Authentication framework
- OAuth providers (Google, GitHub) for easy login

#### Background Jobs
- **Cron Jobs** - For scheduled data refreshes
  - Vercel Cron (if deployed on Vercel)
  - Or external service like GitHub Actions, GitHub Actions, or dedicated job runner

### 4.2 API Architecture

#### Internal API Routes Structure
```
/app/api/
  /players/
    - GET /search - Search players
    - GET /[id] - Get player details
    - GET /[id]/stats - Get player stats
    - GET /[id]/projections - Get player projections
    - GET /[id]/trends - Get player trends
  
  /fantasy/
    /leagues/
      - POST /connect - Connect fantasy league
      - GET /[id] - Get league details
      - POST /[id]/sync - Manually sync league data
      - GET /[id]/teams - Get league teams
      - GET /[id]/standings - Get league standings
    
    /teams/
      - GET /[id] - Get team details
      - GET /[id]/roster - Get team roster
      - GET /[id]/analysis - Get team analysis
      - POST /[id]/optimize - Get lineup optimization
    
    /analysis/
      - POST /trade - Analyze trade
      - GET /waiver-wire - Get waiver wire recommendations
      - GET /streaming - Get streaming suggestions
  
  /stats/
    - GET /advanced - Advanced stats query
    - GET /trends - Player trend data
  
  /projections/
    - GET /player/[id] - Player projections
    - POST /generate - Generate projections
  
  /injury/
    - GET /reports - Get injury reports
    - GET /player/[id] - Get player injury status
```

### 4.3 Data Flow

```
NHL APIs → Data Fetcher → Database
                ↓
            Cache Layer
                ↓
    Next.js API Routes → Frontend
```

**Scheduled Refresh Flow:**
1. Cron job triggers `/api/refresh-stats`
2. Fetches latest data from NHL APIs
3. Processes and normalizes data
4. Updates database
5. Invalidates cache if needed

**User Request Flow:**
1. User interacts with frontend
2. Frontend calls Next.js API route
3. API checks cache/database
4. If data stale or missing, fetch fresh data
5. Return formatted data to frontend
6. Frontend displays with visualizations

---

## 5. Competitive Advantages & Unique Features

### 5.1 What Makes This Platform Valuable

1. **Automated League Sync**: Connect your league once, automatic updates
2. **Context-Aware Recommendations**: Not just stats, but actionable advice
3. **Multi-Category Optimization**: Find players who help in specific weak categories
4. **Trend-Based Projections**: Not just season averages, but recent form weighting
5. **Schedule Intelligence**: Factor in opponent strength and game schedules
6. **Line Combination Tracking**: Know when players move up/down lines
7. **Trade Impact Analysis**: See how trades affect category standings

### 5.2 Differentiation from Existing Tools

- **FantasyPros**: More manual, subscription-heavy
- **Dobber Hockey**: Focus on projections, less on actionable league advice
- **ESPN/Yahoo Default Tools**: Basic stats, no advanced analytics

**Your Advantage:**
- Free/affordable access
- Automated league integration
- Actionable, specific recommendations
- Beautiful, modern UI
- Focus on competitive advantage through data

---

## 6. Implementation Phases

### Phase 1: Foundation (Weeks 1-2)
**Goal**: Build core data infrastructure

- [ ] Set up database (PostgreSQL + Prisma)
- [ ] Design and create database schema
- [ ] Build robust NHL API data fetcher (`/api/refresh-stats`)
- [ ] Set up daily cron job for data refresh
- [ ] Create basic player search and detail endpoints
- [ ] Build simple player search UI

**Deliverable**: Users can search for players and view their stats

### Phase 2: Basic Analytics (Weeks 3-4)
**Goal**: Player value calculations and comparisons

- [ ] Implement player value calculator (multi-category scoring)
- [ ] Create player comparison tool
- [ ] Build player detail pages with visualizations
- [ ] Add trend analysis (last 5/10 games)
- [ ] Create basic dashboard

**Deliverable**: Users can compare players and see calculated fantasy values

### Phase 3: Fantasy League Integration (Weeks 5-7)
**Goal**: Connect to user's fantasy leagues

- [ ] Research and implement ESPN league integration
- [ ] Build league connection UI flow
- [ ] Create roster fetching and storage
- [ ] Build team dashboard showing user's roster
- [ ] Implement basic trade analyzer
- [ ] Add manual league data entry option (fallback)

**Deliverable**: Users can connect their league and analyze their team

### Phase 4: Advanced Features (Weeks 8-10)
**Goal**: Actionable insights and recommendations

- [ ] Build roster optimizer (start/sit recommendations)
- [ ] Create waiver wire analyzer
- [ ] Implement streaming suggestions
- [ ] Add category management tools
- [ ] Build matchup analysis (for H2H leagues)
- [ ] Create trade recommendations based on category needs

**Deliverable**: Platform provides actionable recommendations

### Phase 5: ML & Projections (Weeks 11-13)
**Goal**: Predictive analytics

- [ ] Build simple projection models (regression)
- [ ] Create next game/week projections
- [ ] Implement rest-of-season projections
- [ ] Add confidence intervals
- [ ] Create projection visualization UI

**Deliverable**: Platform can project future performance

### Phase 6: Polish & Scale (Weeks 14-16)
**Goal**: Production-ready platform

- [ ] Add line combination tracking
- [ ] Implement injury report integration
- [ ] Build schedule analysis features
- [ ] Performance optimization (caching, lazy loading)
- [ ] Error handling and monitoring
- [ ] Mobile responsiveness
- [ ] Documentation and help guides

**Deliverable**: Production-ready, polished platform

---

## 7. Data Challenges & Solutions

### 7.1 Challenge: NHL API Rate Limits
**Solution**: 
- Implement rate limiting and request queuing
- Cache aggressively in database
- Use batch requests where possible
- Add delays between API calls

### 7.2 Challenge: Fantasy League API Access
**Solution**:
- Start with ESPN (web scraping if needed)
- Provide manual entry option as fallback
- Document API limitations for users
- Consider building browser extension for easier data collection

### 7.3 Challenge: Historical Data
**Solution**:
- Store historical data as you fetch it
- Backfill previous seasons gradually
- Use archive services if available
- Prioritize recent seasons for analysis

### 7.4 Challenge: Real-time Updates During Season
**Solution**:
- Daily batch updates (scheduled jobs)
- Real-time updates can be premium feature
- User-initiated refresh button
- Show "last updated" timestamps

---

## 8. User Experience Flow

### 8.1 New User Journey
1. **Landing Page**: Value proposition, demo/screenshots
2. **Get Started**: Connect league or explore without connection
3. **League Connection**: Step-by-step guide to connect ESPN/Yahoo
4. **Dashboard**: Overview of their team, key insights
5. **Explore**: Browse players, compare, analyze

### 8.2 Core User Actions
1. **Check Team Dashboard**: Daily view of roster, matchups, recommendations
2. **Search Players**: Find specific players to research
3. **Analyze Trade**: Input trade, get instant analysis
4. **Find Pickups**: Browse waiver wire, get suggestions
5. **Optimize Lineup**: See start/sit recommendations
6. **Project Performance**: Check upcoming projections

---

## 9. Monetization Considerations (Future)

### Free Tier
- Basic player stats
- Manual league entry
- Limited projections

### Premium Tier
- Automatic league sync
- Advanced analytics
- ML projections
- Trade recommendations
- Waiver wire alerts
- Email notifications

---

## 10. Key Success Metrics

### Technical Metrics
- API uptime and response times
- Data freshness (hours old)
- Daily active users
- Feature usage rates

### User Value Metrics
- Trades analyzed
- Pickups suggested
- User wins attributed to platform insights
- User retention

---

## 11. Immediate Next Steps

### Week 1 Priority Tasks
1. **Set up Database**
   - Choose PostgreSQL or MySQL
   - Set up Prisma schema
   - Define core tables (Players, PlayerStats)

2. **Harden Data Fetcher**
   - Test and improve `/api/refresh-stats` route
   - Handle errors gracefully
   - Add data validation

3. **Build Basic Player UI**
   - Player search component
   - Player detail page
   - Simple stat display

4. **Research Fantasy APIs**
   - Test ESPN integration approach
   - Check Yahoo Fantasy API documentation
   - Determine authentication requirements

5. **Set up Cron Jobs**
   - Configure daily data refresh
   - Test scheduled jobs locally

---

## 12. Technical Considerations

### Scalability
- Consider database indexing strategy early
- Plan for caching layer (Redis) if needed
- Use database connection pooling
- Optimize API routes for serverless execution

### Security
- Encrypt stored league credentials
- Never store passwords in plain text
- Use environment variables for API keys
- Implement rate limiting on public endpoints

### Error Handling
- Graceful degradation if NHL APIs are down
- User-friendly error messages
- Logging and monitoring (consider Sentry)
- Fallback data sources where possible

### Performance
- Lazy load heavy components
- Paginate large data sets
- Optimize database queries (avoid N+1)
- Use React Query or SWR for client-side caching

---

## Summary

This platform will combine comprehensive NHL data acquisition with intelligent fantasy league integration to provide users with actionable insights they can't get elsewhere. The phased approach allows for iterative development and user feedback while building toward a complete, production-ready platform.

The key competitive advantages:
1. **Automation**: League sync reduces manual work
2. **Intelligence**: ML-powered recommendations, not just data dumps
3. **Context**: League-specific, category-specific advice
4. **Modern UX**: Beautiful, intuitive interface

Focus on solving real problems fantasy managers face daily: "Should I make this trade?", "Who should I pick up?", "Who should I start?", "How can I improve in this category?"


/**
 * Calculate Z-scores for fantasy hockey players
 * Z-score = (value - mean) / standard deviation
 * Sum of all category Z-scores = total fantasy value
 */

interface SkaterStats {
  goals: number;
  assists: number;
  plusMinus: number;
  penaltyMinutes: number;
  ppPoints?: number;
  totalFaceoffs?: number;
  faceoffsWon?: number;
  shots: number;
  hits?: number;
  blockedShots?: number;
  gamesPlayed: number;
}

interface GoalieStats {
  wins?: number;
  shutouts?: number;
  goalsAgainstAverage?: number;
  savePct?: number;
  gamesPlayed: number;
}

/**
 * Calculate mean (average) of an array of numbers
 */
function mean(values: number[]): number {
  if (values.length === 0) return 0;
  const sum = values.reduce((acc, val) => acc + val, 0);
  return sum / values.length;
}

/**
 * Calculate standard deviation
 */
function standardDeviation(values: number[]): number {
  if (values.length === 0) return 0;
  const avg = mean(values);
  const squareDiffs = values.map(val => Math.pow(val - avg, 2));
  const avgSquareDiff = mean(squareDiffs);
  return Math.sqrt(avgSquareDiff);
}

/**
 * Calculate Z-score for a single value
 * For inverse metrics (like GAA where lower is better), invert the result
 */
function zScore(value: number, mean: number, stdDev: number, invert: boolean = false): number {
  if (stdDev === 0 || isNaN(value) || !isFinite(value)) return 0;
  const z = (value - mean) / stdDev;
  return invert ? -z : z;
}

/**
 * Calculate Z-scores for all skaters
 * Categories: G, A, +/-, PIM, PPP, FOW, SOG, HIT, BLK
 */
export function calculateSkaterZScore(
  player: SkaterStats,
  allPlayers: SkaterStats[]
): number {
  // Filter out players with no games played for calculations
  const validPlayers = allPlayers.filter(p => p.gamesPlayed > 0);
  if (validPlayers.length === 0) return 0;
  
  // If player has no games played, return 0 (but don't exclude them from display)
  if (player.gamesPlayed === 0) return 0;

  // Calculate per-game rates for fair comparison
  const calculateRate = (stat: number, gp: number) => gp > 0 ? stat / gp : 0;

  // Extract all values for each category
  const goalsPerGame = validPlayers.map(p => calculateRate(p.goals, p.gamesPlayed));
  const assistsPerGame = validPlayers.map(p => calculateRate(p.assists, p.gamesPlayed));
  const plusMinusPerGame = validPlayers.map(p => calculateRate(p.plusMinus, p.gamesPlayed));
  const pimPerGame = validPlayers.map(p => calculateRate(p.penaltyMinutes, p.gamesPlayed));
  const pppPerGame = validPlayers.map(p => calculateRate(p.ppPoints || 0, p.gamesPlayed));
  const fowPerGame = validPlayers.map(p => calculateRate(p.faceoffsWon || 0, p.gamesPlayed));
  const sogPerGame = validPlayers.map(p => calculateRate(p.shots, p.gamesPlayed));
  const hitsPerGame = validPlayers.map(p => calculateRate(p.hits || 0, p.gamesPlayed));
  const blkPerGame = validPlayers.map(p => calculateRate(p.blockedShots || 0, p.gamesPlayed));

  // Calculate means and standard deviations
  const goalsMean = mean(goalsPerGame);
  const goalsStdDev = standardDeviation(goalsPerGame);
  const assistsMean = mean(assistsPerGame);
  const assistsStdDev = standardDeviation(assistsPerGame);
  const plusMinusMean = mean(plusMinusPerGame);
  const plusMinusStdDev = standardDeviation(plusMinusPerGame);
  const pimMean = mean(pimPerGame);
  const pimStdDev = standardDeviation(pimPerGame);
  const pppMean = mean(pppPerGame);
  const pppStdDev = standardDeviation(pppPerGame);
  const fowMean = mean(fowPerGame);
  const fowStdDev = standardDeviation(fowPerGame);
  const sogMean = mean(sogPerGame);
  const sogStdDev = standardDeviation(sogPerGame);
  const hitsMean = mean(hitsPerGame);
  const hitsStdDev = standardDeviation(hitsPerGame);
  const blkMean = mean(blkPerGame);
  const blkStdDev = standardDeviation(blkPerGame);

  // Calculate player's per-game rates
  const playerGoalsPerGame = calculateRate(player.goals, player.gamesPlayed);
  const playerAssistsPerGame = calculateRate(player.assists, player.gamesPlayed);
  const playerPlusMinusPerGame = calculateRate(player.plusMinus, player.gamesPlayed);
  const playerPimPerGame = calculateRate(player.penaltyMinutes, player.gamesPlayed);
  const playerPppPerGame = calculateRate(player.ppPoints || 0, player.gamesPlayed);
  const playerFowPerGame = calculateRate(player.faceoffsWon || 0, player.gamesPlayed);
  const playerSogPerGame = calculateRate(player.shots, player.gamesPlayed);
  const playerHitsPerGame = calculateRate(player.hits || 0, player.gamesPlayed);
  const playerBlkPerGame = calculateRate(player.blockedShots || 0, player.gamesPlayed);

  // Calculate Z-scores for each category
  const zGoals = zScore(playerGoalsPerGame, goalsMean, goalsStdDev);
  const zAssists = zScore(playerAssistsPerGame, assistsMean, assistsStdDev);
  const zPlusMinus = zScore(playerPlusMinusPerGame, plusMinusMean, plusMinusStdDev);
  const zPim = zScore(playerPimPerGame, pimMean, pimStdDev);
  const zPpp = zScore(playerPppPerGame, pppMean, pppStdDev);
  const zFow = zScore(playerFowPerGame, fowMean, fowStdDev);
  const zSog = zScore(playerSogPerGame, sogMean, sogStdDev);
  const zHits = zScore(playerHitsPerGame, hitsMean, hitsStdDev);
  const zBlk = zScore(playerBlkPerGame, blkMean, blkStdDev);

  // Sum all Z-scores for total value
  return zGoals + zAssists + zPlusMinus + zPim + zPpp + zFow + zSog + zHits + zBlk;
}

/**
 * Calculate Z-scores for goalies
 * Categories: W, SO, GAA (inverted), SV%
 */
export function calculateGoalieZScore(
  player: GoalieStats,
  allGoalies: GoalieStats[]
): number {
  const validGoalies = allGoalies.filter(p => p.gamesPlayed > 0);
  if (validGoalies.length === 0 || player.gamesPlayed === 0) return 0;

  // Calculate per-game rates
  const calculateRate = (stat: number, gp: number) => gp > 0 ? stat / gp : 0;

  // Extract all values
  const winsPerGame = validGoalies.map(p => calculateRate(p.wins || 0, p.gamesPlayed));
  const shutoutsPerGame = validGoalies.map(p => calculateRate(p.shutouts || 0, p.gamesPlayed));
  const gaaValues = validGoalies.map(p => p.goalsAgainstAverage || 0).filter(g => g > 0);
  const svpctValues = validGoalies.map(p => p.savePct || 0).filter(s => s > 0);

  // Calculate means and standard deviations
  const winsMean = mean(winsPerGame);
  const winsStdDev = standardDeviation(winsPerGame);
  const shutoutsMean = mean(shutoutsPerGame);
  const shutoutsStdDev = standardDeviation(shutoutsPerGame);
  const gaaMean = gaaValues.length > 0 ? mean(gaaValues) : 0;
  const gaaStdDev = gaaValues.length > 0 ? standardDeviation(gaaValues) : 0;
  const svpctMean = svpctValues.length > 0 ? mean(svpctValues) : 0;
  const svpctStdDev = svpctValues.length > 0 ? standardDeviation(svpctValues) : 0;

  // Calculate player's rates
  const playerWinsPerGame = calculateRate(player.wins || 0, player.gamesPlayed);
  const playerShutoutsPerGame = calculateRate(player.shutouts || 0, player.gamesPlayed);
  const playerGaa = player.goalsAgainstAverage || 0;
  const playerSvpct = player.savePct || 0;

  // Calculate Z-scores
  // GAA is inverted (lower is better), so we invert the Z-score
  const zWins = zScore(playerWinsPerGame, winsMean, winsStdDev);
  const zShutouts = zScore(playerShutoutsPerGame, shutoutsMean, shutoutsStdDev);
  const zGaa = playerGaa > 0 ? zScore(playerGaa, gaaMean, gaaStdDev, true) : 0; // Inverted
  const zSvpct = playerSvpct > 0 ? zScore(playerSvpct, svpctMean, svpctStdDev) : 0;

  // Sum all Z-scores
  return zWins + zShutouts + zGaa + zSvpct;
}


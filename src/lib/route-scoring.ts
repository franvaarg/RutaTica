import { db } from '@/lib/db';

export interface RouteScoreConfig {
  timeWeight: number;
  walkingWeight: number;
  transfersWeight: number;
  costWeight: number;
}

export const DEFAULT_SCORE_CONFIG: RouteScoreConfig = {
  timeWeight: 0.4,
  walkingWeight: 0.25,
  transfersWeight: 0.2,
  costWeight: 0.15,
};

export interface RouteOption {
  totalTimeMinutes: number;
  walkingDistanceKm: number;
  transfers: number;
  costCRC: number | null;
}

/**
 * Load scoring configuration from the RouteConfig table.
 * Falls back to defaults if not found.
 */
export async function loadScoringConfig(): Promise<RouteScoreConfig> {
  try {
    const configs = await db.routeConfig.findMany({
      where: {
        key: {
          in: ['scoring_time_weight', 'scoring_walking_weight', 'scoring_transfers_weight', 'scoring_cost_weight'],
        },
      },
    });

    if (configs.length === 0) {
      return DEFAULT_SCORE_CONFIG;
    }

    const configMap: Record<string, number> = {};
    for (const c of configs) {
      const val = parseFloat(c.value);
      if (Number.isFinite(val) && val >= 0 && val <= 1) {
        configMap[c.key] = val;
      }
    }

    return {
      timeWeight: configMap['scoring_time_weight'] ?? DEFAULT_SCORE_CONFIG.timeWeight,
      walkingWeight: configMap['scoring_walking_weight'] ?? DEFAULT_SCORE_CONFIG.walkingWeight,
      transfersWeight: configMap['scoring_transfers_weight'] ?? DEFAULT_SCORE_CONFIG.transfersWeight,
      costWeight: configMap['scoring_cost_weight'] ?? DEFAULT_SCORE_CONFIG.costWeight,
    };
  } catch {
    return DEFAULT_SCORE_CONFIG;
  }
}

/**
 * Normalize a value to 0-1 range based on min and max of the array.
 * If all values are the same, returns 0.
 */
function normalize(value: number, min: number, max: number): number {
  if (max === min) return 0;
  return (value - min) / (max - min);
}

/**
 * Calculate a score for a route option. Lower score = better route.
 * Each factor is normalized to 0-1 (where 1 is worst), then weighted.
 */
export function calculateRouteScore(
  route: RouteOption,
  allRoutes: RouteOption[],
  config: RouteScoreConfig = DEFAULT_SCORE_CONFIG
): number {
  const times = allRoutes.map((r) => r.totalTimeMinutes);
  const walks = allRoutes.map((r) => r.walkingDistanceKm);
  const transfers = allRoutes.map((r) => r.transfers);
  const costs = allRoutes.flatMap((r) => r.costCRC === null ? [] : [r.costCRC]);

  const normalizedTime = normalize(
    route.totalTimeMinutes,
    Math.min(...times),
    Math.max(...times)
  );
  const normalizedWalk = normalize(
    route.walkingDistanceKm,
    Math.min(...walks),
    Math.max(...walks)
  );
  const normalizedTransfers = normalize(
    route.transfers,
    Math.min(...transfers),
    Math.max(...transfers)
  );
  const normalizedCost = route.costCRC === null || costs.length === 0 ? 1 : normalize(
    route.costCRC,
    Math.min(...costs),
    Math.max(...costs)
  );

  return (
    config.timeWeight * normalizedTime +
    config.walkingWeight * normalizedWalk +
    config.transfersWeight * normalizedTransfers +
    config.costWeight * normalizedCost
  );
}

/**
 * Score an array of route options and sort by score ascending (best first).
 * Returns routes with their scores attached.
 */
export function scoreAndSortRoutes<T extends RouteOption>(
  routes: T[],
  config?: RouteScoreConfig
): (T & { score: number })[] {
  if (routes.length === 0) return [];
  if (routes.length === 1) return [{ ...routes[0], score: 0 }];

  const cfg = config ?? DEFAULT_SCORE_CONFIG;

  return routes
    .map((route) => ({
      ...route,
      score: calculateRouteScore(route, routes, cfg),
    }))
    .sort((a, b) => a.score - b.score);
}
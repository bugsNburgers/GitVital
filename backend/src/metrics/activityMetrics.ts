// src/metrics/activityMetrics.ts — PURE FUNCTION
// Input:  commits[] (each has committedDate)
// Output: ActivityMetricsResult
// No database calls. No API calls. No side effects.

import { CommitNode, ActivityMetricsResult } from '../types';

/**
 * Get the ISO week string (YYYY-Www) for a given date.
 * ISO 8601: week 1 is the week containing the first Thursday of the year.
 */
function getISOWeekString(date: Date): string {
  // Create a copy to avoid mutation
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  // Set to nearest Thursday: current date + 4 - current day number (Monday=1, Sunday=7)
  const dayNum = d.getUTCDay() || 7; // Make Sunday = 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  // Get first day of year
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  // Calculate full weeks to nearest Thursday
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

/**
 * Compute commit activity metrics from raw commit data.
 *
 * Steps:
 *   1. Group commits by ISO week
 *   2. Create array of [weekString, commitCount] for the last 12 months
 *   3. recent_avg = average of last 4 weeks
 *   4. previous_avg = average of weeks 5-8
 *   5. velocity_change = ((recent_avg - previous_avg) / previous_avg) * 100
 *   6. Also compute: commits_last_30_days, total_weeks_active
 *
 * Edge cases:
 *   - previous_avg is 0 → velocity_change = recent_avg > 0 ? 100 : 0 (avoid division by zero)
 *   - All commits in one week → still valid, just unusual
 */
export function computeActivityMetrics(commits: CommitNode[]): ActivityMetricsResult {
  const now = new Date();
  const twelveMonthsAgo = new Date(now);
  twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);
  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  // Filter commits within last 12 months
  const recentCommits = commits.filter((c) => {
    const date = new Date(c.committedDate);
    return date >= twelveMonthsAgo;
  });

  // Step 1: Group commits by ISO week
  const weekMap = new Map<string, number>();
  for (const commit of recentCommits) {
    const date = new Date(commit.committedDate);
    const weekKey = getISOWeekString(date);
    weekMap.set(weekKey, (weekMap.get(weekKey) || 0) + 1);
  }

  // Step 2: Create array of [week, count] for all weeks in last 12 months (filled with 0 for empty weeks)
  const allWeeks: Array<{ week: string; count: number }> = [];
  const cursor = new Date(twelveMonthsAgo);
  // Advance cursor to the start of its ISO week (Monday)
  const cursorDay = cursor.getUTCDay() || 7;
  cursor.setUTCDate(cursor.getUTCDate() + (1 - cursorDay)); // Move to Monday

  while (cursor <= now) {
    const weekKey = getISOWeekString(cursor);
    // Avoid duplicate weeks at boundaries
    if (allWeeks.length === 0 || allWeeks[allWeeks.length - 1].week !== weekKey) {
      allWeeks.push({
        week: weekKey,
        count: weekMap.get(weekKey) || 0,
      });
    }
    cursor.setUTCDate(cursor.getUTCDate() + 7); // Jump one week
  }

  // Step 3: recent_avg = average of last 4 weeks
  const lastWeeks = allWeeks.slice(-4);
  const recentSum = lastWeeks.reduce((acc, w) => acc + w.count, 0);
  const recentAvg = lastWeeks.length > 0 ? recentSum / lastWeeks.length : 0;

  // Step 4: previous_avg = average of weeks 5-8 (counting from the end)
  const prevWeeks = allWeeks.slice(-8, -4);
  const prevSum = prevWeeks.reduce((acc, w) => acc + w.count, 0);
  const previousAvg = prevWeeks.length > 0 ? prevSum / prevWeeks.length : 0;

  // Step 5: velocity_change = ((recent_avg - previous_avg) / previous_avg) * 100
  // Edge case: previous_avg is 0 → velocity_change = recent_avg > 0 ? 100 : 0
  let velocityChange: number;
  if (previousAvg === 0) {
    velocityChange = recentAvg > 0 ? 100 : 0;
  } else {
    velocityChange = parseFloat((((recentAvg - previousAvg) / previousAvg) * 100).toFixed(2));
  }

  // Step 6: commits_last_30_days
  const commitsLast30Days = commits.filter((c) => {
    const date = new Date(c.committedDate);
    return date >= thirtyDaysAgo;
  }).length;

  // total_weeks_active = weeks with at least 1 commit
  const totalWeeksActive = allWeeks.filter((w) => w.count > 0).length;

  return {
    velocityChange,
    commitsLast30Days,
    weeklyBreakdown: allWeeks,
    totalWeeksActive,
  };
}

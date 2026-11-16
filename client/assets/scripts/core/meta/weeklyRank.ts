// 排行榜展示，见 docs/01 第 5.9 节。好友周榜由平台提供；这里只负责把自己插进榜单排序（调试用的假榜也走它）。
// 奖励不按名次发，见 WeeklyGoal。

export interface RankRow {
  name?: string;
  score: number;
  me?: boolean;
  [k: string]: unknown;
}

/** 把自己插进榜单并排序：过关数从多到少，同分时自己排在前面。rows 是平台榜单（不含自己），不修改它 */
export function sorted(rows: readonly RankRow[], me: RankRow): RankRow[] {
  const out = rows.map((r) => ({ ...r }));
  out.push({ ...me, me: true });
  out.sort((a, b) => {
    if (a.score !== b.score) return b.score - a.score;
    return Number(Boolean(b.me)) - Number(Boolean(a.me));
  });
  return out;
}

/** 自己过了 score 关时排第几（1 起） */
export function rankOf(rows: readonly RankRow[], score: number): number {
  const list = sorted(rows, { score });
  const i = list.findIndex((r) => r.me === true);
  return i >= 0 ? i + 1 : list.length;
}

// 时间与日期。核心层不读时钟，由这里传入（docs/meta-api.md）。

/** 当前 unix 秒：生命恢复、无限生命窗口用 */
export function now(): number {
  return Math.floor(Date.now() / 1000);
}

/** 本地日期序号（自 1970-01-01 起的天数）：签到、每日次数、周目标用 */
export function today(): number {
  const d = new Date();
  return Math.floor((d.getTime() / 1000 - d.getTimezoneOffset() * 60) / 86400);
}

/**
 * 广告频控用的秒数（系统时间）。频控的时刻存在存档里、下次启动还要拿来比，所以不能用 performance.now()——
 * 它每次启动从 0 起，冷启动后差值是负的，插屏要等很久才弹（#170）。
 * 给了 ads（存档的 save.ads）时，比现在还晚的时刻（系统时间往回调过）拉回现在
 */
export function adNow(ads?: { interstitialAt: number; rewardedAt: number }): number {
  const t = Date.now() / 1000;
  if (ads) {
    if (ads.interstitialAt > t) ads.interstitialAt = t;
    if (ads.rewardedAt > t) ads.rewardedAt = t;
  }
  return t;
}

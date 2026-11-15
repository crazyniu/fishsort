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

/** 单调递增的秒数：广告频控用，改系统时间不影响 */
export function mono(): number {
  return performance.now() / 1000;
}

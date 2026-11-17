#!/bin/bash
# 上架图：每张都由 Codex 整张画出来，文字也画在图里（用户 2026-11-18：全部用 AI 直接生成，不要自己拼）。
# 需求在 store/briefs/posters/*.txt（每个画面 × 语言一份），风格参照是我们自己的图（art/raw/store/ref_style.png 等）。
# 出到 art/raw/store/posters/（不进仓库），再用 tools/store/export.py 等比缩放、裁两边成各商店的尺寸放进 store/images/。
# 已出过的跳过；要重画某张就删掉 art/raw/store/posters/<名字>.png 再跑。用法：./store/gen.sh [名字…]
cd "$(dirname "$0")/.."
RAW=art/raw/store
OUT=$RAW/posters
mkdir -p "$OUT"
run() {
  k="$1"
  [ -s "$OUT/$k.png" ] && { echo "skip $k"; return; }
  # 参照：风格表 + 同一画面的旧插画（构图参考，都是我们自己的图）
  base="${k%_en}"; base="${base%_zh_CN}"
  refs="--image=$RAW/ref_style.png"
  [ -f "$RAW/$base.png" ] && refs="$refs --image=$RAW/$base.png"
  codex exec --skip-git-repo-check --sandbox workspace-write $refs -- "$(cat store/briefs/posters/$k.txt)" < /dev/null > "$OUT/$k.log" 2>&1
  p=$(grep -o "/[^ ]*/generated_images/[^ ]*\.png" "$OUT/$k.log" | tail -1)
  [ -n "$p" ] && cp "$p" "$OUT/$k.png"
  echo "done $k $([ -s $OUT/$k.png ] && echo ok || echo FAIL)"
}
export -f run
export RAW OUT
if [ $# -gt 0 ]; then names="$*"; else names=$(ls store/briefs/posters/*.txt | xargs -n1 basename | sed 's/\.txt$//'); fi
echo $names | tr ' ' '\n' | xargs -P 6 -I{} bash -c 'run {}'

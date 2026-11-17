#!/bin/bash
# 上架图的插画：Codex 出图（docs/06 第 7 节）。需求在 store/briefs/*.txt，风格参照 art/raw/store/ref_style.png（我们自己的图拼的）。
# 出到 art/raw/store/（不进仓库），再用 tools/store/compose.py 加标题、裁成各商店要的尺寸放进 store/images/。已出过的跳过。
cd "$(dirname "$0")/.."
RAW=art/raw/store
mkdir -p "$RAW"
run() {
  k="$1"
  [ -s "$RAW/$k.png" ] && { echo "skip $k"; return; }
  codex exec --skip-git-repo-check --sandbox workspace-write --image="$RAW/ref_style.png" -- "$(cat store/briefs/$k.txt)" < /dev/null > "$RAW/$k.log" 2>&1
  p=$(grep -o "/[^ ]*/generated_images/[^ ]*\.png" "$RAW/$k.log" | tail -1)
  [ -n "$p" ] && cp "$p" "$RAW/$k.png"
  echo "done $k $([ -s $RAW/$k.png ] && echo ok || echo FAIL)"
}
export -f run
export RAW
ls store/briefs/*.txt | xargs -n1 basename | sed 's/\.txt$//' | xargs -P 6 -I{} bash -c 'run {}'

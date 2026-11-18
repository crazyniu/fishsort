// 关卡文件瘦身（微信版放到网上的资源用，tools/wechat/remote.mjs 调；client/tests/slimlevel.test.ts 守着）。
// 关卡文件除了游戏要的数据，还带着只给工具用的东西，以及大量写成默认值的字段，去掉后游戏读出来的关卡一模一样：
//   - ref（参考解，只有关卡校验 tools/level/verify.ts 回放它）、variants（生成器记的易化变体名）——游戏不读；
//   - 等于默认值的字段（LevelData.fromDict 缺省时取的值）：气泡的 layer/chain/fog 为 0、under/ice/pairs 为空、queue 为假，
//     订单的 timer 为 0、cap 为 3，关卡的 challenge 为假、fieldCap 为 0、buffer 为 5、bowlSlots 为 2。
// 仓库里的关卡文件不动（工具还要用 ref），只改构建产物里的那份。

const isEmptyList = (v) => Array.isArray(v) && v.length === 0;

function dropIf(o, key, test) {
  if (key in o && test(o[key])) delete o[key];
}

/** 一个关卡对象（原地改）。不是关卡（没有 bubbles 和 orders）的不动，返回 false */
export function slimLevel(d) {
  if (!d || typeof d !== 'object' || !Array.isArray(d.bubbles) || !Array.isArray(d.orders)) return false;
  delete d.ref;
  delete d.variants;
  dropIf(d, 'challenge', (v) => v === false);
  dropIf(d, 'fieldCap', (v) => v === 0);
  dropIf(d, 'buffer', (v) => v === 5);
  dropIf(d, 'bowlSlots', (v) => v === 2);
  for (const o of d.orders) {
    dropIf(o, 'timer', (v) => v === 0);
    dropIf(o, 'cap', (v) => v === 3);
  }
  for (const b of d.bubbles) {
    for (const k of ['layer', 'chain', 'fog']) dropIf(b, k, (v) => v === 0);
    for (const k of ['under', 'ice', 'pairs']) dropIf(b, k, isEmptyList);
    dropIf(b, 'queue', (v) => v === false || v === 0);
  }
  return true;
}

/**
 * Cocos 构建出的 JsonAsset 导入文件（import/xx/<uuid>.<md5>.json）：[版本, …, [[0, 名字, json内容], …], …]。
 * 找到里面的关卡对象瘦身；改了返回新文本，没有关卡返回 null
 */
export function slimImportJson(text) {
  if (!text.includes('"bubbles"')) return null;
  const data = JSON.parse(text);
  let changed = false;
  const walk = (v) => {
    if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') {
      if (slimLevel(v)) changed = true;
      else Object.values(v).forEach(walk);
    }
  };
  walk(data);
  return changed ? JSON.stringify(data) : null;
}

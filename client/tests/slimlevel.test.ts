// 微信版的关卡文件瘦身（tools/wechat/slimlevel.mjs）：去掉参考解、易化变体名和写成默认值的字段以后，
// 游戏读出来的关卡（LevelData.fromDict）必须和原文件逐项一样。全部关卡文件都过一遍。
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { LevelData } from '../assets/scripts/core/model/levelData';
// @ts-expect-error 工具是 .mjs，没有类型声明
import { slimImportJson, slimLevel } from '../../tools/wechat/slimlevel.mjs';

const DIR = join(__dirname, '../assets/resources/config/levels');

/** 游戏读到的样子：参考解和变体名游戏不用，不比 */
function asGameSees(raw: Record<string, unknown>): Record<string, unknown> {
  const d = LevelData.fromDict(raw).toDict();
  delete d.ref;
  delete d.variants;
  return d;
}

describe('微信版关卡文件瘦身', () => {
  const files = readdirSync(DIR).filter((f) => f.endsWith('.json'));

  it('全部关卡文件瘦身后游戏读出来一样，体积变小', () => {
    assert.ok(files.length >= 1000);
    let before = 0;
    let after = 0;
    for (const f of files) {
      const text = readFileSync(join(DIR, f), 'utf8');
      const raw = JSON.parse(text) as Record<string, unknown>;
      const slim = JSON.parse(text) as Record<string, unknown>;
      assert.equal(slimLevel(slim), true, f);
      assert.deepEqual(asGameSees(slim), asGameSees(raw), f);
      before += text.length;
      after += JSON.stringify(slim).length;
    }
    assert.ok(after < before * 0.8, `只从 ${before} 字节减到 ${after}`);
  });

  it('Cocos 导入文件里的关卡也能认出来；不是关卡的文件不动', () => {
    const level = JSON.parse(readFileSync(join(DIR, files[0]), 'utf8')) as Record<string, unknown>;
    const wrapped = JSON.stringify([1, 0, 0, [['cc.JsonAsset', ['_name', 'json'], 1]], [[0, 0, 1, 3]], [[0, 'level_0001', level]], 0, 0, [], [], []]);
    const out = slimImportJson(wrapped) as string;
    const inner = (JSON.parse(out) as unknown[][])[5][0] as unknown[];
    assert.deepEqual(asGameSees(inner[2] as Record<string, unknown>), asGameSees(level));
    assert.equal('ref' in (inner[2] as Record<string, unknown>), false);
    assert.equal(slimImportJson(JSON.stringify([1, 0, 0, [['cc.JsonAsset', ['_name', 'json'], 1]], [[0, 0, 1, 3]], [[0, 'economy', { a: 1 }]]])), null);
  });
});

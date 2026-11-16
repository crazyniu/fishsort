// 文案：key → 当前语言的文字。翻译在 resources/i18n/strings.json（由 i18n/strings.csv 生成）。
import { loadJson } from './res';

type Table = Record<string, Record<string, string>>;
let table: Table = {};
let lang = 'zh_CN';
const listeners = new Set<() => void>();

export async function loadStrings(initial: string): Promise<void> {
  table = await loadJson<Table>('i18n/strings');
  lang = table[initial] ? initial : 'zh_CN';
}

export function language(): string {
  return lang;
}

export function setLanguage(l: string): void {
  if (!table[l] || l === lang) return;
  lang = l;
  for (const f of listeners) f();
}

/** 换语言时要重画的界面登记在这里 */
export function onLanguage(f: () => void): () => void {
  listeners.add(f);
  return () => listeners.delete(f);
}

/** 取文案，%d / %s 按顺序换成参数 */
export function tr(key: string, ...args: (string | number)[]): string {
  let s = table[lang]?.[key] ?? table.zh_CN?.[key];
  if (s === undefined) {
    console.warn(`缺文案 ${key}`);
    return key;
  }
  let i = 0;
  s = s.replace(/%[ds]/g, () => String(args[i++] ?? ''));
  return s;
}

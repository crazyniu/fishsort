// 文案：key → 当前语言的文字。翻译在 resources/i18n/strings.json（由 i18n/strings.csv 生成）。
import { loadJson } from './res';

type Table = Record<string, Record<string, string>>;
let table: Table = {};
let lang = 'zh_CN';
const listeners = new Set<() => void>();

/**
 * 各语言用自己的文字写的名字（设置里的语言列表；不随界面语言变，所以不进 strings.csv）。
 * 语言代码：zh_CN 简体、zh_TW 繁体（台湾、香港、澳门）、pt 是巴西葡萄牙语（用户 2026-11-19 定的这一套，docs/10 第 8 节）
 */
export const LANGUAGE_NAMES: Record<string, string> = {
  zh_CN: '简体中文',
  zh_TW: '繁體中文',
  en: 'English',
  ja: '日本語',
  ko: '한국어',
  de: 'Deutsch',
  fr: 'Français',
  es: 'Español',
  pt: 'Português',
  it: 'Italiano',
  ru: 'Русский',
  tr: 'Türkçe',
};

/**
 * 系统语言 → 我们带的语言：zh-Hant-TW、zh_TW、zh-HK 归繁体，其余的中文归简体；别的按主语言（ja-JP → ja，pt-PT 也用 pt）；
 * 都不认识就用 supported 的第一个
 */
export function matchLanguage(system: string, supported: string[]): string {
  const s = system.toLowerCase().replace(/_/g, '-');
  const main = s.split('-')[0];
  let want = main;
  if (main === 'zh') want = /hant|-tw|-hk|-mo/.test(s) ? 'zh_TW' : 'zh_CN';
  if (supported.includes(want)) return want;
  // 只带了简体的端（微信）遇到繁体系统：用简体
  if (want === 'zh_TW' && supported.includes('zh_CN')) return 'zh_CN';
  return supported[0] ?? 'zh_CN';
}

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
  // 缺的条目：繁体退到简体，其它语言退到英文，最后退到简体
  let s = table[lang]?.[key] || (lang === 'zh_TW' ? undefined : table.en?.[key]) || table.zh_CN?.[key];
  if (s === undefined) {
    console.warn(`缺文案 ${key}`);
    return key;
  }
  let i = 0;
  s = s.replace(/%[ds]/g, () => String(args[i++] ?? ''));
  return s;
}

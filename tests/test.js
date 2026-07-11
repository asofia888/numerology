#!/usr/bin/env node
/* ============================================================
   数秘術鑑定 — 計算エンジン&鑑定書レンダリングの自動テスト
   実行方法:  node tests/test.js   (依存パッケージ不要)
   index.html のインラインスクリプトを最小DOMスタブ上で実行し、
   計算の正確性・鑑定書出力・回帰を検証します。
   ============================================================ */
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const m = html.match(/<script>\s*\/\* =+\s*数秘術エンジン[\s\S]*?<\/script>/);
if (!m) { console.error("NG: index.html 内のエンジンスクリプトが見つかりません"); process.exit(1); }
const src = m[0].replace(/^<script>/, "").replace(/<\/script>$/, "");

/* ---- 最小DOMスタブ ---- */
function makeEl(id) {
  return {
    id, value: "", innerHTML: "", textContent: "", hidden: false, tabIndex: 0, checked: false,
    dataset: {},
    classList: { add(){}, remove(){}, toggle(){} },
    addEventListener(){}, setAttribute(){}, getAttribute(){ return null; },
    focus(){}, scrollIntoView(){},
  };
}
const els = {};
global.document = {
  getElementById: id => els[id] || (els[id] = makeEl(id)),
  querySelector: () => ({ addEventListener(){}, setAttribute(){}, getAttribute(){ return null; } }),
  querySelectorAll: () => [],
  addEventListener(){},
  documentElement: { setAttribute(){}, getAttribute(){ return null; } },
};
["yy","mm","dd","yyA","mmA","ddA","yyB","mmB","ddB","name","nameA","nameB",
 "method","go","err","result","form-card","form-note","reading-form","remember",
 "tab-personal","tab-pair","mode-personal","mode-pair"].forEach(id => global.document.getElementById(id));
global.window = { matchMedia: () => ({ matches: false }), addEventListener(){}, print(){} };
global.navigator = {}; /* serviceWorker なし → SW登録はスキップされる */
const store = {};
global.localStorage = {
  getItem: k => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: k => { delete store[k]; },
};

/* スクリプト実行(構文エラー・参照エラーもここで検出される) */
const fn = new Function(src + `
;return {calc, calcPair, lifePathParts, pinnacleChallenge, periodCycles, birthGrid,
         fullReduce, reduceSteps, ds, collectInputs, saveInputs, clearInputs, restoreInputs,
         P, CYCLE, LCYCLE, LCYCLE_PHASE, ARROWS, MISSING_NUM, PD_SHORT, MASTERS};`);
const api = fn();
console.log("OK: スクリプト実行成功(構文・ロード時エラーなし)");

/* sw.js の構文チェック */
new Function(fs.readFileSync(path.join(root, "sw.js"), "utf8"));
console.log("OK: sw.js 構文チェック通過");

/* ---- テストヘルパー ---- */
let fail = 0;
const eq = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) { fail++; console.error(`NG: ${label} → got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); }
  else console.log(`ok: ${label} = ${JSON.stringify(got)}`);
};
const has = (label, text, needle) => {
  if (!text.includes(needle)) { fail++; console.error(`NG: ${label} —「${needle}」が見つからない`); }
};

/* ============ 計算エンジンの単体テスト ============ */

/* ライフパス両方式(1980-1-1 は方式で結果が分かれる代表例) */
eq("LP 一括合算 1980-1-1", api.lifePathParts(1980, 1, 1, "standard").lp, 2);
eq("LP 桁別還元 1980-1-1", api.lifePathParts(1980, 1, 1, "component").lp, 11);
/* マスターナンバー保持(1985-3-12 → 29 → 11 で確定) */
eq("LP マスター保持 1985-3-12", api.lifePathParts(1985, 3, 12, "standard").lp, 11);

/* 三大周期: 1985-03-12 → 形成3・生産3・収穫5(1985→23→5) */
{
  const pc = api.periodCycles(1985, 3, 12);
  eq("periodCycles(1985-3-12).nums", pc.nums, [3, 3, 5]);
  const py = yr => api.fullReduce(api.ds("3" + "12" + String(yr))).n;
  eq("t1 はパーソナルイヤー1の年", py(pc.t1), 1);
  eq("t1 は27歳前後(誕生年+23〜+31)", pc.t1 >= 1985 + 23 && pc.t1 <= 1985 + 31, true);
  eq("t2 = t1 + 27", pc.t2, pc.t1 + 27);
}
/* 三大周期のマスター保持: 11月→11 / 29日→11 / 1984年→22 */
{
  const pc = api.periodCycles(1984, 11, 29);
  eq("periodCycles マスター保持 (1984-11-29)", pc.nums, [11, 11, 22]);
  eq("LCYCLE に 11・22・33 の鑑定文がある", [11, 22, 33].every(k => !!api.LCYCLE[k]), true);
}

/* 誕生数チャート: 1985-03-12 → 数字 1,9,8,5,3,1,2 */
{
  const g = api.birthGrid(1985, 3, 12);
  eq("九宮 counts[1]", g.counts[1], 2);
  eq("九宮 counts[9]", g.counts[9], 1);
  eq("九宮 空白の数", g.missing, [4, 6, 7]);
  eq("九宮 最多の数", g.tops, [1]);
  const names = g.arrows.map(a => a.name);
  eq("計画の矢(1・2・3)あり", names.includes("計画の矢"), true);
  eq("決断の矢(1・5・9)あり", names.includes("決断の矢"), true);
  eq("精神性の矢(3・5・7)なし(7欠け)", names.includes("精神性の矢"), false);
}
/* 疎なチャート: 2000-01-01 → 数字 2,1,1 のみ・矢なし */
{
  const g = api.birthGrid(2000, 1, 1);
  eq("疎チャート counts[1]", g.counts[1], 2);
  eq("疎チャート counts[2]", g.counts[2], 1);
  eq("疎チャート 矢なし", g.arrows.length, 0);
  eq("疎チャート 空白", g.missing, [3, 4, 5, 6, 7, 8, 9]);
}

/* ============ 個人鑑定 E2E(鑑定書レンダリング) ============ */
els["yy"].value = "1985"; els["mm"].value = "3"; els["dd"].value = "12";
els["method"].value = "standard";
els["name"].value = "HANAKO YAMADA";
api.calc();
const out = els["result"].innerHTML;
if (!out || out.length < 5000) { console.error("NG: 鑑定書HTMLが短すぎる"); fail++; }
[
  "鑑 定 書", "ライフパスナンバー", "運気サイクル", "パーソナルマンス",
  "今日のパーソナルデー", "これから12ヶ月の運気ごよみ", "(今月)",
  "人生の四季", "人生の三大周期", "いまの周期", "形成期", "生産期", "収穫期",
  "誕生数チャート", "強みの矢", "空白の部屋", "最も濃い数", "総合鑑定",
  "そして、いま。",
].forEach(s => has("個人鑑定出力", out, s));
console.log(`ok: 個人鑑定 E2E 出力 ${out.length} 文字・必須セクション網羅`);
eq("12ヶ月ごよみのセル数", (out.match(/class="pm-cell/g) || []).length, 12);
eq("九宮のセル数", (out.match(/class="bcell/g) || []).length, 9);
if (/undefined|NaN|\[object/.test(out)) { console.error("NG: 出力に undefined/NaN が混入"); fail++; }
else console.log("ok: undefined/NaN 混入なし");

/* 目次ナビ: 全リンクが実在するセクションIDを指すこと */
{
  has("目次ナビ", out, 'class="toc no-print"');
  const hrefs = [...out.matchAll(/href="#(sec-[a-z]+)"/g)].map(x => x[1]);
  eq("目次の項目数(名前あり=13)", hrefs.length, 13);
  const broken = hrefs.filter(id => !out.includes(`id="${id}"`));
  eq("目次リンク切れなし", broken, []);
}

/* 12ヶ月ごよみの年またぎ: 次に来る1月は正しい年ラベルで表示される */
{
  const nowT = new Date();
  const janYear = nowT.getMonth() === 0 ? nowT.getFullYear() : nowT.getFullYear() + 1;
  has("運気ごよみの年またぎラベル", out, `${janYear}年1月`);
  console.log(`ok: 運気ごよみに ${janYear}年1月 のラベルあり`);
}

/* カルミックナンバー検出(13日生まれ → 13/4) */
els["yy"].value = "1990"; els["mm"].value = "4"; els["dd"].value = "13"; els["name"].value = "";
api.calc();
has("カルミック検出", els["result"].innerHTML, "カルミックナンバー");
has("カルミック 13/4", els["result"].innerHTML, "13/4");
console.log("ok: カルミックナンバー(13日生まれ)検出");

/* 名前なし鑑定 */
els["yy"].value = "1985"; els["mm"].value = "3"; els["dd"].value = "12"; els["name"].value = "";
api.calc();
const out2 = els["result"].innerHTML;
if (/undefined|NaN/.test(out2)) { console.error("NG: 名前なし出力に undefined/NaN"); fail++; }
["誕生数チャート", "人生の三大周期", "今日のパーソナルデー"].forEach(s => has("名前なし鑑定", out2, s));
{
  const hrefs2 = [...out2.matchAll(/href="#(sec-[a-z]+)"/g)].map(x => x[1]);
  eq("目次の項目数(名前なし=9)", hrefs2.length, 9);
}
console.log("ok: 名前なし鑑定も新セクション表示・汚染なし");

/* マスターナンバー日付(1984-11-29)*/
els["yy"].value = "1984"; els["mm"].value = "11"; els["dd"].value = "29"; els["name"].value = "TARO SATO";
api.calc();
const out3 = els["result"].innerHTML;
if (/undefined|NaN/.test(out3)) { console.error("NG: マスター日付出力に undefined/NaN"); fail++; }
has("マスタータグ", out3, "MASTER");
console.log("ok: マスターナンバー日付(1984-11-29)も正常");

/* 境界日付(今年生まれ・1930年生まれ) */
{
  const nowT = new Date();
  for (const [yy, dd] of [["2020", "5"], ["1930", "15"], [String(nowT.getFullYear()), "1"]]) {
    els["yy"].value = yy; els["mm"].value = "7"; els["dd"].value = dd; els["name"].value = "";
    api.calc();
    if (/undefined|NaN/.test(els["result"].innerHTML)) { console.error(`NG: ${yy}年生まれで undefined/NaN`); fail++; }
  }
  console.log("ok: 2020年・1930年・今年生まれの境界も正常");
}

/* ============ 入力記憶(オプトイン) ============ */
els["remember"].checked = true;
els["yy"].value = "1985"; els["mm"].value = "3"; els["dd"].value = "12"; els["name"].value = "HANAKO YAMADA";
api.calc();
{
  const saved = JSON.parse(store["numerology-inputs"] || "null");
  eq("記憶ON: 生年が保存される", saved && saved.yy, "1985");
  eq("記憶ON: 名前が保存される", saved && saved.name, "HANAKO YAMADA");
  els["yy"].value = ""; els["name"].value = "";
  api.restoreInputs();
  eq("復元: 生年が戻る", els["yy"].value, "1985");
  eq("復元: 名前が戻る", els["name"].value, "HANAKO YAMADA");
  api.clearInputs();
  eq("削除: 記憶が消える", store["numerology-inputs"] === undefined, true);
}
els["remember"].checked = false;
els["yy"].value = "1985"; els["mm"].value = "3"; els["dd"].value = "12";
api.calc();
eq("記憶OFF: 保存されない", store["numerology-inputs"] === undefined, true);

/* ============ 相性診断(回帰) ============ */
els["yyA"].value = "1985"; els["mmA"].value = "3"; els["ddA"].value = "12";
els["yyB"].value = "1990"; els["mmB"].value = "11"; els["ddB"].value = "22";
els["nameA"].value = ""; els["nameB"].value = "";
api.calcPair();
const out4 = els["result"].innerHTML;
if (!out4.includes("相 性 鑑 定 書") || /undefined|NaN/.test(out4)) { console.error("NG: 相性診断に問題"); fail++; }
else console.log("ok: 相性診断も正常(回帰なし)");

/* ============ 結果 ============ */
if (fail) { console.error(`\n${fail} 件のテストが失敗しました`); process.exit(1); }
console.log("\nすべてのテストに合格しました ✓");

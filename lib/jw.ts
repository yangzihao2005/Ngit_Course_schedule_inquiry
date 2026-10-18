/**
 * 教务课表接口（新版）：kbList JSON → CourseItem[]。
 * 移植自 schedule-tool 的 kb/jw.py，httpx → 原生 fetch，仅在服务端运行。
 *
 * 接口：实测 2026-10 仍可用，可能要 VPN。
 *   POST http://jwjxnew.njit.edu.cn/jwglxt/kbcx/xskbcx_cxXsgrkb.html?gnmkdm=N2151
 *   form: xnm=2026&xqm=3&kzlx=ck&xsdm=&kclbdm=&kclxdm=   (xqm: 3=第一学期 12=第二学期)
 *   resp: {"kbList": [...]}
 * 认证：登录后的 Cookie（JSESSIONID + iPlanetDirectoryPro + route）。
 */
import { parseDay, parsePeriods, parseWeeks, uniqSorted } from "./parse";
import { makeCourseItem, type CourseItem } from "./types";

export const KB_BASE = "http://jwjxnew.njit.edu.cn";
export const KB_API = `${KB_BASE}/jwglxt/kbcx/xskbcx_cxXsgrkb.html?gnmkdm=N2151`;
export const INDEX_URL = `${KB_BASE}/jwglxt/kbcx/xskbcx_cxXskbcxIndex.html?gnmkdm=N2151&layout=default`;

export class JwAuthError extends Error {}
export class JwResponseError extends Error {}

export interface KbRow {
  kcmc?: string;
  xm?: string;
  xqj?: string | number;
  jcs?: string;
  zcd?: string;
  cdmc?: string;
  jxdd?: string;
  jxb_id?: string;
  [key: string]: unknown;
}

/**
 * 请求课表接口，返回原始 JSON。响应非 JSON（Cookie 失效会返回 HTML）→ JwAuthError。
 */
export async function fetchKbList(
  cookie: string,
  xnm: number,
  xqm: number,
): Promise<{ kbList?: KbRow[] }> {
  const body = `xnm=${xnm}&xqm=${xqm}&kzlx=ck&xsdm=&kclbdm=&kclxdm=`;
  let res: Response;
  try {
    res = await fetch(KB_API, {
      method: "POST",
      headers: {
        Cookie: cookie,
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
        Referer: INDEX_URL,
        "X-Requested-With": "XMLHttpRequest",
        "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
      },
      body,
      cache: "no-store",
      signal: AbortSignal.timeout(20000),
    });
  } catch (err) {
    throw new JwResponseError(
      `教务接口请求失败（可能需要校园网/VPN）：${err instanceof Error ? err.message : String(err)}`,
    );
  }

  const text = await res.text();
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new JwAuthError(
      "响应不是 JSON，Cookie 已失效或未登录。请重新登录 http://jwjxnew.njit.edu.cn ，F12 → Network → 任意请求 → Request Headers → 复制 Cookie 整行后重试。",
    );
  }
  const obj = data as { kbList?: KbRow[] };
  if (!obj || !Array.isArray(obj.kbList)) {
    throw new JwResponseError(`响应里没有 kbList：${text.slice(0, 200)}`);
  }
  return obj;
}

/**
 * kbList → CourseItem 列表：按 (jxb_id, xqj, jcs, zcd) 去重，
 * 缺星期/节次/周次的行跳过，kind 按课程名自动推断。
 */
export function parseKbList(data: { kbList?: KbRow[] }): CourseItem[] {
  const out: CourseItem[] = [];
  const seen = new Set<string>();
  for (const k of data.kbList || []) {
    const key = [k.jxb_id, k.xqj, k.jcs, k.zcd].join("|");
    if (seen.has(key)) continue;
    seen.add(key);

    const name = String(k.kcmc || "").trim();
    const day = parseDay(k.xqj);
    const periods = parsePeriods(k.jcs || "");
    const weeks = uniqSorted(parseWeeks(k.zcd || ""));
    if (!name || day < 1 || day > 7 || !periods.length || !weeks.length) continue;

    out.push(
      makeCourseItem({
        name,
        day,
        periods,
        weeks,
        place: String(k.cdmc || k.jxdd || "").trim(),
        teacher: String(k.xm || "").trim(),
        src: "jw",
      }),
    );
  }
  return out;
}

/** 拉取 + 解析一步到位 */
export async function syncFromJw(
  cookie: string,
  xnm: number,
  xqm: number,
): Promise<CourseItem[]> {
  const data = await fetchKbList(cookie, xnm, xqm);
  return parseKbList(data);
}

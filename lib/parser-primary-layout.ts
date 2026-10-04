import { detectPrimaryTableColumns, type PdfTextItem, type groupRows } from './parser-v04.ts';

export type ReportRow = ReturnType<typeof groupRows>[number];
export type PrimaryHeader = {
  page: number;
  top: number;
  bottom: number;
  labelMax: number;
  anchors: number[];
  comparisonIndex: number;
  changePercent: boolean;
  periodColumns: [string, string];
};
export type PrimarySegment = { header: PrimaryHeader; page: number; continuation: boolean; rows: ReportRow[] };
export type LayoutProblem = { page: number; message: string };
const clean = (text: string) => text.replace(/\s+/g, '');
const currentIdentity = /^(本报告期|本报告期末)$/;
const comparisonIdentity = /^(上年同期|上年度末)$/;

/** A cell's explicit unit wins; inherited units never divide an explicit % twice. */
export function parseLayoutNumber(text: string, inheritedPercent = false): number | undefined {
  const normalized = clean(text).replace(/,/g, '').replace(/[−–—]/g, '-').replace(/％/g, '%');
  const points = normalized.match(/^(增加|减少)?([-+]?\d+(?:\.\d+)?)个百分点$/);
  if (points) {
    const value = Number(points[2]);
    if (!Number.isFinite(value) || (points[1] && value < 0)) return undefined;
    return value * (points[1] === '减少' ? -1 : 1) / 100;
  }
  if (!/^[-+]?\d+(?:\.\d+)?%?$/.test(normalized)) return undefined;
  const explicitPercent = normalized.endsWith('%');
  const value = Number(explicitPercent ? normalized.slice(0, -1) : normalized);
  return Number.isFinite(value) ? value / (explicitPercent || inheritedPercent ? 100 : 1) : undefined;
}

export function numericItems(row: ReportRow, header: PrimaryHeader): PdfTextItem[] {
  return row.items.filter(item => item.x >= header.labelMax && parseLayoutNumber(item.str) !== undefined)
    .sort((a, b) => a.x - b.x);
}

export function primaryRowLabel(row: ReportRow, rows: ReportRow[], header: PrimaryHeader): string {
  const numericRows = rows.filter(candidate => numericItems(candidate, header).length > 0);
  return rows.filter(candidate => {
    if (candidate.page !== row.page || Math.abs(candidate.y - row.y) > 22) return false;
    const nearest = numericRows.reduce((best, numeric) =>
      !best || Math.abs(candidate.y - numeric.y) < Math.abs(candidate.y - best.y) ? numeric : best,
    undefined as ReportRow | undefined);
    return nearest === row;
  }).sort((a, b) => b.y - a.y)
    .map(candidate => candidate.items.filter(item => item.x < header.labelMax).map(item => clean(item.str)).join(''))
    .join('');
}

function detectHeader(row: ReportRow, rows: ReportRow[]): { header?: PrimaryHeader; problem?: LayoutProblem } {
  const current = row.items.filter(item => currentIdentity.test(clean(item.str)));
  if (!current.length) return {};
  const nearby = rows.filter(candidate => candidate.page === row.page && Math.abs(candidate.y - row.y) <= 28);
  const items = nearby.flatMap(candidate => candidate.items);
  const comparisons = items.filter(item => comparisonIdentity.test(clean(item.str)));
  const changes = items.filter(item => /增减|同比/.test(clean(item.str)));
  // A lone '本报告期' (e.g. non-recurring disclosure) is not a primary header.
  const problem = (message: string) => ({ problem: { page: row.page, message } });
  if (!comparisons.length && !changes.length) return {};
  if (!comparisons.length || !changes.length) return problem('Primary header lacks a comparison or change column identity.');
  if (new Set(current.map(item => item.x)).size !== 1 || new Set(comparisons.map(item => item.x)).size !== 1) {
    return problem('Primary header has multiple current/comparison column identities.');
  }
  if ((clean(current[0].str) === '本报告期末') !== (clean(comparisons[0].str) === '上年度末')) {
    return problem('Current and comparison period identities do not form a recognized pair.');
  }
  const detection = detectPrimaryTableColumns(nearby);
  if (!detection) return problem('Primary header column order or geometry is ambiguous.');
  const changeX = Math.min(...changes.map(item => item.x));
  const center = (item: PdfTextItem) => item.x + (item.width ?? 0) / 2;
  const currentX = center(current[0]), comparisonX = center(comparisons[0]);
  const changeCenters = changes.map(center).sort((a, b) => a - b);
  const changeCenter = changeCenters[Math.floor(changeCenters.length / 2)];
  const before = items.filter(item => /^调整前$/.test(clean(item.str)));
  const after = items.filter(item => /^调整后$/.test(clean(item.str)));
  if (before.length !== after.length || before.length > 1) return problem('Restated comparison header lacks unique before/after identities.');
  const anchors = before.length ? [currentX, center(before[0]), center(after[0]), changeCenter] : [currentX, comparisonX, changeCenter];
  if (!anchors.every((x, index) => index === 0 || x > anchors[index - 1])) return problem('Column identities are not ordered left to right.');
  const headerItems = items.filter(item => currentIdentity.test(clean(item.str)) || comparisonIdentity.test(clean(item.str)) ||
    /增减|同比|^调整[前后]$/.test(clean(item.str)) || (item.x >= changeX && /^[（(]?[%％][）)]?$/.test(clean(item.str))));
  return { header: {
    page: row.page, top: Math.max(...headerItems.map(item => item.y)), bottom: Math.min(...headerItems.map(item => item.y)),
    labelMax: detection.bounds.labelMax, anchors, comparisonIndex: before.length ? 2 : 1,
    changePercent: headerItems.some(item => item.x >= changeX && /[%％]/.test(item.str)),
    periodColumns: [clean(current[0].str), clean(comparisons[0].str)],
  } };
}

function endsTable(row: ReportRow, header: PrimaryHeader): boolean {
  const left = clean(row.items.filter(item => item.x < header.labelMax).map(item => item.str).join(''));
  if (/^(?:[一二三四五六七八九十]+[、．.]|[（(][一二三四五六七八九十]+[）)]|注[:：]|说明[:：])/.test(left)) return true;
  // A different table header terminates context even if its later labels happen to match.
  if (/项目/.test(left) && /本期金额|说明|期末余额|期初余额/.test(clean(row.text))) return true;
  return false;
}

/**
 * Detect bounded primary table/header segments, not a global collection of matching labels.
 * A continuation may inherit only the immediately preceding, still-open segment:
 * its first left-column content must identify a primary metric, with aligned cells.
 * A new primary header always starts a new context; an unrelated section closes it.
 */
export function detectPrimarySegments(rows: ReportRow[], isPrimaryLabel: (label: string) => boolean): {
  segments: PrimarySegment[]; problems: LayoutProblem[];
} {
  const segments: PrimarySegment[] = [], problems: LayoutProblem[] = [];
  const headers = new Map<ReportRow, ReturnType<typeof detectHeader>>();
  for (const row of rows) {
    const detection = detectHeader(row, rows);
    if (detection.header || detection.problem) headers.set(row, detection);
  }
  let active: PrimarySegment | undefined;
  let page: number | undefined;
  let continuationCandidate: PrimarySegment | undefined;
  for (const row of rows) {
    if (row.page !== page) {
      const prior = active;
      const lastPrimary = prior && prior.rows.filter(candidate => numericItems(candidate, prior.header).length > 0 &&
        isPrimaryLabel(primaryRowLabel(candidate, prior.rows, prior.header))).at(-1);
      const priorTop = prior && Math.max(...rows.filter(candidate => candidate.page === prior.page).map(candidate => candidate.y));
      continuationCandidate = prior && row.page === prior.page + 1 && lastPrimary && priorTop &&
        lastPrimary.y <= priorTop / 4 ? prior : undefined;
      active = undefined;
      page = row.page;
    }
    const detected = headers.get(row);
    if (detected) {
      // An incomplete header in an already identified primary table is a
      // blocker. Similar words in an unrelated later table only close context;
      // they cannot invalidate (or contribute to) the primary table globally.
      const priorWasPrimary = active?.rows.some(candidate =>
        isPrimaryLabel(primaryRowLabel(candidate, active!.rows, active!.header)));
      continuationCandidate = undefined;
      active = undefined;
      if (detected.problem && priorWasPrimary) problems.push(detected.problem);
      if (detected.header) {
        active = { header: detected.header, page: row.page, continuation: false, rows: [] };
        segments.push(active);
      }
      continue;
    }
    if (!active && continuationCandidate) {
      const inherited = continuationCandidate.header;
      const left = clean(row.items.filter(item => item.x < inherited.labelMax).map(item => item.str).join(''));
      if (!left) continue; // centered running title / footer cannot initiate a table
      const pageRows = rows.filter(candidate => candidate.page === row.page && Math.abs(candidate.y - row.y) <= 22);
      const label = pageRows.map(candidate => candidate.items.filter(item => item.x < inherited.labelMax).map(item => clean(item.str)).join('')).join('');
      const aligned = pageRows.some(candidate => alignedPrimaryCells(candidate, inherited) !== undefined);
      const pageTop = Math.max(...rows.filter(candidate => candidate.page === row.page).map(candidate => candidate.y));
      if (!isPrimaryLabel(label) || !aligned || endsTable(row, inherited) || row.y < pageTop * 0.75) {
        continuationCandidate = undefined;
        continue;
      }
      active = { header: inherited, page: row.page, continuation: true, rows: [] };
      segments.push(active);
      continuationCandidate = undefined;
    }
    if (!active) continue;
    if (row.page === active.header.page && row.y >= active.header.bottom) continue;
    if (endsTable(row, active.header)) { active = undefined; continue; }
    active.rows.push(row);
  }
  return { segments, problems };
}

/** Assign cells by declared column count AND geometry, never by label alone. */
export function alignedPrimaryCells(row: ReportRow, header: PrimaryHeader): PdfTextItem[] | undefined {
  const cells = numericItems(row, header);
  if (cells.length !== header.anchors.length) return undefined;
  // Right-aligned PDF numbers can start to the right of a centered header. Permit
  // a column gap on the right and half on the left; shifted rows must not acquire
  // another table's context. Anchors are header text centers, not text start x.
  return cells.every((cell, index) => {
    const anchor = header.anchors[index];
    const leftGap = index ? anchor - header.anchors[index - 1] : header.anchors[1] - anchor;
    const rightGap = index < header.anchors.length - 1 ? header.anchors[index + 1] - anchor : leftGap;
    const end = cell.x + (cell.width ?? 0);
    return end >= anchor - leftGap / 2 && cell.x <= anchor + rightGap;
  }) ? cells : undefined;
}

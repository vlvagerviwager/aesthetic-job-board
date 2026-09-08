export interface SalaryRange {
  low: number;
  high: number;
}

const FULL_TIME_HOURS_PER_YEAR = 2080;
const MONTHS_PER_YEAR = 12;
const THOUSAND_MULTIPLIER = 1000;
const BARE_FIGURE_MINIMUM = 10000;

const HOURLY_PATTERN = /per hour|\/hour|hourly|\bp\.?\s?h\.?\b|per hr/i;
const MONTHLY_PATTERN = /per month|\/month|monthly/i;
const K_SUFFIX_PATTERN = /\d[\d.,]*\s*[kK]\b/;
const EURO_AMOUNT_PATTERN = /€\s*(\d{1,3}(?:[,\s]\d{3})*(?:\.\d+)?|\d+(?:\.\d+)?)/g;
const BARE_AMOUNT_PATTERN = /(\d{1,3}(?:[,\s]\d{3})*(?:\.\d+)?|\d+(?:\.\d+)?)/g;
const SCALE_CONTEXT_PATTERN = /scale|band|\bpay\b/i;

function parseFigure(figureText: string): number {
  return Number.parseFloat(figureText.replace(/[,\s]/g, ""));
}

function collectEuroFigures(salaryText: string): number[] {
  const figures: number[] = [];
  EURO_AMOUNT_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = EURO_AMOUNT_PATTERN.exec(salaryText)) !== null) {
    const figureText = match[1] ?? "";
    const figure = parseFigure(figureText);
    if (Number.isFinite(figure)) {
      figures.push(figure);
    }
  }
  return figures;
}

function collectBareScaleFigures(salaryText: string): number[] {
  if (SCALE_CONTEXT_PATTERN.test(salaryText) === false) {
    return [];
  }
  const figures: number[] = [];
  BARE_AMOUNT_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = BARE_AMOUNT_PATTERN.exec(salaryText)) !== null) {
    const figureText = match[1] ?? "";
    const figure = parseFigure(figureText);
    if (Number.isFinite(figure) && figure >= BARE_FIGURE_MINIMUM) {
      figures.push(figure);
    }
  }
  return figures;
}

const K_RANGE_SHORTHAND_PATTERN = /€(\s*\d[\d.,]*\s*[-–—]\s*)(\d[\d.,]*)\s*([kK])/g;

export function parseSalaryRange(salaryText: string): SalaryRange | null {
  const trimmedText = salaryText.trim();
  if (trimmedText === "") {
    return null;
  }
  const expandedText = trimmedText.replace(K_RANGE_SHORTHAND_PATTERN, "€$1€$2$3");
  let figures = collectEuroFigures(expandedText);
  if (figures.length === 0) {
    figures = collectBareScaleFigures(trimmedText);
  }
  if (figures.length === 0) {
    return null;
  }
  if (K_SUFFIX_PATTERN.test(trimmedText)) {
    figures = figures.map((figure) =>
      figure < THOUSAND_MULTIPLIER ? figure * THOUSAND_MULTIPLIER : figure,
    );
  }
  if (HOURLY_PATTERN.test(trimmedText)) {
    figures = figures.map((figure) => Math.round(figure * FULL_TIME_HOURS_PER_YEAR));
  } else if (MONTHLY_PATTERN.test(trimmedText)) {
    figures = figures.map((figure) => Math.round(figure * MONTHS_PER_YEAR));
  }
  return { low: Math.min(...figures), high: Math.max(...figures) };
}

export function matchesSalaryRange(
  salaryText: string,
  salaryMin: number | null,
  salaryMax: number | null,
): boolean {
  if (salaryMin === null && salaryMax === null) {
    return true;
  }
  const parsedRange = parseSalaryRange(salaryText);
  if (parsedRange === null) {
    return false;
  }
  if (salaryMin !== null && parsedRange.high < salaryMin) {
    return false;
  }
  if (salaryMax !== null && parsedRange.low > salaryMax) {
    return false;
  }
  return true;
}

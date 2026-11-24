export type Category = 'COPY' | 'UI' | 'CODE';

export type Severity = 'low' | 'medium' | 'high';

export type AutoFix =
  | {
      kind: 'delete-line';
      description: string;
    }
  | {
      kind: 'replace-match';
      startColumn: number;
      endColumn: number;
      replacement: string;
      description: string;
    };

export interface Finding {
  ruleId: string;
  category: Category;
  severity: Severity;
  filePath: string;
  line: number;
  column: number;
  snippet: string;
  match: string;
  reason: string;
  suggestion: string;
  fix?: AutoFix;
}

export interface RuleContext {
  filePath: string;
  extension: string;
  content: string;
  lines: readonly string[];
}

export interface AnalyzerRule {
  id: string;
  category: Category;
  severity: Severity;
  extensions: readonly string[];
  analyze: (ctx: RuleContext) => Finding[];
}

export interface FileScanResult {
  filePath: string;
  findings: Finding[];
  fixedCount: number;
}

export interface CategoryCounts {
  COPY: number;
  UI: number;
  CODE: number;
}

export type CraftGrade =
  | 'Principal Craft'
  | 'Senior Standard'
  | 'Needs Polish'
  | 'AI Slop Detected';

export interface ScanSummary {
  targetPath: string;
  filesScanned: number;
  filesWithFindings: number;
  findings: Finding[];
  counts: CategoryCounts;
  score: number;
  grade: CraftGrade;
  fixedCount: number;
  autoFixableRemaining: number;
}

export type InitTarget = 'cursor' | 'claude' | 'antigravity' | 'gemini';

export type RuleModule = 'base' | 'ui' | 'copy' | 'code';

export interface InitFileResult {
  target: InitTarget;
  filePath: string;
  status: 'created' | 'merged' | 'updated';
}

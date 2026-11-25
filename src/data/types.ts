export type GameMode = "belajar" | "tantangan" | "ujian";

export type ChapterStageId = "pembuka" | "penjelasan" | "latihan" | "kuis" | "boss";

export type BuildingStyle =
  | "gate"
  | "classroom"
  | "market"
  | "station"
  | "clinic"
  | "lab"
  | "teahouse";

export interface VocabEntry {
  id: string;
  chapterId: string;
  chapterLabel: string;
  hanzi: string;
  pinyin: string;
  meaning: string;
  note: string;
  source: string;
  isTambahan?: boolean;
}

export interface VisualBoardRow {
  col1: string;
  col2: string;
  col3: string;
}

export interface VisualBoard {
  title: string;
  kind: "comparison" | "flow" | "pattern";
  headers: [string, string, string];
  rows: VisualBoardRow[];
  tambahanNote?: string;
}

export interface TappableTerm {
  hanzi: string;
  pinyin: string;
  meaning: string;
  note: string;
  source: string;
  isTambahan?: boolean;
}

export interface DialogScreen {
  speaker: string;
  title: string;
  sentences: string[]; // <= 4 sentences per screen
  example?: {
    hanzi: string;
    pinyin: string;
    meaning: string;
  };
}

export interface CheatSheet {
  title: string;
  formulas: { pattern: string; usage: string; example: string }[];
  quickPitfalls: string[];
  source: string;
}

export type PracticeKind =
  | "dialogue_reply"
  | "order"
  | "polite_rewrite"
  | "listening_scenario";

export interface PracticeTask {
  id: string;
  kind: PracticeKind;
  conceptTag: string;
  topic: string;
  difficulty: 1 | 2 | 3;
  prompt: string;
  contextLine?: string;
  audioText?: string;
  dialogue?: { speaker: string; hanzi: string; pinyin: string; meaning: string }[];
  hanzi?: string;
  pinyin?: string;
  meaning?: string;
  options?: string[];
  tokens?: string[];
  placeholder?: string;
  acceptedAnswers?: string[];
  answer: number | string[] | string;
  hints: [string, string, string]; // tiered: small clue -> big clue -> answer
  explain: string;
  source: string;
  isTambahan?: boolean;
}

export type QuizQuestionKind =
  | "mcq"
  | "true_false"
  | "order"
  | "match"
  | "short_fill";

export interface QuizVariant {
  prompt: string;
  hanzi?: string;
  pinyin?: string;
  options?: string[];
  tokens?: string[];
  pairs?: { left: string; right: string }[];
  placeholder?: string;
  acceptedAnswers?: string[];
  answer: number | boolean | string[] | string;
  explain: string;
}

export interface QuizQuestion {
  id: string;
  chapterId: string;
  kind: QuizQuestionKind;
  conceptTag: string;
  topic: string;
  difficulty: 1 | 2 | 3;
  prompt: string;
  hanzi?: string;
  pinyin?: string;
  options?: string[]; // for mcq
  tokens?: string[]; // for order
  pairs?: { left: string; right: string }[]; // for match (left -> matching right)
  placeholder?: string; // for short_fill
  acceptedAnswers?: string[]; // for short_fill
  answer: number | boolean | string[] | string; // mcq: index, tf: boolean, order: string[], match: string[] (same order), short_fill: canonical string
  hints: [string, string, string];
  explain: string;
  source: string;
  isTambahan?: boolean;
  variant: QuizVariant;
}

export interface BossStep {
  id: string;
  stepTitle: string;
  situation: string;
  audioText?: string;
  hanzi?: string;
  pinyin?: string;
  kind: "mcq" | "order";
  options?: string[];
  tokens?: string[];
  answer: number | string[];
  hints: [string, string, string];
  explain: string;
  source: string;
}

export interface ChapterData {
  id: string;
  order: number;
  title: string;
  shortTitle: string;
  subtitle: string;
  summary: string;
  badgeName: string;
  npcName: string;
  npcRole: string;
  worldPos: [number, number, number];
  buildingStyle: BuildingStyle;
  accentHex: string;
  pembuka: {
    sceneTitle: string;
    storyHook: string;
    challengePrompt: string;
    goalSummary: string;
    source: string;
  };
  penjelasan: {
    screens: DialogScreen[];
    simplifiedRecap?: string;
    visualBoard: VisualBoard;
    tappableTerms: TappableTerm[];
    cheatSheet: CheatSheet;
  };
  latihan: PracticeTask[];
  kuis: QuizQuestion[]; // 5 mixed questions
  boss: {
    title: string;
    brief: string;
    steps: BossStep[];
  };
}

export interface CurriculumAnalysis {
  courseType: string;
  textbooks: {
    name: string;
    scope: string;
    coverageNote: string;
  }[];
  transparencyNotes: string[];
}

export interface MateriBundle {
  worldTitle: string;
  playerName: string;
  mentorName: string;
  mentorHanzi: string;
  analysis: CurriculumAnalysis;
  vocabBank: VocabEntry[];
  chapters: ChapterData[];
}

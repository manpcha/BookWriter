
export const VERSION = "1.16";

export const BOOK_TYPES = [
  "실용서", "돈 버는법", "기술 매뉴얼", "자동화", "습관", 
  "사고방식", "생산성", "트렌드", "산업분석", "사례집", 
  "에세이", "경험담", "이론+실전가이드"
];

export const AUTHOR_POSITIONS = [
  "선배(경험담+경고)", "실무전문가(단정, 근거중심)", "코치(질문 유도)", 
  "내부자(업계 비밀 공개)", "관찰자(분석적, 중립적)"
];

export const BOOK_DEPTHS = [
  "개념이해(why 중심)", "실행 가능(How 중심)", "바로 성과(What to do today)"
];

export const PURPOSES = [
  "단권판매(완결성)", "퍼널용(다음단계 암시)", "강의 연결(프레임 공개)", "브랜드 구축(철학 강조)"
];

export const DEFAULT_CONFIG = {
  bookType: "실용서",
  authorPosition: "실무전문가(단정, 근거중심)",
  bookDepth: "바로 성과(What to do today)",
  purpose: "단권판매(완결성)",
  reader: "",
  chapterCount: 12,
  pagesPerChapter: 25,
  subTopicsPerChapter: 7
};

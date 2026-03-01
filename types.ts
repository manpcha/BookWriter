
export interface BookConfig {
  bookType: string;
  authorPosition: string;
  bookDepth: string;
  purpose: string;
  reader: string;
  chapterCount: number;
  pagesPerChapter: number;
  subTopicsPerChapter: number;
}

export interface SubTopic {
  id: string;
  title: string;
  content?: string;
  isCompleted: boolean;
}

export interface Chapter {
  id: string;
  title: string;
  subTopics: SubTopic[];
}

export interface EBook {
  title: string;
  config: BookConfig;
  outline: Chapter[];
}

export enum AppStep {
  CONFIG = 'CONFIG',
  OUTLINE = 'OUTLINE',
  WRITING = 'WRITING',
  FINISHED = 'FINISHED'
}

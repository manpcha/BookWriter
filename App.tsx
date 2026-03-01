
import React, { useState, useEffect, useRef } from 'react';
import { 
  BookConfig, 
  Chapter, 
  AppStep,
  SubTopic
} from './types.ts';
import { 
  VERSION, 
  DEFAULT_CONFIG, 
  BOOK_TYPES, 
  AUTHOR_POSITIONS, 
  BOOK_DEPTHS, 
  PURPOSES 
} from './constants.ts';
import { 
  generateEBookOutline, 
  generateSubTopicContent,
  generateTitlesAndSubtitles,
  generateCoverImage
} from './services/geminiService.ts';
import html2canvas from 'html2canvas';
import JSZip from 'jszip';

const ConfigNumber: React.FC<{
  label: string;
  value: number;
  onChange: (val: number) => void;
  min?: number;
  max?: number;
}> = ({ label, value, onChange, min = 1, max = 100 }) => (
  <div className="flex flex-col gap-1.5">
    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{label}</label>
    <div className="flex items-center gap-2 bg-white p-1 rounded-xl border border-slate-200 shadow-sm focus-within:border-blue-500 transition-all">
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        onChange={(e) => {
          const val = parseInt(e.target.value);
          if (!isNaN(val)) onChange(val);
        }}
        className="flex-grow bg-transparent text-xl font-black text-slate-800 text-center outline-none py-2"
      />
      <div className="flex flex-col gap-0.5 pr-0.5">
        <button 
          type="button"
          onClick={() => onChange(Math.min(max, value + 1))}
          className="w-7 h-7 flex items-center justify-center bg-slate-50 hover:bg-blue-600 hover:text-white rounded-lg text-[10px] transition-colors border font-bold text-slate-600"
        >▲</button>
        <button 
          type="button"
          onClick={() => onChange(Math.max(min, value - 1))}
          className="w-7 h-7 flex items-center justify-center bg-slate-50 hover:bg-blue-600 hover:text-white rounded-lg text-[10px] transition-colors border font-bold text-slate-600"
        >▼</button>
      </div>
    </div>
  </div>
);

const App: React.FC = () => {
  const [step, setStep] = useState<AppStep>(AppStep.CONFIG);
  const [config, setConfig] = useState<BookConfig>(DEFAULT_CONFIG);
  const [outline, setOutline] = useState<Chapter[]>([]);
  
  const [suggestedTitles, setSuggestedTitles] = useState<string[]>([]);
  const [suggestedSubtitles, setSuggestedSubtitles] = useState<string[]>([]);
  const [selectedTitle, setSelectedTitle] = useState("");
  const [selectedSubtitle, setSelectedSubtitle] = useState("");
  const [hasSuggestedOnce, setHasSuggestedOnce] = useState(false);
  
  const [manualTitle, setManualTitle] = useState("");
  const [manualSubtitle, setManualSubtitle] = useState("");

  const [coverImage, setCoverImage] = useState("");
  const [tempCoverImage, setTempCoverImage] = useState("");
  const [showCoverModal, setShowCoverModal] = useState(false);
  const [coverItemsInput, setCoverItemsInput] = useState("");
  
  const [currentChapterIdx, setCurrentChapterIdx] = useState(0);
  const [currentSubTopicIdx, setCurrentSubTopicIdx] = useState(0);
  
  const [isGeneratingTitles, setIsGeneratingTitles] = useState(false);
  const [isGeneratingOutline, setIsGeneratingOutline] = useState(false);
  const [isGeneratingGeneral, setIsGeneratingGeneral] = useState(false); 
  const [fakeProgress, setFakeProgress] = useState(0);
  const [lastError, setLastError] = useState<string | null>(null);
  const [isAutoWriting, setIsAutoWriting] = useState(false);
  const [isKeyModalOpen, setIsKeyModalOpen] = useState(false);
  const [hasApiKey, setHasApiKey] = useState(false);
  const [isKeyModalOpen, setIsKeyModalOpen] = useState(false);
  const [writingContent, setWritingContent] = useState("");
  const [isCopied, setIsCopied] = useState(false);
  
  const [startTime, setStartTime] = useState<number | null>(null);
  const [etaSeconds, setEtaSeconds] = useState<number | null>(null);
  
  const contentRef = useRef<HTMLDivElement>(null);
  const tocContainerRef = useRef<HTMLDivElement>(null);
  const progressInterval = useRef<number | null>(null);
  const etaTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const checkKey = async () => {
      // @ts-ignore
      if (window.aistudio) {
        // @ts-ignore
        const selected = await window.aistudio.hasSelectedApiKey();
        setHasApiKey(selected);
      } else {
        setHasApiKey(!!process.env.API_KEY);
      }
    };
    checkKey();
  }, []);

  useEffect(() => {
    if (contentRef.current) {
      contentRef.current.scrollTop = contentRef.current.scrollHeight;
    }
  }, [writingContent]);

  useEffect(() => {
    if (isAutoWriting && startTime) {
      etaTimerRef.current = window.setInterval(() => {
        const totalSubTopics = outline.length * config.subTopicsPerChapter;
        const completedSubTopics = currentChapterIdx * config.subTopicsPerChapter + currentSubTopicIdx;
        
        if (completedSubTopics > 0 && totalSubTopics > 0) {
          const elapsed = Date.now() - startTime;
          const avgTimePerSubTopic = elapsed / completedSubTopics;
          const remainingSubTopics = totalSubTopics - completedSubTopics;
          const adjustedEta = Math.round((avgTimePerSubTopic * remainingSubTopics) / 1000);
          setEtaSeconds(Math.max(1, adjustedEta));
        }
      }, 1000);
    } else {
      if (etaTimerRef.current) clearInterval(etaTimerRef.current);
    }
    return () => { if (etaTimerRef.current) clearInterval(etaTimerRef.current); };
  }, [isAutoWriting, startTime, currentChapterIdx, currentSubTopicIdx, outline.length, config.subTopicsPerChapter]);

  const startFakeProgress = () => {
    setFakeProgress(1);
    if (progressInterval.current) clearInterval(progressInterval.current);
    progressInterval.current = window.setInterval(() => {
      setFakeProgress(prev => {
        if (prev >= 98) return prev;
        const inc = Math.random() * 2.5 + 0.3;
        return Math.min(98, prev + inc);
      });
    }, 450);
  };

  const stopFakeProgress = () => {
    if (progressInterval.current) {
      clearInterval(progressInterval.current);
      progressInterval.current = null;
    }
    setFakeProgress(100);
    setTimeout(() => setFakeProgress(0), 600);
  };

  const handleOpenKeySelector = async () => setIsKeyModalOpen(true);

  const handleSuggestTitles = async () => {
    if (!config.reader.trim()) {
      setLastError("책의 독자를 입력해 주세요.");
      return;
    }
    setLastError(null);
    setIsGeneratingTitles(true);
    startFakeProgress();
    try {
      const { titles, subtitles } = await generateTitlesAndSubtitles(config);
      setSuggestedTitles(titles);
      setSuggestedSubtitles(subtitles);
      setHasSuggestedOnce(true);
    } catch (error: any) {
      setLastError(`에러: ${error.message}`);
    } finally {
      stopFakeProgress();
      setIsGeneratingTitles(false);
    }
  };

  const handleSelectTitle = (title: string, subtitle: string) => {
    setSelectedTitle(title);
    setSelectedSubtitle(subtitle);
    setManualTitle(title);
    setManualSubtitle(subtitle);
  };

  const startOutlineGeneration = async () => {
    const finalTitle = manualTitle || selectedTitle;
    const finalSubtitle = manualSubtitle || selectedSubtitle;

    if (!finalTitle) {
      setLastError("제목을 선택하거나 직접 입력해 주세요.");
      return;
    }

    setLastError(null);
    setIsGeneratingOutline(true);
    startFakeProgress();
    try {
      const [generatedOutline, img] = await Promise.all([
        generateEBookOutline(config, finalTitle, finalSubtitle),
        generateCoverImage(finalTitle, finalSubtitle)
      ]);
      setOutline(generatedOutline);
      setCoverImage(img);
      setTempCoverImage(img);
      setStep(AppStep.OUTLINE);
    } catch (error: any) {
      setLastError(`에러: ${error.message}`);
    } finally {
      stopFakeProgress();
      setIsGeneratingOutline(false);
    }
  };

  const handleOpenCoverModal = (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    setTempCoverImage(coverImage);
    setShowCoverModal(true);
  };

  const regenerateCoverWithItems = async () => {
    setIsGeneratingGeneral(true);
    startFakeProgress();
    try {
      const newImg = await generateCoverImage(
        manualTitle || selectedTitle, 
        manualSubtitle || selectedSubtitle, 
        coverItemsInput
      );
      setTempCoverImage(newImg);
    } catch (error: any) {
      setLastError(`표지 재생성 실패: ${error.message}`);
    } finally {
      stopFakeProgress();
      setIsGeneratingGeneral(false);
    }
  };

  const saveCoverFromModal = () => {
    setCoverImage(tempCoverImage);
    setShowCoverModal(false);
  };

  const downloadCoverAsJpg = async () => {
    if (!tempCoverImage) return;
    
    setIsGeneratingGeneral(true);
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
        const link = document.createElement('a');
        link.download = `cover_${(manualTitle || selectedTitle).replace(/\s+/g, '_')}.jpg`;
        link.href = canvas.toDataURL('image/jpeg', 0.95);
        link.click();
      }
      setIsGeneratingGeneral(false);
    };
    img.onerror = () => {
      setIsGeneratingGeneral(false);
      setLastError("이미지 로딩 중 오류가 발생했습니다.");
    };
    img.src = tempCoverImage;
  };

  const startAutoWriting = () => {
    setIsAutoWriting(true);
    setStartTime(Date.now());
    setStep(AppStep.WRITING);
    generateNextSubTopic(0, 0, true);
  };

  const generateNextSubTopic = async (chIdx: number, stIdx: number, auto: boolean) => {
    if (chIdx >= outline.length) {
      setStep(AppStep.FINISHED);
      setIsAutoWriting(false);
      return;
    }
    
    setLastError(null);
    const chapter = outline[chIdx];
    const subTopic = chapter.subTopics[stIdx];
    setIsGeneratingGeneral(true);
    try {
      const rawContent = await generateSubTopicContent(
        config, 
        chapter.title, 
        subTopic.title, 
        manualTitle || selectedTitle, 
        manualSubtitle || selectedSubtitle
      );
      
      setOutline(prev => {
        const newOutline = [...prev];
        const targetChapter = {...newOutline[chIdx]};
        const targetSubTopic = {...targetChapter.subTopics[stIdx]};
        targetSubTopic.content = rawContent;
        targetSubTopic.isCompleted = true;
        targetChapter.subTopics = [...targetChapter.subTopics];
        targetChapter.subTopics[stIdx] = targetSubTopic;
        newOutline[chIdx] = targetChapter;
        return newOutline;
      });
      setWritingContent(rawContent);
      if (auto) {
        moveToNext(chIdx, stIdx, true);
      }
    } catch (error: any) {
      setIsAutoWriting(false);
      setLastError(`집필 중단: ${error.message}`);
    } finally {
      setIsGeneratingGeneral(false);
    }
  };

  const moveToNext = (chIdx: number, stIdx: number, auto: boolean) => {
    const chapter = outline[chIdx];
    const isLastSubTopic = stIdx === (chapter?.subTopics?.length || 0) - 1;
    const isLastChapter = chIdx === outline.length - 1;
    
    if (isLastSubTopic && isLastChapter) {
      setStep(AppStep.FINISHED);
      setIsAutoWriting(false);
    } else {
      let nextCh = chIdx;
      let nextSt = stIdx + 1;
      if (isLastSubTopic) { nextCh = chIdx + 1; nextSt = 0; }
      setCurrentChapterIdx(nextCh);
      setCurrentSubTopicIdx(nextSt);
      if (auto) generateNextSubTopic(nextCh, nextSt, true);
    }
  };

  const handleDownloadMd = () => {
    const finalTitle = manualTitle || selectedTitle;
    let md = "";
    outline.forEach((ch, idx) => {
      md += `\n# Chapter ${idx + 1}: ${ch.title}\n`;
      ch.subTopics.forEach(st => {
        md += `\n${st.content || ""}\n`;
      });
    });
    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${finalTitle.replace(/\s+/g, '_')}_v${VERSION}.md`;
    a.click();
  };

  const handleCopyContent = () => {
    if (!writingContent) return;
    navigator.clipboard.writeText(writingContent);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  const handleCaptureToc = async () => {
    if (!tocContainerRef.current) return;
    setIsGeneratingGeneral(true);
    startFakeProgress();
    
    try {
      const zip = new JSZip();
      const pageElements = tocContainerRef.current.querySelectorAll('.a4-page');
      
      for (let i = 0; i < pageElements.length; i++) {
        const canvas = await html2canvas(pageElements[i] as HTMLElement, { 
          scale: 2,
          useCORS: true,
          backgroundColor: '#ffffff'
        });
        const imgData = canvas.toDataURL('image/png').split(',')[1];
        zip.file(`toc_page_${i + 1}.png`, imgData, { base64: true });
      }
      
      const zipContent = await zip.generateAsync({ type: 'blob' });
      const link = document.createElement('a');
      link.download = `목차_${(manualTitle || selectedTitle).replace(/\s+/g, '_')}.zip`;
      link.href = URL.createObjectURL(zipContent);
      link.click();
    } catch (e: any) {
      console.error(e);
      setLastError(`목차 이미지 생성 중 오류가 발생했습니다: ${e.message}`);
    } finally {
      stopFakeProgress();
      setIsGeneratingGeneral(false);
    }
  };

  const handleExportPRD = () => {
    const prd = `
# Product Requirements Document (PRD) - 전자책 작가 (Ebook Writer)

## 1. 개요 (Overview)
- **제품명**: 전자책 작가 (Ebook Writer)
- **버전**: V${VERSION}
- **목표**: 인공지능(Gemini API)을 활용하여 전자책의 기획, 목차 구성, 본문 집필, 표지 디자인까지 모든 과정을 자동화하는 원스톱 솔루션 제공.

## 2. 현재 설정 데이터 (Current Configuration Data)
### 2.1 책 기본 설정 (Basic Settings)
- **책 종류**: ${config.bookType}
- **대상 독자**: ${config.reader || "(미지정)"}
- **저자 포지션**: ${config.authorPosition}
- **책의 깊이**: ${config.bookDepth}
- **출판 목적**: ${config.purpose}
- **현재 제목**: ${manualTitle || selectedTitle || "(미정)"}
- **현재 부제**: ${manualSubtitle || selectedSubtitle || "(미정)"}

### 2.2 분량 설정 기준 (Volume Configuration Standards)
- **총 챕터 수**: ${config.chapterCount} Chapters
- **챕터당 소주제 수**: ${config.subTopicsPerChapter} Sections
- **챕터당 예상 페이지**: ${config.pagesPerChapter} Pages (A4 기준)
- **총 예상 소주제 수**: ${config.chapterCount * config.subTopicsPerChapter}개

## 3. 시스템 정의 항목 리스트 (Selection Option Lists)
### 3.1 책 종류 (Book Types)
${BOOK_TYPES.map(t => `- ${t}`).join('\n')}

### 3.2 저자의 포지션 (Author Positions)
${AUTHOR_POSITIONS.map(p => `- ${p}`).join('\n')}

### 3.3 책의 깊이 (Book Depths)
${BOOK_DEPTHS.map(d => `- ${d}`).join('\n')}

### 3.4 출판 목적 (Purposes)
${PURPOSES.map(p => `- ${p}`).join('\n')}

## 4. 주요 기능 (Key Features)
- **기획 설정**: 책 종류, 저자 포지션, 깊이, 독자 대상 등 상세 파라미터 구성.
- **AI 제목 추천**: 독자 타겟팅 기반 10종의 제목/부제 조합 추천.
- **상세 목차 생성**: 챕터 및 소주제 단위의 논리적 구조 자동 설계.
- **A4 표지 디자인**: Gemini Pro Image 모델 기반 고품질 표지 생성 및 커스텀 프롬프트 편집.
- **실시간 자동 집필**: 소주제당 2,000자 이상의 본문 실시간 생성 및 진행률 표시.
- **이미지 및 문서 내보내기**:
  - 목차 이미지 (A4 규격 ZIP 패키지)
  - 표지 이미지 (고해상도 JPG)
  - 원고 파일 (Markdown 형식)

## 5. 기술 사양 (Technical Specifications)
- **프레임워크**: React (ESM)
- **스타일링**: Tailwind CSS
- **AI 연동**: Google Gemini 2.5/3.0 API (Flash, Pro Image)
- **이미지 처리**: html2canvas (UI 캡처), Canvas API (고품질 저장)
- **유틸리티**: JSZip (파일 압축), Noto Sans KR (폰트)

## 6. 사용자 인터페이스 (UI/UX)
- **단계별 워크플로우**: 설정 -> 목차/표지 확인 -> 실시간 집필 -> 완성.
- **A4 시뮬레이션**: 실제 인쇄 및 전자책 배포 규격(A4)에 맞춘 프리뷰 제공.
- **반응형 디자인**: 다양한 디바이스 환경 대응.

## 7. 비기능적 요구사항
- **에러 복구**: API 오류 발생 시 지수 백오프 기반 재시도 로직.
- **진행 가시성**: 가짜 로딩 바 및 실제 ETA(남은 시간) 계산 기능으로 사용자 경험 개선.
    `.trim();

    const blob = new Blob([prd], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `PRD_EbookWriter_V${VERSION}.md`;
    a.click();
  };

  const renderTOCPages = () => {
    const pages: React.ReactNode[] = [];
    let currentItems: { type: 'chapter' | 'subtopic', title: string, pageNum?: number }[] = [];
    
    const PAGE_CAPACITY_LINES = 32; 
    let usedLines = 0;

    outline.forEach((ch, chIdx) => {
      const startPage = chIdx * config.pagesPerChapter + 1;
      const chCost = 2.5; 
      
      if (usedLines + chCost > PAGE_CAPACITY_LINES) {
        pages.push(renderSingleTOCPage(currentItems, pages.length + 1));
        currentItems = [];
        usedLines = 0;
      }
      
      currentItems.push({ type: 'chapter', title: `CHAPTER ${String(chIdx + 1).padStart(2, '0')}. ${ch.title}`, pageNum: startPage });
      usedLines += chCost;

      ch.subTopics.forEach((st) => {
        if (usedLines + 1 > PAGE_CAPACITY_LINES) {
          pages.push(renderSingleTOCPage(currentItems, pages.length + 1));
          currentItems = [];
          usedLines = 0;
        }
        currentItems.push({ type: 'subtopic', title: st.title });
        usedLines += 1;
      });
    });

    if (currentItems.length > 0) {
      pages.push(renderSingleTOCPage(currentItems, pages.length + 1));
    }

    return pages;
  };

  const renderSingleTOCPage = (items: any[], pageIndex: number) => (
    <div key={pageIndex} className="a4-page shadow-2xl mb-12 flex-shrink-0 animate-in slide-in-from-bottom-4 duration-500 border border-slate-100">
      <div className="mb-8 border-b-2 border-slate-900 pb-3 flex justify-between items-end">
         <h2 className="text-2xl font-black text-slate-900 tracking-tighter uppercase">목차 (Contents)</h2>
         {pageIndex > 1 && <span className="text-[10px] font-black text-slate-400 mb-0.5 tracking-widest">(CONTINUED)</span>}
      </div>
      <div className="toc-content-wrapper">
        {items.map((item, idx) => (
          item.type === 'chapter' ? (
            <div key={idx} className="chapter-item">
              <div className="flex justify-between items-baseline">
                <span className="font-black text-[16px] text-slate-900 tracking-tight">{item.title}</span>
                <div className="flex-grow mx-2 border-b border-dotted border-slate-300 mb-1"></div>
                <span className="text-[14px] font-bold text-slate-600 min-w-[2rem] text-right">P.{item.pageNum}</span>
              </div>
            </div>
          ) : (
            <div key={idx} className="subtopic-item flex items-center gap-3 ml-6 py-1">
              <span className="w-1.5 h-1.5 bg-blue-600 rounded-full flex-shrink-0 opacity-30"></span>
              <span className="text-slate-600 font-medium">{item.title}</span>
            </div>
          )
        ))}
      </div>
      
      <div className="absolute bottom-[96px] left-[96px] right-[96px] border-t border-slate-100 pt-4 flex justify-between items-center text-slate-400">
        <span className="text-[9px] font-bold uppercase tracking-widest">전자책 작가 V{VERSION}</span>
        <span className="text-[12px] font-black text-slate-900 bg-slate-50 px-3 py-1 rounded">PAGE {pageIndex}</span>
      </div>
      
      <div className="absolute bottom-0 left-0 w-full h-[96px] pointer-events-none"></div>
    </div>
  );

  const totalSubTopicsCount = outline.length > 0 
    ? outline.reduce((acc, ch) => acc + ch.subTopics.length, 0)
    : (config.chapterCount * config.subTopicsPerChapter);

  const currentProgressCount = (currentChapterIdx * config.subTopicsPerChapter) + currentSubTopicIdx + 1;
  
  const progressPercent = Math.min(100, Math.round(((currentProgressCount - 1) / totalSubTopicsCount) * 100));

  const estimatedWordCount = writingContent ? writingContent.trim().split(/\s+/).length : 0;

  const formatEta = (seconds: number | null) => {
    if (seconds === null || seconds < 0) return "--:--";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-8 min-h-screen">
      <header className="flex flex-col md:flex-row justify-between items-center mb-8 gap-4">
        <div className="flex-grow w-full">
          <div className="flex justify-between items-center w-full">
            <h1 className="text-3xl font-black text-white flex items-center gap-2">
              <span className="bg-white text-blue-600 px-3 py-1 rounded-xl shadow-lg tracking-tight">전자책 작가</span>
              <span className="text-sm font-medium opacity-70 ml-2 tracking-widest">V{VERSION}</span>
            </h1>
            <div className="flex items-center gap-3">
              <button 
                onClick={handleExportPRD}
                className="bg-slate-800/40 hover:bg-slate-800 text-white text-[11px] font-black py-2 px-4 rounded-xl backdrop-blur-md border border-white/10 transition-all flex items-center gap-2 uppercase tracking-widest active:scale-95 shadow-lg"
              >
                <span>📄</span> PRD 내보내기
              </button>
              {!hasApiKey && (
                <button 
                  onClick={handleOpenKeySelector}
                  className="bg-yellow-400 hover:bg-yellow-500 text-black font-bold py-2 px-4 rounded-xl shadow-xl transition-all active:scale-95 flex items-center gap-2 text-xs"
                >
                  <span>🔑 API 키 설정</span>
                </button>
              )}
            </div>
          </div>
          <p className="text-white/80 mt-1 font-medium tracking-tight">인공지능 기반 고품질 전자책 자동 집필 솔루션</p>
        </div>
      </header>

      {fakeProgress > 0 && (
        <div className="fixed top-0 left-0 w-full h-1 z-[100]">
          <div className="h-full bg-blue-600 transition-all duration-300" style={{ width: `${fakeProgress}%` }}></div>
        </div>
      )}

      {step === AppStep.CONFIG && (
        <main className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start animate-in fade-in slide-in-from-bottom-4 duration-700">
          <div className="lg:col-span-4 space-y-4">
            <section className="bg-white/95 backdrop-blur shadow-2xl rounded-3xl p-6 border border-white/20">
              <h2 className="text-lg font-black mb-4 flex items-center gap-2 text-slate-800">
                <span className="w-1.5 h-6 bg-blue-600 rounded-full"></span>
                기본 설정
              </h2>
              <div className="space-y-3">
                <div className="flex flex-col gap-1">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">책의 종류</label>
                  <select 
                    value={config.bookType} 
                    onChange={e => setConfig({...config, bookType: e.target.value})}
                    className="w-full p-2.5 border rounded-xl text-sm bg-white font-bold outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {BOOK_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">저자의 포지션</label>
                  <select 
                    value={config.authorPosition} 
                    onChange={e => setConfig({...config, authorPosition: e.target.value})}
                    className="w-full p-2.5 border rounded-xl text-sm bg-white font-bold outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {AUTHOR_POSITIONS.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">책의 깊이</label>
                  <select 
                    value={config.bookDepth} 
                    onChange={e => setConfig({...config, bookDepth: e.target.value})}
                    className="w-full p-2.5 border rounded-xl text-sm bg-white font-bold outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {BOOK_DEPTHS.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">출판 목적</label>
                  <select 
                    value={config.purpose} 
                    onChange={e => setConfig({...config, purpose: e.target.value})}
                    className="w-full p-2.5 border rounded-xl text-sm bg-white font-bold outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {PURPOSES.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">대상 독자</label>
                  <input 
                    type="text" 
                    placeholder="예: 퇴사를 꿈꾸는 3년차 직장인"
                    value={config.reader} 
                    onChange={e => setConfig({...config, reader: e.target.value})}
                    className="w-full p-2.5 border rounded-xl text-sm bg-pink-50 text-black font-bold outline-none focus:ring-2 focus:ring-blue-500 shadow-sm"
                  />
                </div>
              </div>
            </section>

            <section className="bg-slate-900 shadow-2xl rounded-3xl p-6 text-white">
              <h2 className="text-lg font-black mb-4 flex items-center gap-2">
                <span className="w-1.5 h-6 bg-blue-500 rounded-full"></span>
                분량 설정
              </h2>
              <div className="grid grid-cols-1 gap-4">
                <ConfigNumber label="총 챕터 수 (Chapters)" value={config.chapterCount} onChange={val => setConfig({...config, chapterCount: val})} />
                <ConfigNumber label="챕터당 소주제 수 (Sections)" value={config.subTopicsPerChapter} onChange={val => setConfig({...config, subTopicsPerChapter: val})} />
                <ConfigNumber label="챕터당 예상 페이지 (Pages)" value={config.pagesPerChapter} onChange={val => setConfig({...config, pagesPerChapter: val})} />
              </div>
            </section>
          </div>

          <div className="lg:col-span-8 space-y-4">
            <div className="bg-white/95 backdrop-blur shadow-2xl rounded-3xl p-6 border border-white/20 h-full min-h-[500px] flex flex-col overflow-hidden">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-black text-slate-800 tracking-tighter">제목 기획 및 선택</h2>
                <button 
                  onClick={handleSuggestTitles}
                  disabled={isGeneratingTitles || !hasApiKey}
                  className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-black py-2.5 px-6 rounded-xl shadow-lg transition-all active:scale-95 flex items-center gap-2 text-sm"
                >
                  {isGeneratingTitles ? "기획 중..." : "AI 제목 추천받기"}
                </button>
              </div>

              {lastError && (
                <div className="mb-4 p-3 bg-red-50 text-red-600 border border-red-100 rounded-xl text-xs font-bold flex items-center gap-2">
                  <span className="text-sm">⚠️</span> {lastError}
                </div>
              )}

              {!hasSuggestedOnce ? (
                <div className="flex-grow flex flex-col items-center justify-center text-center opacity-40 py-12">
                  <div className="text-5xl mb-3">📚</div>
                  <p className="font-bold text-slate-500 text-sm">독자 정보를 입력하고 AI 추천을 받아보세요.</p>
                </div>
              ) : (
                <div className="flex-grow flex flex-col gap-4 overflow-hidden">
                  <div className="flex-grow overflow-y-auto pr-2 custom-scrollbar">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2 block">AI 추천 조합</label>
                    <div className="grid grid-cols-1 gap-2">
                      {suggestedTitles.map((t, i) => (
                        <button
                          key={i}
                          onClick={() => handleSelectTitle(t, suggestedSubtitles[i])}
                          className={`p-3 rounded-xl border transition-all hover:border-blue-500 text-left ${selectedTitle === t ? 'border-blue-600 bg-blue-50' : 'border-slate-100 bg-white'}`}
                        >
                          <div className="text-sm font-black text-slate-900 leading-tight mb-0.5">{t}</div>
                          <div className="text-[11px] font-medium text-slate-500 truncate">{suggestedSubtitles[i]}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="border-t pt-4 space-y-3">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">직접 수정 또는 입력</label>
                    <div className="grid grid-cols-1 gap-2">
                      <input 
                        type="text" 
                        placeholder="메인 제목"
                        value={manualTitle} 
                        onChange={e => setManualTitle(e.target.value)}
                        className="w-full p-3 border rounded-xl text-xl font-black bg-blue-50 focus:ring-2 focus:ring-blue-500 shadow-inner"
                      />
                      <input 
                        type="text" 
                        placeholder="부제"
                        value={manualSubtitle} 
                        onChange={e => setManualSubtitle(e.target.value)}
                        className="w-full p-3 border rounded-xl text-xl font-bold bg-blue-50 focus:ring-2 focus:ring-blue-500 shadow-inner"
                      />
                    </div>
                    <button 
                      onClick={startOutlineGeneration}
                      disabled={isGeneratingOutline || (!manualTitle && !selectedTitle)}
                      className="w-full bg-slate-900 hover:bg-black text-white font-black py-4 rounded-2xl shadow-xl transition-all active:scale-95 disabled:opacity-50 text-lg"
                    >
                      {isGeneratingOutline ? "목차 생성 중..." : "목차 및 커버 생성"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </main>
      )}

      {step === AppStep.OUTLINE && (
        <main className="animate-in fade-in slide-in-from-bottom-8 duration-700">
          <div className="bg-white/95 backdrop-blur-md shadow-2xl rounded-[40px] p-8 border border-white/20 overflow-hidden relative">
            
            <div className="flex flex-col md:flex-row gap-8 items-start mb-6">
              
              <div className="w-full md:w-[150px] flex-shrink-0">
                <div 
                  className="relative group cursor-pointer overflow-hidden rounded-lg shadow-xl border-2 border-white aspect-[210/297]" 
                  onDoubleClick={(e) => handleOpenCoverModal(e)}
                >
                  <img 
                    src={coverImage} 
                    alt="Cover" 
                    className="w-full h-full object-cover transition-transform group-hover:scale-[1.05]" 
                  />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity text-center p-2">
                    <span className="text-white font-bold text-[10px]">더블클릭: 디자인 설정/저장</span>
                  </div>
                </div>
              </div>

              <div className="flex-grow w-full">
                <div className="text-center mb-6">
                  <h2 className="text-4xl font-black text-slate-900 tracking-tighter leading-tight mb-1">
                    {manualTitle || selectedTitle}
                  </h2>
                  <p className="text-lg font-bold text-slate-500 tracking-tight">
                    {manualSubtitle || selectedSubtitle}
                  </p>
                </div>

                <div className="flex flex-col md:flex-row items-center justify-center gap-4">
                  <div className="bg-slate-50/80 p-4 rounded-2xl border border-slate-100 shadow-sm flex items-center justify-center min-w-[250px]">
                    <button 
                      onClick={handleCaptureToc}
                      className="bg-slate-900 hover:bg-black text-white font-black py-3.5 px-8 rounded-full shadow-lg transition-all active:scale-95 flex items-center gap-2 text-sm"
                    >
                      <span>📥</span> 목차 이미지 다운로드 (.zip)
                    </button>
                  </div>

                  <div className="bg-blue-50/30 p-4 rounded-2xl border border-blue-100 shadow-sm flex items-center justify-center min-w-[250px]">
                    <button 
                      onClick={startAutoWriting}
                      className="bg-blue-600 hover:bg-blue-700 text-white font-black py-3.5 px-12 rounded-full shadow-lg transition-all active:scale-95 flex items-center gap-2 text-sm"
                    >
                      자동집필 시작
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="w-full bg-black text-white py-2 mb-6 text-center">
              <h3 className="text-lg font-black uppercase tracking-[0.2em]">Table Of Contents</h3>
            </div>

            <div ref={tocContainerRef} className="flex flex-col items-center bg-slate-100/30 p-8 rounded-[40px] max-h-[1000px] overflow-y-auto custom-scrollbar border border-slate-100">
              {renderTOCPages()}
            </div>
          </div>
        </main>
      )}

      {step === AppStep.WRITING && (
        <main className="animate-in zoom-in-95 duration-500">
           <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
             <aside className="lg:col-span-4 space-y-6">
               <div className="bg-white/95 backdrop-blur shadow-2xl rounded-3xl p-6 border border-white/20">
                 <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest mb-4">집필 진행 상황</h3>
                 <div className="space-y-4">
                    <div className="flex justify-between items-end mb-1">
                      <span className="text-xs font-black text-blue-600 uppercase">PROGRESS</span>
                      <span className="text-2xl font-black text-slate-900">{progressPercent}%</span>
                    </div>
                    <div className="w-full bg-slate-100 h-4 rounded-full overflow-hidden border">
                      <div 
                        className="h-full bg-blue-600 transition-all duration-1000 ease-out shadow-[0_0_10px_rgba(37,99,235,0.4)]" 
                        style={{ width: `${progressPercent}%` }}
                      ></div>
                    </div>
                    <div className="grid grid-cols-2 gap-4 pt-2">
                       <div className="bg-slate-50 p-3 rounded-xl border">
                         <div className="text-[10px] font-bold text-slate-400 uppercase">예상 남은 시간</div>
                         <div className="text-sm font-black text-slate-800">{formatEta(etaSeconds)}</div>
                       </div>
                       <div className="bg-slate-50 p-3 rounded-xl border">
                         <div className="text-[10px] font-bold text-slate-400 uppercase">현재 작성 장수</div>
                         <div className="text-sm font-black text-slate-800">{currentProgressCount} / {totalSubTopicsCount}</div>
                       </div>
                    </div>
                 </div>
               </div>

               <div className="bg-slate-900 shadow-2xl rounded-3xl p-6 text-white overflow-hidden relative">
                  <div className="absolute -right-4 -top-4 w-24 h-24 bg-blue-500/20 rounded-full blur-3xl"></div>
                  <h3 className="text-sm font-black text-blue-400 uppercase tracking-widest mb-4">현재 목차 위치</h3>
                  <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                    {outline.map((ch, cIdx) => (
                      <div key={ch.id} className={`space-y-1 transition-opacity ${cIdx > currentChapterIdx ? 'opacity-30' : 'opacity-100'}`}>
                        <div className="text-xs font-black text-slate-400 uppercase tracking-tight">CHAPTER {cIdx + 1}</div>
                        <div className="text-sm font-bold truncate mb-2">{ch.title}</div>
                        <div className="pl-3 space-y-1 border-l-2 border-slate-700">
                          {ch.subTopics.map((st, sIdx) => {
                            const isCurrent = cIdx === currentChapterIdx && sIdx === currentSubTopicIdx;
                            const isDone = st.isCompleted;
                            return (
                              <div key={st.id} className={`text-xs flex items-center gap-2 py-1 ${isCurrent ? 'text-blue-400 font-black' : isDone ? 'text-emerald-400' : 'text-slate-500'}`}>
                                {isDone ? '✓' : isCurrent ? '●' : '○'} {st.title}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
               </div>
             </aside>

             <div className="lg:col-span-8 flex flex-col h-[800px]">
                <div className="bg-white shadow-2xl rounded-3xl overflow-hidden flex flex-col h-full border border-white/20">
                  <div className="bg-slate-50 border-b p-6 flex justify-between items-center">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white font-black shadow-lg">AI</div>
                      <div>
                        <div className="text-xs font-black text-slate-400 uppercase tracking-widest">자동 집필 중...</div>
                        <div className="text-sm font-black text-slate-800">{outline[currentChapterIdx]?.subTopics[currentSubTopicIdx]?.title}</div>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button 
                        onClick={handleCopyContent}
                        className="p-3 bg-white hover:bg-slate-50 border rounded-xl shadow-sm transition-all active:scale-95"
                        title="복사하기"
                      >
                        {isCopied ? "✅" : "📋"}
                      </button>
                    </div>
                  </div>
                  
                  <div 
                    ref={contentRef}
                    className="flex-grow p-10 overflow-y-auto bg-[#fafafa] custom-scrollbar selection:bg-blue-100"
                  >
                    {isGeneratingGeneral && !writingContent && (
                      <div className="flex flex-col items-center justify-center h-full text-slate-300 gap-4">
                        <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                        <p className="font-bold text-lg">AI가 원고를 생성하고 있습니다...</p>
                      </div>
                    )}
                    <div className="prose prose-slate max-w-none prose-p:leading-relaxed prose-headings:font-black whitespace-pre-wrap font-medium text-slate-700">
                      {writingContent}
                    </div>
                  </div>

                  <div className="bg-white border-t p-4 px-8 flex justify-between items-center">
                    <div className="text-xs font-bold text-slate-400 uppercase tracking-widest">ESTIMATED: {estimatedWordCount} WORDS</div>
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
                      <span className="text-xs font-black text-slate-800 uppercase tracking-widest">LIVE WRITING SESSION</span>
                    </div>
                  </div>
                </div>
             </div>
           </div>
        </main>
      )}

      {step === AppStep.FINISHED && (
        <main className="max-w-4xl mx-auto text-center animate-in zoom-in-95 duration-700 py-12">
          <div className="bg-white/95 backdrop-blur-xl shadow-2xl rounded-[60px] p-16 border border-white/20">
            <div className="w-32 h-32 bg-emerald-100 text-emerald-600 rounded-[40px] flex items-center justify-center text-6xl mx-auto mb-10 shadow-inner">🎉</div>
            <h2 className="text-5xl font-black text-slate-900 tracking-tighter mb-4">전자책 원고 완성!</h2>
            <p className="text-xl font-bold text-slate-500 mb-12 max-w-lg mx-auto leading-relaxed">축하합니다! AI가 책의 모든 챕터를 성공적으로 집필했습니다. 이제 원고를 다운로드하여 마무리하세요.</p>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-2xl mx-auto">
              <button 
                onClick={handleDownloadMd}
                className="group relative bg-slate-900 hover:bg-black text-white font-black py-6 rounded-3xl shadow-2xl transition-all active:scale-95 flex flex-col items-center gap-2 overflow-hidden"
              >
                <span className="text-2xl">📥</span>
                <span>Markdown 다운로드</span>
                <div className="absolute bottom-0 left-0 w-full h-1 bg-blue-500 scale-x-0 group-hover:scale-x-100 transition-transform origin-left"></div>
              </button>
              <button 
                onClick={() => window.location.reload()}
                className="bg-white hover:bg-slate-50 text-slate-900 border-2 border-slate-100 font-black py-6 rounded-3xl shadow-xl transition-all active:scale-95 flex flex-col items-center gap-2"
              >
                <span className="text-2xl">🔄</span>
                <span>새 책 쓰기</span>
              </button>
            </div>
          </div>
        </main>
      )}

      {/* Cover Modal - Improved logic and layout to prevent flickering/blank downloads */}
      {showCoverModal && (
        <div 
          className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onDoubleClick={(e) => { e.stopPropagation(); setShowCoverModal(false); }}
        >
          <div 
            className="relative bg-white rounded-[40px] shadow-[0_30px_100px_rgba(0,0,0,0.4)] w-full max-w-4xl overflow-hidden flex flex-col md:flex-row animate-in zoom-in-95 duration-300"
            onClick={(e) => e.stopPropagation()} 
          >
            {/* Left side: Preview Area */}
            <div className="md:w-1/2 bg-[#f8fafc] p-10 flex items-center justify-center min-h-[400px]">
               <div className="bg-white p-3 rounded-2xl shadow-xl border border-slate-100 max-w-[280px] w-full aspect-[210/297] relative overflow-hidden">
                 {isGeneratingGeneral ? (
                    <div className="flex flex-col items-center justify-center h-full gap-4 text-slate-300">
                      <div className="w-10 h-10 border-4 border-slate-200 border-t-blue-600 rounded-full animate-spin"></div>
                      <p className="font-black uppercase tracking-widest text-[10px]">표지 생성 중...</p>
                    </div>
                  ) : (
                    <img src={tempCoverImage} alt="Modal Preview" className="w-full h-full object-cover rounded-lg" />
                  )}
               </div>
            </div>
            
            <div className="md:w-1/2 p-10 flex flex-col justify-between">
              <div>
                <button 
                  onClick={() => setShowCoverModal(false)} 
                  className="absolute top-8 right-8 text-slate-300 hover:text-slate-900 text-3xl transition-colors"
                >✕</button>
                <h3 className="text-2xl font-black text-slate-900 tracking-tighter mb-2">표지 디자인 설정</h3>
                <p className="text-slate-500 font-bold mb-8 text-sm leading-snug">AI가 생성한 표지를 확인하고 원하는 요소를 추가하여 다시 그려보세요.</p>
                
                <div className="space-y-6">
                  <div className="flex flex-col gap-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">포함할 시각적 요소 (선택)</label>
                    <textarea 
                      placeholder="예: 푸른색 배경, 황금색 열쇠, 세련된 서체, 미래지향적 분위기..."
                      value={coverItemsInput}
                      onChange={e => setCoverItemsInput(e.target.value)}
                      className="w-full p-4 border rounded-2xl h-32 bg-[#f1f5f9] font-bold outline-none focus:ring-2 focus:ring-blue-500 transition-all text-slate-600 text-sm"
                    />
                  </div>
                  <button 
                    onClick={regenerateCoverWithItems}
                    disabled={isGeneratingGeneral}
                    className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 text-white font-black rounded-xl shadow-lg transition-all disabled:opacity-50 text-base"
                  >
                    디자인 재생성 요청
                  </button>
                </div>
              </div>

              <div className="flex gap-4 pt-8">
                <button 
                  onClick={downloadCoverAsJpg}
                  className="flex-grow py-4 bg-[#1e293b] hover:bg-slate-800 text-white font-black rounded-xl shadow-xl transition-all active:scale-95 flex items-center justify-center gap-2 text-sm"
                >
                  <span className="text-lg">📥</span> JPG 저장 (고품질)
                </button>
                <button 
                  onClick={saveCoverFromModal}
                  className="flex-grow py-4 bg-[#10b981] hover:bg-[#059669] text-white font-black rounded-xl shadow-xl transition-all active:scale-95 text-sm"
                >
                  확인 및 적용
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
	  {isKeyModalOpen && (
<div style={{position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.8)'}}>
<div style={{backgroundColor: 'white', padding: '40px', borderRadius: '30px', textAlign: 'center', color: 'black'}}>
<h3 style={{fontSize: '20px', fontWeight: 'bold', marginBottom: '20px'}}>Gemini API 키 입력</h3>
<input type="password" placeholder="AIza... 입력" style={{border: '1px solid #ccc', padding: '10px', width: '100%', marginBottom: '20px', borderRadius: '10px'}} onChange={(e) => { if(e.target.value.startsWith('AIza')) { setHasApiKey(true); } }} />
<button style={{backgroundColor: '#2563eb', color: 'white', padding: '10px 30px', borderRadius: '15px', border: 'none', fontWeight: 'bold'}} onClick={() => setIsKeyModalOpen(false)}>설정 완료</button>
</div>
</div>
)}
    </div>
  );
};

export default App;

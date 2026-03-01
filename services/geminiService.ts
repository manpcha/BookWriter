
import { GoogleGenAI, Type } from "@google/genai";
import { BookConfig, Chapter, SubTopic } from "../types.ts";

// Helper function to handle retries for API calls with exponential backoff
async function withRetry<T>(fn: () => Promise<T>, retries = 3, delay = 2500): Promise<T> {
  try {
    return await fn();
  } catch (error: any) {
    const isRetryable = error.status === 500 || error.status === 429 || 
                       error.message?.includes('Internal Server Error') ||
                       error.message?.includes('overloaded');
    if (retries > 0 && isRetryable) {
      console.warn(`API Error encountered. Retrying in ${delay}ms... (${retries} retries left)`);
      await new Promise(r => setTimeout(r, delay));
      return withRetry(fn, retries - 1, delay * 1.5);
    }
    throw error;
  }
}

// Generate book titles and subtitles using gemini-3-flash-preview
export const generateTitlesAndSubtitles = async (config: BookConfig): Promise<{titles: string[], subtitles: string[]}> => {
  return withRetry(async () => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const prompt = `
      전자책 제목과 부제를 추천해줘.
      책 종류: ${config.bookType}, 독자: ${config.reader}, 저자: ${config.authorPosition}, 목적: ${config.purpose}
      제목 10개와 부제 10개를 JSON으로 반환 (titles: string[], subtitles: string[])
    `;
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            titles: { type: Type.ARRAY, items: { type: Type.STRING } },
            subtitles: { type: Type.ARRAY, items: { type: Type.STRING } }
          },
          required: ["titles", "subtitles"],
          propertyOrdering: ["titles", "subtitles"]
        }
      }
    });
    try { return JSON.parse(response.text || '{"titles":[], "subtitles":[]}'); } catch (e) { return { titles: [], subtitles: [] }; }
  });
};

// Generate detailed ebook outline using gemini-3-flash-preview
export const generateEBookOutline = async (config: BookConfig, title: string, subtitle: string): Promise<Chapter[]> => {
  return withRetry(async () => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const prompt = `책 [${title}: ${subtitle}]의 상세 목차를 JSON으로 작성. 총 ${config.chapterCount}장, 장당 소주제 ${config.subTopicsPerChapter}개. 각 장과 소주제는 논리적이고 체계적이어야 함.`;
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              id: { type: Type.STRING },
              title: { type: Type.STRING },
              subTopics: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    id: { type: Type.STRING },
                    title: { type: Type.STRING },
                    isCompleted: { type: Type.BOOLEAN }
                  },
                  required: ["id", "title", "isCompleted"]
                }
              }
            },
            required: ["id", "title", "subTopics"]
          }
        }
      }
    });
    try { return JSON.parse(response.text || "[]"); } catch (e) { return []; }
  });
};

// Generate high-quality content for a specific subtopic using gemini-3-flash-preview for speed and efficiency
export const generateSubTopicContent = async (
  config: BookConfig, 
  chapterTitle: string, 
  subTopicTitle: string,
  bookTitle: string,
  bookSubtitle: string
): Promise<string> => {
  return withRetry(async () => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const prompt = `
      [전자책 본문 집필 지시서]
      책 제목: ${bookTitle} (${bookSubtitle})
      현재 챕터: ${chapterTitle}
      현재 소주제: ${subTopicTitle}

      [집필 규칙]
      1. 본문에는 어떠한 이미지 태그나 슬롯도 포함하지 마십시오.
      2. 오직 텍스트로만 구성된 고품질의 원고를 작성하십시오.
      3. ${config.authorPosition}의 전문적인 톤앤매너를 유지하며 독자(${config.reader})에게 실질적인 도움이 되는 내용을 상세히 서술하십시오.
      4. '### ${subTopicTitle}'로 시작하여 논리적이고 체계적인 설명을 제공하십시오.
      5. 최소 2000자 이상의 풍부한 분량으로 작성하십시오. 빠르고 명확하게 원고를 완성하십시오.
    `;
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: { temperature: 0.7 }
    });
    return response.text || "생성 실패";
  });
};

// Generate ebook cover image using gemini-3-pro-image-preview
export const generateCoverImage = async (title: string, subtitle: string, extraItems?: string): Promise<string> => {
  return withRetry(async () => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const prompt = `Premium minimalist ebook cover design. Title: "${title}". Subtitle: "${subtitle}". ${extraItems ? `Please MUST include visual elements related to: ${extraItems}.` : ''} 
    [Layout Rules]: Place the main title and subtitle in the upper-middle area (around the upper golden ratio point) typical of professional best-selling book covers. Ensure there is generous breathing room at the top and side margins. DO NOT place the text at the very top edge.
    Highly professional typography, abstract elegant background, professional business publishing style. Clear readability. Cinematic lighting. 3:4 aspect ratio.`;
    
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-image-preview',
      contents: { parts: [{ text: prompt }] },
      config: { 
        imageConfig: { aspectRatio: "3:4", imageSize: "1K" }
      }
    });
    
    if (!response.candidates?.[0]?.content?.parts) throw new Error("이미지 생성 실패");
    for (const part of response.candidates[0].content.parts) {
      if (part.inlineData) return `data:image/png;base64,${part.inlineData.data}`;
    }
    throw new Error("이미지 데이터 누락");
  });
};

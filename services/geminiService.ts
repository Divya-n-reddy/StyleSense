import { GoogleGenAI, Type, GenerateContentParameters } from "@google/genai";
import { StyleAnalysisResult, Occasion, BudgetRange, StyleVibe, TrendItem, PersonalColor } from "../types";

const extractJSON = (text: string) => {
  try {
    return JSON.parse(text);
  } catch (e) {
    const match = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (match && match[1]) {
      return JSON.parse(match[1].trim());
    }
    throw e;
  }
};

export const getOutfitRecommendations = async (
  occasion: Occasion,
  budget: BudgetRange,
  vibe: StyleVibe,
  base64Image?: string,
  userPalette?: PersonalColor
): Promise<StyleAnalysisResult> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  const paletteContext = userPalette 
    ? `Color Season: ${userPalette.season}. Best Colors: ${userPalette.bestColors.join(', ')}.`
    : "";

  const prompt = `Stylist Mode:
    Occasion: ${occasion}
    Style: ${vibe}
    Budget: ${budget}
    ${paletteContext}
    Generate 3 detailed outfits. Return JSON format.`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-flash-latest',
      contents: base64Image 
        ? { 
            parts: [
              { inlineData: { data: base64Image, mimeType: 'image/jpeg' } },
              { text: prompt }
            ] 
          }
        : prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            recommendations: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING },
                  name: { type: Type.STRING },
                  description: { type: Type.STRING },
                  keyItems: { type: Type.ARRAY, items: { type: Type.STRING } },
                  accessories: { type: Type.ARRAY, items: { type: Type.STRING } },
                  stylingTip: { type: Type.STRING },
                  seasonalContext: { type: Type.STRING },
                },
                required: ["id", "name", "description", "keyItems", "accessories", "stylingTip", "seasonalContext"]
              }
            },
            vibeSummary: { type: Type.STRING }
          },
          required: ["recommendations", "vibeSummary"]
        }
      }
    });
    return extractJSON(response.text || "{}");
  } catch (error) {
    console.error("Gemini API Error:", error);
    throw error;
  }
};

export const analyzePersonalColor = async (base64Image: string): Promise<PersonalColor> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const prompt = `Analyze seasonal color palette: Undertone, Season, best/avoid colors.`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-flash-latest',
      contents: {
        parts: [
          { inlineData: { data: base64Image, mimeType: 'image/jpeg' } },
          { text: prompt }
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            season: { type: Type.STRING, enum: ["Spring", "Summer", "Autumn", "Winter"] },
            undertone: { type: Type.STRING, enum: ["Warm", "Cool", "Neutral"] },
            bestColors: { type: Type.ARRAY, items: { type: Type.STRING } },
            avoidColors: { type: Type.ARRAY, items: { type: Type.STRING } },
            description: { type: Type.STRING }
          },
          required: ["season", "undertone", "bestColors", "avoidColors", "description"]
        }
      }
    });

    return extractJSON(response.text || "{}");
  } catch (error) {
    throw error;
  }
};

export const generateFashionImage = async (description: string, type: 'outfit' | 'moodboard' | 'palette' = 'outfit'): Promise<string | null> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  let prompt = "";
  let aspectRatio: "1:1" | "3:4" | "4:3" | "9:16" | "16:9" = "3:4";

  if (type === 'outfit') {
    prompt = `Editorial fashion shoot, high detail: ${description}. Professional studio lighting.`;
  } else if (type === 'moodboard') {
    prompt = `Aesthetic moodboard: ${description}. High fashion magazine style.`;
    aspectRatio = "16:9";
  } else {
    prompt = `Abstract color palette visualization for ${description}. Minimalist swatches.`;
    aspectRatio = "1:1";
  }

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: { parts: [{ text: prompt }] },
      config: { imageConfig: { aspectRatio } }
    });

    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) return `data:image/png;base64,${part.inlineData.data}`;
    }
    return null;
  } catch (error) {
    console.error("Image generation failed", error);
    throw error; // Rethrow to let App.tsx handle throttling
  }
};

export const getSeasonalTrends = async (): Promise<TrendItem[]> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-flash-latest',
      contents: "List 4 fashion trends today. JSON output.",
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              description: { type: Type.STRING },
              context: { type: Type.STRING }
            },
            required: ["title", "description", "context"]
          }
        }
      }
    });
    return extractJSON(response.text || "[]");
  } catch (error) {
    return [];
  }
};
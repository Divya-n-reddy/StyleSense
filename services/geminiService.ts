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
    throw new Error("Could not parse AI response as JSON.");
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
    ? `User Palette: ${userPalette.season}. Suit: ${userPalette.bestColors.join(', ')}. Avoid: ${userPalette.avoidColors.join(', ')}.`
    : "";

  const prompt = `Act as a luxury fashion stylist. 
    Task: Suggest 3 outfits for ${occasion} in ${vibe} style (Budget: ${budget}).
    ${paletteContext}
    ${base64Image ? "The user provided an image of an item; integrate it into the outfits." : ""}
    Output ONLY valid JSON.`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
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
  const prompt = `Perform a seasonal color analysis on this user portrait. Output JSON.`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
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
    prompt = `Professional fashion model wearing: ${description}. High-end editorial style.`;
  } else if (type === 'moodboard') {
    prompt = `Fashion trend moodboard: ${description}. Magazine layout.`;
    aspectRatio = "16:9";
  } else {
    prompt = `Minimalist color swatch grid for ${description}.`;
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
    // If it's a 429, we log it and return null so the UI can handle missing images gracefully
    console.warn("Image generation limit reached (429)");
    throw error; 
  }
};

export const getSeasonalTrends = async (): Promise<TrendItem[]> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: "List 4 current fashion trends for 2024. Return JSON.",
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
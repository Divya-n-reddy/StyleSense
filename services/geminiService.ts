
import { GoogleGenAI, Type } from "@google/genai";
import { StyleAnalysisResult, Occasion, BudgetRange, StyleVibe, TrendItem, PersonalColor } from "../types";

const getApiKey = () => {
  const key = process.env.API_KEY;
  if (!key || key === "undefined" || key === "null" || key.trim() === "") return null;
  return key;
};

export const getOutfitRecommendations = async (
  occasion: Occasion,
  budget: BudgetRange,
  vibe: StyleVibe,
  base64Image?: string,
  userPalette?: PersonalColor
): Promise<StyleAnalysisResult> => {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error("API_KEY_MISSING");

  const ai = new GoogleGenAI({ apiKey });
  const paletteContext = userPalette 
    ? `The user's color season is ${userPalette.season}. Recommend colors like ${userPalette.bestColors.join(', ')}. Avoid ${userPalette.avoidColors.join(', ')}.`
    : "";

  const prompt = `Act as a senior fashion stylist. 
    Create 3 distinct, high-end outfit recommendations for:
    Occasion: ${occasion}
    Vibe: ${vibe}
    Budget Context: ${budget}
    ${paletteContext}
    ${base64Image ? "Integrate the clothing item from the attached image into these looks." : "Create complete fresh looks."}
    
    Return a JSON object with:
    - recommendations: Array of 3 outfits (name, description, keyItems[], accessories[], stylingTip, seasonalContext)
    - vibeSummary: A short, 1-2 sentence atmospheric summary of the overall style direction.`;

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
  
  return JSON.parse(response.text || "{}");
};

export const generateFashionImage = async (description: string, type: 'outfit' | 'moodboard' = 'outfit'): Promise<string | null> => {
  const apiKey = getApiKey();
  if (!apiKey) return null;
  
  const ai = new GoogleGenAI({ apiKey });
  
  let prompt = "";
  let aspectRatio: "1:1" | "3:4" | "4:3" | "9:16" | "16:9" = "3:4";

  if (type === 'outfit') {
    prompt = `Editorial fashion photography. A full outfit: ${description}. Neutral chic background, soft lighting.`;
  } else {
    prompt = `Aesthetic fashion moodboard for ${description}. Clean magazine layout.`;
    aspectRatio = "16:9";
  }

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image', // Reverted to model that works on free-tier API keys
      contents: { parts: [{ text: prompt }] },
      config: { 
        imageConfig: { 
          aspectRatio
          // imageSize is only for gemini-3-pro-image-preview
        } 
      }
    });

    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) return `data:image/png;base64,${part.inlineData.data}`;
    }
    return null;
  } catch (error: any) {
    console.error("Image generation failed:", error);
    throw error;
  }
};

export const analyzePersonalColor = async (base64Image: string): Promise<PersonalColor> => {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error("API_KEY_MISSING");

  const ai = new GoogleGenAI({ apiKey });
  const prompt = `Perform a seasonal color analysis on this portrait. Determine if the user is Spring, Summer, Autumn, or Winter. Return JSON.`;

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

  return JSON.parse(response.text || "{}");
};

export const getSeasonalTrends = async (): Promise<TrendItem[]> => {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error("API_KEY_MISSING");

  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: "List 4 current high-end fashion trends. Return JSON.",
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
  return JSON.parse(response.text || "[]");
};

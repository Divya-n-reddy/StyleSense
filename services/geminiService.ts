
import { GoogleGenAI, Type, GenerateContentParameters } from "@google/genai";
import { StyleAnalysisResult, Occasion, BudgetRange, StyleVibe, TrendItem, PersonalColor } from "../types";

/**
 * Generates outfit recommendations based on user preferences and optional color palette.
 */
export const getOutfitRecommendations = async (
  occasion: Occasion,
  budget: BudgetRange,
  vibe: StyleVibe,
  base64Image?: string,
  userPalette?: PersonalColor
): Promise<StyleAnalysisResult> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  const paletteContext = userPalette 
    ? `The user has been analyzed as a "${userPalette.season}" (${userPalette.undertone} undertone). 
       ONLY recommend items in their best colors: ${userPalette.bestColors.join(', ')}. 
       AVOID these colors: ${userPalette.avoidColors.join(', ')}.`
    : "";

  const prompt = `You are an expert AI fashion stylist. 
    Analyze the user's request:
    - Occasion: ${occasion}
    - Style Preference: ${vibe}
    - Budget: ${budget}
    ${paletteContext}
    
    CRITICAL: Adhere strictly to the budget of "${budget}". 
    ${base64Image ? "The user provided an image. Build outfits that complement this piece." : "Provide general outfit ideas."}
    
    Provide exactly 3 distinct outfit recommendations.`;

  const parameters: GenerateContentParameters = {
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
  };

  try {
    const response = await ai.models.generateContent(parameters);
    return JSON.parse(response.text || "{}") as StyleAnalysisResult;
  } catch (error) {
    console.error("Gemini API Error:", error);
    throw error;
  }
};

/**
 * Analyzes a user's face to determine their seasonal color palette.
 */
export const analyzePersonalColor = async (base64Image: string): Promise<PersonalColor> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const prompt = `Analyze this person's facial features for Seasonal Color Analysis.
    1. Determine skin undertone (Warm/Cool/Neutral).
    2. Determine their "Season" (Spring, Summer, Autumn, or Winter).
    3. List 5 specific colors that make them "glow".
    4. List 3 colors they should avoid.
    5. Provide a brief explanation of why this season fits them.`;

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

    return JSON.parse(response.text || "{}") as PersonalColor;
  } catch (error) {
    console.error("Color Analysis Error:", error);
    throw error;
  }
};

export const generateFashionImage = async (description: string, type: 'outfit' | 'moodboard' | 'palette' = 'outfit'): Promise<string | null> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  let prompt = "";
  let aspectRatio: "1:1" | "3:4" | "4:3" | "9:16" | "16:9" = "3:4";

  if (type === 'outfit') {
    prompt = `A high-fashion professional photoshoot of a model wearing: ${description}. Photorealistic, soft studio lighting.`;
  } else if (type === 'moodboard') {
    prompt = `A creative fashion moodboard and aesthetic collage for: ${description}. Artistic, elegant.`;
    aspectRatio = "16:9";
  } else {
    prompt = `A professional graphic design layout of a color palette for a "${description}" fashion personality. Clean circles of colors, minimalist, elegant, labeled.`;
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
    return null;
  }
};

export const getSeasonalTrends = async (): Promise<TrendItem[]> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: "List 4 current major fashion trends for the current season. Provide a title, a short description, and context.",
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
  } catch (error) {
    return [];
  }
};

import { GoogleGenAI, Type, GenerateContentParameters } from "@google/genai";
import { StyleAnalysisResult, Occasion, BudgetRange, StyleVibe, TrendItem, PersonalColor } from "../types";

const extractJSON = (text: string) => {
  try {
    // Attempt standard parse first
    return JSON.parse(text);
  } catch (e) {
    // Handle cases where model wraps JSON in markdown code blocks
    const match = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (match && match[1]) {
      return JSON.parse(match[1].trim());
    }
    throw e;
  }
};

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
    ? `The user's color season is "${userPalette.season}" (${userPalette.undertone}). 
       Recommend colors that suit them: ${userPalette.bestColors.join(', ')}. 
       Avoid: ${userPalette.avoidColors.join(', ')}.`
    : "";

  const prompt = `You are a world-class AI fashion stylist. 
    Analyze request:
    - Occasion: ${occasion}
    - Style: ${vibe}
    - Budget Level: ${budget}
    ${paletteContext}
    
    ${base64Image ? "Integrate the item in the attached image into the outfits." : "Create 3 full head-to-toe looks."}
    
    Return exactly 3 distinct outfit recommendations.`;

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
    return extractJSON(response.text || "{}");
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
  
  const prompt = `Analyze facial features for Seasonal Color Analysis:
    1. Undertone (Warm/Cool/Neutral).
    2. Season (Spring, Summer, Autumn, or Winter).
    3. 5 best colors.
    4. 3 avoid colors.
    5. Reasoning.`;

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
    console.error("Color Analysis Error:", error);
    throw error;
  }
};

export const generateFashionImage = async (description: string, type: 'outfit' | 'moodboard' | 'palette' = 'outfit'): Promise<string | null> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  let prompt = "";
  let aspectRatio: "1:1" | "3:4" | "4:3" | "9:16" | "16:9" = "3:4";

  if (type === 'outfit') {
    prompt = `High-end professional fashion photography of: ${description}. Soft lighting, clean background.`;
  } else if (type === 'moodboard') {
    prompt = `Aesthetic fashion moodboard for: ${description}. Creative layout.`;
    aspectRatio = "16:9";
  } else {
    prompt = `Minimalist graphic design of a color palette swatch for "${description}".`;
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
      contents: "List 4 major current fashion trends. Title, description, and context.",
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
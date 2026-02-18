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
    // Final fallback: try to find first { and last }
    const startIdx = text.indexOf('{');
    const endIdx = text.lastIndexOf('}');
    if (startIdx !== -1 && endIdx !== -1) {
      return JSON.parse(text.substring(startIdx, endIdx + 1));
    }
    throw new Error("Could not parse AI response. The model may have reached its limit.");
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
    ? `The user's color season is ${userPalette.season}. Recommend colors like ${userPalette.bestColors.join(', ')}. Avoid ${userPalette.avoidColors.join(', ')}.`
    : "";

  const prompt = `Act as a senior fashion stylist. 
    Create 3 head-to-toe outfits for the following:
    Occasion: ${occasion}
    Vibe: ${vibe}
    Budget: ${budget}
    ${paletteContext}
    ${base64Image ? "Integrate the specific clothing item provided in the image into these outfits." : ""}
    
    Response must be a strict JSON object following the schema provided. No conversational text outside JSON.`;

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
    console.error("Stylist API Error:", error);
    throw error;
  }
};

export const analyzePersonalColor = async (base64Image: string): Promise<PersonalColor> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const prompt = `Perform a professional seasonal color analysis. Analyze skin undertone and eye depth to determine if they are Spring, Summer, Autumn, or Winter. Provide a reasoning and list colors.`;

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
    prompt = `Professional high-end editorial fashion photography of a model wearing: ${description}. Soft studio lighting, minimalist background.`;
  } else if (type === 'moodboard') {
    prompt = `Aesthetic fashion moodboard for the trend: ${description}. Magazine layout style.`;
    aspectRatio = "16:9";
  } else {
    prompt = `Elegant graphic color swatch for ${description}.`;
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
    throw error; 
  }
};

export const getSeasonalTrends = async (): Promise<TrendItem[]> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: "Identify 4 current fashion trends for the current season. Focus on silhouettes and color palettes. Return JSON.",
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
    throw error;
  }
};
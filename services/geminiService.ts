
import { GoogleGenAI, Type } from "@google/genai";
import { StyleAnalysisResult, Occasion, BudgetRange, StyleVibe, TrendItem, PersonalColor } from "../types";

// Mock data for Demo Mode
const MOCK_RECOMMENDATIONS: StyleAnalysisResult = {
  vibeSummary: "A sophisticated blend of modern tailoring and effortless grace, perfect for a curated wardrobe.",
  recommendations: [
    {
      id: "demo-1",
      name: "The Urban Architect",
      description: "A structured look featuring a charcoal blazer paired with tapered trousers and a silk camisole.",
      keyItems: ["Structured Charcoal Blazer", "Tapered Wool Trousers", "Silk Camisole"],
      accessories: ["Geometric Gold Earrings", "Leather Loafers", "Minimalist Tote"],
      stylingTip: "Roll up the blazer sleeves slightly to reveal a contrasting lining for an effortless touch.",
      seasonalContext: "Perfect for transitional Autumn weather."
    },
    {
      id: "demo-2",
      name: "Midnight Minimalist",
      description: "A sleek, all-black ensemble that plays with textures: matte leather meets soft cashmere.",
      keyItems: ["Cashmere Mock-neck", "Vegan Leather Skirt", "Oversized Wool Coat"],
      accessories: ["Silver Chain Belt", "Chelsea Boots", "Statement Watch"],
      stylingTip: "Mix matte and shiny black fabrics to add depth to a monochromatic palette.",
      seasonalContext: "Ideal for evening events in Winter."
    },
    {
      id: "demo-3",
      name: "Solstice Linen",
      description: "Breathable neutrals focusing on relaxed silhouettes and natural fibers.",
      keyItems: ["Linen Wide-leg Pants", "Cropped Cotton Vest", "Sandals"],
      accessories: ["Straw Boater Hat", "Woven Bag", "Tortoise Shell Shades"],
      stylingTip: "Keep the color palette within three shades of beige for a high-end resort look.",
      seasonalContext: "Best suited for high Summer heat."
    }
  ]
};

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
  
  if (!apiKey) {
    console.info("StyleSense: Running in Demo Mode (No API Key detected)");
    return new Promise((resolve) => setTimeout(() => resolve(MOCK_RECOMMENDATIONS), 1200));
  }

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
    
    return JSON.parse(response.text || "{}");
  } catch (error) {
    console.error("Stylist API Error:", error);
    return MOCK_RECOMMENDATIONS;
  }
};

export const analyzePersonalColor = async (base64Image: string): Promise<PersonalColor> => {
  const apiKey = getApiKey();
  if (!apiKey) {
    return {
      season: "Autumn",
      undertone: "Warm",
      bestColors: ["Rust", "Olive Green", "Mustard Yellow", "Cream"],
      avoidColors: ["Hot Pink", "Electric Blue", "Pure White"],
      description: "You have warm, rich undertones that harmonize beautifully with earth tones and spiced shades."
    };
  }

  const ai = new GoogleGenAI({ apiKey });
  const prompt = `Perform a seasonal color analysis on this portrait. Determine if the user is Spring, Summer, Autumn, or Winter based on skin undertone and contrast. Provide reasoning.`;

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

    return JSON.parse(response.text || "{}");
  } catch (error) {
    console.error("Lab Analysis Error:", error);
    throw error;
  }
};

export const generateFashionImage = async (description: string, type: 'outfit' | 'moodboard' | 'palette' = 'outfit'): Promise<string | null> => {
  const apiKey = getApiKey();
  if (!apiKey) return null;
  
  const ai = new GoogleGenAI({ apiKey });
  let prompt = "";
  let aspectRatio: "1:1" | "3:4" | "4:3" | "9:16" | "16:9" = "3:4";

  if (type === 'outfit') {
    prompt = `Editorial fashion photography, high-end magazine style. Model wearing: ${description}. Neutral chic background, soft daylight.`;
  } else if (type === 'moodboard') {
    prompt = `Aesthetic fashion collage moodboard for ${description}. High fashion magazine layout.`;
    aspectRatio = "16:9";
  } else {
    prompt = `Minimalist luxury color palette swatch for ${description}, artistic layout.`;
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
    console.warn("Image generation failed:", error);
    return null;
  }
};

export const getSeasonalTrends = async (): Promise<TrendItem[]> => {
  const apiKey = getApiKey();
  if (!apiKey) {
    return [
      { title: "Quiet Luxury", description: "Minimalist pieces with premium fabrics.", context: "Global Trend" },
      { title: "Eclectic Grandpa", description: "Vintage knits and loafers.", context: "Street Style" },
      { title: "Corporate Siren", description: "Sharp office-wear with a feminine edge.", context: "Workwear" },
      { title: "Red Accents", description: "A pop of cherry red in every look.", context: "Color Trend" }
    ];
  }

  const ai = new GoogleGenAI({ apiKey });
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: "List 4 top fashion trends for the current real-world season. Return JSON format.",
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
    console.error("Trends Error:", error);
    throw error;
  }
};

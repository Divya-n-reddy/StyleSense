
export enum Occasion {
  CASUAL = 'Casual',
  FORMAL = 'Formal',
  WORK = 'Work/Business',
  DATE = 'Date Night',
  STREETWEAR = 'Streetwear',
  SPORTY = 'Sporty/Athleisure',
  PARTY = 'Party/Clubbing'
}

export enum BudgetRange {
  BUDGET = 'Budget Friendly ($)',
  MID = 'Mid-Range ($$)',
  PREMIUM = 'Premium/Luxury ($$$)'
}

export enum StyleVibe {
  MINIMALIST = 'Minimalist',
  BOHEMIAN = 'Bohemian',
  CHIC = 'Chic',
  EDGY = 'Edgy',
  CLASSIC = 'Classic',
  VINTAGE = 'Vintage',
  EXPERIMENTAL = 'Experimental'
}

export interface PersonalColor {
  season: 'Spring' | 'Summer' | 'Autumn' | 'Winter';
  undertone: 'Warm' | 'Cool' | 'Neutral';
  bestColors: string[];
  avoidColors: string[];
  description: string;
  paletteImageUrl?: string;
}

export interface OutfitRecommendation {
  id: string;
  name: string;
  description: string;
  keyItems: string[];
  accessories: string[];
  stylingTip: string;
  seasonalContext: string;
  imageUrl?: string;
}

export interface StyleAnalysisResult {
  recommendations: OutfitRecommendation[];
  detectedColors?: string[];
  clothingTypeDetected?: string;
  vibeSummary: string;
}

export interface TrendItem {
  title: string;
  description: string;
  context: string;
  trendImageUrl?: string;
}

export interface SavedOutfit extends OutfitRecommendation {
  savedAt: number;
}

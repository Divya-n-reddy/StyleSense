import React, { useState, useRef, useEffect } from 'react';
import { Occasion, BudgetRange, StyleVibe, StyleAnalysisResult, TrendItem, SavedOutfit, OutfitRecommendation, PersonalColor } from './types';
import { getOutfitRecommendations, generateFashionImage, getSeasonalTrends, analyzePersonalColor } from './services/geminiService';
import { Button } from './components/Button';
import { OutfitCard } from './components/OutfitCard';

type Tab = 'stylist' | 'wardrobe' | 'trends' | 'lab';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Tab>('stylist');
  const [occasion, setOccasion] = useState<Occasion>(Occasion.CASUAL);
  const [budget, setBudget] = useState<BudgetRange>(BudgetRange.MID);
  const [vibe, setVibe] = useState<StyleVibe>(StyleVibe.MINIMALIST);
  const [image, setImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<StyleAnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [softWarning, setSoftWarning] = useState<string | null>(null);
  
  const [userPalette, setUserPalette] = useState<PersonalColor | null>(null);
  const [loadingLab, setLoadingLab] = useState(false);
  const [labImage, setLabImage] = useState<string | null>(null);

  const [savedOutfits, setSavedOutfits] = useState<SavedOutfit[]>([]);
  const [trends, setTrends] = useState<TrendItem[]>([]);
  const [loadingTrends, setLoadingTrends] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const labInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const storedWardrobe = localStorage.getItem('stylesense_wardrobe');
    if (storedWardrobe) setSavedOutfits(JSON.parse(storedWardrobe));
    
    const storedPalette = localStorage.getItem('stylesense_palette');
    if (storedPalette) setUserPalette(JSON.parse(storedPalette));

    if (!process.env.API_KEY) {
      setError("API Key missing! Add 'API_KEY' to your Environment Variables.");
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'trends' && trends.length === 0) fetchTrends();
  }, [activeTab]);

  const parseError = (e: any): string => {
    const msg = e?.message || "";
    if (msg.includes("429") || msg.includes("RESOURCE_EXHAUSTED")) return "Daily limit reached. Try again in 60 seconds.";
    return msg || "An unknown error occurred.";
  };

  const fetchTrends = async () => {
    setLoadingTrends(true);
    setError(null);
    try {
      const data = await getSeasonalTrends();
      setTrends(data);
      for (let i = 0; i < data.length; i++) {
        try {
          const url = await generateFashionImage(data[i].title, 'moodboard');
          if (url) setTrends(prev => {
            const up = [...prev];
            up[i] = { ...up[i], trendImageUrl: url };
            return up;
          });
          await new Promise(r => setTimeout(r, 1500)); // Throttling
        } catch (err) {
          console.warn("Trend image skipped due to quota");
        }
      }
    } catch (e: any) { 
      setError(`Trend error: ${parseError(e)}`);
    } finally { 
      setLoadingTrends(false); 
    }
  };

  const handleLabAnalysis = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64 = reader.result as string;
        setLabImage(base64);
        setLoadingLab(true);
        setError(null);
        try {
          const analysis = await analyzePersonalColor(base64.split(',')[1]);
          setUserPalette(analysis);
          localStorage.setItem('stylesense_palette', JSON.stringify(analysis));
          // Attempt image but don't crash if fails
          try {
            const paletteUrl = await generateFashionImage(`${analysis.season} Palette`, 'palette');
            if (paletteUrl) {
              const updated = { ...analysis, paletteImageUrl: paletteUrl };
              setUserPalette(updated);
              localStorage.setItem('stylesense_palette', JSON.stringify(updated));
            }
          } catch (imgErr) {}
        } catch (e: any) { 
          setError(`Lab error: ${parseError(e)}`);
        } finally { 
          setLoadingLab(false); 
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleGenerate = async () => {
    setLoading(true);
    setError(null);
    setSoftWarning(null);
    try {
      const base64Data = image ? image.split(',')[1] : undefined;
      const data = await getOutfitRecommendations(occasion, budget, vibe, base64Data, userPalette || undefined);
      setResult(data);
      
      // Attempt image generation one by one
      for (let i = 0; i < data.recommendations.length; i++) {
        try {
          const outfit = data.recommendations[i];
          const url = await generateFashionImage(`${outfit.name}: ${outfit.description}`);
          if (url) {
            setResult(prev => {
              if (!prev) return null;
              const recs = [...prev.recommendations];
              recs[i] = { ...recs[i], imageUrl: url };
              return { ...prev, recommendations: recs };
            });
          }
          await new Promise(r => setTimeout(r, 1800)); // Be very gentle with quota
        } catch (imgError: any) {
          if (imgError?.message?.includes("429")) {
            setSoftWarning("Style text ready! (Image limits reached for now)");
            break; // Stop trying images to save remaining quota
          }
        }
      }
    } catch (e: any) { 
      setError(`Stylist error: ${parseError(e)}`);
    } finally { 
      setLoading(false); 
    }
  };

  const handleSaveOutfit = (outfit: OutfitRecommendation) => {
    const isSaved = savedOutfits.some(o => o.id === outfit.id);
    let updated;
    if (isSaved) {
      updated = savedOutfits.filter(o => o.id !== outfit.id);
    } else {
      updated = [{ ...outfit, savedAt: Date.now() }, ...savedOutfits];
    }
    setSavedOutfits(updated);
    localStorage.setItem('stylesense_wardrobe', JSON.stringify(updated));
  };

  return (
    <div className="min-h-screen pb-20 selection:bg-amber-200">
      {error && (
        <div className="bg-red-600 text-white text-center py-3 px-4 text-sm font-bold sticky top-0 z-[100] flex items-center justify-center gap-4">
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)} className="bg-white/20 px-2 py-1 rounded">✕</button>
        </div>
      )}
      
      {softWarning && (
        <div className="bg-amber-500 text-white text-center py-2 px-4 text-xs font-bold sticky top-0 z-[90] flex items-center justify-center gap-4">
          <span className="flex-1">✨ {softWarning}</span>
          <button onClick={() => setSoftWarning(null)} className="hover:opacity-75">✕</button>
        </div>
      )}

      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-gray-100 py-4">
        <div className="max-w-6xl mx-auto px-4 flex justify-between items-center">
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => setActiveTab('stylist')}>
            <div className="w-8 h-8 bg-black rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-xl">S</span>
            </div>
            <h1 className="text-xl font-serif font-bold tracking-tight">StyleSense</h1>
          </div>
          <nav className="flex gap-4 md:gap-8 text-xs md:text-sm font-medium text-gray-400">
            <button onClick={() => setActiveTab('stylist')} className={activeTab === 'stylist' ? 'text-black font-bold' : 'hover:text-black'}>Stylist</button>
            <button onClick={() => setActiveTab('lab')} className={activeTab === 'lab' ? 'text-amber-600 font-bold' : 'hover:text-black'}>Palette Lab ✨</button>
            <button onClick={() => setActiveTab('wardrobe')} className={activeTab === 'wardrobe' ? 'text-black font-bold' : 'hover:text-black'}>Wardrobe</button>
            <button onClick={() => setActiveTab('trends')} className={activeTab === 'trends' ? 'text-black font-bold' : 'hover:text-black'}>Trends</button>
          </nav>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 mt-8 lg:mt-12">
        {activeTab === 'lab' && (
          <div className="max-w-4xl mx-auto space-y-12 animate-in fade-in slide-in-from-bottom-4">
            <div className="text-center space-y-4">
              <h2 className="text-5xl font-serif font-bold">The Palette Lab</h2>
              <p className="text-gray-500 max-w-xl mx-auto text-lg">Revel your best colors based on your natural features.</p>
            </div>

            <div className="grid md:grid-cols-2 gap-12 items-center">
              <div className={`aspect-square rounded-[3rem] overflow-hidden border-8 border-white shadow-2xl relative flex items-center justify-center bg-gray-50 ${loadingLab ? 'animate-pulse' : ''}`}>
                {labImage ? (
                  <img src={labImage} className="w-full h-full object-cover" />
                ) : (
                  <div className="text-center p-8 space-y-4">
                    <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center mx-auto shadow-sm text-3xl">✨</div>
                    <Button onClick={() => labInputRef.current?.click()}>Upload Portrait</Button>
                  </div>
                )}
                {loadingLab && (
                  <div className="absolute inset-0 bg-black/40 backdrop-blur-sm flex flex-col items-center justify-center text-white text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-4 border-white border-t-transparent mb-4"></div>
                    <p className="font-bold">Analyzing features...</p>
                  </div>
                )}
                <input type="file" ref={labInputRef} onChange={handleLabAnalysis} className="hidden" accept="image/*" />
              </div>

              <div className="space-y-8">
                {userPalette ? (
                  <div className="space-y-6">
                    <h3 className="text-4xl font-serif font-bold">You're a <span className="text-amber-600 italic">{userPalette.season}</span></h3>
                    <div className="p-4 bg-gray-50 rounded-2xl">
                      <p className="text-[10px] font-bold text-gray-400 uppercase">Best Shades</p>
                      <div className="flex flex-wrap gap-2 mt-2">
                        {userPalette.bestColors.map(c => <span key={c} className="px-3 py-1 bg-white border border-gray-100 rounded-full text-xs font-medium">{c}</span>)}
                      </div>
                    </div>
                    <p className="text-gray-600 italic leading-relaxed">"{userPalette.description}"</p>
                    <Button onClick={() => setActiveTab('stylist')} className="w-full">Get Personalized Recommendations</Button>
                  </div>
                ) : (
                  <div className="space-y-6 text-gray-500">
                    <p className="text-lg">Don't guess your colors. Let AI find what makes you glow.</p>
                    <ul className="space-y-4">
                      <li className="flex items-center gap-3">
                        <span className="w-6 h-6 rounded-full bg-blue-50 text-blue-500 flex items-center justify-center text-[10px] font-bold">1</span>
                        <span>Use a selfie in even lighting.</span>
                      </li>
                      <li className="flex items-center gap-3">
                        <span className="w-6 h-6 rounded-full bg-pink-50 text-pink-500 flex items-center justify-center text-[10px] font-bold">2</span>
                        <span>We analyze skin, eyes, and hair depth.</span>
                      </li>
                    </ul>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'stylist' && (
          <>
            {!result ? (
              <div className="grid lg:grid-cols-2 gap-12 items-start">
                <div className="space-y-6">
                  <h2 className="text-5xl lg:text-7xl font-serif font-semibold leading-[1.1] text-gray-900">Style, <span className="text-amber-600 italic">Redefined</span>.</h2>
                  <p className="text-lg text-gray-500 max-w-md">Your 24/7 personal stylist powered by Gemini AI.</p>
                  
                  <div className="bg-white p-8 rounded-3xl shadow-xl border border-gray-100 space-y-6 mt-8">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      <div>
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-2">Occasion</label>
                        <select value={occasion} onChange={(e) => setOccasion(e.target.value as Occasion)} className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl outline-none text-sm">
                          {Object.values(Occasion).map(v => <option key={v} value={v}>{v}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-2">Style</label>
                        <select value={vibe} onChange={(e) => setVibe(e.target.value as StyleVibe)} className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl outline-none text-sm">
                          {Object.values(StyleVibe).map(v => <option key={v} value={v}>{v}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-2">Budget</label>
                        <select value={budget} onChange={(e) => setBudget(e.target.value as BudgetRange)} className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl outline-none text-sm">
                          {Object.values(BudgetRange).map(v => <option key={v} value={v}>{v}</option>)}
                        </select>
                      </div>
                    </div>
                    <Button loading={loading} onClick={handleGenerate} className="w-full py-4 text-lg">Generate Lookbook</Button>
                  </div>
                </div>

                <div className="relative aspect-[4/5] bg-gray-100 rounded-[2.5rem] overflow-hidden border-4 border-white shadow-2xl flex flex-col items-center justify-center p-8">
                  {image ? (
                    <>
                      <img src={image} alt="Ref" className="absolute inset-0 w-full h-full object-cover" />
                      <button onClick={() => setImage(null)} className="absolute top-4 right-4 bg-white/80 p-2 rounded-full z-10 shadow-sm">✕</button>
                    </>
                  ) : (
                    <div className="text-center space-y-4">
                      <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center mx-auto shadow-sm">🧥</div>
                      <p className="text-gray-500 text-sm">Optional: Add a base item</p>
                      <Button variant="outline" className="text-xs" onClick={() => fileInputRef.current?.click()}>Upload Image</Button>
                      <input type="file" ref={fileInputRef} onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          const reader = new FileReader();
                          reader.onloadend = () => setImage(reader.result as string);
                          reader.readAsDataURL(file);
                        }
                      }} className="hidden" accept="image/*" />
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-12">
                <div className="flex justify-between items-end">
                  <div className="space-y-2">
                    <Button variant="outline" onClick={() => setResult(null)} className="px-4 py-2 text-xs mb-4">← Start Over</Button>
                    <h2 className="text-4xl font-serif font-bold">Curated Styles</h2>
                    <p className="text-gray-500 max-w-2xl">{result.vibeSummary}</p>
                  </div>
                </div>
                <div className="grid md:grid-cols-3 gap-8">
                  {result.recommendations.map((outfit, i) => (
                    <OutfitCard key={outfit.id} outfit={outfit} index={i} onSave={handleSaveOutfit} isSaved={savedOutfits.some(o => o.id === outfit.id)} />
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {activeTab === 'wardrobe' && (
          <div className="space-y-12">
             <div className="text-center space-y-4">
                <h2 className="text-5xl font-serif font-bold">Lookbook</h2>
                <p className="text-gray-500">Your collection of saved inspirations.</p>
             </div>
             {savedOutfits.length === 0 ? (
               <div className="bg-white border-2 border-dashed border-gray-100 rounded-[2rem] p-20 text-center">
                  <p className="text-gray-400">Empty lookbook.</p>
                  <Button onClick={() => setActiveTab('stylist')} className="mt-4 text-sm">Explore Trends</Button>
               </div>
             ) : (
               <div className="grid md:grid-cols-3 gap-8">
                 {savedOutfits.map((outfit, i) => (
                   <OutfitCard key={outfit.id} outfit={outfit} index={i} onSave={handleSaveOutfit} isSaved={true} />
                 ))}
               </div>
             )}
          </div>
        )}

        {activeTab === 'trends' && (
          <div className="space-y-12">
             <div className="text-center space-y-4">
                <h2 className="text-5xl font-serif font-bold">Global Trends</h2>
                <p className="text-gray-500">Curated from the world's fashion capitals.</p>
             </div>
             {loadingTrends ? (
               <div className="grid md:grid-cols-2 gap-8">
                 {[1,2,3,4].map(i => <div key={i} className="h-64 bg-gray-100 rounded-[2rem] animate-pulse"></div>)}
               </div>
             ) : (
               <div className="grid md:grid-cols-2 gap-8">
                 {trends.map((trend, i) => (
                   <div key={i} className="bg-white border border-gray-100 rounded-[2rem] overflow-hidden group">
                      <div className="h-56 bg-gray-50 relative overflow-hidden">
                        {trend.trendImageUrl ? (
                          <img src={trend.trendImageUrl} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" alt="" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-gray-300 text-xs">Visualizing trend...</div>
                        )}
                      </div>
                      <div className="p-8">
                        <h3 className="text-2xl font-serif font-bold text-gray-900 mb-2">{trend.title}</h3>
                        <p className="text-gray-600 text-sm mb-4 leading-relaxed">{trend.description}</p>
                        <div className="text-[10px] font-bold uppercase text-amber-600 bg-amber-50 px-3 py-1 rounded-full w-fit tracking-widest">{trend.context}</div>
                      </div>
                   </div>
                 ))}
               </div>
             )}
          </div>
        )}
      </main>
    </div>
  );
};

export default App;
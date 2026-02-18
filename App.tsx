import React, { useState, useCallback, useRef, useEffect } from 'react';
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

    if (!process.env.API_KEY || process.env.API_KEY === "") {
      setError("API Key missing! Add 'API_KEY' to your Vercel Environment Variables.");
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'trends' && trends.length === 0) fetchTrends();
  }, [activeTab]);

  const parseErrorMessage = (e: any): string => {
    const msg = e?.message || "";
    if (msg.includes("429") || msg.includes("RESOURCE_EXHAUSTED")) {
      return "Rate limit reached. Please wait 60 seconds and try again.";
    }
    if (msg.includes("API_KEY_INVALID") || msg.includes("403")) {
      return "Invalid API Key. Please check your Vercel settings.";
    }
    return msg || "An unexpected error occurred.";
  };

  const fetchTrends = async () => {
    setLoadingTrends(true);
    setError(null);
    try {
      const data = await getSeasonalTrends();
      setTrends(data);
      
      // Sequential image generation to avoid 429
      for (let i = 0; i < data.length; i++) {
        const trend = data[i];
        try {
          const url = await generateFashionImage(trend.title, 'moodboard');
          if (url) setTrends(prev => {
            const up = [...prev];
            up[i] = { ...up[i], trendImageUrl: url };
            return up;
          });
          // Small delay between requests
          await new Promise(r => setTimeout(r, 800));
        } catch (err) {
          console.warn(`Failed to load image for trend ${i}`);
        }
      }
    } catch (e: any) { 
      setError(`Trend fetch failed: ${parseErrorMessage(e)}`);
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
          const paletteUrl = await generateFashionImage(`${analysis.season} Palette`, 'palette');
          const finalAnalysis = { ...analysis, paletteImageUrl: paletteUrl || undefined };
          setUserPalette(finalAnalysis);
          localStorage.setItem('stylesense_palette', JSON.stringify(finalAnalysis));
        } catch (e: any) { 
          setError(`Analysis error: ${parseErrorMessage(e)}`);
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
    try {
      const base64Data = image ? image.split(',')[1] : undefined;
      const data = await getOutfitRecommendations(occasion, budget, vibe, base64Data, userPalette || undefined);
      setResult(data);
      
      // Sequential image generation to avoid triggering 429
      for (let i = 0; i < data.recommendations.length; i++) {
        const outfit = data.recommendations[i];
        try {
          const url = await generateFashionImage(`${outfit.name}: ${outfit.description}`);
          if (url) {
            setResult(prev => {
              if (!prev) return null;
              const recs = [...prev.recommendations];
              recs[i] = { ...recs[i], imageUrl: url };
              return { ...prev, recommendations: recs };
            });
          }
          // Small delay to be kind to the API rate limit
          await new Promise(r => setTimeout(r, 1000));
        } catch (imgError) {
          console.warn("Image generation throttled for recommendation", i);
        }
      }
    } catch (e: any) { 
      setError(`Stylist error: ${parseErrorMessage(e)}`);
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
        <div className="bg-red-600 text-white text-center py-3 px-4 text-sm font-bold sticky top-0 z-[100] shadow-lg flex items-center justify-center gap-4">
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)} className="bg-white/20 hover:bg-white/40 px-3 py-1 rounded text-xs">Dismiss</button>
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
            <button onClick={() => setActiveTab('stylist')} className={`${activeTab === 'stylist' ? 'text-black font-bold' : 'hover:text-black'}`}>Stylist</button>
            <button onClick={() => setActiveTab('lab')} className={`${activeTab === 'lab' ? 'text-amber-600 font-bold' : 'hover:text-black'}`}>Palette Lab ✨</button>
            <button onClick={() => setActiveTab('wardrobe')} className={`${activeTab === 'wardrobe' ? 'text-black font-bold' : 'hover:text-black'}`}>Wardrobe</button>
            <button onClick={() => setActiveTab('trends')} className={`${activeTab === 'trends' ? 'text-black font-bold' : 'hover:text-black'}`}>Trends</button>
          </nav>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 mt-8 lg:mt-12">
        {activeTab === 'lab' && (
          <div className="max-w-4xl mx-auto space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <div className="text-center space-y-4">
              <h2 className="text-5xl font-serif font-bold">The Palette Lab</h2>
              <p className="text-gray-500 max-w-xl mx-auto text-lg">AI-powered seasonal color analysis for your unique features.</p>
            </div>

            <div className="grid md:grid-cols-2 gap-12 items-center">
              <div className={`aspect-square rounded-[3rem] overflow-hidden border-8 border-white shadow-2xl relative flex items-center justify-center bg-gray-50 ${loadingLab ? 'animate-pulse' : ''}`}>
                {labImage ? (
                  <img src={labImage} className="w-full h-full object-cover" />
                ) : (
                  <div className="text-center p-8 space-y-4">
                    <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center mx-auto shadow-sm text-3xl">✨</div>
                    <Button onClick={() => labInputRef.current?.click()}>Upload Selfie</Button>
                  </div>
                )}
                {loadingLab && (
                  <div className="absolute inset-0 bg-black/40 backdrop-blur-sm flex flex-col items-center justify-center text-white p-8 text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-4 border-white border-t-transparent mb-4"></div>
                    <p className="font-bold">Analyzing Tone...</p>
                  </div>
                )}
                <input type="file" ref={labInputRef} onChange={handleLabAnalysis} className="hidden" accept="image/*" />
              </div>

              <div className="space-y-8">
                {userPalette ? (
                  <div className="space-y-6 animate-in fade-in slide-in-from-right-4">
                    <div className="inline-block px-4 py-1 bg-amber-50 text-amber-700 rounded-full text-xs font-bold uppercase tracking-widest">Result</div>
                    <h3 className="text-4xl font-serif font-bold">You're a <span className="text-amber-600 italic">{userPalette.season}</span></h3>
                    <div className="p-4 bg-gray-50 rounded-2xl">
                      <p className="text-[10px] font-bold text-gray-400 uppercase mb-1">Undertone</p>
                      <p className="font-bold">{userPalette.undertone}</p>
                    </div>
                    <p className="text-gray-600 italic">"{userPalette.description}"</p>
                    <div className="space-y-2">
                       <p className="text-[10px] font-bold text-gray-400 uppercase">Best Colors</p>
                       <div className="flex flex-wrap gap-2">
                         {userPalette.bestColors.map(c => <span key={c} className="px-3 py-1 bg-gray-100 rounded-full text-sm font-medium">{c}</span>)}
                       </div>
                    </div>
                    <Button onClick={() => setActiveTab('stylist')} className="w-full">Apply Palette</Button>
                  </div>
                ) : (
                  <div className="space-y-6 text-gray-500">
                    <p className="text-lg">Discover the colors that work with your biology, not against it.</p>
                    <ul className="space-y-4">
                      <li className="flex items-center gap-3">
                        <span className="w-6 h-6 rounded-full bg-blue-50 text-blue-500 flex items-center justify-center text-[10px] font-bold">1</span>
                        <span>Use a front-facing photo in natural light.</span>
                      </li>
                      <li className="flex items-center gap-3">
                        <span className="w-6 h-6 rounded-full bg-pink-50 text-pink-500 flex items-center justify-center text-[10px] font-bold">2</span>
                        <span>Our AI maps skin, hair, and eyes.</span>
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
            {userPalette && (
              <div className="mb-8 p-4 bg-amber-50/50 border border-amber-100 rounded-2xl flex items-center justify-between">
                <p className="text-sm font-medium text-amber-900">✨ Personalized for your <span className="font-bold">{userPalette.season}</span> palette.</p>
                <button onClick={() => setActiveTab('lab')} className="text-xs font-bold text-amber-600 hover:underline">Edit</button>
              </div>
            )}

            {!result ? (
              <div className="grid lg:grid-cols-2 gap-12 items-start">
                <div className="space-y-6">
                  <h2 className="text-5xl lg:text-7xl font-serif font-semibold leading-[1.1] text-gray-900">Your <span className="text-amber-600 italic">Personal</span> AI Stylist.</h2>
                  <p className="text-lg text-gray-500 max-w-md leading-relaxed">Curated looks based on your occasion, vibe, and color profile.</p>
                  <div className="bg-white p-8 rounded-3xl shadow-xl border border-gray-100 space-y-6 mt-8">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      <div>
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-2">Occasion</label>
                        <select value={occasion} onChange={(e) => setOccasion(e.target.value as Occasion)} className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl outline-none text-sm">
                          {Object.values(Occasion).map(v => <option key={v} value={v}>{v}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-2">Vibe</label>
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
                    <Button loading={loading} onClick={handleGenerate} className="w-full py-4 text-lg">Generate Style Guide</Button>
                  </div>
                </div>
                <div className="relative group aspect-[4/5] bg-gray-100 rounded-[2.5rem] overflow-hidden border-4 border-white shadow-2xl flex flex-col items-center justify-center p-8">
                  {image ? (
                    <>
                      <img src={image} alt="Uploaded" className="absolute inset-0 w-full h-full object-cover" />
                      <button onClick={() => setImage(null)} className="absolute top-4 right-4 bg-white/80 p-2 rounded-full z-10">✕</button>
                    </>
                  ) : (
                    <div className="text-center space-y-4">
                      <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center mx-auto shadow-sm">👕</div>
                      <p className="text-gray-500 text-sm">Upload a clothing item (optional)</p>
                      <Button variant="outline" className="text-xs" onClick={() => fileInputRef.current?.click()}>Choose File</Button>
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
                    <Button variant="outline" onClick={() => setResult(null)} className="px-4 py-2 text-xs mb-4">← Back to Inputs</Button>
                    <h2 className="text-4xl font-serif font-bold">Curated for You</h2>
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
          <div className="space-y-8">
             <div className="text-center space-y-4">
                <h2 className="text-5xl font-serif font-bold">Your Wardrobe</h2>
                <p className="text-gray-500">Styles you've curated and saved.</p>
             </div>
             {savedOutfits.length === 0 ? (
               <div className="bg-white border-2 border-dashed border-gray-100 rounded-[2rem] p-20 text-center">
                  <p className="text-gray-400">Lookbook is currently empty.</p>
                  <Button onClick={() => setActiveTab('stylist')} className="mt-4 text-sm">Explore Styles</Button>
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
                <p className="text-gray-500">What's trending in the fashion world right now.</p>
             </div>
             {loadingTrends ? (
               <div className="grid md:grid-cols-2 gap-8">
                 {[1,2,3,4].map(i => <div key={i} className="h-64 bg-gray-100 rounded-[2rem] animate-pulse"></div>)}
               </div>
             ) : (
               <div className="grid md:grid-cols-2 gap-8">
                 {trends.map((trend, i) => (
                   <div key={i} className="bg-white border border-gray-100 rounded-[2rem] overflow-hidden">
                      <div className="h-56 bg-gray-50 relative overflow-hidden">
                        {trend.trendImageUrl && <img src={trend.trendImageUrl} className="w-full h-full object-cover" alt="" />}
                      </div>
                      <div className="p-8">
                        <h3 className="text-2xl font-serif font-bold text-gray-900 mb-2">{trend.title}</h3>
                        <p className="text-gray-600 text-sm mb-4 leading-relaxed">{trend.description}</p>
                        <div className="text-[10px] font-bold uppercase text-amber-600 bg-amber-50 px-3 py-1 rounded-full w-fit tracking-wider">{trend.context}</div>
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
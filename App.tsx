
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
  const [isDemo, setIsDemo] = useState(false);
  
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

    // Robust API key detection for UI state
    const key = process.env.API_KEY;
    const hasKey = key && key !== "undefined" && key !== "null" && key.trim() !== "";
    setIsDemo(!hasKey);
  }, []);

  const parseError = (e: any): string => {
    const msg = e?.message || "";
    if (msg.includes("429") || msg.includes("RESOURCE_EXHAUSTED")) {
      return "Rate limit exceeded. Please wait a moment and try again.";
    }
    return msg || "An unexpected connection error occurred.";
  };

  const fetchTrends = async () => {
    setLoadingTrends(true);
    setError(null);
    try {
      const data = await getSeasonalTrends();
      setTrends(data);
      if (!isDemo) {
        for (let i = 0; i < data.length; i++) {
          try {
            const url = await generateFashionImage(data[i].title, 'moodboard');
            if (url) {
              setTrends(prev => {
                const updated = [...prev];
                updated[i] = { ...updated[i], trendImageUrl: url };
                return updated;
              });
            }
            await new Promise(r => setTimeout(r, 1500));
          } catch (err) {}
        }
      }
    } catch (e: any) { 
      setError(`Trends failed: ${parseError(e)}`);
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
        } catch (e: any) { 
          setError(`Analysis failed: ${parseError(e)}`);
        } finally { 
          setLoadingLab(false); 
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleGenerate = async () => {
    if (loading) return;
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const base64Data = image ? image.split(',')[1] : undefined;
      const data = await getOutfitRecommendations(occasion, budget, vibe, base64Data, userPalette || undefined);
      setResult(data);
      setLoading(false);

      if (!isDemo) {
        for (let i = 0; i < data.recommendations.length; i++) {
          await new Promise(r => setTimeout(r, 2000));
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
          } catch (imgError: any) {}
        }
      }
    } catch (e: any) { 
      setError(`Stylist error: ${parseError(e)}`);
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
    <div className="min-h-screen pb-20 selection:bg-amber-100 luxury-gradient">
      {isDemo && (
        <div className="bg-amber-500 text-white text-[10px] font-black uppercase tracking-[0.3em] py-2 text-center sticky top-0 z-[110] shadow-sm">
          StyleSense Preview Mode
        </div>
      )}

      {error && (
        <div className="bg-black text-white text-center py-4 px-6 text-xs font-bold sticky top-0 z-[100] flex items-center justify-between gap-4 shadow-2xl animate-in slide-in-from-top duration-500">
          <div className="flex items-center gap-3">
            <span className="bg-red-500 w-2 h-2 rounded-full"></span>
            <span className="flex-1 text-left">{error}</span>
          </div>
          <button onClick={() => setError(null)} className="hover:opacity-50 transition-opacity">CLOSE</button>
        </div>
      )}

      <header className="sticky top-0 z-50 glass-panel py-4 transition-all duration-300">
        <div className="max-w-6xl mx-auto px-6 flex justify-between items-center">
          <div className="flex items-center gap-3 cursor-pointer group" onClick={() => setActiveTab('stylist')}>
            <div className="w-9 h-9 bg-black rounded-lg flex items-center justify-center shadow-lg group-hover:scale-105 transition-transform">
              <span className="text-white font-serif text-xl">S</span>
            </div>
            <h1 className="text-xl font-serif font-bold tracking-tight">StyleSense</h1>
          </div>
          <nav className="hidden md:flex gap-10 text-[10px] font-bold uppercase tracking-[0.2em] text-gray-400">
            <button onClick={() => setActiveTab('stylist')} className={activeTab === 'stylist' ? 'text-black border-b border-black' : 'hover:text-black transition-colors'}>Stylist</button>
            <button onClick={() => setActiveTab('lab')} className={activeTab === 'lab' ? 'text-amber-600 border-b border-amber-600' : 'hover:text-black transition-colors'}>Palette Lab</button>
            <button onClick={() => setActiveTab('wardrobe')} className={activeTab === 'wardrobe' ? 'text-black border-b border-black' : 'hover:text-black transition-colors'}>Lookbook</button>
            <button onClick={() => setActiveTab('trends')} className={activeTab === 'trends' ? 'text-black border-b border-black' : 'hover:text-black transition-colors'}>Trends</button>
          </nav>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 mt-12">
        {activeTab === 'lab' && (
          <div className="max-w-4xl mx-auto space-y-16 animate-in fade-in slide-in-from-bottom-6 duration-700">
            <div className="text-center space-y-4">
              <h2 className="text-5xl font-serif font-bold italic">The Palette Lab</h2>
              <p className="text-gray-400 text-sm tracking-widest uppercase">Personal Color Analysis</p>
            </div>

            <div className="grid lg:grid-cols-2 gap-16 items-start">
              <div className={`aspect-square rounded-[3rem] overflow-hidden border-[12px] border-white shadow-2xl relative flex items-center justify-center bg-gray-50 transition-all ${loadingLab ? 'scale-95 grayscale' : 'hover:scale-[1.02]'}`}>
                {labImage ? (
                  <img src={labImage} className="w-full h-full object-cover" />
                ) : (
                  <div className="text-center p-12 space-y-6">
                    <div className="w-16 h-16 bg-white rounded-full mx-auto flex items-center justify-center shadow-md text-3xl">📷</div>
                    <p className="text-gray-400 text-xs font-medium max-w-[200px] mx-auto leading-relaxed">Upload a clear photo for analysis.</p>
                    <Button onClick={() => labInputRef.current?.click()} className="text-[10px] tracking-widest uppercase">Select Portrait</Button>
                  </div>
                )}
                {loadingLab && (
                  <div className="absolute inset-0 bg-white/60 backdrop-blur-md flex flex-col items-center justify-center text-black text-center p-6">
                    <div className="w-12 h-12 border-2 border-black border-t-transparent animate-spin rounded-full mb-4"></div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.2em]">Analyzing Tones</p>
                  </div>
                )}
                <input type="file" ref={labInputRef} onChange={handleLabAnalysis} className="hidden" accept="image/*" />
              </div>

              <div className="space-y-10">
                {userPalette ? (
                  <div className="space-y-8 animate-in fade-in slide-in-from-right-8">
                    <div>
                      <h3 className="text-4xl font-serif font-bold text-gray-900">Season: <span className="text-amber-700 italic underline decoration-1 underline-offset-8">{userPalette.season}</span></h3>
                      <div className="mt-4 inline-block px-4 py-1 bg-amber-50 text-amber-800 text-[10px] font-black uppercase tracking-widest rounded-full border border-amber-100">
                        {userPalette.undertone} Undertone
                      </div>
                    </div>
                    <div className="p-6 bg-white/50 border border-white rounded-3xl">
                      <p className="text-gray-600 text-sm italic leading-loose">"{userPalette.description}"</p>
                    </div>
                    <div className="space-y-4">
                      <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.3em]">Power Palette</p>
                      <div className="flex flex-wrap gap-2">
                        {userPalette.bestColors.map(c => (
                          <span key={c} className="px-5 py-2 bg-white text-black shadow-sm rounded-full text-[10px] font-bold border border-gray-100">
                            {c}
                          </span>
                        ))}
                      </div>
                    </div>
                    <Button onClick={() => setActiveTab('stylist')} className="w-full text-[10px] tracking-[0.2em] uppercase py-5">Apply to Stylist</Button>
                  </div>
                ) : (
                  <div className="space-y-8">
                    <p className="text-lg text-gray-600 leading-relaxed font-serif">Discover your <span className="italic">true colors</span>. Our AI helps curate a wardrobe that perfectly complements your skin, hair, and eyes.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'stylist' && (
          <div className="animate-in fade-in duration-700">
            {!result ? (
              <div className="grid lg:grid-cols-2 gap-20 items-center">
                <div className="space-y-8">
                  <div className="space-y-3">
                    <p className="text-[10px] font-black uppercase tracking-[0.3em] text-amber-700">Style Intelligence</p>
                    <h2 className="text-6xl lg:text-8xl font-serif font-semibold leading-[0.9]">Style<br />Your <span className="text-amber-600 italic">Way</span>.</h2>
                  </div>
                  <p className="text-gray-500 max-w-sm leading-relaxed text-sm">Experience personalized AI styling designed to elevate your everyday looks.</p>
                  <div className="bg-white/40 p-10 rounded-[2.5rem] shadow-xl border border-white/60 space-y-8 mt-12 backdrop-blur-sm">
                    <div className="grid md:grid-cols-3 gap-6">
                      <div className="space-y-2">
                        <label className="text-[9px] font-black uppercase tracking-widest text-gray-400 ml-1">Occasion</label>
                        <select value={occasion} onChange={(e) => setOccasion(e.target.value as Occasion)} className="w-full p-3 bg-white/80 border-none rounded-xl text-[11px] font-bold outline-none focus:ring-1 focus:ring-black">
                          {Object.values(Occasion).map(v => <option key={v} value={v}>{v}</option>)}
                        </select>
                      </div>
                      <div className="space-y-2">
                        <label className="text-[9px] font-black uppercase tracking-widest text-gray-400 ml-1">Vibe</label>
                        <select value={vibe} onChange={(e) => setVibe(e.target.value as StyleVibe)} className="w-full p-3 bg-white/80 border-none rounded-xl text-[11px] font-bold outline-none focus:ring-1 focus:ring-black">
                          {Object.values(StyleVibe).map(v => <option key={v} value={v}>{v}</option>)}
                        </select>
                      </div>
                      <div className="space-y-2">
                        <label className="text-[9px] font-black uppercase tracking-widest text-gray-400 ml-1">Budget</label>
                        <select value={budget} onChange={(e) => setBudget(e.target.value as BudgetRange)} className="w-full p-3 bg-white/80 border-none rounded-xl text-[11px] font-bold outline-none focus:ring-1 focus:ring-black">
                          {Object.values(BudgetRange).map(v => <option key={v} value={v}>{v}</option>)}
                        </select>
                      </div>
                    </div>
                    <Button loading={loading} onClick={handleGenerate} className="w-full text-[10px] py-5 tracking-[0.3em] font-black uppercase shadow-lg">Generate Looks</Button>
                  </div>
                </div>

                <div className="aspect-[4/5] bg-gray-50 rounded-[3rem] border-[10px] border-white shadow-2xl overflow-hidden relative group cursor-pointer" onClick={() => !image && fileInputRef.current?.click()}>
                  {image ? (
                    <img src={image} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center p-16 text-center space-y-6">
                      <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center text-4xl shadow-md">👗</div>
                      <p className="font-bold text-sm tracking-tight">Add a piece from your closet</p>
                    </div>
                  )}
                  <input type="file" ref={fileInputRef} onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      const reader = new FileReader();
                      reader.onloadend = () => setImage(reader.result as string);
                      reader.readAsDataURL(file);
                    }
                  }} className="hidden" accept="image/*" />
                </div>
              </div>
            ) : (
              <div className="space-y-16 animate-in fade-in zoom-in-95 duration-1000">
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-8 border-b border-gray-100 pb-10">
                  <div className="space-y-4">
                    <button onClick={() => setResult(null)} className="text-[10px] font-black text-gray-400 hover:text-black mb-4 uppercase tracking-[0.2em]">← New Search</button>
                    <h2 className="text-5xl font-serif font-bold italic">The Edit</h2>
                    <p className="text-gray-500 text-sm max-w-2xl leading-loose">{result.vibeSummary}</p>
                  </div>
                </div>
                <div className="grid lg:grid-cols-3 gap-12">
                  {result.recommendations.map((outfit, i) => (
                    <OutfitCard key={outfit.id} outfit={outfit} index={i} onSave={handleSaveOutfit} isSaved={savedOutfits.some(o => o.id === outfit.id)} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'wardrobe' && (
          <div className="space-y-16 animate-in fade-in slide-in-from-bottom-6 duration-700">
             <div className="text-center space-y-4">
                <h2 className="text-5xl font-serif font-bold italic">Lookbook</h2>
                <p className="text-gray-400 text-[10px] uppercase tracking-[0.3em]">Your Saved Style</p>
             </div>
             {savedOutfits.length === 0 ? (
               <div className="bg-white/40 border border-white rounded-[3rem] p-32 text-center shadow-sm">
                  <p className="text-gray-400 text-sm">Your lookbook is currently empty.</p>
               </div>
             ) : (
               <div className="grid lg:grid-cols-3 gap-12">
                 {savedOutfits.map((outfit, i) => (
                   <OutfitCard key={outfit.id} outfit={outfit} index={i} onSave={handleSaveOutfit} isSaved={true} />
                 ))}
               </div>
             )}
          </div>
        )}

        {activeTab === 'trends' && (
          <div className="space-y-16 animate-in fade-in slide-in-from-bottom-6 duration-700">
             <div className="text-center space-y-4">
                <h2 className="text-5xl font-serif font-bold italic">Trends</h2>
                <p className="text-gray-400 text-[10px] uppercase tracking-[0.3em]">Global Style Pulse</p>
             </div>
             {trends.length === 0 && !loadingTrends && (
               <div className="flex justify-center">
                 <Button onClick={fetchTrends} className="text-[10px] tracking-[0.2em] px-12 py-5 font-black">Scan Trends</Button>
               </div>
             )}
             <div className="grid lg:grid-cols-2 gap-10">
               {trends.map((trend, i) => (
                 <div key={i} className="bg-white/60 backdrop-blur-sm rounded-[2.5rem] overflow-hidden group border border-white shadow-xl p-10 space-y-4">
                    <div className="text-[9px] font-black uppercase text-amber-700 bg-amber-50 px-3 py-1 rounded-full w-fit">{trend.context}</div>
                    <h3 className="text-3xl font-serif font-bold text-gray-900">{trend.title}</h3>
                    <p className="text-gray-500 text-sm leading-relaxed">{trend.description}</p>
                 </div>
               ))}
             </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default App;

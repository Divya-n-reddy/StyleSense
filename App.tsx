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

    // Critical check for Vercel users
    if (!process.env.API_KEY || process.env.API_KEY === "") {
      setError("API Key not found. Please ensure API_KEY is set in your Vercel Project Settings.");
    }
  }, []);

  const parseError = (e: any): string => {
    const msg = e?.message || "";
    if (msg.includes("429") || msg.includes("RESOURCE_EXHAUSTED")) {
      return "Rate limit exceeded. Please wait a moment and try again.";
    }
    if (msg.includes("API_KEY_INVALID")) {
      return "Invalid API Key. Please check your configuration.";
    }
    return msg || "An unexpected connection error occurred.";
  };

  const fetchTrends = async () => {
    setLoadingTrends(true);
    setError(null);
    try {
      const data = await getSeasonalTrends();
      setTrends(data);
      // Progressive loading of trend visuals
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
        } catch (err) {
          console.warn(`Trend image skipped: ${data[i].title}`);
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
          
          // Background task: get palette visual
          try {
            const paletteUrl = await generateFashionImage(`${analysis.season} Seasonal Palette`, 'palette');
            if (paletteUrl) {
              const updated = { ...analysis, paletteImageUrl: paletteUrl };
              setUserPalette(updated);
              localStorage.setItem('stylesense_palette', JSON.stringify(updated));
            }
          } catch (imgErr) {}
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
    setSoftWarning(null);
    setResult(null);

    try {
      const base64Data = image ? image.split(',')[1] : undefined;
      const data = await getOutfitRecommendations(occasion, budget, vibe, base64Data, userPalette || undefined);
      setResult(data);
      setLoading(false); // Stop main spinner immediately to show text

      // Progressive Image Generation
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
        } catch (imgError: any) {
          if (imgError?.message?.includes("429")) {
            setSoftWarning("Style text ready! Visuals are loading slowly due to server demand.");
            break; 
          }
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
      {error && (
        <div className="bg-black text-white text-center py-4 px-6 text-xs font-bold sticky top-0 z-[100] flex items-center justify-between gap-4 shadow-2xl animate-in slide-in-from-top duration-500">
          <div className="flex items-center gap-3">
            <span className="bg-red-500 w-2 h-2 rounded-full"></span>
            <span className="flex-1 text-left">{error}</span>
          </div>
          <button onClick={() => setError(null)} className="hover:opacity-50 transition-opacity">CLOSE</button>
        </div>
      )}
      
      {softWarning && (
        <div className="bg-amber-50 text-amber-900 text-center py-2 px-4 text-[10px] font-bold sticky top-0 z-[90] flex items-center justify-center gap-4 border-b border-amber-100">
          <span className="flex-1 uppercase tracking-widest">✨ {softWarning}</span>
          <button onClick={() => setSoftWarning(null)} className="hover:opacity-50">✕</button>
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
          {/* Mobile Nav Trigger could go here */}
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 mt-12">
        {activeTab === 'lab' && (
          <div className="max-w-4xl mx-auto space-y-16 animate-in fade-in slide-in-from-bottom-6 duration-700">
            <div className="text-center space-y-4">
              <h2 className="text-5xl font-serif font-bold italic">The Palette Lab</h2>
              <p className="text-gray-400 text-sm tracking-widest uppercase">Professional Color Analysis</p>
            </div>

            <div className="grid lg:grid-cols-2 gap-16 items-start">
              <div className={`aspect-square rounded-[3rem] overflow-hidden border-[12px] border-white shadow-2xl relative flex items-center justify-center bg-gray-50 transition-all ${loadingLab ? 'scale-95 grayscale' : 'hover:scale-[1.02]'}`}>
                {labImage ? (
                  <img src={labImage} className="w-full h-full object-cover" />
                ) : (
                  <div className="text-center p-12 space-y-6">
                    <div className="w-16 h-16 bg-white rounded-full mx-auto flex items-center justify-center shadow-md text-3xl">📷</div>
                    <p className="text-gray-400 text-xs font-medium max-w-[200px] mx-auto leading-relaxed">Upload a clear photo in natural light for the best results.</p>
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
                          <span key={c} className="px-5 py-2 bg-white text-black shadow-sm rounded-full text-[10px] font-bold border border-gray-100 hover:shadow-md transition-shadow">
                            {c}
                          </span>
                        ))}
                      </div>
                    </div>
                    
                    <Button onClick={() => setActiveTab('stylist')} className="w-full text-[10px] tracking-[0.2em] uppercase py-5">Apply to Stylist</Button>
                  </div>
                ) : (
                  <div className="space-y-8">
                    <p className="text-lg text-gray-600 leading-relaxed font-serif">Finding your <span className="italic">personal colors</span> changes everything. Our AI identifies your season to curate a wardrobe that illuminates your features.</p>
                    <div className="space-y-6">
                       {[
                         { id: '01', title: 'Face the Light', desc: 'Direct, natural window light is best for skin detection.' },
                         { id: '02', title: 'AI Detection', desc: 'We analyze skin undertone and eye contrast depth.' },
                         { id: '03', title: 'Get Your Season', desc: 'Receive your Spring, Summer, Autumn or Winter profile.' }
                       ].map(step => (
                         <div key={step.id} className="flex gap-5 items-start">
                           <div className="text-[10px] font-black text-amber-600 pt-1">{step.id}</div>
                           <div>
                             <h4 className="font-bold text-sm uppercase tracking-tight">{step.title}</h4>
                             <p className="text-gray-400 text-xs mt-1">{step.desc}</p>
                           </div>
                         </div>
                       ))}
                    </div>
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
                    <p className="text-[10px] font-black uppercase tracking-[0.3em] text-amber-700">Curated Intelligence</p>
                    <h2 className="text-6xl lg:text-8xl font-serif font-semibold leading-[0.9]">Elevate<br />Your <span className="text-amber-600 italic">Story</span>.</h2>
                  </div>
                  <p className="text-gray-500 max-w-sm leading-relaxed text-sm">Experience personalized AI styling that harmonizes your color palette with any occasion.</p>
                  
                  <div className="bg-white/40 p-10 rounded-[2.5rem] shadow-xl border border-white/60 space-y-8 mt-12 backdrop-blur-sm">
                    <div className="grid md:grid-cols-3 gap-6">
                      <div className="space-y-2">
                        <label className="text-[9px] font-black uppercase tracking-widest text-gray-400 ml-1">Occasion</label>
                        <select value={occasion} onChange={(e) => setOccasion(e.target.value as Occasion)} className="w-full p-3 bg-white/80 border-none rounded-xl text-[11px] font-bold outline-none focus:ring-1 focus:ring-black shadow-sm">
                          {Object.values(Occasion).map(v => <option key={v} value={v}>{v}</option>)}
                        </select>
                      </div>
                      <div className="space-y-2">
                        <label className="text-[9px] font-black uppercase tracking-widest text-gray-400 ml-1">Vibe</label>
                        <select value={vibe} onChange={(e) => setVibe(e.target.value as StyleVibe)} className="w-full p-3 bg-white/80 border-none rounded-xl text-[11px] font-bold outline-none focus:ring-1 focus:ring-black shadow-sm">
                          {Object.values(StyleVibe).map(v => <option key={v} value={v}>{v}</option>)}
                        </select>
                      </div>
                      <div className="space-y-2">
                        <label className="text-[9px] font-black uppercase tracking-widest text-gray-400 ml-1">Budget</label>
                        <select value={budget} onChange={(e) => setBudget(e.target.value as BudgetRange)} className="w-full p-3 bg-white/80 border-none rounded-xl text-[11px] font-bold outline-none focus:ring-1 focus:ring-black shadow-sm">
                          {Object.values(BudgetRange).map(v => <option key={v} value={v}>{v}</option>)}
                        </select>
                      </div>
                    </div>
                    <Button loading={loading} onClick={handleGenerate} className="w-full text-[10px] py-5 tracking-[0.3em] font-black uppercase shadow-lg hover:shadow-2xl hover:-translate-y-1 transition-all">Generate Looks</Button>
                  </div>
                </div>

                <div className="aspect-[4/5] bg-gray-50 rounded-[3rem] border-[10px] border-white shadow-2xl overflow-hidden relative group cursor-pointer transition-transform hover:scale-[1.01]" onClick={() => !image && fileInputRef.current?.click()}>
                  {image ? (
                    <>
                      <img src={image} className="w-full h-full object-cover" />
                      <button onClick={(e) => { e.stopPropagation(); setImage(null); }} className="absolute top-6 right-6 bg-white/90 p-3 rounded-full shadow-xl hover:bg-black hover:text-white transition-all">✕</button>
                    </>
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center p-16 text-center space-y-6">
                      <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center text-4xl shadow-md transition-transform group-hover:scale-110">👗</div>
                      <div>
                        <p className="font-bold text-sm tracking-tight">Add a piece from your closet</p>
                        <p className="text-gray-400 text-xs mt-2 leading-relaxed max-w-[200px] mx-auto">We'll style your existing items with fresh recommendations.</p>
                      </div>
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
              <div className="space-y-16 animate-in fade-in zoom-in-95 duration-1000">
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-8 border-b border-gray-100 pb-10">
                  <div className="space-y-4">
                    <button onClick={() => setResult(null)} className="text-[10px] font-black text-gray-400 hover:text-black mb-4 uppercase tracking-[0.2em] transition-colors">← Refine Selection</button>
                    <h2 className="text-5xl font-serif font-bold italic">Curated Selection</h2>
                    <p className="text-gray-500 text-sm max-w-2xl leading-loose">{result.vibeSummary}</p>
                  </div>
                  <div className="flex gap-4">
                     <div className="text-right">
                       <p className="text-[9px] font-black text-gray-300 uppercase tracking-widest">Selected Occasion</p>
                       <p className="text-xs font-bold">{occasion}</p>
                     </div>
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
                <h2 className="text-5xl font-serif font-bold italic">Private Lookbook</h2>
                <p className="text-gray-400 text-[10px] uppercase tracking-[0.3em]">Your Curated History</p>
             </div>
             {savedOutfits.length === 0 ? (
               <div className="bg-white/40 border border-white rounded-[3rem] p-32 text-center space-y-6 shadow-sm backdrop-blur-sm">
                  <div className="text-4xl opacity-20">🕯️</div>
                  <p className="text-gray-400 text-sm font-medium tracking-wide">Your collection is waiting to be built.</p>
                  <Button onClick={() => setActiveTab('stylist')} variant="outline" className="text-[10px] tracking-widest px-8">Return to Stylist</Button>
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
                <h2 className="text-5xl font-serif font-bold italic">Global Trends</h2>
                <p className="text-gray-400 text-[10px] uppercase tracking-[0.3em]">Real-time Fashion Pulse</p>
             </div>
             
             {trends.length === 0 && !loadingTrends && (
               <div className="flex justify-center">
                 <Button onClick={fetchTrends} className="text-[10px] tracking-[0.2em] px-12 py-5 font-black shadow-xl">Scan Global Trends</Button>
               </div>
             )}

             {loadingTrends ? (
               <div className="grid lg:grid-cols-2 gap-10">
                 {[1,2,3,4].map(i => (
                   <div key={i} className="h-80 bg-white/40 rounded-[2.5rem] animate-pulse border border-white shadow-sm flex items-center justify-center">
                      <div className="w-10 h-10 border-2 border-gray-200 border-t-gray-400 rounded-full animate-spin"></div>
                   </div>
                 ))}
               </div>
             ) : (
               <div className="grid lg:grid-cols-2 gap-10">
                 {trends.map((trend, i) => (
                   <div key={i} className="bg-white/60 backdrop-blur-sm rounded-[2.5rem] overflow-hidden group border border-white shadow-xl hover:shadow-2xl transition-all duration-500">
                      <div className="h-72 bg-gray-50 relative overflow-hidden">
                        {trend.trendImageUrl ? (
                          <img src={trend.trendImageUrl} className="w-full h-full object-cover transition-transform duration-1000 group-hover:scale-110" alt="" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <p className="text-[9px] font-black uppercase tracking-[0.4em] text-gray-300 animate-pulse">Visualizing trend...</p>
                          </div>
                        )}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent"></div>
                      </div>
                      <div className="p-10 space-y-4">
                        <div className="text-[9px] font-black uppercase text-amber-700 bg-amber-50 px-3 py-1 rounded-full w-fit border border-amber-100">{trend.context}</div>
                        <h3 className="text-3xl font-serif font-bold text-gray-900">{trend.title}</h3>
                        <p className="text-gray-500 text-sm leading-relaxed">{trend.description}</p>
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
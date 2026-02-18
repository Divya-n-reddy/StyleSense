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

    if (!process.env.API_KEY || process.env.API_KEY === "") {
      setError("No API Key detected. Ensure API_KEY is set in your environment.");
    }
  }, []);

  const parseError = (e: any): string => {
    const msg = e?.message || "";
    if (msg.includes("429") || msg.includes("RESOURCE_EXHAUSTED")) {
      return "Gemini API Daily Limit Reached. Please wait 30-60 seconds before retrying.";
    }
    return msg || "An error occurred while connecting to the AI.";
  };

  const fetchTrends = async () => {
    setLoadingTrends(true);
    setError(null);
    try {
      const data = await getSeasonalTrends();
      setTrends(data);
      // Sequentially load trend images with a delay to respect rate limits
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
          await new Promise(r => setTimeout(r, 2000));
        } catch (err) {
          console.warn(`Skipped image for trend: ${data[i].title}`);
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
          
          // Gently try to get a palette image
          try {
            await new Promise(r => setTimeout(r, 1000));
            const paletteUrl = await generateFashionImage(`${analysis.season} Seasonal Palette`, 'palette');
            if (paletteUrl) {
              const updated = { ...analysis, paletteImageUrl: paletteUrl };
              setUserPalette(updated);
              localStorage.setItem('stylesense_palette', JSON.stringify(updated));
            }
          } catch (imgErr) {}
        } catch (e: any) { 
          setError(`Lab analysis failed: ${parseError(e)}`);
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
      // Step 1: Generate Text Recommendations first
      const data = await getOutfitRecommendations(occasion, budget, vibe, base64Data, userPalette || undefined);
      setResult(data);
      setLoading(false); // Stop main spinner once text is here

      // Step 2: Sequentially generate images for each outfit
      for (let i = 0; i < data.recommendations.length; i++) {
        await new Promise(r => setTimeout(r, 2000)); // Respect RPM limits
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
            setSoftWarning("Recommendation text loaded, but visual generation is temporarily limited.");
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
    <div className="min-h-screen pb-20 selection:bg-amber-100">
      {error && (
        <div className="bg-red-600 text-white text-center py-3 px-4 text-xs font-bold sticky top-0 z-[100] flex items-center justify-center gap-4 shadow-xl">
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)} className="bg-white/20 p-1 rounded-md">✕</button>
        </div>
      )}
      
      {softWarning && (
        <div className="bg-amber-500 text-white text-center py-2 px-4 text-[10px] font-bold sticky top-0 z-[90] flex items-center justify-center gap-4">
          <span className="flex-1">✨ {softWarning}</span>
          <button onClick={() => setSoftWarning(null)} className="hover:opacity-50">✕</button>
        </div>
      )}

      <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-gray-100 py-3">
        <div className="max-w-6xl mx-auto px-4 flex justify-between items-center">
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => setActiveTab('stylist')}>
            <div className="w-8 h-8 bg-black rounded-lg flex items-center justify-center shadow-lg">
              <span className="text-white font-bold text-lg">S</span>
            </div>
            <h1 className="text-lg font-serif font-bold tracking-tight">StyleSense</h1>
          </div>
          <nav className="flex gap-4 md:gap-8 text-[11px] md:text-xs font-semibold uppercase tracking-widest text-gray-400">
            <button onClick={() => setActiveTab('stylist')} className={activeTab === 'stylist' ? 'text-black' : 'hover:text-black transition-colors'}>Stylist</button>
            <button onClick={() => setActiveTab('lab')} className={activeTab === 'lab' ? 'text-amber-600' : 'hover:text-black transition-colors'}>Palette Lab</button>
            <button onClick={() => setActiveTab('wardrobe')} className={activeTab === 'wardrobe' ? 'text-black' : 'hover:text-black transition-colors'}>Lookbook</button>
            <button onClick={() => setActiveTab('trends')} className={activeTab === 'trends' ? 'text-black' : 'hover:text-black transition-colors'}>Trends</button>
          </nav>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 mt-8">
        {activeTab === 'lab' && (
          <div className="max-w-4xl mx-auto space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="text-center space-y-2">
              <h2 className="text-4xl font-serif font-bold">The Palette Lab</h2>
              <p className="text-gray-400 text-sm">Discover your seasonal color profile with AI.</p>
            </div>

            <div className="grid md:grid-cols-2 gap-12 items-center">
              <div className={`aspect-square rounded-3xl overflow-hidden border-4 border-white shadow-xl relative flex items-center justify-center bg-gray-50 ${loadingLab ? 'animate-pulse' : ''}`}>
                {labImage ? (
                  <img src={labImage} className="w-full h-full object-cover" />
                ) : (
                  <div className="text-center p-8 space-y-4">
                    <div className="text-4xl">🎨</div>
                    <Button onClick={() => labInputRef.current?.click()} className="text-xs">Select Portrait</Button>
                  </div>
                )}
                {loadingLab && (
                  <div className="absolute inset-0 bg-black/50 backdrop-blur-sm flex flex-col items-center justify-center text-white text-center p-6">
                    <div className="animate-spin rounded-full h-8 w-8 border-2 border-white border-t-transparent mb-4"></div>
                    <p className="text-xs font-bold uppercase tracking-widest">Scanning Tones...</p>
                  </div>
                )}
                <input type="file" ref={labInputRef} onChange={handleLabAnalysis} className="hidden" accept="image/*" />
              </div>

              <div className="space-y-6">
                {userPalette ? (
                  <div className="space-y-6 animate-in fade-in slide-in-from-right-4">
                    <h3 className="text-3xl font-serif font-bold">You are a <span className="text-amber-600 italic">{userPalette.season}</span></h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="p-4 bg-gray-50 rounded-xl">
                        <p className="text-[10px] font-bold text-gray-400 uppercase">Undertone</p>
                        <p className="font-bold text-sm">{userPalette.undertone}</p>
                      </div>
                    </div>
                    <p className="text-gray-500 text-sm italic leading-relaxed">"{userPalette.description}"</p>
                    <div className="space-y-2">
                      <p className="text-[10px] font-bold text-gray-400 uppercase">Power Palette</p>
                      <div className="flex flex-wrap gap-2">
                        {userPalette.bestColors.map(c => <span key={c} className="px-3 py-1 bg-white border border-gray-100 rounded-full text-[10px] font-bold">{c}</span>)}
                      </div>
                    </div>
                    <Button onClick={() => setActiveTab('stylist')} className="w-full text-xs">Apply to Stylist</Button>
                  </div>
                ) : (
                  <div className="space-y-4 text-gray-500">
                    <p className="text-sm">Stop wearing colors that wash you out. Upload a selfie in natural light to find your perfect palette.</p>
                    <div className="p-4 bg-white border border-gray-100 rounded-2xl text-xs space-y-3">
                       <div className="flex items-center gap-3">
                         <div className="w-5 h-5 rounded-full bg-blue-50 text-blue-500 flex items-center justify-center font-bold">1</div>
                         <span>Face the light.</span>
                       </div>
                       <div className="flex items-center gap-3">
                         <div className="w-5 h-5 rounded-full bg-pink-50 text-pink-500 flex items-center justify-center font-bold">2</div>
                         <span>AI detects skin and eye depth.</span>
                       </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'stylist' && (
          <div className="animate-in fade-in duration-500">
            {!result ? (
              <div className="grid lg:grid-cols-2 gap-12 items-start">
                <div className="space-y-6">
                  <h2 className="text-5xl lg:text-7xl font-serif font-semibold leading-tight">Elevate your <br /><span className="text-amber-600 italic">Style</span>.</h2>
                  <p className="text-gray-500 max-w-sm">Personalized AI styling advice tailored to your color palette and occasion.</p>
                  
                  <div className="bg-white p-6 rounded-3xl shadow-xl border border-gray-100 space-y-6 mt-8">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="space-y-1">
                        <label className="text-[9px] font-bold uppercase text-gray-400 ml-1">Occasion</label>
                        <select value={occasion} onChange={(e) => setOccasion(e.target.value as Occasion)} className="w-full p-2 bg-gray-50 border-none rounded-lg text-xs outline-none focus:ring-1 focus:ring-black">
                          {Object.values(Occasion).map(v => <option key={v} value={v}>{v}</option>)}
                        </select>
                      </div>
                      <div className="space-y-1">
                        <label className="text-[9px] font-bold uppercase text-gray-400 ml-1">Vibe</label>
                        <select value={vibe} onChange={(e) => setVibe(e.target.value as StyleVibe)} className="w-full p-2 bg-gray-50 border-none rounded-lg text-xs outline-none focus:ring-1 focus:ring-black">
                          {Object.values(StyleVibe).map(v => <option key={v} value={v}>{v}</option>)}
                        </select>
                      </div>
                      <div className="space-y-1">
                        <label className="text-[9px] font-bold uppercase text-gray-400 ml-1">Budget</label>
                        <select value={budget} onChange={(e) => setBudget(e.target.value as BudgetRange)} className="w-full p-2 bg-gray-50 border-none rounded-lg text-xs outline-none focus:ring-1 focus:ring-black">
                          {Object.values(BudgetRange).map(v => <option key={v} value={v}>{v}</option>)}
                        </select>
                      </div>
                    </div>
                    <Button loading={loading} onClick={handleGenerate} className="w-full text-xs py-4 tracking-widest font-bold">Generate Looks</Button>
                  </div>
                </div>

                <div className="aspect-[4/5] bg-gray-100 rounded-[2.5rem] border-4 border-white shadow-2xl overflow-hidden relative group">
                  {image ? (
                    <>
                      <img src={image} className="w-full h-full object-cover" />
                      <button onClick={() => setImage(null)} className="absolute top-4 right-4 bg-white/80 p-2 rounded-full shadow-lg hover:bg-white transition-colors">✕</button>
                    </>
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center p-12 text-center space-y-4">
                      <div className="text-3xl text-gray-300">📸</div>
                      <p className="text-gray-400 text-[11px] leading-relaxed">Add a photo of a piece you already own to style it with new recommendations.</p>
                      <Button variant="outline" className="text-[10px] px-4 py-2" onClick={() => fileInputRef.current?.click()}>Upload Item</Button>
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
              <div className="space-y-12 animate-in fade-in zoom-in-95 duration-700">
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                  <div className="space-y-2">
                    <button onClick={() => setResult(null)} className="text-[10px] font-bold text-gray-400 hover:text-black mb-2 uppercase tracking-tighter">← Back to inputs</button>
                    <h2 className="text-4xl font-serif font-bold">Your AI Looks</h2>
                    <p className="text-gray-500 text-sm max-w-xl">{result.vibeSummary}</p>
                  </div>
                </div>
                <div className="grid md:grid-cols-3 gap-8">
                  {result.recommendations.map((outfit, i) => (
                    <OutfitCard key={outfit.id} outfit={outfit} index={i} onSave={handleSaveOutfit} isSaved={savedOutfits.some(o => o.id === outfit.id)} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'wardrobe' && (
          <div className="space-y-12 animate-in fade-in duration-500">
             <div className="text-center space-y-2">
                <h2 className="text-4xl font-serif font-bold">Lookbook</h2>
                <p className="text-gray-400 text-sm">Styles you've curated.</p>
             </div>
             {savedOutfits.length === 0 ? (
               <div className="bg-white border border-gray-100 rounded-3xl p-20 text-center space-y-4 shadow-sm">
                  <p className="text-gray-300 text-sm">Your lookbook is currently empty.</p>
                  <Button onClick={() => setActiveTab('stylist')} variant="outline" className="text-[10px]">Start Styling</Button>
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
          <div className="space-y-12 animate-in fade-in duration-500">
             <div className="text-center space-y-2">
                <h2 className="text-4xl font-serif font-bold">Global Trends</h2>
                <p className="text-gray-400 text-sm">Visual inspirations from the current season.</p>
             </div>
             
             {trends.length === 0 && !loadingTrends && (
               <div className="flex justify-center">
                 <Button onClick={fetchTrends} className="text-xs">Fetch Current Trends</Button>
               </div>
             )}

             {loadingTrends ? (
               <div className="grid md:grid-cols-2 gap-8">
                 {[1,2,3,4].map(i => <div key={i} className="h-64 bg-gray-50 rounded-3xl animate-pulse"></div>)}
               </div>
             ) : (
               <div className="grid md:grid-cols-2 gap-8">
                 {trends.map((trend, i) => (
                   <div key={i} className="bg-white border border-gray-50 rounded-3xl overflow-hidden group shadow-sm hover:shadow-md transition-shadow">
                      <div className="h-60 bg-gray-50 relative overflow-hidden">
                        {trend.trendImageUrl ? (
                          <img src={trend.trendImageUrl} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" alt="" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-[10px] text-gray-300 font-bold uppercase tracking-widest">Visualizing...</div>
                        )}
                      </div>
                      <div className="p-8 space-y-3">
                        <h3 className="text-2xl font-serif font-bold text-gray-900">{trend.title}</h3>
                        <p className="text-gray-500 text-xs leading-relaxed">{trend.description}</p>
                        <div className="text-[9px] font-bold uppercase text-amber-600 bg-amber-50 px-3 py-1 rounded-full w-fit">{trend.context}</div>
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
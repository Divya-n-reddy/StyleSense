
import React, { useState, useEffect, useMemo } from 'https://esm.sh/react@19.0.0';
import ReactDOM from 'https://esm.sh/react-dom@19.0.0/client';
import htm from 'https://esm.sh/htm';
import { GoogleGenAI, Type } from "https://esm.sh/@google/genai@1.41.0";

const html = htm.bind(React.createElement);

// --- API Service ---
const getAI = () => {
  const apiKey = window.process?.env?.API_KEY;
  if (!apiKey || apiKey === "undefined" || apiKey.length < 5) {
    throw new Error("API_KEY_MISSING");
  }
  return new GoogleGenAI({ apiKey });
};

const callWithRetry = async (fn, maxRetries = 2, delay = 3000) => {
  for (let i = 0; i <= maxRetries; i++) {
    try {
      return await fn();
    } catch (err) {
      const isQuota = err.message?.includes("429") || err.message?.includes("RESOURCE_EXHAUSTED");
      if (isQuota && i < maxRetries) {
        console.warn(`Quota hit, retrying in ${delay}ms...`);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      throw err;
    }
  }
};

const getRecommendations = async (occasion, budget, vibe, base64Image) => {
  const ai = getAI();
  const prompt = `Act as a world-class luxury fashion stylist and editor for Vogue. 
  Occasion: ${occasion}
  Desired Vibe: ${vibe}
  Budget Category: ${budget}
  
  ${base64Image ? "Base your style analysis on the item in the attached image, suggesting complementary pieces to complete the look." : "Curate a capsule collection for this request."}
  
  Focus on fabric quality, silhouettes, and current high-fashion trends.
  Return a JSON object with:
  1. recommendations: an array of 3 distinct outfit components (id, name, description, stylingTip)
  2. vibeSummary: a brief editorial paragraph describing the overall aesthetic direction.`;

  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: base64Image 
      ? { parts: [{ inlineData: { data: base64Image, mimeType: 'image/jpeg' } }, { text: prompt }] }
      : { parts: [{ text: prompt }] },
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
                stylingTip: { type: Type.STRING }
              }
            }
          },
          vibeSummary: { type: Type.STRING }
        },
        required: ["recommendations", "vibeSummary"]
      }
    }
  });
  return JSON.parse(response.text);
};

const visualizeLook = async (name, description) => {
  const ai = getAI();
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash-image',
    contents: { 
      parts: [{ 
        text: `High-end editorial fashion photography, full length shot. A luxury ${name}: ${description}. Model with effortless elegance. Neutral, minimalist studio lighting, 8k resolution, cinematic composition.` 
      }] 
    },
    config: { 
      imageConfig: { 
        aspectRatio: "3:4" 
      } 
    }
  });
  const part = response.candidates?.[0]?.content?.parts.find(p => p.inlineData);
  return part ? `data:image/png;base64,${part.inlineData.data}` : null;
};

// --- Components ---

const Button = ({ children, onClick, loading, variant = 'primary', className = '' }) => {
  const styles = {
    primary: "bg-black text-white hover:bg-zinc-800",
    secondary: "bg-white text-black border border-zinc-200 hover:bg-zinc-50",
    outline: "bg-transparent text-zinc-400 border border-zinc-200 hover:border-black hover:text-black",
  };
  return html`
    <button 
      onClick=${onClick} 
      disabled=${loading} 
      className="px-8 py-4 rounded-full font-bold text-[10px] tracking-[0.2em] uppercase transition-all flex items-center justify-center disabled:opacity-50 active:scale-95 ${styles[variant]} ${className}"
    >
      ${loading && html`<div className="w-4 h-4 border-2 border-current border-t-transparent animate-spin rounded-full mr-3"></div>`}
      ${children}
    </button>
  `;
};

const OutfitCard = ({ outfit, onSave, isSaved, onVisualize }) => {
  const [loading, setLoading] = useState(false);
  const handleVis = async () => {
    setLoading(true);
    try {
      await onVisualize(outfit.id, outfit.name, outfit.description);
    } catch (e) {
      console.error(e);
      alert("Visualization failed. Please check your API key quota.");
    } finally {
      setLoading(false);
    }
  };

  return html`
    <div className="bg-white rounded-[2.5rem] overflow-hidden border border-zinc-100 shadow-sm hover:shadow-xl transition-shadow duration-500 animate-fade-in group">
      <div className="aspect-[3/4] bg-zinc-50 relative flex items-center justify-center overflow-hidden">
        ${outfit.imageUrl 
          ? html`<img src=${outfit.imageUrl} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />`
          : html`
            <div className="p-10 text-center space-y-4">
              <div className="text-3xl opacity-20">✨</div>
              <${Button} variant="secondary" onClick=${handleVis} loading=${loading} className="py-2 text-[8px] shadow-sm">
                Generate Visual
              </${Button}>
            </div>
          `
        }
      </div>
      <div className="p-10 space-y-5">
        <div className="flex justify-between items-start">
          <h3 className="text-2xl font-serif font-bold tracking-tight">${outfit.name}</h3>
          <button onClick=${() => onSave(outfit)} className="transition-all hover:scale-110">
            <svg className="w-7 h-7 ${isSaved ? 'text-amber-600 fill-current' : 'text-zinc-200'}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
            </svg>
          </button>
        </div>
        <p className="text-zinc-500 text-sm leading-relaxed font-light">${outfit.description}</p>
        <div className="pt-6 border-t border-zinc-50">
           <span className="text-[9px] font-black uppercase tracking-widest text-amber-700 block mb-2">Styling Note</span>
           <p className="text-[12px] text-zinc-400 italic font-serif leading-snug">${outfit.stylingTip}</p>
        </div>
      </div>
    </div>
  `;
};

const ErrorOverlay = ({ message }) => html`
  <div className="fixed inset-0 z-[100] bg-white flex flex-col items-center justify-center p-10 text-center space-y-6">
    <div className="text-6xl mb-4">💎</div>
    <h2 className="text-3xl font-serif font-bold">Connection Required</h2>
    <p className="text-zinc-500 max-w-md">
      ${message === 'API_KEY_MISSING' 
        ? "We couldn't detect your Gemini API key. Please ensure you set the environment variable in your terminal before running the server." 
        : message}
    </p>
    <div className="bg-zinc-50 p-6 rounded-2xl text-left font-mono text-xs w-full max-w-md border border-zinc-100">
      <p className="text-zinc-400 mb-2"># Windows (PowerShell)</p>
      <code className="block mb-4">$env:API_KEY="your_key"</code>
      <p className="text-zinc-400 mb-2"># Mac / Linux</p>
      <code>export API_KEY="your_key"</code>
    </div>
    <${Button} onClick=${() => window.location.reload()}>Try Again</${Button}>
  </div>
`;

// --- App ---

const App = () => {
  const [tab, setTab] = useState('stylist');
  const [params, setParams] = useState({ occasion: 'Formal', vibe: 'Minimalist', budget: 'Luxury ($$$)' });
  const [image, setImage] = useState(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('saved_styles') || '[]');
    } catch { return []; }
  });

  useEffect(() => localStorage.setItem('saved_styles', JSON.stringify(saved)), [saved]);

  const handleGenerate = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await callWithRetry(() => getRecommendations(params.occasion, params.budget, params.vibe, image?.split(',')[1]));
      setResult(data);
    } catch (err) {
      if (err.message === "API_KEY_MISSING") setError("API_KEY_MISSING");
      else alert("Generation failed: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleVisualize = async (id, name, desc) => {
    const url = await visualizeLook(name, desc);
    if (url) {
      setResult(prev => ({
        ...prev,
        recommendations: prev.recommendations.map(r => r.id === id ? { ...r, imageUrl: url } : r)
      }));
    }
  };

  const toggleSave = (outfit) => {
    setSaved(prev => {
      const isExist = prev.some(o => o.id === outfit.id);
      return isExist ? prev.filter(o => o.id !== outfit.id) : [outfit, ...prev];
    });
  };

  if (error) return html`<${ErrorOverlay} message=${error} />`;

  return html`
    <div className="min-h-screen luxury-gradient pb-40">
      <header className="sticky top-0 z-50 glass-panel border-b border-black/5 py-8 px-12 flex justify-between items-center">
        <div className="flex items-center gap-5 cursor-pointer group" onClick=${() => {setTab('stylist'); setResult(null);}}>
          <div className="w-12 h-12 bg-black rounded-2xl flex items-center justify-center text-white font-serif font-bold text-2xl shadow-xl transition-transform group-hover:scale-110">S</div>
          <div>
            <h1 className="text-2xl font-serif font-bold tracking-tight">StyleSense</h1>
            <p className="text-[8px] font-black uppercase tracking-[0.4em] text-zinc-400">AI Haute Couture</p>
          </div>
        </div>
        <nav className="flex gap-16 text-[10px] font-black uppercase tracking-[0.3em] text-zinc-400">
          <button onClick=${() => setTab('stylist')} className="transition-all ${tab === 'stylist' ? 'text-black border-b-2 border-black pb-1' : 'hover:text-zinc-600'}">Stylist</button>
          <button onClick=${() => setTab('wardrobe')} className="transition-all ${tab === 'wardrobe' ? 'text-black border-b-2 border-black pb-1' : 'hover:text-zinc-600'}">Wardrobe (${saved.length})</button>
        </nav>
      </header>

      <main className="max-w-6xl mx-auto px-12 mt-28">
        ${tab === 'stylist' && html`
          <div className="space-y-32 animate-fade-in">
            ${!result ? html`
              <div className="grid lg:grid-cols-2 gap-32 items-center">
                <div className="space-y-12">
                  <div className="space-y-4">
                    <span className="text-[10px] font-black uppercase tracking-[0.5em] text-amber-700">Experience Excellence</span>
                    <h2 className="text-8xl font-serif font-bold leading-[0.95] tracking-tighter">Your AI<br /><span className="italic font-normal text-zinc-300">Personal</span><br />Stylist.</h2>
                  </div>
                  
                  <div className="bg-white/60 backdrop-blur-3xl border border-white p-14 rounded-[4rem] shadow-2xl space-y-12 relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-amber-100/30 blur-3xl rounded-full -mr-16 -mt-16"></div>
                    <div className="grid md:grid-cols-3 gap-10">
                      ${['occasion', 'vibe', 'budget'].map(f => html`
                        <div className="space-y-4" key=${f}>
                          <label className="text-[9px] font-black uppercase text-zinc-400 tracking-widest">${f}</label>
                          <select className="w-full bg-transparent border-b border-zinc-200 py-2 text-xs font-bold focus:outline-none focus:border-black transition-colors" value=${params[f]} onChange=${e => setParams(p => ({ ...p, [f]: e.target.value }))}>
                            ${f === 'occasion' && ['Casual', 'Formal', 'Work', 'Streetwear', 'Wedding', 'Gala'].map(o => html`<option key=${o} value=${o}>${o}</option>`)}
                            ${f === 'vibe' && ['Minimalist', 'Chic', 'Edgy', 'Classic', 'Avant-Garde', 'Bohemian'].map(v => html`<option key=${v} value=${v}>${v}</option>`)}
                            ${f === 'budget' && ['Budget ($)', 'Mid-Range ($$)', 'Luxury ($$$)'].map(b => html`<option key=${b} value=${b}>${b}</option>`)}
                          </select>
                        </div>
                      `)}
                    </div>
                    <${Button} loading=${loading} onClick=${handleGenerate} className="w-full h-16 shadow-2xl shadow-black/10">Curate The Edit</${Button}>
                  </div>
                </div>
                
                <div className="relative group">
                   <div className="absolute inset-0 bg-black/5 rounded-[4.5rem] transform translate-x-6 translate-y-6 -z-10 transition-transform group-hover:translate-x-4 group-hover:translate-y-4"></div>
                   <div className="aspect-[4/5] bg-white rounded-[4.5rem] border-[16px] border-white shadow-2xl overflow-hidden relative cursor-pointer" onClick=${() => !image && document.getElementById('uploader').click()}>
                    ${image ? html`
                      <div className="relative h-full">
                        <img src=${image} className="w-full h-full object-cover" />
                        <button onClick=${(e) => {e.stopPropagation(); setImage(null);}} className="absolute top-6 right-6 bg-black/50 text-white p-3 rounded-full backdrop-blur-md hover:bg-black transition-colors">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                      </div>
                    ` : html`
                      <div className="flex flex-col items-center justify-center h-full space-y-8 text-zinc-300">
                        <div className="w-20 h-20 border-2 border-dashed border-zinc-200 rounded-full flex items-center justify-center text-4xl">+</div>
                        <div className="text-center">
                          <p className="text-[11px] font-black uppercase tracking-[0.3em]">Upload Inspiration</p>
                          <p className="text-[10px] text-zinc-400 mt-2 font-serif italic">Photo, Sketch, or Color Palette</p>
                        </div>
                      </div>`}
                    <input type="file" id="uploader" className="hidden" accept="image/*" onChange=${e => {
                      const file = e.target.files[0];
                      if (!file) return;
                      const reader = new FileReader();
                      reader.onload = () => setImage(reader.result);
                      reader.readAsDataURL(file);
                    }} />
                  </div>
                </div>
              </div>` : html`
              <div className="space-y-20 animate-fade-in">
                <div className="border-b border-zinc-100 pb-16 relative">
                  <${Button} variant="outline" onClick=${() => setResult(null)} className="mb-12 border-none px-0 !text-zinc-400 hover:!text-black">
                    ← Create New Look
                  </${Button}>
                  <h2 className="text-7xl font-serif font-bold italic tracking-tight">The Styled Edit</h2>
                  <p className="text-zinc-400 text-lg max-w-2xl mt-8 leading-relaxed font-light font-serif">${result.vibeSummary}</p>
                </div>
                <div className="grid md:grid-cols-3 gap-16">
                  ${result.recommendations.map(o => html`
                    <${OutfitCard} 
                      key=${o.id} 
                      outfit=${o} 
                      onSave=${toggleSave} 
                      isSaved=${saved.some(s => s.id === o.id)} 
                      onVisualize=${handleVisualize} 
                    />
                  `)}
                </div>
              </div>`
            }
          </div>
        `}

        ${tab === 'wardrobe' && html`
          <div className="space-y-24 animate-fade-in">
            <div className="text-center space-y-6">
              <h2 className="text-7xl font-serif font-bold italic">Your Collection</h2>
              <p className="text-zinc-400 uppercase text-[9px] tracking-[0.5em] font-black">Private Selection</p>
            </div>
            ${saved.length > 0 ? html`
              <div className="grid md:grid-cols-3 gap-16">
                ${saved.map(o => html`
                  <${OutfitCard} key=${o.id} outfit=${o} onSave=${toggleSave} isSaved=${true} onVisualize=${handleVisualize} />
                `)}
              </div>` : html`
              <div className="text-center py-40 border-2 border-dashed border-zinc-100 rounded-[4rem]">
                <p className="text-zinc-300 font-serif italic text-2xl">Awaiting your curation.</p>
                <${Button} variant="outline" onClick=${() => setTab('stylist')} className="mt-10 mx-auto">Explore Styles</${Button}>
              </div>
            `}
          </div>
        `}
      </main>
      
      <footer className="mt-40 border-t border-zinc-100 pt-20 pb-10 text-center px-10">
         <p className="text-[10px] font-black uppercase tracking-[0.5em] text-zinc-300">StyleSense AI Luxury Styling Service</p>
         <p className="text-[10px] text-zinc-400 mt-4 font-serif italic">Powered by Gemini 3.0 & 2.5 Intelligence</p>
      </footer>
    </div>
  `;
};

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(html`<${App} />`);

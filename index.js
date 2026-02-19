import React, { useState, useEffect, useRef } from 'https://esm.sh/react@19.0.0';
import ReactDOM from 'https://esm.sh/react-dom@19.0.0/client';
import htm from 'https://esm.sh/htm';
import { GoogleGenAI, Type } from "https://esm.sh/@google/genai@1.41.0";

const html = htm.bind(React.createElement);

// --- API Service Utilities ---

const getAI = () => new GoogleGenAI({ apiKey: process.env.API_KEY });

// Helper to handle retries for 429 Quota errors
const callWithRetry = async (fn, maxRetries = 2, delay = 3000) => {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (err) {
      const isQuota = err.message?.includes("429") || err.message?.includes("RESOURCE_EXHAUSTED");
      if (isQuota && i < maxRetries - 1) {
        console.warn(`Quota exceeded. Retrying in ${delay}ms...`);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      throw err;
    }
  }
};

const getRecommendations = async (occasion, budget, vibe, base64Image, palette) => {
  const ai = getAI();
  const paletteInfo = palette ? `User Season: ${palette.season}. Recommend: ${palette.bestColors.join(', ')}.` : "";
  const prompt = `Style Expert. Occasion: ${occasion}, Vibe: ${vibe}, Budget: ${budget}. ${paletteInfo} ${base64Image ? "Integrate attached item." : ""} Return JSON with recommendations[] (id, name, description, stylingTip) and vibeSummary string.`;

  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: base64Image 
      ? { parts: [{ inlineData: { data: base64Image, mimeType: 'image/jpeg' } }, { text: prompt }] }
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
                stylingTip: { type: Type.STRING }
              }
            }
          },
          vibeSummary: { type: Type.STRING }
        }
      }
    }
  });
  return JSON.parse(response.text);
};

const visualizeOutfit = async (description) => {
  const ai = getAI();
  const prompt = `Editorial high-fashion. Outfit: ${description}. Studio background.`;
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash-image',
    contents: { parts: [{ text: prompt }] },
    config: { imageConfig: { aspectRatio: "3:4" } }
  });
  const part = response.candidates?.[0]?.content?.parts.find(p => p.inlineData);
  return part ? `data:image/png;base64,${part.inlineData.data}` : null;
};

// --- UI Components ---

const Button = ({ children, onClick, loading, variant = 'primary', className = '' }) => {
  const styles = {
    primary: "bg-black text-white hover:bg-zinc-800",
    secondary: "bg-amber-100 text-amber-900 hover:bg-amber-200",
  };
  return html`
    <button 
      onClick=${onClick} 
      disabled=${loading}
      className="px-8 py-4 rounded-full font-bold text-[10px] tracking-[0.2em] uppercase transition-all flex items-center justify-center disabled:opacity-50 ${styles[variant]} ${className}"
    >
      ${loading && html`<div className="w-4 h-4 border-2 border-current border-t-transparent animate-spin rounded-full mr-3"></div>`}
      ${children}
    </button>
  `;
};

const OutfitCard = ({ outfit, index, onSave, isSaved, onVisualize }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleVisualize = async () => {
    setLoading(true);
    setError(null);
    try {
      await callWithRetry(() => onVisualize(outfit.id, `${outfit.name}: ${outfit.description}`));
    } catch (e) {
      setError(e.message?.includes("429") ? "Quota Limit" : "Failed");
    } finally {
      setLoading(false);
    }
  };

  return html`
    <div className="bg-white rounded-[2rem] overflow-hidden border border-zinc-100 shadow-sm animate-fade-in group" style=${{ animationDelay: `${index * 150}ms` }}>
      <div className="aspect-[3/4] bg-zinc-50 relative flex items-center justify-center">
        ${outfit.imageUrl 
          ? html`<img src=${outfit.imageUrl} className="w-full h-full object-cover" />`
          : html`
            <div className="text-center p-8 space-y-4">
               ${loading 
                 ? html`<div className="w-8 h-8 border-2 border-amber-600 border-t-transparent animate-spin rounded-full mx-auto"></div>`
                 : html`
                   <div className="space-y-4">
                     <p className="text-zinc-300 text-[10px] font-bold uppercase tracking-widest">${error || "Visual Pending"}</p>
                     <${Button} variant="secondary" onClick=${handleVisualize} className="py-2 px-4 text-[8px]">Visualize</${Button}>
                   </div>`
               }
            </div>`
        }
      </div>
      <div className="p-8 space-y-4">
        <div className="flex justify-between items-start">
          <h3 className="text-2xl font-serif font-bold">${outfit.name}</h3>
          <button onClick=${() => onSave(outfit)} className="text-zinc-300 hover:text-amber-600 transition-colors">
            <svg className="w-6 h-6 ${isSaved ? 'text-amber-600' : ''}" fill="currentColor" viewBox="0 0 20 20"><path d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z"/></svg>
          </button>
        </div>
        <p className="text-zinc-500 text-sm leading-relaxed">${outfit.description}</p>
        <div className="pt-4 border-t border-zinc-50">
          <p className="text-[11px] text-zinc-400 italic"><span className="text-amber-700 font-black not-italic mr-2">TIP:</span>${outfit.stylingTip}</p>
        </div>
      </div>
    </div>
  `;
};

// --- App Container ---

const App = () => {
  const [tab, setTab] = useState('stylist');
  const [params, setParams] = useState({ occasion: 'Casual', vibe: 'Minimalist', budget: 'Mid-Range ($$)' });
  const [image, setImage] = useState(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(() => JSON.parse(localStorage.getItem('saved_outfits') || '[]'));

  useEffect(() => localStorage.setItem('saved_outfits', JSON.stringify(saved)), [saved]);

  const handleGenerate = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const data = await callWithRetry(() => getRecommendations(params.occasion, params.budget, params.vibe, image?.split(',')[1]));
      setResult(data);
    } catch (e) {
      setError(e.message?.includes("429") ? "API Quota exceeded. Please wait a minute." : "Styling service unavailable.");
    } finally {
      setLoading(false);
    }
  };

  const handleVisualize = async (id, desc) => {
    const url = await visualizeOutfit(desc);
    if (url) {
      setResult(prev => ({
        ...prev,
        recommendations: prev.recommendations.map(r => r.id === id ? { ...r, imageUrl: url } : r)
      }));
    }
  };

  const toggleSave = (outfit) => {
    setSaved(prev => prev.some(o => o.id === outfit.id) ? prev.filter(o => o.id !== outfit.id) : [outfit, ...prev]);
  };

  return html`
    <div className="min-h-screen luxury-gradient pb-20">
      ${error && html`
        <div className="fixed top-0 left-0 w-full z-[100] bg-red-600 text-white text-[10px] font-black uppercase py-4 text-center tracking-widest animate-fade-in flex justify-between px-10 items-center">
          <span>${error}</span>
          <button onClick=${() => setError(null)}>✕</button>
        </div>`}

      <header className="sticky top-0 z-50 glass-panel border-b border-white/20 py-6">
        <div className="max-w-7xl mx-auto px-10 flex justify-between items-center">
          <div className="flex items-center gap-4 cursor-pointer" onClick=${() => setTab('stylist')}>
            <div className="w-10 h-10 bg-black rounded-lg flex items-center justify-center text-white font-serif font-bold text-xl shadow-xl">S</div>
            <h1 className="text-2xl font-serif font-bold tracking-tight">StyleSense</h1>
          </div>
          <nav className="flex gap-12 text-[10px] font-black uppercase tracking-[0.3em] text-zinc-400">
            ${['stylist', 'wardrobe'].map(t => html`
              <button key=${t} onClick=${() => setTab(t)} className="${tab === t ? 'text-black border-b-2 border-black pb-1' : 'hover:text-black transition-colors'}">${t}</button>
            `)}
          </nav>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-10 mt-20">
        ${tab === 'stylist' && html`
          <div className="space-y-20 animate-fade-in">
            ${!result ? html`
              <div className="grid lg:grid-cols-2 gap-24 items-center">
                <div className="space-y-10">
                  <div className="space-y-4">
                    <p className="text-[10px] font-black uppercase tracking-[0.4em] text-amber-700">Digital Atelier</p>
                    <h2 className="text-7xl font-serif font-bold leading-[1.1]">Curated<br /><span className="italic text-amber-600">Just for You.</span></h2>
                  </div>
                  <div className="bg-white/40 backdrop-blur-xl border border-white p-12 rounded-[3rem] shadow-2xl space-y-10">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                      ${['occasion', 'vibe', 'budget'].map(field => html`
                        <div className="space-y-3" key=${field}>
                          <label className="text-[9px] font-black uppercase text-zinc-400 tracking-widest ml-1">${field}</label>
                          <select 
                            className="w-full bg-white border-none rounded-2xl p-4 text-xs font-bold shadow-sm focus:ring-2 focus:ring-amber-500"
                            value=${params[field]}
                            onChange=${e => setParams(p => ({ ...p, [field]: e.target.value }))}
                          >
                            ${field === 'occasion' && ['Casual', 'Formal', 'Work', 'Date Night', 'Streetwear'].map(o => html`<option key=${o}>${o}</option>`)}
                            ${field === 'vibe' && ['Minimalist', 'Chic', 'Edgy', 'Classic', 'Bohemian'].map(v => html`<option key=${v}>${v}</option>`)}
                            ${field === 'budget' && ['Budget ($)', 'Mid-Range ($$)', 'Luxury ($$$)'].map(b => html`<option key=${b}>${b}</option>`)}
                          </select>
                        </div>
                      `)}
                    </div>
                    <${Button} loading=${loading} onClick=${handleGenerate} className="w-full py-6">Begin The Edit</${Button}>
                  </div>
                </div>
                <div 
                  className="aspect-[4/5] bg-white rounded-[4rem] border-[12px] border-white shadow-2xl overflow-hidden relative group cursor-pointer hover:scale-[1.01] transition-transform"
                  onClick=${() => !image && document.getElementById('uploader').click()}
                >
                  ${image ? html`<img src=${image} className="w-full h-full object-cover" />` : html`
                    <div className="flex flex-col items-center justify-center h-full space-y-6 text-center p-12">
                      <div className="text-6xl grayscale group-hover:grayscale-0 transition-all">👕</div>
                      <p className="text-lg font-serif font-bold">Inspiration Piece</p>
                      <p className="text-zinc-400 text-xs tracking-wide">Upload a photo to style around</p>
                    </div>`}
                  <input type="file" id="uploader" className="hidden" accept="image/*" onChange=${e => {
                    const reader = new FileReader();
                    reader.onload = () => setImage(reader.result);
                    reader.readAsDataURL(e.target.files[0]);
                  }} />
                  ${image && html`<button onClick=${(e) => { e.stopPropagation(); setImage(null); }} className="absolute top-8 right-8 bg-white/80 p-3 rounded-full text-black hover:bg-white transition-all shadow-lg">✕</button>`}
                </div>
              </div>` : html`
              <div className="space-y-16">
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-10 border-b border-zinc-200 pb-12">
                  <div className="space-y-6">
                    <button onClick=${() => setResult(null)} className="text-[10px] font-black uppercase tracking-[0.3em] text-zinc-400 hover:text-black">← New Edit</button>
                    <h2 className="text-6xl font-serif font-bold italic">The Results</h2>
                    <p className="text-zinc-500 text-sm max-w-2xl leading-relaxed">${result.vibeSummary}</p>
                  </div>
                </div>
                <div className="grid md:grid-cols-3 gap-12">
                  ${result.recommendations.map((o, i) => html`
                    <${OutfitCard} 
                      key=${o.id} 
                      outfit=${o} 
                      index=${i} 
                      onSave=${toggleSave} 
                      isSaved=${saved.some(s => s.id === o.id)} 
                      onVisualize=${handleVisualize}
                    />`)}
                </div>
              </div>`
            }
          </div>
        `}

        ${tab === 'wardrobe' && html`
          <div className="space-y-16 animate-fade-in">
            <div className="text-center space-y-4">
              <h2 className="text-6xl font-serif font-bold italic">Saved Wardrobe</h2>
              <p className="text-zinc-400 text-[10px] font-black uppercase tracking-[0.4em]">Your Curated Collection</p>
            </div>
            ${saved.length > 0 ? html`
              <div className="grid md:grid-cols-3 gap-12">
                ${saved.map((o, i) => html`
                  <${OutfitCard} 
                    key=${o.id} 
                    outfit=${o} 
                    index=${i} 
                    onSave=${toggleSave} 
                    isSaved=${true} 
                    onVisualize=${handleVisualize}
                  />`)}
              </div>` : html`
              <div className="py-40 text-center space-y-10">
                <p className="text-zinc-400 font-serif italic text-xl">Your wardrobe is waiting for its first edit.</p>
                <${Button} onClick=${() => setTab('stylist')} variant="secondary" className="mx-auto">Start Styling</${Button}>
              </div>`
            }
          </div>
        `}
      </main>
    </div>
  `;
};

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(html`<${App} />`);
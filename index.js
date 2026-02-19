import React, { useState, useEffect } from 'https://esm.sh/react@19.0.0';
import ReactDOM from 'https://esm.sh/react-dom@19.0.0/client';
import htm from 'https://esm.sh/htm';
import { GoogleGenAI, Type } from "https://esm.sh/@google/genai@1.41.0";

const html = htm.bind(React.createElement);

// --- API Service ---
const getAI = () => new GoogleGenAI({ apiKey: process.env.API_KEY });

const callWithRetry = async (fn, maxRetries = 2, delay = 3000) => {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (err) {
      const isQuota = err.message?.includes("429") || err.message?.includes("RESOURCE_EXHAUSTED");
      if (isQuota && i < maxRetries - 1) {
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      throw err;
    }
  }
};

const getRecommendations = async (occasion, budget, vibe, base64Image) => {
  const ai = getAI();
  const prompt = `Act as a luxury fashion stylist. Occasion: ${occasion}, Vibe: ${vibe}, Budget: ${budget}. ${base64Image ? "Base recommendations on the attached clothing item." : ""} Return a JSON object with recommendations[] (id, name, description, stylingTip) and a vibeSummary.`;

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

const visualizeLook = async (description) => {
  const ai = getAI();
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash-image',
    contents: { parts: [{ text: `High-fashion editorial photography. A complete outfit: ${description}. Neutral chic studio background.` }] },
    config: { imageConfig: { aspectRatio: "3:4" } }
  });
  const part = response.candidates?.[0]?.content?.parts.find(p => p.inlineData);
  return part ? `data:image/png;base64,${part.inlineData.data}` : null;
};

// --- Components ---

const Button = ({ children, onClick, loading, variant = 'primary', className = '' }) => {
  const styles = {
    primary: "bg-black text-white hover:bg-zinc-800",
    secondary: "bg-amber-100 text-amber-900 hover:bg-amber-200",
  };
  return html`
    <button onClick=${onClick} disabled=${loading} className="px-8 py-4 rounded-full font-bold text-[10px] tracking-[0.2em] uppercase transition-all flex items-center justify-center disabled:opacity-50 ${styles[variant]} ${className}">
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
      await callWithRetry(() => onVisualize(outfit.id, outfit.description));
    } finally {
      setLoading(false);
    }
  };

  return html`
    <div className="bg-white rounded-[2rem] overflow-hidden border border-zinc-100 shadow-sm animate-fade-in group">
      <div className="aspect-[3/4] bg-zinc-50 relative flex items-center justify-center">
        ${outfit.imageUrl 
          ? html`<img src=${outfit.imageUrl} className="w-full h-full object-cover" />`
          : html`<${Button} variant="secondary" onClick=${handleVis} loading=${loading} className="py-2 text-[8px]">Visualize Look</${Button}>`
        }
      </div>
      <div className="p-8 space-y-4">
        <div className="flex justify-between items-start">
          <h3 className="text-xl font-serif font-bold">${outfit.name}</h3>
          <button onClick=${() => onSave(outfit)} className="text-zinc-300 hover:text-amber-600 transition-colors">
            <svg className="w-6 h-6 ${isSaved ? 'text-amber-600' : ''}" fill="currentColor" viewBox="0 0 20 20"><path d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z"/></svg>
          </button>
        </div>
        <p className="text-zinc-500 text-sm leading-relaxed">${outfit.description}</p>
        <p className="text-[11px] text-zinc-400 italic pt-4 border-t border-zinc-50"><span className="text-amber-700 font-black not-italic mr-2">TIP:</span>${outfit.stylingTip}</p>
      </div>
    </div>
  `;
};

// --- App ---

const App = () => {
  const [tab, setTab] = useState('stylist');
  const [params, setParams] = useState({ occasion: 'Casual', vibe: 'Minimalist', budget: 'Mid-Range ($$)' });
  const [image, setImage] = useState(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [saved, setSaved] = useState(() => JSON.parse(localStorage.getItem('saved_styles') || '[]'));

  useEffect(() => localStorage.setItem('saved_styles', JSON.stringify(saved)), [saved]);

  const handleGenerate = async () => {
    setLoading(true);
    try {
      const data = await callWithRetry(() => getRecommendations(params.occasion, params.budget, params.vibe, image?.split(',')[1]));
      setResult(data);
    } finally {
      setLoading(false);
    }
  };

  const handleVisualize = async (id, desc) => {
    const url = await visualizeLook(desc);
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
      <header className="sticky top-0 z-50 glass-panel border-b border-white/20 py-6 px-10 flex justify-between items-center">
        <div className="flex items-center gap-4 cursor-pointer" onClick=${() => setTab('stylist')}>
          <div className="w-10 h-10 bg-black rounded-lg flex items-center justify-center text-white font-serif font-bold text-xl shadow-xl">S</div>
          <h1 className="text-2xl font-serif font-bold tracking-tight">StyleSense</h1>
        </div>
        <nav className="flex gap-12 text-[10px] font-black uppercase tracking-[0.3em] text-zinc-400">
          <button onClick=${() => setTab('stylist')} className="${tab === 'stylist' ? 'text-black border-b-2 border-black pb-1' : ''}">Stylist</button>
          <button onClick=${() => setTab('wardrobe')} className="${tab === 'wardrobe' ? 'text-black border-b-2 border-black pb-1' : ''}">Wardrobe</button>
        </nav>
      </header>

      <main className="max-w-7xl mx-auto px-10 mt-20">
        ${tab === 'stylist' && html`
          <div className="space-y-20 animate-fade-in">
            ${!result ? html`
              <div className="grid lg:grid-cols-2 gap-24 items-center">
                <div className="space-y-10">
                  <h2 className="text-7xl font-serif font-bold leading-[1.1]">Curated<br /><span className="italic text-amber-600">For You.</span></h2>
                  <div className="bg-white/40 backdrop-blur-xl border border-white p-12 rounded-[3rem] shadow-2xl space-y-10">
                    <div className="grid md:grid-cols-3 gap-8">
                      ${['occasion', 'vibe', 'budget'].map(f => html`
                        <div className="space-y-3" key=${f}>
                          <label className="text-[9px] font-black uppercase text-zinc-400 tracking-widest">${f}</label>
                          <select className="w-full bg-white rounded-2xl p-4 text-xs font-bold border-none" onChange=${e => setParams(p => ({ ...p, [f]: e.target.value }))}>
                            ${f === 'occasion' && ['Casual', 'Formal', 'Work', 'Streetwear'].map(o => html`<option>${o}</option>`)}
                            ${f === 'vibe' && ['Minimalist', 'Chic', 'Edgy', 'Classic'].map(v => html`<option>${v}</option>`)}
                            ${f === 'budget' && ['Budget ($)', 'Mid-Range ($$)', 'Luxury ($$$)'].map(b => html`<option>${b}</option>`)}
                          </select>
                        </div>
                      `)}
                    </div>
                    <${Button} loading=${loading} onClick=${handleGenerate} className="w-full">Generate Selection</${Button}>
                  </div>
                </div>
                <div className="aspect-[4/5] bg-white rounded-[4rem] border-[12px] border-white shadow-2xl overflow-hidden relative cursor-pointer" onClick=${() => !image && document.getElementById('uploader').click()}>
                  ${image ? html`<img src=${image} className="w-full h-full object-cover" />` : html`
                    <div className="flex flex-col items-center justify-center h-full space-y-6 text-zinc-400">
                      <div className="text-6xl">👕</div>
                      <p className="text-sm font-bold uppercase tracking-widest">Upload Inspiration</p>
                    </div>`}
                  <input type="file" id="uploader" className="hidden" accept="image/*" onChange=${e => {
                    const reader = new FileReader();
                    reader.onload = () => setImage(reader.result);
                    reader.readAsDataURL(e.target.files[0]);
                  }} />
                </div>
              </div>` : html`
              <div className="space-y-16">
                <div className="border-b border-zinc-200 pb-12">
                  <button onClick=${() => setResult(null)} className="text-[10px] font-black uppercase text-zinc-400 mb-4">← Start Over</button>
                  <h2 className="text-6xl font-serif font-bold italic">The Edit</h2>
                  <p className="text-zinc-500 text-sm max-w-2xl mt-4 leading-relaxed">${result.vibeSummary}</p>
                </div>
                <div className="grid md:grid-cols-3 gap-12">
                  ${result.recommendations.map(o => html`
                    <${OutfitCard} key=${o.id} outfit=${o} onSave=${toggleSave} isSaved=${saved.some(s => s.id === o.id)} onVisualize=${handleVisualize} />
                  `)}
                </div>
              </div>`
            }
          </div>
        `}

        ${tab === 'wardrobe' && html`
          <div className="space-y-16 animate-fade-in">
            <h2 className="text-6xl font-serif font-bold italic text-center">Saved Wardrobe</h2>
            ${saved.length > 0 ? html`
              <div className="grid md:grid-cols-3 gap-12">
                ${saved.map(o => html`
                  <${OutfitCard} key=${o.id} outfit=${o} onSave=${toggleSave} isSaved=${true} onVisualize=${handleVisualize} />
                `)}
              </div>` : html`<p className="text-center text-zinc-400 font-serif italic py-40">Your collection is empty.</p>`
            }
          </div>
        `}
      </main>
    </div>
  `;
};

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(html`<${App} />`);
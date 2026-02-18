
import React from 'react';
import { OutfitRecommendation } from '../types';
import { Button } from './Button';

interface OutfitCardProps {
  outfit: OutfitRecommendation;
  index: number;
  onSave?: (outfit: OutfitRecommendation) => void;
  isSaved?: boolean;
}

export const OutfitCard: React.FC<OutfitCardProps> = ({ outfit, index, onSave, isSaved }) => {
  return (
    <div 
      className="bg-white rounded-2xl overflow-hidden shadow-sm border border-gray-100 hover:shadow-xl transition-all duration-500 animate-in fade-in slide-in-from-bottom-4"
      style={{ animationDelay: `${index * 150}ms`, animationFillMode: 'both' }}
    >
      <div className="relative aspect-[3/4] bg-gray-100 overflow-hidden">
        {outfit.imageUrl ? (
          <img 
            src={outfit.imageUrl} 
            alt={outfit.name} 
            className="w-full h-full object-cover transition-transform duration-700 hover:scale-110"
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center p-8 text-center bg-gray-50">
            <div className="animate-pulse flex flex-col items-center">
              <div className="w-12 h-12 bg-gray-200 rounded-full mb-4"></div>
              <p className="text-gray-400 text-sm font-medium">Visualizing look...</p>
            </div>
          </div>
        )}
        <div className="absolute top-4 left-4 bg-white/90 backdrop-blur px-3 py-1 rounded-full text-[10px] font-bold tracking-widest text-black uppercase shadow-sm">
          Look #{index + 1}
        </div>
      </div>

      <div className="p-6">
        <div className="flex items-start justify-between mb-2">
          <h3 className="text-xl font-serif font-semibold text-gray-900 leading-tight">{outfit.name}</h3>
          {onSave && (
            <button 
              onClick={() => onSave(outfit)}
              className={`p-2 rounded-full transition-colors ${isSaved ? 'text-amber-500 bg-amber-50' : 'text-gray-400 bg-gray-50 hover:text-black'}`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" clipRule="evenodd" />
              </svg>
            </button>
          )}
        </div>
        
        <p className="text-gray-500 text-sm mb-6 line-clamp-2">{outfit.description}</p>
        
        <div className="space-y-4">
          <div>
            <h4 className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-2">Key Pieces</h4>
            <div className="flex flex-wrap gap-1.5">
              {outfit.keyItems.slice(0, 3).map((item, i) => (
                <span key={i} className="px-2 py-0.5 bg-gray-50 text-gray-600 rounded-md text-[11px] border border-gray-100">
                  {item}
                </span>
              ))}
              {outfit.keyItems.length > 3 && <span className="text-[11px] text-gray-400">+{outfit.keyItems.length - 3} more</span>}
            </div>
          </div>

          <div className="pt-4 border-t border-gray-50">
            <p className="text-[11px] leading-relaxed text-gray-600 italic">
              <span className="font-bold text-amber-600 not-italic mr-1">STYLIST TIP:</span> 
              {outfit.stylingTip}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

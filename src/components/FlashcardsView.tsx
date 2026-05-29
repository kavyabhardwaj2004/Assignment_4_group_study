import React, { useState } from 'react';
import { ChevronLeft, ChevronRight, RefreshCw, Award } from 'lucide-react';
import { FlashcardItem } from '@/app/actions/gemini';

interface FlashcardsViewProps {
  cards: FlashcardItem[];
}

export default function FlashcardsView({ cards }: FlashcardsViewProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);

  if (!cards || cards.length === 0) {
    return (
      <div className="p-8 text-center text-slate-500 text-xs">
        No flashcards available.
      </div>
    );
  }

  const currentCard = cards[currentIndex];

  const handleNext = () => {
    setIsFlipped(false);
    setTimeout(() => {
      setCurrentIndex((prev) => (prev + 1) % cards.length);
    }, 150);
  };

  const handlePrev = () => {
    setIsFlipped(false);
    setTimeout(() => {
      setCurrentIndex((prev) => (prev - 1 + cards.length) % cards.length);
    }, 150);
  };

  return (
    <div className="flex flex-col items-center justify-center p-4 space-y-6">
      
      {/* 3D Flashcard Container */}
      <div 
        onClick={() => setIsFlipped(!isFlipped)}
        className="w-full max-w-md h-64 perspective-1000 cursor-pointer"
      >
        <div className={`w-full h-full transform-style-3d transition-transform duration-500 relative ${
          isFlipped ? 'rotate-y-180' : ''
        }`}>
          
          {/* Front of Card (Question) */}
          <div className="absolute inset-0 bg-slate-900 border border-white/10 rounded-2xl p-6 flex flex-col justify-between backface-hidden shadow-2xl">
            <div className="flex justify-between items-center text-[10px] text-indigo-400 font-bold uppercase tracking-wider">
              <span>Flashcard Question</span>
              <span>{currentIndex + 1} / {cards.length}</span>
            </div>
            <div className="flex-1 flex items-center justify-center text-center">
              <p className="text-base md:text-lg font-bold text-slate-100 leading-snug">
                {currentCard.front}
              </p>
            </div>
            <div className="flex justify-center items-center text-[10px] text-slate-500 space-x-1.5">
              <RefreshCw className="h-3 w-3 animate-spin" style={{ animationDuration: '6s' }} />
              <span>Click to reveal answer</span>
            </div>
          </div>

          {/* Back of Card (Answer) */}
          <div className="absolute inset-0 bg-indigo-950/95 border border-indigo-500/20 rounded-2xl p-6 flex flex-col justify-between backface-hidden rotate-y-180 shadow-2xl">
            <div className="flex justify-between items-center text-[10px] text-emerald-400 font-bold uppercase tracking-wider">
              <span>Answer / Explanation</span>
              <span>{currentIndex + 1} / {cards.length}</span>
            </div>
            <div className="flex-1 flex items-center justify-center text-center overflow-y-auto max-h-[140px] px-2 scrollbar-thin">
              <p className="text-sm text-slate-200 font-light leading-relaxed">
                {currentCard.back}
              </p>
            </div>
            <div className="flex justify-center items-center text-[10px] text-slate-400 space-x-1">
              <Award className="h-3.5 w-3.5 text-emerald-400" />
              <span>Great job! Click to show question</span>
            </div>
          </div>

        </div>
      </div>

      {/* Navigation Controls */}
      <div className="flex items-center space-x-4">
        <button
          onClick={handlePrev}
          className="p-2.5 bg-white/5 border border-white/10 hover:bg-white/10 text-slate-300 rounded-xl transition duration-200"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        
        <span className="text-xs text-slate-400 font-mono">
          Card {currentIndex + 1} of {cards.length}
        </span>

        <button
          onClick={handleNext}
          className="p-2.5 bg-white/5 border border-white/10 hover:bg-white/10 text-slate-300 rounded-xl transition duration-200"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}

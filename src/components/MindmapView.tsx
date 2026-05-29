import React, { useEffect, useRef, useState } from 'react';
import mermaid from 'mermaid';

interface MindmapViewProps {
  code: string;
}

function sanitizeAndFormatMermaidMindmap(rawCode: string): string {
  const lines = rawCode.split('\n');
  const cleanLines: { indent: number; text: string }[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    
    if (trimmed.toLowerCase().startsWith('mindmap')) {
      continue;
    }
    
    // Skip markdown code block markers
    if (trimmed.startsWith('```')) continue;
    
    // Determine depth based on leading spaces
    const leadingSpaces = line.match(/^ */)?.[0].length || 0;
    
    // Clean the content text of the line
    let cleanText = trimmed;
    
    // Remove bullet prefixes: e.g. "- ", "* ", "+ ", "1. " etc.
    cleanText = cleanText.replace(/^([-*+]\s+|[0-9]+\.\s+)/, '');
    
    // Remove Mermaid node shapes and quotes if they already exist, to get clean text
    cleanText = cleanText.replace(/^[a-zA-Z0-9_-]+\s*[\(\[\{]+/g, ''); // Remove opening node shapes
    cleanText = cleanText.replace(/[\)\]\}]+$/g, '');                 // Remove closing node shapes
    cleanText = cleanText.replace(/^["'“`]+|["'”`]+$/g, '');           // Remove wrapping quotes
    cleanText = cleanText.trim();
    
    if (cleanText) {
      cleanLines.push({ indent: leadingSpaces, text: cleanText });
    }
  }

  if (cleanLines.length === 0) {
    return `mindmap\n  root(("Study Topic"))\n    "Details"`;
  }

  // Normalize indents: map indentation values to incremental depths (0, 1, 2, ...)
  const uniqueIndents = Array.from(new Set(cleanLines.map(l => l.indent))).sort((a, b) => a - b);
  
  let result = 'mindmap\n';
  cleanLines.forEach((line, index) => {
    const depth = uniqueIndents.indexOf(line.indent);
    const spaces = '  '.repeat(depth + 1); // 2 spaces per depth level starting with 1
    
    // Use unique node IDs and wrap text cleanly in quotes
    const nodeId = `node_${index}`;
    const escapedText = line.text.replace(/"/g, '\\"'); // Escape internal double quotes
    
    if (depth === 0) {
      // Root node shape: double circle
      result += `${spaces}${nodeId}(("${escapedText}"))\n`;
    } else if (depth === 1) {
      // Level 1: rounded box
      result += `${spaces}${nodeId}("${escapedText}")\n`;
    } else {
      // Leaf/Deep level: default box/text
      result += `${spaces}${nodeId}["${escapedText}"]\n`;
    }
  });
  
  return result;
}

export default function MindmapView({ code }: MindmapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    mermaid.initialize({
      startOnLoad: false,
      theme: 'dark',
      securityLevel: 'loose',
      themeVariables: {
        background: '#0f172a',
        primaryColor: '#6366f1',
        primaryTextColor: '#fff',
        lineColor: '#4f46e5',
      }
    });
  }, []);

  useEffect(() => {
    if (!containerRef.current || !code) return;

    setError(null);
    const elementId = `mermaid-${Math.floor(Math.random() * 100000)}`;
    containerRef.current.innerHTML = `<div class="animate-pulse text-indigo-400 text-xs py-4 text-center">Parsing diagram...</div>`;

    const sanitizedCode = sanitizeAndFormatMermaidMindmap(code);

    try {
      mermaid.render(elementId, sanitizedCode)
        .then(({ svg }) => {
          if (containerRef.current) {
            containerRef.current.innerHTML = svg;
          }
        })
        .catch((err) => {
          console.error("Mermaid render error:", err);
          setError("Failed to render mindmap. Please regenerate.");
          if (containerRef.current) {
            containerRef.current.innerHTML = "";
          }
        });
    } catch (err: any) {
      setError("Mermaid parsing exception.");
      console.error(err);
    }
  }, [code]);

  if (error) {
    return (
      <div className="p-4 bg-red-950/20 border border-red-500/20 text-red-400 text-xs rounded-xl">
        {error}
      </div>
    );
  }

  return (
    <div 
      ref={containerRef} 
      className="w-full flex items-center justify-center p-4 bg-slate-950/40 border border-white/5 rounded-2xl overflow-auto min-h-[300px] max-h-[500px]"
    />
  );
}

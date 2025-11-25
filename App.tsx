import React, { useState, useRef, useEffect, useMemo } from 'react';
import { 
    DRMD, INITIAL_DRMD, INITIAL_PRODUCER, INITIAL_PERSON, INITIAL_ID, INITIAL_QUANTITY, ALLOWED_TITLES
} from './types';
import { extractStructuredDataFromPdf } from './services/geminiService';
import { generateDrmdXml } from './utils/xmlGenerator';
import { convertToDSI } from './utils/unitConverter';

// Helper for UUIDs
const generateUUID = () => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    return Math.random().toString(36).substring(2) + Date.now().toString(36);
};

// --- Custom PDF Viewer Component ---
interface HighlightData {
    type: 'text' | 'coords';
    value: string | number[]; // text string OR [page, ymin, xmin, ymax, xmax]
}

interface PdfViewport {
    width: number;
    height: number;
    transform: number[];
}

// Sub-component for individual PDF pages
const PdfPage: React.FC<{ 
    pdfDoc: any; 
    pageNum: number; 
    highlightData?: HighlightData | null; 
}> = ({ pdfDoc, pageNum, highlightData }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const wrapperRef = useRef<HTMLDivElement>(null);
    const [viewport, setViewport] = useState<PdfViewport | null>(null);
    const scrollRef = useRef<HTMLDivElement>(null);

    // 1. Render PDF Content
    useEffect(() => {
        const render = async () => {
            if (!pdfDoc || !wrapperRef.current || !canvasRef.current) return;
            
            // Only re-render canvas if it's the first load or if text highlighting is requested (legacy fallback)
            const isTextHighlight = highlightData?.type === 'text';

            const page = await pdfDoc.getPage(pageNum);
            const containerWidth = wrapperRef.current.clientWidth || 800; // Fallback width
            
            // Calculate scale to fit container with high DPI support
            // We ensure a minimum scale of 1.5 for text clarity
            const unscaledViewport = page.getViewport({ scale: 1 });
            const pixelRatio = window.devicePixelRatio || 1;
            const desiredScale = (containerWidth * pixelRatio) / unscaledViewport.width;
            const scale = Math.max(desiredScale, 1.5);
            
            const newViewport = page.getViewport({ scale });
            setViewport(newViewport);
            
            const canvas = canvasRef.current;
            const ctx = canvas.getContext('2d');
            
            if (ctx && (canvas.width !== newViewport.width || isTextHighlight)) {
                canvas.width = newViewport.width;
                canvas.height = newViewport.height;
                
                // Clear and Render PDF
                const renderContext = { canvasContext: ctx, viewport: newViewport };
                await page.render(renderContext).promise;

                // --- Text Search Based Highlighting (Canvas Fallback) ---
                if (highlightData?.type === 'text' && typeof highlightData.value === 'string') {
                     const queryLower = highlightData.value.toLowerCase().trim();
                     if (queryLower.length > 0) {
                        const textContent = await page.getTextContent();
                        let matchFound = false;
                        for (const item of textContent.items) {
                            const str = (item as any).str.toLowerCase();
                            if (str.includes(queryLower)) {
                                const transform = (item as any).transform;
                                // pdf.js transform: [scaleX, skewY, skewX, scaleY, x, y]
                                const x = transform[4];
                                const y = transform[5];
                                const w = (item as any).width;
                                const h = (item as any).height || 12;

                                ctx.save();
                                ctx.fillStyle = 'rgba(255, 215, 0, 0.4)';
                                ctx.globalCompositeOperation = 'multiply'; 

                                // Convert PDF point coords to Viewport pixel coords
                                const tx = newViewport.transform;
                                const canvasX = x * tx[0] + y * tx[2] + tx[4];
                                const canvasY = x * tx[1] + y * tx[3] + tx[5];
                                const widthScaled = w * tx[0];
                                const heightScaled = h * Math.abs(tx[3]);

                                // Draw highlight on canvas
                                ctx.fillRect(canvasX, canvasY - heightScaled * 0.8, widthScaled, heightScaled * 1.4);
                                ctx.restore();
                                matchFound = true;
                            }
                        }
                        // Auto-scroll for text match if found on this page
                        if (matchFound) {
                            canvas.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        }
                    }
                }
            }
        };
        render();
    }, [pdfDoc, pageNum, highlightData?.type === 'text' ? highlightData.value : 'resize-trigger']);

    // 2. Coordinate Highlighting (DOM Overlay - The "Best Method")
    const highlightBox = useMemo(() => {
        if (!highlightData || highlightData.type !== 'coords') return null;
        
        // Gemini: [pageIndex, ymin, xmin, ymax, xmax] (0-1000 scale)
        const [p, rawYmin, xmin, rawYmax, xmax] = highlightData.value as number[];
        
        if (p !== pageNum) return null;

        // Apply dynamic padding to height to fix "small box" issues
        const rawHeight = rawYmax - rawYmin;
        
        // User requested: "starts perfectly but the height of the box should be sightly more"
        // We increase the padding factor and shift the distribution.
        const paddingFactor = rawHeight < 50 ? 0.5 : 0.2; 
        const padding = rawHeight * paddingFactor;
        
        // Apply assymetric padding: 
        // 10% to Top (maintain "starts perfectly" with slight buffer)
        // 90% to Bottom (increase height below)
        const ymin = Math.max(0, rawYmin - (padding * 0.1));
        const ymax = Math.min(1000, rawYmax + (padding * 0.9));

        // Map 0-1000 normalized coordinates to PERCENTAGES of container
        // This handles CSS scaling (e.g. w-full) automatically
        return {
            top: `${ymin / 10}%`,
            left: `${xmin / 10}%`,
            width: `${(xmax - xmin) / 10}%`,
            height: `${(ymax - ymin) / 10}%`
        };
    }, [highlightData, pageNum]);

    // Scroll effect for Coords
    useEffect(() => {
        if (highlightBox && scrollRef.current) {
            scrollRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }, [highlightBox]);

    // Use aspect-ratio style to strictly enforce the relationship between width/height based on the PDF Page
    const containerStyle = useMemo(() => {
        if (!viewport) return { minHeight: '300px' };
        return { aspectRatio: `${viewport.width} / ${viewport.height}` };
    }, [viewport]);

    return (
        <div 
            ref={wrapperRef} 
            className="relative w-full mb-4 shadow-md bg-white"
            style={containerStyle}
        >
            <canvas 
                ref={canvasRef} 
                className="block w-full h-full rounded-sm" 
            />
            {highlightBox && (
                <div 
                    ref={scrollRef}
                    className="absolute border-2 border-red-600 bg-red-500/25 z-10 animate-pulse shadow-sm mix-blend-multiply"
                    style={{
                        top: highlightBox.top,
                        left: highlightBox.left,
                        width: highlightBox.width,
                        height: highlightBox.height,
                        pointerEvents: 'none' // Allow clicks to pass through to canvas/text if needed
                    }}
                />
            )}
        </div>
    )
}

const PdfViewer: React.FC<{ url: string; highlightData?: HighlightData | null }> = ({ url, highlightData }) => {
    const [pdfDoc, setPdfDoc] = useState<any>(null);
    const [pages, setPages] = useState<number[]>([]);

    useEffect(() => {
        const loadPdf = async () => {
            try {
                const pdfjsLib = (window as any).pdfjsLib;
                if (!pdfjsLib) return;

                const loadingTask = pdfjsLib.getDocument(url);
                const pdf = await loadingTask.promise;
                setPdfDoc(pdf);
                setPages(Array.from({ length: pdf.numPages }, (_, i) => i + 1));
            } catch (e) {
                console.error("Error loading PDF", e);
            }
        };
        loadPdf();
    }, [url]);

    return (
        <div className="h-full w-full overflow-y-auto bg-gray-700 p-4 flex flex-col gap-4 items-center">
            {pages.map(pageNum => (
                <PdfPage 
                    key={pageNum} 
                    pdfDoc={pdfDoc} 
                    pageNum={pageNum} 
                    highlightData={highlightData} 
                />
            ))}
        </div>
    );
};

const App: React.FC = () => {
  const [drmdData, setDrmdData] = useState<DRMD>(INITIAL_DRMD);
  const [geminiApiKey, setGeminiApiKey] = useState<string>("");
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>("settings");
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [highlightData, setHighlightData] = useState<HighlightData | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDrmdData(prev => {
        const newData = { ...prev };
        if (!newData.administrativeData.uniqueIdentifier) {
            newData.administrativeData.uniqueIdentifier = generateUUID();
        }
        return newData;
    });
  }, []);

  const handleHighlight = (data: string | number[] | undefined) => {
      if (!data) return;
      
      if (Array.isArray(data) && data.length === 5) {
          setHighlightData({ type: 'coords', value: data });
      } else if (typeof data === 'string' && data.length > 0) {
          setHighlightData({ type: 'text', value: data });
      }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!geminiApiKey) {
        setError("Please enter a Google Gemini API Key in Settings.");
        setActiveTab("settings");
        return;
    }

    if (event.target.files && event.target.files[0]) {
      const file = event.target.files[0];
      const objectUrl = URL.createObjectURL(file);
      setPdfUrl(objectUrl);
      setError(null);
      setIsProcessing(true);

      const reader = new FileReader();
      reader.onloadend = async () => {
          const base64String = reader.result as string;
          const base64Content = base64String.split(',')[1];

          try {
              setStatusMessage("Analyzing PDF structure and coordinates with Gemini Vision...");
              const extractedData = await extractStructuredDataFromPdf(base64Content, geminiApiKey);
              
              // Normalize validity duration
              if (extractedData?.administrativeData && extractedData.administrativeData.validityType === "Time After Dispatch") {
                  const rawY = extractedData.administrativeData.durationY || 0;
                  const rawM = extractedData.administrativeData.durationM || 0;
                  const totalMonths = (rawY * 12) + rawM;
                  
                  if (totalMonths > 0) {
                      extractedData.administrativeData.durationY = Math.floor(totalMonths / 12);
                      extractedData.administrativeData.durationM = totalMonths % 12;
                  }
              }

              // Fix Specific Time MM/YYYY format to YYYY-MM-DD (End of Month)
              if (extractedData?.administrativeData?.validityType === "Specific Time" && extractedData.administrativeData.specificTime) {
                   const raw = extractedData.administrativeData.specificTime.trim();
                   // Match MM/YYYY or M/YYYY
                   const match = raw.match(/^(\d{1,2})\/(\d{4})$/);
                   if (match) {
                       const month = parseInt(match[1]);
                       const year = parseInt(match[2]);
                       // Get last day of month: day 0 of next month
                       const lastDay = new Date(year, month, 0).getDate();
                       extractedData.administrativeData.specificTime = `${year}-${match[1].padStart(2, '0')}-${lastDay}`;
                   }
              }
              
              // Auto-fix for Berlin -> DE
              if (extractedData?.administrativeData?.producers) {
                  extractedData.administrativeData.producers.forEach((p: any) => {
                      const city = p.address?.city || "";
                      if (city.toLowerCase().includes("berlin") || city.toLowerCase().includes("adlershof")) {
                          if (!p.address) p.address = {};
                          p.address.countryCode = "DE";
                      }
                  });
              }

              const cleanPostalCode = (pc: string) => pc ? pc.replace(/[^0-9]/g, '') : "";

              setDrmdData(prev => {
                  const newMats = (extractedData?.materials || []).map((m: any) => ({
                      ...m, 
                      uuid: generateUUID(), 
                      materialIdentifiers: [{...INITIAL_ID}], 
                      materialClass: m.materialClass || "", 
                      itemQuantities: m.itemQuantities || "1",
                      minimumSampleSize: m.minimumSampleSize || "", 
                      fieldCoordinates: m.fieldCoordinates,
                      sectionCoordinates: m.sectionCoordinates
                  }));
                  
                  // Property and Result Merging Logic
                  const normalizeName = (s: string) => s ? s.toLowerCase().replace(/[^a-z0-9]/g, "") : "";
                  const propertyMap: Record<string, any> = {};

                  (extractedData?.properties || []).forEach((p: any) => {
                      const propName = p.name || "Material Properties";
                      const propKey = normalizeName(propName);
                      
                      if (!propertyMap[propKey]) {
                          propertyMap[propKey] = { ...p, results: [] };
                      }
                      
                      // Move Description to Result if it looks like footnotes (starts with 1), * etc)
                      const propDesc = (p.description || "").trim();
                      const isFootnote = propDesc.match(/^(\d+\)|1\)|\*)/);
                      let resultDescPrefix = "";
                      
                      if (isFootnote) {
                          resultDescPrefix = propDesc;
                          propertyMap[propKey].description = ""; // clear from property
                      }

                      if (p.results) {
                          // Inject the moved description into the first result if available
                          if (resultDescPrefix && p.results.length > 0) {
                              p.results[0].description = (p.results[0].description ? p.results[0].description + "\n" : "") + resultDescPrefix;
                          }
                          
                          p.results.forEach((r: any) => {
                              const rName = (r.name || "").toLowerCase().trim();
                              
                              // Refined fragment check: Only merge if it looks like a unit header
                              const isFragment = 
                                  rName.includes("in mg/kg") || 
                                  rName.includes("in %") || 
                                  rName === "mg/kg" ||
                                  rName === "%" ||
                                  rName === "";

                              if (propertyMap[propKey].results.length > 0 && isFragment) {
                                  // Merge into the first result
                                  if (r.quantities) {
                                      if (!propertyMap[propKey].results[0].quantities) {
                                          propertyMap[propKey].results[0].quantities = [];
                                      }
                                      propertyMap[propKey].results[0].quantities.push(...r.quantities);
                                  }
                                  if (r.description) {
                                      propertyMap[propKey].results[0].description = (propertyMap[propKey].results[0].description || "") + "\n" + r.description;
                                  }
                              } else {
                                  // Add as new separate table
                                  propertyMap[propKey].results.push(r);
                              }
                          });
                      }
                  });

                  const newProps = Object.values(propertyMap).map((p: any) => {
                      const finalResults = (p.results || []).map((r: any) => {
                          const qs = (r.quantities || []).map((q: any) => {
                              let finalValue = q.value || "";
                              let finalUncertainty = q.uncertainty || "";

                              if (!finalValue && finalUncertainty && (finalUncertainty.trim().startsWith('<') || finalUncertainty.trim().startsWith('>'))) {
                                  finalValue = finalUncertainty;
                                  finalUncertainty = "";
                              }

                              const dsi = convertToDSI(finalValue, q.unit);
                              return {
                                  ...q, 
                                  uuid: generateUUID(), 
                                  identifiers: [{...INITIAL_ID}],
                                  value: finalValue, 
                                  unit: q.unit || "", 
                                  uncertainty: finalUncertainty, 
                                  coverageFactor: q.coverageFactor || "2.0",
                                  coverageProbability: q.coverageProbability || "0.95",
                                  distribution: q.distribution || "normal",
                                  dsiValue: dsi.dsiValue,
                                  dsiUnit: dsi.dsiUnit,
                                  fieldCoordinates: q.fieldCoordinates
                              };
                          });
                          
                          // Ensure valid name
                          const finalName = r.name && r.name.length > 1 ? r.name : "Values";

                          return { 
                              ...r, 
                              name: finalName,
                              uuid: generateUUID(), 
                              quantities: qs,
                              sectionCoordinates: r.sectionCoordinates // Ensure section coords are preserved for tables
                          };
                      });
                      return { ...p, uuid: generateUUID(), results: finalResults };
                  });

                  const newProds = (extractedData?.administrativeData?.producers || []).map((p: any) => {
                      let countryCode = p.address?.countryCode || "";
                      const city = p.address?.city || "";
                      
                      // Auto-fix for Berlin -> DE (redundant check but keeps consistency)
                      if (city.toLowerCase().includes("berlin") || city.toLowerCase().includes("adlershof")) {
                          countryCode = "DE";
                      }
                  
                      return {
                          ...p, 
                          uuid: generateUUID(), 
                          organizationIdentifiers: [{...INITIAL_ID}], 
                          address: { ...p.address, postCode: cleanPostalCode(p.address?.postCode), countryCode },
                          fieldCoordinates: p.fieldCoordinates,
                          sectionCoordinates: p.sectionCoordinates
                      };
                  });

                  const newPersons = (extractedData?.administrativeData?.responsiblePersons || []).map((p: any) => ({
                      ...INITIAL_PERSON, 
                      uuid: generateUUID(), 
                      name: p.name || "", 
                      role: p.role || "", 
                      description: p.description || "",
                      fieldCoordinates: p.fieldCoordinates,
                      sectionCoordinates: p.sectionCoordinates
                  }));

                  return {
                      ...prev,
                      administrativeData: { 
                          ...prev.administrativeData, 
                          ...extractedData?.administrativeData,
                          uniqueIdentifier: extractedData?.administrativeData?.uniqueIdentifier || prev.administrativeData.uniqueIdentifier || generateUUID(),
                          dateOfIssue: new Date().toISOString().split('T')[0],
                          documentIdentifiers: [{ ...INITIAL_ID }],
                          producers: newProds.length > 0 ? newProds : prev.administrativeData.producers,
                          responsiblePersons: newPersons.length > 0 ? newPersons : prev.administrativeData.responsiblePersons,
                          fieldCoordinates: extractedData?.administrativeData?.fieldCoordinates
                      },
                      statements: { 
                          ...prev.statements, 
                          official: { ...prev.statements.official, ...(extractedData?.statements?.official || {}) } 
                      },
                      materials: newMats.length > 0 ? newMats : prev.materials,
                      properties: newProps.length > 0 ? newProps : prev.properties
                  };
              });
              setActiveTab("admin");
            } catch (err) {
              setError(err instanceof Error ? err.message : "Extraction failed.");
              console.error(err);
            } finally {
              setIsProcessing(false);
              setStatusMessage("");
            }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleExport = () => {
    const xmlContent = generateDrmdXml(drmdData);
    const blob = new Blob([xmlContent], { type: 'text/xml' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `DRMD-${drmdData.administrativeData.uniqueIdentifier || 'export'}.xml`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getIsoDuration = () => {
      const y = drmdData.administrativeData.durationY;
      const m = drmdData.administrativeData.durationM;
      if (!y && !m) return "P";
      return `P${y?y+'Y':''}${m?m+'M':''}`;
  };

  const renderSettings = () => (
      <div className="space-y-6 animate-fadeIn">
          <SectionHeader title="Application Settings" icon="⚙️" />
          <div className="bg-gray-50 p-6 rounded-lg border border-gray-200 space-y-6">
              <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">Google Gemini API Key</label>
                  <input 
                      type="password" 
                      value={geminiApiKey}
                      onChange={(e) => setGeminiApiKey(e.target.value)}
                      placeholder="Enter Google Gemini API Key..."
                      className="w-full border border-gray-300 rounded-md p-2 focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                  <p className="text-xs text-gray-500 mt-1">Used for extracting data from PDF (Gemini 1.5 Pro/Flash or 2.0).</p>
              </div>
          </div>
      </div>
  );

  const renderAdmin = () => (
    <div className="space-y-8 animate-fadeIn">
        <div className="space-y-4 border p-4 rounded-lg bg-white shadow-sm">
            <SectionHeader title="Basic Information" icon="📄" />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Select label="Title of Document *" value={drmdData.administrativeData.title} options={ALLOWED_TITLES} onChange={(v) => setDrmdData(p => ({...p, administrativeData: {...p.administrativeData, title: v}}))} />
                <div className="flex gap-2 items-end">
                    <div className="flex-1">
                        <Input label="Unique Identifier *" value={drmdData.administrativeData.uniqueIdentifier} onChange={(v) => setDrmdData(p => ({...p, administrativeData: {...p.administrativeData, uniqueIdentifier: v}}))} onInfoClick={() => handleHighlight(drmdData.administrativeData.fieldCoordinates?.['uniqueIdentifier'] || drmdData.administrativeData.uniqueIdentifier)} />
                    </div>
                    <button onClick={() => setDrmdData(p => ({...p, administrativeData: {...p.administrativeData, uniqueIdentifier: generateUUID()}}))} className="bg-gray-200 p-2 rounded mb-[2px] hover:bg-gray-300" title="Generate new UUID">🔄</button>
                </div>
            </div>
            
            {/* Validity Section */}
            <div className="border-t pt-4 mt-2">
                <h4 className="font-bold text-sm text-gray-700 mb-2">Period of Validity</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
                    <Select label="Validity Type *" value={drmdData.administrativeData.validityType} options={["Until Revoked", "Time After Dispatch", "Specific Time"]} onChange={(v) => setDrmdData(p => ({...p, administrativeData: {...p.administrativeData, validityType: v as any}}))} />
                    
                    {drmdData.administrativeData.validityType === "Time After Dispatch" && (
                        <>
                            <div className="flex gap-2">
                                <Input label="Years" type="number" value={drmdData.administrativeData.durationY} onChange={(v) => setDrmdData(p => ({...p, administrativeData: {...p.administrativeData, durationY: parseInt(v) || 0}}))} />
                                <Input label="Months" type="number" value={drmdData.administrativeData.durationM} onChange={(v) => setDrmdData(p => ({...p, administrativeData: {...p.administrativeData, durationM: parseInt(v) || 0}}))} />
                            </div>
                            <div>
                                <div className="text-xs font-bold text-gray-500 uppercase mb-1">ISO 8601 Format</div>
                                <div className="bg-green-50 border border-green-200 p-2 rounded text-sm text-green-800 font-mono">
                                    {getIsoDuration()}
                                </div>
                                <div className="mt-2">
                                    <Input label="Dispatch Date *" type="date" value={drmdData.administrativeData.dateOfIssue} onChange={(v) => setDrmdData(p => ({...p, administrativeData: {...p.administrativeData, dateOfIssue: v}}))} />
                                </div>
                            </div>
                        </>
                    )}
                    {drmdData.administrativeData.validityType === "Specific Time" && (
                        <Input label="Valid Until Date *" type="date" value={drmdData.administrativeData.specificTime} onChange={(v) => setDrmdData(p => ({...p, administrativeData: {...p.administrativeData, specificTime: v}}))} />
                    )}
                </div>
            </div>
        </div>

        <div className="space-y-4 border p-4 rounded-lg bg-white shadow-sm">
            <div className="flex justify-between items-center border-b pb-2">
                <SectionHeader title="Reference Material Producer" icon="🏢" />
                <button onClick={() => setDrmdData(p => ({...p, administrativeData: {...p.administrativeData, producers: [...p.administrativeData.producers, {...INITIAL_PRODUCER, uuid: generateUUID()}]}}))} className="text-sm bg-indigo-50 text-indigo-600 px-3 py-1 rounded hover:bg-indigo-100 font-medium">+ Add Producer</button>
            </div>
            {drmdData.administrativeData.producers.map((prod, idx) => (
                <div key={prod.uuid} className="bg-gray-50 border border-gray-200 p-4 rounded-lg space-y-3 relative mb-4">
                     {drmdData.administrativeData.producers.length > 1 && <div className="font-bold text-gray-500 text-sm">Producer {idx + 1}</div>}
                     <button onClick={() => {
                        if (drmdData.administrativeData.producers.length > 1) {
                            const newProds = [...drmdData.administrativeData.producers];
                            newProds.splice(idx, 1);
                            setDrmdData(p => ({...p, administrativeData: {...p.administrativeData, producers: newProds}}));
                        }
                     }} className="absolute top-4 right-4 text-red-400 hover:text-red-600 disabled:opacity-50" disabled={drmdData.administrativeData.producers.length <= 1}>🗑️</button>
                     
                     {/* Pass sectionCoordinates to trigger section highlight on any interaction */}
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-3">
                            <Input label="Name *" value={prod.name} onFocus={() => handleHighlight(prod.sectionCoordinates)} onChange={(v) => { const list = [...drmdData.administrativeData.producers]; list[idx].name = v; setDrmdData(p => ({...p, administrativeData: {...p.administrativeData, producers: list}})); }} onInfoClick={() => handleHighlight(prod.sectionCoordinates)} />
                            <Input label="Email *" value={prod.email} onFocus={() => handleHighlight(prod.sectionCoordinates)} onChange={(v) => { const list = [...drmdData.administrativeData.producers]; list[idx].email = v; setDrmdData(p => ({...p, administrativeData: {...p.administrativeData, producers: list}})); }} onInfoClick={() => handleHighlight(prod.sectionCoordinates)} />
                            <Input label="Phone" value={prod.phone} onFocus={() => handleHighlight(prod.sectionCoordinates)} onChange={(v) => { const list = [...drmdData.administrativeData.producers]; list[idx].phone = v; setDrmdData(p => ({...p, administrativeData: {...p.administrativeData, producers: list}})); }} onInfoClick={() => handleHighlight(prod.sectionCoordinates)} />
                        </div>
                        <div className="space-y-3">
                             <div className="grid grid-cols-4 gap-2">
                                <div className="col-span-3"><Input label="Street" value={prod.address.street} onFocus={() => handleHighlight(prod.sectionCoordinates)} onChange={(v) => { const list = [...drmdData.administrativeData.producers]; list[idx].address.street = v; setDrmdData(p => ({...p, administrativeData: {...p.administrativeData, producers: list}})); }} onInfoClick={() => handleHighlight(prod.sectionCoordinates)} /></div>
                                <Input label="No." value={prod.address.streetNo} onFocus={() => handleHighlight(prod.sectionCoordinates)} onChange={(v) => { const list = [...drmdData.administrativeData.producers]; list[idx].address.streetNo = v; setDrmdData(p => ({...p, administrativeData: {...p.administrativeData, producers: list}})); }} onInfoClick={() => handleHighlight(prod.sectionCoordinates)} />
                             </div>
                             <div className="grid grid-cols-4 gap-2">
                                <div className="col-span-1"><Input label="Post Code" value={prod.address.postCode} onFocus={() => handleHighlight(prod.sectionCoordinates)} onChange={(v) => { const list = [...drmdData.administrativeData.producers]; list[idx].address.postCode = v; setDrmdData(p => ({...p, administrativeData: {...p.administrativeData, producers: list}})); }} onInfoClick={() => handleHighlight(prod.sectionCoordinates)} /></div>
                                <div className="col-span-2"><Input label="City" value={prod.address.city} onFocus={() => handleHighlight(prod.sectionCoordinates)} onChange={(v) => { const list = [...drmdData.administrativeData.producers]; list[idx].address.city = v; setDrmdData(p => ({...p, administrativeData: {...p.administrativeData, producers: list}})); }} onInfoClick={() => handleHighlight(prod.sectionCoordinates)} /></div>
                                <div className="col-span-1"><Input label="Country" value={prod.address.countryCode} onFocus={() => handleHighlight(prod.sectionCoordinates)} onChange={(v) => { const list = [...drmdData.administrativeData.producers]; list[idx].address.countryCode = v; setDrmdData(p => ({...p, administrativeData: {...p.administrativeData, producers: list}})); }} onInfoClick={() => handleHighlight(prod.sectionCoordinates)} /></div>
                             </div>
                             <Input label="Fax" value={prod.fax} onFocus={() => handleHighlight(prod.sectionCoordinates)} onChange={(v) => { const list = [...drmdData.administrativeData.producers]; list[idx].fax = v; setDrmdData(p => ({...p, administrativeData: {...p.administrativeData, producers: list}})); }} onInfoClick={() => handleHighlight(prod.sectionCoordinates)} />
                        </div>
                     </div>
                </div>
            ))}
        </div>

        <div className="space-y-4 border p-4 rounded-lg bg-white shadow-sm">
            <div className="flex justify-between items-center border-b pb-2">
                <SectionHeader title="Responsible Persons" icon="👥" />
                <button onClick={() => setDrmdData(p => ({...p, administrativeData: {...p.administrativeData, responsiblePersons: [...p.administrativeData.responsiblePersons, {...INITIAL_PERSON, uuid: generateUUID()}]}}))} className="text-sm bg-indigo-50 text-indigo-600 px-3 py-1 rounded hover:bg-indigo-100 font-medium">+ Add Person</button>
            </div>
            {drmdData.administrativeData.responsiblePersons.map((rp, idx) => (
                <div key={rp.uuid} className="bg-white border border-gray-200 p-4 rounded-lg shadow-sm space-y-3 relative mb-4">
                     <div className="font-bold text-gray-500 text-sm">Responsible Person {idx + 1}</div>
                     <button onClick={() => {
                        if (drmdData.administrativeData.responsiblePersons.length > 1) {
                            const list = [...drmdData.administrativeData.responsiblePersons]; list.splice(idx, 1); setDrmdData(p => ({...p, administrativeData: {...p.administrativeData, responsiblePersons: list}}));
                        }
                     }} className="absolute top-4 right-4 text-red-400 hover:text-red-600 disabled:opacity-50" disabled={drmdData.administrativeData.responsiblePersons.length <= 1}>🗑️</button>

                     {/* Pass sectionCoordinates to trigger section highlight */}
                     <div className="grid grid-cols-3 gap-4">
                         <div>
                            <Input label="Name *" value={rp.name} onFocus={() => handleHighlight(rp.sectionCoordinates)} onChange={(v) => { const list = [...drmdData.administrativeData.responsiblePersons]; list[idx].name = v; setDrmdData(p => ({...p, administrativeData: {...p.administrativeData, responsiblePersons: list}})); }} onInfoClick={() => handleHighlight(rp.sectionCoordinates)} />
                            <div className="mt-2"><Input label="Role *" value={rp.role} onFocus={() => handleHighlight(rp.sectionCoordinates)} onChange={(v) => { const list = [...drmdData.administrativeData.responsiblePersons]; list[idx].role = v; setDrmdData(p => ({...p, administrativeData: {...p.administrativeData, responsiblePersons: list}})); }} onInfoClick={() => handleHighlight(rp.sectionCoordinates)} /></div>
                         </div>
                         <div>
                            <TextArea label="Description" value={rp.description} onFocus={() => handleHighlight(rp.sectionCoordinates)} onChange={(v) => { const list = [...drmdData.administrativeData.responsiblePersons]; list[idx].description = v; setDrmdData(p => ({...p, administrativeData: {...p.administrativeData, responsiblePersons: list}})); }} onInfoClick={() => handleHighlight(rp.sectionCoordinates)} />
                         </div>
                         <div className="bg-gray-50 p-3 rounded">
                            <div className="text-xs font-bold text-gray-500 uppercase mb-2">Digital Signature Options</div>
                            <div className="space-y-2">
                                <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer"><input type="checkbox" checked={rp.mainSigner} onChange={(e) => { const list = [...drmdData.administrativeData.responsiblePersons]; list[idx].mainSigner = e.target.checked; setDrmdData(p => ({...p, administrativeData: {...p.administrativeData, responsiblePersons: list}})); }} /> Main Signer</label>
                                <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer"><input type="checkbox" checked={rp.cryptElectronicSeal} onChange={(e) => { const list = [...drmdData.administrativeData.responsiblePersons]; list[idx].cryptElectronicSeal = e.target.checked; setDrmdData(p => ({...p, administrativeData: {...p.administrativeData, responsiblePersons: list}})); }} /> Electronic Seal</label>
                                <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer"><input type="checkbox" checked={rp.cryptElectronicSignature} onChange={(e) => { const list = [...drmdData.administrativeData.responsiblePersons]; list[idx].cryptElectronicSignature = e.target.checked; setDrmdData(p => ({...p, administrativeData: {...p.administrativeData, responsiblePersons: list}})); }} /> Electronic Signature</label>
                            </div>
                         </div>
                     </div>
                </div>
            ))}
        </div>
    </div>
  );

  const renderMaterials = () => (
    <div className="space-y-6 animate-fadeIn">
        <div className="flex justify-between items-center">
            <SectionHeader title="Materials" icon="🧪" />
            <button onClick={() => setDrmdData(p => ({...p, materials: [...p.materials, {
                uuid: generateUUID(), name: "", description: "", materialClass: "", itemQuantities: "", minimumSampleSize: "", isCertified: false, materialIdentifiers: [{...INITIAL_ID}]
            }]}))} className="text-sm bg-indigo-50 text-indigo-600 px-3 py-1 rounded hover:bg-indigo-100 font-medium">+ Add Material</button>
        </div>
        
        {drmdData.materials.map((mat, idx) => (
            <div key={mat.uuid} className="bg-white border border-gray-200 p-4 rounded-lg relative space-y-4 shadow-sm">
                <div className="font-bold text-gray-500 text-sm">Material {idx + 1}</div>
                <button onClick={() => { 
                    if(drmdData.materials.length > 1) {
                        const list = [...drmdData.materials]; list.splice(idx, 1); setDrmdData(p => ({...p, materials: list})); 
                    }
                }} className="absolute top-4 right-4 text-red-400 hover:text-red-600 disabled:opacity-50" disabled={drmdData.materials.length <= 1}>🗑️</button>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-3">
                        {/* Use fieldCoordinates for Name (specific field) or fallback to text search */}
                        <Input label="Material Name *" value={mat.name} onFocus={() => handleHighlight(mat.fieldCoordinates?.['name'] || mat.name)} onChange={(v) => { const list = [...drmdData.materials]; list[idx].name = v; setDrmdData(p => ({...p, materials: list})); }} onInfoClick={() => handleHighlight(mat.fieldCoordinates?.['name'] || mat.name)} />
                        
                        {/* Keep sectionCoordinates for other fields as requested by user ("rest all are working perfectly") */}
                        <Input label="Material Class" value={mat.materialClass} onFocus={() => handleHighlight(mat.sectionCoordinates)} onChange={(v) => { const list = [...drmdData.materials]; list[idx].materialClass = v; setDrmdData(p => ({...p, materials: list})); }} onInfoClick={() => handleHighlight(mat.sectionCoordinates)} />
                        <Input label="Item Quantities" value={mat.itemQuantities} onFocus={() => handleHighlight(mat.sectionCoordinates)} onChange={(v) => { const list = [...drmdData.materials]; list[idx].itemQuantities = v; setDrmdData(p => ({...p, materials: list})); }} onInfoClick={() => handleHighlight(mat.sectionCoordinates)} />
                    </div>
                    <div className="space-y-3">
                         {/* Modified to prefer specific field coordinates if available */}
                         <TextArea label="Description" value={mat.description} onFocus={() => handleHighlight(mat.fieldCoordinates?.['description'] || mat.sectionCoordinates)} onChange={(v) => { const list = [...drmdData.materials]; list[idx].description = v; setDrmdData(p => ({...p, materials: list})); }} onInfoClick={() => handleHighlight(mat.fieldCoordinates?.['description'] || mat.sectionCoordinates)} />
                         <div className="grid grid-cols-2 gap-4 items-end">
                             {/* CHANGED: Use 'intendedUse' coordinates for Min Sample Size as it typically resides in the Recommended Use paragraph */}
                             <Input label="Min Sample Size (e.g. 4.9 g) *" value={mat.minimumSampleSize} onFocus={() => handleHighlight(drmdData.statements.official.fieldCoordinates?.['intendedUse'] || mat.fieldCoordinates?.['minimumSampleSize'] || mat.sectionCoordinates)} onChange={(v) => { const list = [...drmdData.materials]; list[idx].minimumSampleSize = v; setDrmdData(p => ({...p, materials: list})); }} onInfoClick={() => handleHighlight(drmdData.statements.official.fieldCoordinates?.['intendedUse'] || mat.fieldCoordinates?.['minimumSampleSize'] || mat.sectionCoordinates)} />
                             <div className="pb-2">
                                <label className="flex items-center gap-2 font-bold text-gray-700 cursor-pointer"><input type="checkbox" checked={mat.isCertified} onChange={(e) => { const list = [...drmdData.materials]; list[idx].isCertified = e.target.checked; setDrmdData(p => ({...p, materials: list})); }} /> Certified</label>
                             </div>
                         </div>
                    </div>
                </div>
            </div>
        ))}
    </div>
  );

  const renderProperties = () => (
      <div className="space-y-6 animate-fadeIn">
          <div className="flex justify-between items-center">
              <SectionHeader title="Material Properties" icon="📊" />
              <button onClick={() => setDrmdData(p => ({...p, properties: [...p.properties, {
                  uuid: generateUUID(), id: "", name: "New Property Set", isCertified: true, description: "", procedures: "", results: []
              }]}))} className="text-sm bg-indigo-50 text-indigo-600 px-3 py-1 rounded hover:bg-indigo-100 font-medium">+ Add Property Set</button>
          </div>

          {drmdData.properties.map((prop, pIdx) => (
              <div key={prop.uuid} className="border border-gray-300 rounded-xl overflow-hidden mb-6 shadow-sm bg-white">
                   <div className={`p-3 ${prop.isCertified ? 'bg-green-50 border-b border-green-100' : 'bg-yellow-50 border-b border-yellow-100'} flex justify-between items-center`}>
                        <div className="flex items-center gap-4 flex-1">
                            <div className="w-32">
                                <input 
                                    type="text" 
                                    value={prop.id || ""}
                                    placeholder="ID (opt)"
                                    onChange={(e) => { const list = [...drmdData.properties]; list[pIdx].id = e.target.value; setDrmdData(p => ({...p, properties: list})); }}
                                    className="bg-white/50 text-sm px-2 py-1 rounded border border-transparent hover:border-gray-300 outline-none w-full"
                                />
                            </div>
                            <div className="flex-1 flex items-center gap-2">
                                <input 
                                    type="text" 
                                    value={prop.name}
                                    onChange={(e) => { const list = [...drmdData.properties]; list[pIdx].name = e.target.value; setDrmdData(p => ({...p, properties: list})); }}
                                    className={`font-bold bg-transparent outline-none ${prop.isCertified ? 'text-green-800' : 'text-yellow-800'} w-full text-lg`}
                                />
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <label className="text-xs font-bold cursor-pointer"><input type="checkbox" checked={prop.isCertified} onChange={(e) => { const list = [...drmdData.properties]; list[pIdx].isCertified = e.target.checked; setDrmdData(p => ({...p, properties: list})); }} /> Certified</label>
                            <button onClick={() => { const list = [...drmdData.properties]; list.splice(pIdx, 1); setDrmdData(p => ({...p, properties: list})); }} className="text-red-400 hover:text-red-600 ml-2">🗑️</button>
                        </div>
                   </div>
                   <div className="p-4 space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <TextArea label="Description" value={prop.description} onChange={(v) => { const list = [...drmdData.properties]; list[pIdx].description = v; setDrmdData(p => ({...p, properties: list})); }} onInfoClick={() => handleHighlight(prop.description)} />
                            <TextArea label="Procedures" value={prop.procedures} onChange={(v) => { const list = [...drmdData.properties]; list[pIdx].procedures = v; setDrmdData(p => ({...p, properties: list})); }} onInfoClick={() => handleHighlight(prop.procedures)} />
                        </div>
                        
                        <div className="space-y-6 mt-4">
                            {prop.results.map((res, rIdx) => (
                                <div key={res.uuid} className="bg-gray-50 p-4 rounded border border-gray-200 shadow-sm">
                                    <div className="flex gap-4 mb-4 items-start">
                                        <div className="flex-1">
                                            {/* Pass Table sectionCoordinates */}
                                            <Input label="Table Name" value={res.name} onFocus={() => handleHighlight(res.sectionCoordinates)} onChange={(v) => { const list = [...drmdData.properties]; list[pIdx].results[rIdx].name = v; setDrmdData(p => ({...p, properties: list})); }} onInfoClick={() => handleHighlight(res.sectionCoordinates)} />
                                        </div>
                                        <div className="flex-[2]">
                                            <TextArea label="Table Description" value={res.description} onFocus={() => handleHighlight(res.sectionCoordinates)} onChange={(v) => { const list = [...drmdData.properties]; list[pIdx].results[rIdx].description = v; setDrmdData(p => ({...p, properties: list})); }} onInfoClick={() => handleHighlight(res.sectionCoordinates)} />
                                        </div>
                                        <button onClick={() => { const list = [...drmdData.properties]; list[pIdx].results.splice(rIdx, 1); setDrmdData(p => ({...p, properties: list})); }} className="text-xs text-red-500 mt-6 bg-white border border-red-100 px-2 py-1 rounded">Remove</button>
                                    </div>
                                    
                                    <div className="overflow-x-auto bg-white border border-gray-200 rounded-lg">
                                        <table className="min-w-full divide-y divide-gray-200 text-xs">
                                            <thead className="bg-gray-100">
                                                <tr>
                                                    <th className="px-2 py-2 text-left w-24">Element</th>
                                                    <th className="px-2 py-2 text-left w-24">Value</th>
                                                    <th className="px-2 py-2 text-left w-20">Unit</th>
                                                    <th className="px-2 py-2 text-left w-40">D-SI (Auto)</th>
                                                    <th className="px-2 py-2 text-left w-24">Uncertainty</th>
                                                    <th className="px-2 py-2 text-left w-16">k-Factor</th>
                                                    <th className="px-2 py-2 w-10"></th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-200">
                                                {res.quantities.map((q, qIdx) => (
                                                    <tr key={q.uuid} className="hover:bg-gray-50 group">
                                                        <td className="p-1 relative">
                                                            <input 
                                                                className="w-full border-b border-transparent group-hover:border-gray-300 outline-none bg-transparent pr-4" 
                                                                value={q.name} 
                                                                onFocus={() => handleHighlight(res.sectionCoordinates)} // Focus entire table when editing cell
                                                                onChange={(e) => { const list = [...drmdData.properties]; list[pIdx].results[rIdx].quantities[qIdx].name = e.target.value; setDrmdData(p => ({...p, properties: list})); }} 
                                                            />
                                                        </td>
                                                        <td className="p-1 relative group-td">
                                                            <input 
                                                                className="w-full border-b border-transparent group-hover:border-gray-300 outline-none bg-transparent pr-4" 
                                                                value={q.value} 
                                                                onFocus={() => handleHighlight(res.sectionCoordinates)}
                                                                onChange={(e) => { 
                                                                    const list = [...drmdData.properties]; 
                                                                    list[pIdx].results[rIdx].quantities[qIdx].value = e.target.value; 
                                                                    const dsi = convertToDSI(e.target.value, q.unit);
                                                                    list[pIdx].results[rIdx].quantities[qIdx].dsiValue = dsi.dsiValue;
                                                                    list[pIdx].results[rIdx].quantities[qIdx].dsiUnit = dsi.dsiUnit;
                                                                    setDrmdData(p => ({...p, properties: list})); 
                                                                }} 
                                                            />
                                                        </td>
                                                        <td className="p-1 relative">
                                                            <input 
                                                                className="w-full border-b border-transparent group-hover:border-gray-300 outline-none bg-transparent pr-4" 
                                                                value={q.unit} 
                                                                onFocus={() => handleHighlight(res.sectionCoordinates)}
                                                                onChange={(e) => { 
                                                                    const list = [...drmdData.properties]; 
                                                                    list[pIdx].results[rIdx].quantities[qIdx].unit = e.target.value; 
                                                                    const dsi = convertToDSI(q.value, e.target.value);
                                                                    list[pIdx].results[rIdx].quantities[qIdx].dsiValue = dsi.dsiValue;
                                                                    list[pIdx].results[rIdx].quantities[qIdx].dsiUnit = dsi.dsiUnit;
                                                                    setDrmdData(p => ({...p, properties: list})); 
                                                                }} 
                                                            />
                                                        </td>
                                                        <td className="p-1">
                                                            <div className="w-full border-b border-transparent bg-gray-50 text-gray-600 text-xs px-1 py-2 overflow-x-auto whitespace-nowrap font-mono">
                                                                {q.dsiValue} {q.dsiUnit}
                                                            </div>
                                                        </td>
                                                        <td className="p-1 relative">
                                                            <input 
                                                                className="w-full border-b border-transparent group-hover:border-gray-300 outline-none bg-transparent pr-4" 
                                                                value={q.uncertainty} 
                                                                onFocus={() => handleHighlight(res.sectionCoordinates)}
                                                                onChange={(e) => { const list = [...drmdData.properties]; list[pIdx].results[rIdx].quantities[qIdx].uncertainty = e.target.value; setDrmdData(p => ({...p, properties: list})); }} 
                                                            />
                                                        </td>
                                                        <td className="p-1"><input className="w-full border-b border-transparent group-hover:border-gray-300 outline-none bg-transparent" value={q.coverageFactor} onChange={(e) => { const list = [...drmdData.properties]; list[pIdx].results[rIdx].quantities[qIdx].coverageFactor = e.target.value; setDrmdData(p => ({...p, properties: list})); }} /></td>
                                                        <td className="p-1 text-center"><button onClick={() => { const list = [...drmdData.properties]; list[pIdx].results[rIdx].quantities.splice(qIdx, 1); setDrmdData(p => ({...p, properties: list})); }} className="text-red-400 hover:text-red-600">×</button></td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                        <div className="p-2 bg-gray-50 border-t">
                                            <button onClick={() => { 
                                                const list = [...drmdData.properties]; 
                                                list[pIdx].results[rIdx].quantities.push({ ...INITIAL_QUANTITY, uuid: generateUUID(), identifiers: [] });
                                                setDrmdData(p => ({...p, properties: list}));
                                            }} className="text-xs text-indigo-600 hover:text-indigo-800 font-medium">+ Add Row</button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                   </div>
              </div>
          ))}
      </div>
  );

  const renderStatements = () => (
      <div className="space-y-6 animate-fadeIn">
          <SectionHeader title="Official ISO 17034 Statements" icon="📋" />
          <p className="text-sm text-gray-500 mb-4">Standard statements required by ISO 17034 for reference material certificates.</p>
          
          <TextArea label="Intended Use *" value={drmdData.statements.official.intendedUse} onChange={(v) => setDrmdData(p => ({...p, statements: {...p.statements, official: {...p.statements.official, intendedUse: v}}}))} onFocus={() => handleHighlight(drmdData.statements.official.fieldCoordinates?.['intendedUse'] || drmdData.statements.official.intendedUse)} onInfoClick={() => handleHighlight(drmdData.statements.official.fieldCoordinates?.['intendedUse'] || drmdData.statements.official.intendedUse)} />
          <TextArea label="Commutability" value={drmdData.statements.official.commutability} onChange={(v) => setDrmdData(p => ({...p, statements: {...p.statements, official: {...p.statements.official, commutability: v}}}))} onFocus={() => handleHighlight(drmdData.statements.official.fieldCoordinates?.['commutability'] || drmdData.statements.official.commutability)} onInfoClick={() => handleHighlight(drmdData.statements.official.fieldCoordinates?.['commutability'] || drmdData.statements.official.commutability)} />
          <TextArea label="Storage Information *" value={drmdData.statements.official.storageInformation} onChange={(v) => setDrmdData(p => ({...p, statements: {...p.statements, official: {...p.statements.official, storageInformation: v}}}))} onFocus={() => handleHighlight(drmdData.statements.official.fieldCoordinates?.['storageInformation'] || drmdData.statements.official.storageInformation)} onInfoClick={() => handleHighlight(drmdData.statements.official.fieldCoordinates?.['storageInformation'] || drmdData.statements.official.storageInformation)} />
          <TextArea label="Instructions For Handling And Use *" value={drmdData.statements.official.handlingInstructions} onChange={(v) => setDrmdData(p => ({...p, statements: {...p.statements, official: {...p.statements.official, handlingInstructions: v}}}))} onFocus={() => handleHighlight(drmdData.statements.official.fieldCoordinates?.['handlingInstructions'] || drmdData.statements.official.handlingInstructions)} onInfoClick={() => handleHighlight(drmdData.statements.official.fieldCoordinates?.['handlingInstructions'] || drmdData.statements.official.handlingInstructions)} />
          <TextArea label="Metrological Traceability" value={drmdData.statements.official.metrologicalTraceability} onChange={(v) => setDrmdData(p => ({...p, statements: {...p.statements, official: {...p.statements.official, metrologicalTraceability: v}}}))} onFocus={() => handleHighlight(drmdData.statements.official.fieldCoordinates?.['metrologicalTraceability'] || drmdData.statements.official.metrologicalTraceability)} onInfoClick={() => handleHighlight(drmdData.statements.official.fieldCoordinates?.['metrologicalTraceability'] || drmdData.statements.official.metrologicalTraceability)} />
          <TextArea label="Health And Safety Information" value={drmdData.statements.official.healthAndSafety} onChange={(v) => setDrmdData(p => ({...p, statements: {...p.statements, official: {...p.statements.official, healthAndSafety: v}}}))} onFocus={() => handleHighlight(drmdData.statements.official.fieldCoordinates?.['healthAndSafety'] || drmdData.statements.official.healthAndSafety)} onInfoClick={() => handleHighlight(drmdData.statements.official.fieldCoordinates?.['healthAndSafety'] || drmdData.statements.official.healthAndSafety)} />
          <TextArea label="Subcontractors" value={drmdData.statements.official.subcontractors} onChange={(v) => setDrmdData(p => ({...p, statements: {...p.statements, official: {...p.statements.official, subcontractors: v}}}))} onFocus={() => handleHighlight(drmdData.statements.official.fieldCoordinates?.['subcontractors'] || drmdData.statements.official.subcontractors)} onInfoClick={() => handleHighlight(drmdData.statements.official.fieldCoordinates?.['subcontractors'] || drmdData.statements.official.subcontractors)} />
          <TextArea label="Legal Notice" value={drmdData.statements.official.legalNotice} onChange={(v) => setDrmdData(p => ({...p, statements: {...p.statements, official: {...p.statements.official, legalNotice: v}}}))} onFocus={() => handleHighlight(drmdData.statements.official.fieldCoordinates?.['legalNotice'] || drmdData.statements.official.legalNotice)} onInfoClick={() => handleHighlight(drmdData.statements.official.fieldCoordinates?.['legalNotice'] || drmdData.statements.official.legalNotice)} />
          <TextArea label="Reference To Certification Report" value={drmdData.statements.official.referenceToCertificationReport} onChange={(v) => setDrmdData(p => ({...p, statements: {...p.statements, official: {...p.statements.official, referenceToCertificationReport: v}}}))} onFocus={() => handleHighlight(drmdData.statements.official.fieldCoordinates?.['referenceToCertificationReport'] || drmdData.statements.official.referenceToCertificationReport)} onInfoClick={() => handleHighlight(drmdData.statements.official.fieldCoordinates?.['referenceToCertificationReport'] || drmdData.statements.official.referenceToCertificationReport)} />

          <SectionHeader title="Other Statements" icon="📝" />
          <p className="text-sm text-gray-500 mb-4">Add custom statements beyond the standard ISO 17034 requirements.</p>
          {drmdData.statements.custom.map((st, idx) => (
              <div key={st.uuid} className="flex gap-4 items-start mb-4 bg-white p-4 rounded border border-gray-200 shadow-sm relative">
                  <button onClick={() => { const list = [...drmdData.statements.custom]; list.splice(idx, 1); setDrmdData(p => ({...p, statements: {...p.statements, custom: list}})); }} className="absolute top-2 right-2 text-red-400 hover:text-red-600">🗑️</button>
                  <div className="flex-1 space-y-2">
                      <Input label="Statement Name" value={st.name} onChange={(v) => { const list = [...drmdData.statements.custom]; list[idx].name = v; setDrmdData(p => ({...p, statements: {...p.statements, custom: list}})); }} onInfoClick={() => handleHighlight(st.name)} />
                      <TextArea label="Content" value={st.content} onChange={(v) => { const list = [...drmdData.statements.custom]; list[idx].content = v; setDrmdData(p => ({...p, statements: {...p.statements, custom: list}})); }} onInfoClick={() => handleHighlight(st.content)} />
                  </div>
              </div>
          ))}
          <button onClick={() => setDrmdData(p => ({...p, statements: {...p.statements, custom: [...p.statements.custom, { uuid: generateUUID(), name: "", content: "" }]}}))} className="bg-indigo-50 text-indigo-600 px-4 py-2 rounded hover:bg-indigo-100 text-sm font-semibold">+ Add Statement</button>
      </div>
  );

  const renderComments = () => (
      <div className="space-y-6 animate-fadeIn">
          <SectionHeader title="Comments & Documents" icon="💬" />
          <div className="p-10 text-center border-2 border-dashed border-gray-300 rounded-lg bg-gray-50">
              <p className="text-gray-500 font-medium">Feature to add comments and attach additional documents (PDF/Images) is coming soon.</p>
              <p className="text-xs text-gray-400 mt-2">This will allow attaching raw data logs or reviewer notes to the XML package.</p>
          </div>
      </div>
  );

  const renderValidateExport = () => {
    const getValidationReport = () => {
        const errors: { section: string; message: string }[] = [];
        const warnings: { section: string; message: string }[] = [];

        // Admin Data
        if (!drmdData.administrativeData.title) errors.push({ section: "Administrative", message: "Document Title is missing." });
        if (!drmdData.administrativeData.uniqueIdentifier) errors.push({ section: "Administrative", message: "Unique Identifier is missing." });
        
        // Producers
        if (drmdData.administrativeData.producers.length === 0) {
            errors.push({ section: "Administrative", message: "At least one Producer is required." });
        } else if (drmdData.administrativeData.producers.length > 1) {
            errors.push({ section: "Administrative", message: "Only ONE Producer is allowed by schema." });
        } else {
            drmdData.administrativeData.producers.forEach((p, i) => {
                if (!p.name) errors.push({ section: "Administrative", message: `Producer ${i + 1}: Name is required.` });
            });
        }

        // Responsible Persons
        if (drmdData.administrativeData.responsiblePersons.length === 0) {
            warnings.push({ section: "Administrative", message: "No Responsible Persons defined (Warning)." });
        }

        // Materials
        if (drmdData.materials.length === 0) {
            errors.push({ section: "Materials", message: "At least one Material must be defined." });
        } else {
            drmdData.materials.forEach((m, i) => {
                if (!m.name) errors.push({ section: "Materials", message: `Material ${i + 1}: Name is required.` });
                if (!m.minimumSampleSize) errors.push({ section: "Materials", message: `Material ${i + 1}: Minimum Sample Size is required.` });
            });
        }

        // Statements - Strict XSD Checks (minOccurs=1)
        if (!drmdData.statements.official.intendedUse) errors.push({ section: "Statements", message: "Intended Use is required." });
        if (!drmdData.statements.official.storageInformation) errors.push({ section: "Statements", message: "Storage Information is required." });
        if (!drmdData.statements.official.handlingInstructions) errors.push({ section: "Statements", message: "Instructions for Handling and Use are required." });

        return { errors, warnings };
    };

    const { errors, warnings } = getValidationReport();
    const xmlPreview = generateDrmdXml(drmdData);
    const isValid = errors.length === 0;

    return (
        <div className="space-y-6 animate-fadeIn">
            <SectionHeader title="Validate & Export" icon="✅" />
            
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Validation Report */}
                <div className="space-y-4">
                    <div className={`p-4 rounded-lg border ${isValid ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                        <div className="flex items-center gap-3 mb-2">
                            <div className={`text-2xl ${isValid ? 'text-green-600' : 'text-red-600'}`}>
                                {isValid ? '✓' : '⚠️'}
                            </div>
                            <h3 className={`text-lg font-bold ${isValid ? 'text-green-800' : 'text-red-800'}`}>
                                {isValid ? "Ready for Export" : "Validation Errors Found"}
                            </h3>
                        </div>
                        <p className={`text-sm ${isValid ? 'text-green-700' : 'text-red-700'}`}>
                            {isValid 
                                ? "The document structure appears valid according to schema requirements." 
                                : "Please fix the errors below before exporting."}
                        </p>
                    </div>

                    <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
                        <div className="bg-gray-50 px-4 py-3 border-b border-gray-200 font-bold text-gray-700 text-sm">Validation Report</div>
                        <div className="divide-y divide-gray-100 max-h-[400px] overflow-y-auto">
                            {errors.length === 0 && warnings.length === 0 && (
                                <div className="p-4 text-center text-gray-500 italic text-sm">No issues found.</div>
                            )}
                            {errors.map((err, idx) => (
                                <div key={`err-${idx}`} className="p-3 flex gap-3 items-start bg-red-50/50">
                                    <span className="text-red-500 mt-0.5 text-sm">❌</span>
                                    <div>
                                        <span className="text-xs font-bold uppercase text-gray-400 block">{err.section}</span>
                                        <span className="text-sm text-red-700 font-medium">{err.message}</span>
                                    </div>
                                </div>
                            ))}
                            {warnings.map((warn, idx) => (
                                <div key={`warn-${idx}`} className="p-3 flex gap-3 items-start">
                                    <span className="text-yellow-500 mt-0.5 text-sm">⚠️</span>
                                    <div>
                                        <span className="text-xs font-bold uppercase text-gray-400 block">{warn.section}</span>
                                        <span className="text-sm text-gray-700">{warn.message}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* XML Preview */}
                <div className="space-y-4 flex flex-col">
                     <div className="bg-white border border-gray-200 rounded-lg shadow-sm flex flex-col flex-1">
                          <div className="bg-gray-50 px-4 py-3 border-b border-gray-200 font-bold text-gray-700 text-sm flex justify-between items-center">
                              <span>XML Preview</span>
                              <button 
                                  onClick={() => navigator.clipboard.writeText(xmlPreview)}
                                  className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
                              >
                                  Copy Code
                              </button>
                          </div>
                          <div className="relative flex-1 min-h-[400px] bg-gray-900">
                              <textarea 
                                  readOnly 
                                  value={xmlPreview} 
                                  className="absolute inset-0 w-full h-full p-4 bg-gray-900 text-green-400 font-mono text-xs resize-none outline-none"
                              />
                          </div>
                          <div className="p-4 bg-gray-50 border-t border-gray-200">
                              <button 
                                  onClick={handleExport}
                                  disabled={!isValid}
                                  className={`w-full py-3 rounded-lg font-bold text-white flex justify-center items-center gap-2 shadow-sm transition-all ${
                                      isValid 
                                      ? 'bg-indigo-600 hover:bg-indigo-700 hover:shadow' 
                                      : 'bg-gray-400 cursor-not-allowed opacity-70'
                                  }`}
                              >
                                  <span>💾</span> Download DRMD XML
                              </button>
                          </div>
                     </div>
                </div>
            </div>
        </div>
    );
  };

  return (
    <div className="h-screen flex flex-col bg-gray-50 font-sans text-gray-900">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 p-4 flex justify-between items-center z-10 shadow-sm">
        <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-indigo-700 rounded-lg flex items-center justify-center text-white text-xl">🔬</div>
            <div>
                <h1 className="text-lg font-bold text-gray-800">DRMD Generator</h1>
                <p className="text-xs text-gray-500">Streamlit Port • v0.3.0</p>
            </div>
        </div>
        <div className="flex gap-3">
          <input type="file" accept="application/pdf" ref={fileInputRef} onChange={handleFileUpload} className="hidden" />
          <button onClick={() => fileInputRef.current?.click()} className="bg-gray-100 hover:bg-gray-200 transition px-4 py-2 rounded-md text-sm font-medium flex items-center gap-2 text-gray-700 border border-gray-300">
            📄 Upload PDF
          </button>
          <button onClick={handleExport} className="bg-indigo-600 text-white hover:bg-indigo-700 transition px-4 py-2 rounded-md text-sm font-bold flex items-center gap-2 shadow-sm">
            💾 Export XML
          </button>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* Left Panel: PDF Viewer */}
        <div className="w-[45%] bg-gray-800 border-r border-gray-700 flex flex-col relative">
          {pdfUrl ? (
            <PdfViewer url={pdfUrl} highlightData={highlightData} />
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-gray-400 p-10 text-center">
                <div className="text-6xl mb-4 opacity-20">📄</div>
                <p>Upload a certificate to visualize it here.</p>
                <p className="text-xs mt-2 text-gray-600 max-w-xs">Or skip upload and start filling the form manually.</p>
            </div>
          )}
          
          {isProcessing && (
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm flex flex-col items-center justify-center text-white z-50">
              <div className="animate-spin rounded-full h-12 w-12 border-4 border-indigo-500 border-t-transparent mb-4"></div>
              <p className="font-bold text-lg">Processing Document...</p>
              <p className="text-sm text-gray-400 mt-1">{statusMessage}</p>
            </div>
          )}
          
          {error && (
             <div className="absolute bottom-5 left-5 right-5 bg-red-500/90 text-white px-4 py-3 rounded shadow-lg backdrop-blur-md border border-red-400">
                <p className="font-bold text-sm">Error</p>
                <p className="text-xs">{error}</p>
             </div>
          )}
        </div>

        {/* Right Panel: Application Tabs */}
        <div className="w-[55%] flex flex-col bg-white">
          <div className="flex border-b border-gray-200 bg-gray-50 overflow-x-auto hide-scrollbar">
            {[
                { id: 'admin', label: 'Administrative Data', icon: '📋' },
                { id: 'materials', label: 'Materials', icon: '🧪' },
                { id: 'properties', label: 'Properties', icon: '📊' },
                { id: 'statements', label: 'Statements', icon: '📝' },
                { id: 'comments', label: 'Comments', icon: '💬' },
                { id: 'validate-export', label: 'Validate & Export', icon: '✅' },
                { id: 'settings', label: 'Settings', icon: '⚙️' }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-5 py-4 text-sm font-medium transition-all border-b-2 min-w-max ${
                  activeTab === tab.id
                    ? 'border-indigo-600 text-indigo-700 bg-white'
                    : 'border-transparent text-gray-500 hover:text-gray-800 hover:bg-gray-100'
                }`}
              >
                <span>{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto p-8 bg-white pb-20">
            {activeTab === 'settings' && renderSettings()}
            {activeTab === 'admin' && renderAdmin()}
            {activeTab === 'materials' && renderMaterials()}
            {activeTab === 'properties' && renderProperties()}
            {activeTab === 'statements' && renderStatements()}
            {activeTab === 'comments' && renderComments()}
            {activeTab === 'validate-export' && renderValidateExport()}
          </div>
        </div>
      </div>
    </div>
  );
};

// --- Reusable UI Components ---

const SectionHeader: React.FC<{ title: string; icon: string }> = ({ title, icon }) => (
    <div className="flex items-center gap-2 border-b border-gray-200 pb-3 mb-6">
        <span className="text-2xl bg-gray-100 p-2 rounded-lg">{icon}</span>
        <h2 className="text-xl font-bold text-gray-800">{title}</h2>
    </div>
);

const Input: React.FC<{ label: string; value: any; onChange: (v: string) => void; type?: string; disabled?: boolean; onInfoClick?: () => void; onFocus?: () => void }> = ({ label, value, onChange, type = "text", disabled, onInfoClick, onFocus }) => (
    <div className="w-full">
        <div className="flex items-center justify-between mb-1">
            {label && <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide">{label}</label>}
            {onInfoClick && (
                <button 
                    onClick={onInfoClick} 
                    title="Highlight in PDF" 
                    className="text-blue-500 hover:text-blue-700 transition-colors"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10"></circle>
                        <line x1="12" y1="16" x2="12" y2="12"></line>
                        <line x1="12" y1="8" x2="12.01" y2="8"></line>
                    </svg>
                </button>
            )}
        </div>
        <input
            type={type}
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
            onFocus={onFocus}
            className={`w-full border border-gray-300 rounded-md p-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-shadow ${disabled ? 'bg-gray-100 text-gray-400' : 'bg-white'}`}
        />
    </div>
);

const Select: React.FC<{ label: string; value: string; options: string[]; onChange: (v: string) => void; onFocus?: () => void }> = ({ label, value, options, onChange, onFocus }) => (
    <div className="w-full">
        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">{label}</label>
        <select
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
            onFocus={onFocus}
            className="w-full border border-gray-300 rounded-md p-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none bg-white"
        >
            {options.map(o => <option key={o} value={o}>{o.replace(/([A-Z])/g, ' $1').trim()}</option>)}
        </select>
    </div>
);

const TextArea: React.FC<{ label: string; value: string; onChange: (v: string) => void; onInfoClick?: () => void; onFocus?: () => void }> = ({ label, value, onChange, onInfoClick, onFocus }) => (
    <div className="w-full">
        <div className="flex items-center justify-between mb-1">
            {label && <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide">{label}</label>}
            {onInfoClick && (
                <button 
                    onClick={onInfoClick} 
                    title="Highlight in PDF" 
                    className="text-blue-500 hover:text-blue-700 transition-colors"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10"></circle>
                        <line x1="12" y1="16" x2="12" y2="12"></line>
                        <line x1="12" y1="8" x2="12.01" y2="8"></line>
                    </svg>
                </button>
            )}
        </div>
        <textarea
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
            onFocus={onFocus}
            className="w-full border border-gray-300 rounded-md p-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none min-h-[80px]"
        />
    </div>
);

export default App;
'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { RotateCcw, Download, Move, ZoomIn, ZoomOut, Target, RotateCw } from "lucide-react";

interface Position {
  x: number;
  y: number;
}

interface RealTimeDraggableJewelryProps {
  modelImage: string; // Base64 model image
  jewelryImage: string; // Base64 jewelry image (with transparent background)
  jewelryType: 'necklace' | 'ring' | 'earrings' | 'bracelet';
  onFinalComposition?: (compositeImageData: string) => void;
}

export function RealTimeDraggableJewelry({ 
  modelImage, 
  jewelryImage, 
  jewelryType,
  onFinalComposition 
}: RealTimeDraggableJewelryProps) {
  const [jewelryPosition, setJewelryPosition] = useState<Position>({ x: 0, y: 0 });
  const [jewelryScale, setJewelryScale] = useState({ width: 1, height: 1 });
  const [jewelryRotation, setJewelryRotation] = useState(0); // in degrees
  const [jewelryAdjustments, setJewelryAdjustments] = useState({
    scaleX: 1,
    scaleY: 1,
    skew: 0,
    opacity: 1
  });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<Position>({ x: 0, y: 0 });
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [aiConfidence, setAiConfidence] = useState<number | null>(null);
  
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const modelImgRef = useRef<HTMLImageElement>(null);
  const jewelryImgRef = useRef<HTMLImageElement>(null);

  // Initialize default positions based on jewelry type
  useEffect(() => {
    if (canvasRef.current) {
      const canvas = canvasRef.current;
      const centerX = canvas.width / 2; // 600px for 1200px width
      const centerY = canvas.height / 2; // 450px for 900px height
      
      let defaultPosition: Position;
      let defaultScale: { width: number; height: number };
      
      switch (jewelryType) {
        case 'necklace':
          defaultPosition = { x: centerX, y: centerY * 0.6 }; // Around 270px from top
          defaultScale = { width: 0.6, height: 0.6 };
          break;
        case 'ring':
          defaultPosition = { x: centerX * 1.2, y: centerY * 1.3 }; // Right hand area
          defaultScale = { width: 0.25, height: 0.25 };
          break;
        case 'earrings':
          defaultPosition = { x: centerX * 0.85, y: centerY * 0.5 }; // Left ear area
          defaultScale = { width: 0.2, height: 0.2 };
          break;
        case 'bracelet':
          defaultPosition = { x: centerX * 1.15, y: centerY * 1.4 }; // Right wrist area
          defaultScale = { width: 0.35, height: 0.35 };
          break;
        default:
          defaultPosition = { x: centerX, y: centerY };
          defaultScale = { width: 0.4, height: 0.4 };
      }
      
      setJewelryPosition(defaultPosition);
      setJewelryScale(defaultScale);
    }
  }, [jewelryType]);

  // Redraw canvas whenever position, scale, rotation or adjustments change
  useEffect(() => {
    drawCanvas();
  }, [jewelryPosition, jewelryScale, jewelryRotation, jewelryAdjustments, modelImage, jewelryImage]);

  const drawCanvas = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || !modelImgRef.current || !jewelryImgRef.current) return;

    // Enable alpha compositing for transparency
    ctx.globalCompositeOperation = 'source-over';
    
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw model image as background
    ctx.drawImage(modelImgRef.current, 0, 0, canvas.width, canvas.height);

    // Save context for jewelry drawing
    ctx.save();
    
    // Enable smooth rendering for better quality
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    // Apply transformations for rotation and adjustments
    ctx.translate(jewelryPosition.x, jewelryPosition.y);
    
    // Apply rotation
    if (jewelryRotation !== 0) {
      ctx.rotate((jewelryRotation * Math.PI) / 180);
    }
    
    // Apply skew transformation for perspective
    if (jewelryAdjustments.skew !== 0) {
      const skewRadians = (jewelryAdjustments.skew * Math.PI) / 180;
      ctx.transform(1, Math.tan(skewRadians), 0, 1, 0, 0);
    }

    // Apply scaling with adjustments
    const finalScaleX = jewelryScale.width * jewelryAdjustments.scaleX;
    const finalScaleY = jewelryScale.height * jewelryAdjustments.scaleY;
    ctx.scale(finalScaleX, finalScaleY);

    // Apply opacity
    ctx.globalAlpha = jewelryAdjustments.opacity;

    // Draw jewelry at transformed position
    const jewelryImg = jewelryImgRef.current;
    const scaledWidth = jewelryImg.naturalWidth;
    const scaledHeight = jewelryImg.naturalHeight;
    
    ctx.drawImage(
      jewelryImg,
      -scaledWidth / 2,  // Center the image at the transformed origin
      -scaledHeight / 2,
      scaledWidth,
      scaledHeight
    );

    // Restore context
    ctx.restore();

    // Calculate jewelry bounds for visual feedback (after drawing jewelry)
    const finalScaleX2 = jewelryScale.width * jewelryAdjustments.scaleX;
    const finalScaleY2 = jewelryScale.height * jewelryAdjustments.scaleY;
    const scaledWidth2 = jewelryImgRef.current.naturalWidth * finalScaleX2;
    const scaledHeight2 = jewelryImgRef.current.naturalHeight * finalScaleY2;

    // Draw drag hint when not dragging
    if (!isDragging) {
      ctx.save();
      ctx.strokeStyle = '#3b82f6';
      ctx.setLineDash([5, 5]);
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.6;
      ctx.translate(jewelryPosition.x, jewelryPosition.y);
      if (jewelryRotation !== 0) {
        ctx.rotate((jewelryRotation * Math.PI) / 180);
      }
      ctx.strokeRect(
        -scaledWidth2 / 2 - 10,
        -scaledHeight2 / 2 - 10,
        scaledWidth2 + 20,
        scaledHeight2 + 20
      );
      ctx.restore();
    } else {
      // Draw drag feedback when dragging
      ctx.save();
      ctx.strokeStyle = '#10b981';
      ctx.setLineDash([]);
      ctx.lineWidth = 3;
      ctx.globalAlpha = 0.8;
      ctx.translate(jewelryPosition.x, jewelryPosition.y);
      if (jewelryRotation !== 0) {
        ctx.rotate((jewelryRotation * Math.PI) / 180);
      }
      ctx.strokeRect(
        -scaledWidth2 / 2 - 15,
        -scaledHeight2 / 2 - 15,
        scaledWidth2 + 30,
        scaledHeight2 + 30
      );
      // Add crosshair at center
      ctx.beginPath();
      ctx.moveTo(-10, 0);
      ctx.lineTo(10, 0);
      ctx.moveTo(0, -10);
      ctx.lineTo(0, 10);
      ctx.stroke();
      ctx.restore();
    }
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    // Check if click is near jewelry (considering jewelry bounds with rotation)
    const jewelryImg = jewelryImgRef.current;
    if (!jewelryImg) return;
    
    const finalScaleX = jewelryScale.width * jewelryAdjustments.scaleX;
    const finalScaleY = jewelryScale.height * jewelryAdjustments.scaleY;
    const scaledWidth = jewelryImg.naturalWidth * finalScaleX;
    const scaledHeight = jewelryImg.naturalHeight * finalScaleY;
    
    // Transform click coordinates relative to jewelry position and rotation
    const relativeX = x - jewelryPosition.x;
    const relativeY = y - jewelryPosition.y;
    
    // Apply inverse rotation to check if click is within bounds
    const rotationRad = (-jewelryRotation * Math.PI) / 180; // Inverse rotation
    const rotatedX = relativeX * Math.cos(rotationRad) - relativeY * Math.sin(rotationRad);
    const rotatedY = relativeX * Math.sin(rotationRad) + relativeY * Math.cos(rotationRad);
    
    // Check if rotated click is within jewelry bounds
    const halfWidth = scaledWidth / 2 + 30; // Add margin for easier clicking
    const halfHeight = scaledHeight / 2 + 30;
    
    if (Math.abs(rotatedX) <= halfWidth && Math.abs(rotatedY) <= halfHeight) {
      setIsDragging(true);
      setDragStart({ x: x - jewelryPosition.x, y: y - jewelryPosition.y });
      canvas.style.cursor = 'grabbing';
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || !isDragging) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    const newPosition = {
      x: Math.max(50, Math.min(canvas.width - 50, x - dragStart.x)),
      y: Math.max(50, Math.min(canvas.height - 50, y - dragStart.y))
    };

    setJewelryPosition(newPosition);
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    if (canvasRef.current) {
      canvasRef.current.style.cursor = 'grab';
    }
  };

  // Touch event handlers for mobile support
  const handleTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas || e.touches.length !== 1) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    
    const touch = e.touches[0];
    const x = (touch.clientX - rect.left) * scaleX;
    const y = (touch.clientY - rect.top) * scaleY;

    // Check if touch is near jewelry (using same logic as mouse)
    const jewelryImg = jewelryImgRef.current;
    if (!jewelryImg) return;
    
    const finalScaleX = jewelryScale.width * jewelryAdjustments.scaleX;
    const finalScaleY = jewelryScale.height * jewelryAdjustments.scaleY;
    const scaledWidth = jewelryImg.naturalWidth * finalScaleX;
    const scaledHeight = jewelryImg.naturalHeight * finalScaleY;
    
    // Transform touch coordinates relative to jewelry position and rotation
    const relativeX = x - jewelryPosition.x;
    const relativeY = y - jewelryPosition.y;
    
    // Apply inverse rotation to check if touch is within bounds
    const rotationRad = (-jewelryRotation * Math.PI) / 180;
    const rotatedX = relativeX * Math.cos(rotationRad) - relativeY * Math.sin(rotationRad);
    const rotatedY = relativeX * Math.sin(rotationRad) + relativeY * Math.cos(rotationRad);
    
    // Check if rotated touch is within jewelry bounds
    const halfWidth = scaledWidth / 2 + 30;
    const halfHeight = scaledHeight / 2 + 30;
    
    if (Math.abs(rotatedX) <= halfWidth && Math.abs(rotatedY) <= halfHeight) {
      setIsDragging(true);
      setDragStart({ x: x - jewelryPosition.x, y: y - jewelryPosition.y });
    }
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas || !isDragging || e.touches.length !== 1) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    
    const touch = e.touches[0];
    const x = (touch.clientX - rect.left) * scaleX;
    const y = (touch.clientY - rect.top) * scaleY;

    const newPosition = {
      x: Math.max(50, Math.min(canvas.width - 50, x - dragStart.x)),
      y: Math.max(50, Math.min(canvas.height - 50, y - dragStart.y))
    };

    setJewelryPosition(newPosition);
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
  };

  const handleMouseEnter = () => {
    if (canvasRef.current && !isDragging) {
      canvasRef.current.style.cursor = 'grab';
    }
  };

  const handleMouseLeave = () => {
    if (canvasRef.current) {
      canvasRef.current.style.cursor = 'default';
    }
  };

  const resetPosition = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const centerX = canvas.width / 2; // 600px for 1200px width
    const centerY = canvas.height / 2; // 450px for 900px height
    
    let defaultPosition: Position;
    let defaultScale: { width: number; height: number };
    
    switch (jewelryType) {
      case 'necklace':
        defaultPosition = { x: centerX, y: centerY * 0.6 }; // Around 270px from top
        defaultScale = { width: 0.6, height: 0.6 };
        break;
      case 'ring':
        defaultPosition = { x: centerX * 1.2, y: centerY * 1.3 }; // Right hand area
        defaultScale = { width: 0.25, height: 0.25 };
        break;
      case 'earrings':
        defaultPosition = { x: centerX * 0.85, y: centerY * 0.5 }; // Left ear area
        defaultScale = { width: 0.2, height: 0.2 };
        break;
      case 'bracelet':
        defaultPosition = { x: centerX * 1.15, y: centerY * 1.4 }; // Right wrist area
        defaultScale = { width: 0.35, height: 0.35 };
        break;
      default:
        defaultPosition = { x: centerX, y: centerY };
        defaultScale = { width: 0.4, height: 0.4 };
    }
    
    setJewelryPosition(defaultPosition);
    setJewelryScale(defaultScale);
    setJewelryRotation(0);
    setJewelryAdjustments({
      scaleX: 1,
      scaleY: 1,
      skew: 0,
      opacity: 1
    });
  };

  const adjustScale = (dimension: 'width' | 'height' | 'both', increment: number) => {
    setJewelryScale(prev => {
      if (dimension === 'both') {
        return {
          width: Math.max(0.1, Math.min(3, prev.width + increment)),
          height: Math.max(0.1, Math.min(3, prev.height + increment))
        };
      } else if (dimension === 'width') {
        return {
          ...prev,
          width: Math.max(0.1, Math.min(3, prev.width + increment))
        };
      } else {
        return {
          ...prev,
          height: Math.max(0.1, Math.min(3, prev.height + increment))
        };
      }
    });
  };

  const findOptimalPosition = async () => {
    setIsAnalyzing(true);
    setAiConfidence(null);
    
    try {
      console.log(`🤖 Requesting AI positioning analysis for ${jewelryType}...`);
      
      // Convert base64 image to buffer for analysis
      const base64Data = modelImage.split(',')[1];
      if (!base64Data) {
        console.error('Invalid model image format');
        return;
      }
      
      // Call our positioning API
      const response = await fetch('/api/jewelry-positioning', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          modelImage: base64Data,
          jewelryType: jewelryType
        })
      });
      
      if (response.ok) {
        const result = await response.json();
        console.log('🎯 AI positioning response:', result);
        
        if (result.success && result.positioning) {
          // Apply AI-suggested positioning with all enhancements
          const newPosition = {
            x: Math.max(50, Math.min(1150, result.positioning.position.x)), // Clamp to canvas bounds
            y: Math.max(50, Math.min(850, result.positioning.position.y))
          };
          
          setJewelryPosition(newPosition);
          
          // Convert single scale to width/height scale, ensuring reasonable bounds
          const scale = Math.max(0.1, Math.min(2.0, result.positioning.scale));
          setJewelryScale({ width: scale, height: scale });
          
          // Apply rotation
          const rotation = result.positioning.rotation || 0;
          setJewelryRotation(Math.max(-45, Math.min(45, rotation))); // Clamp rotation
          
          // Apply adjustments if provided
          if (result.positioning.adjustments) {
            setJewelryAdjustments({
              scaleX: Math.max(0.5, Math.min(1.5, result.positioning.adjustments.scaleX || 1)),
              scaleY: Math.max(0.5, Math.min(1.5, result.positioning.adjustments.scaleY || 1)),
              skew: Math.max(-15, Math.min(15, result.positioning.adjustments.skew || 0)),
              opacity: Math.max(0.5, Math.min(1, result.positioning.adjustments.opacity || 1))
            });
          }
          
          setAiConfidence(result.positioning.confidence);
          
          console.log('✅ AI positioning applied successfully:', {
            position: newPosition,
            scale: scale,
            rotation: rotation,
            adjustments: result.positioning.adjustments,
            confidence: result.positioning.confidence
          });
        } else {
          console.warn('❌ AI positioning failed:', result.error || 'Unknown error');
        }
      } else {
        const errorText = await response.text();
        console.error('🚨 AI positioning request failed:', response.status, response.statusText, errorText);
      }
      
    } catch (error) {
      console.error('💥 AI positioning error:', error);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const downloadComposite = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Create download link
    canvas.toBlob((blob) => {
      if (blob) {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `virtual-tryon-${jewelryType}-${Date.now()}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        // Also call the callback if provided
        if (onFinalComposition) {
          const dataURL = canvas.toDataURL('image/png');
          onFinalComposition(dataURL);
        }
      }
    }, 'image/png');
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Real-Time Virtual Try-On</h3>
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => adjustScale('both', -0.1)}
            title="Make smaller (both dimensions)"
          >
            <ZoomOut className="w-4 h-4" />
          </Button>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => adjustScale('both', 0.1)}
            title="Make larger (both dimensions)"
          >
            <ZoomIn className="w-4 h-4" />
          </Button>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => setJewelryRotation(prev => prev - 15)}
            title="Rotate counter-clockwise"
          >
            <RotateCcw className="w-4 h-4" />
          </Button>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => setJewelryRotation(prev => prev + 15)}
            title="Rotate clockwise"
          >
            <RotateCw className="w-4 h-4" />
          </Button>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={resetPosition}
          >
            <RotateCcw className="w-4 h-4 mr-2" />
            Reset
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={findOptimalPosition}
            disabled={isAnalyzing}
            className={isAnalyzing ? 'opacity-50 cursor-not-allowed' : ''}
          >
            {isAnalyzing ? '🤖 Analyzing...' : '🤖 Smart Position'}
          </Button>
          <Button 
            variant="default" 
            size="sm" 
            onClick={downloadComposite}
          >
            <Download className="w-4 h-4 mr-2" />
            Download
          </Button>
        </div>
      </div>
      
      {/* Enhanced controls with rotation and adjustments */}
      <div className="grid grid-cols-3 gap-4 p-4 bg-gray-50 rounded-lg">
        <div>
          <label className="block text-sm font-medium mb-2">Width Scale</label>
          <div className="flex items-center gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => adjustScale('width', -0.05)}
            >
              -
            </Button>
            <span className="min-w-[60px] text-center text-sm">
              {(jewelryScale.width * 100).toFixed(0)}%
            </span>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => adjustScale('width', 0.05)}
            >
              +
            </Button>
          </div>
        </div>
        
        <div>
          <label className="block text-sm font-medium mb-2">Height Scale</label>
          <div className="flex items-center gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => adjustScale('height', -0.05)}
            >
              -
            </Button>
            <span className="min-w-[60px] text-center text-sm">
              {(jewelryScale.height * 100).toFixed(0)}%
            </span>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => adjustScale('height', 0.05)}
            >
              +
            </Button>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">Rotation</label>
          <div className="flex items-center gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => setJewelryRotation(prev => Math.max(-90, prev - 5))}
            >
              -
            </Button>
            <span className="min-w-[60px] text-center text-sm">
              {jewelryRotation.toFixed(0)}°
            </span>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => setJewelryRotation(prev => Math.min(90, prev + 5))}
            >
              +
            </Button>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">Horizontal Adj.</label>
          <div className="flex items-center gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => setJewelryAdjustments(prev => ({ ...prev, scaleX: Math.max(0.5, prev.scaleX - 0.05) }))}
            >
              -
            </Button>
            <span className="min-w-[60px] text-center text-sm">
              {(jewelryAdjustments.scaleX * 100).toFixed(0)}%
            </span>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => setJewelryAdjustments(prev => ({ ...prev, scaleX: Math.min(1.5, prev.scaleX + 0.05) }))}
            >
              +
            </Button>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">Vertical Adj.</label>
          <div className="flex items-center gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => setJewelryAdjustments(prev => ({ ...prev, scaleY: Math.max(0.5, prev.scaleY - 0.05) }))}
            >
              -
            </Button>
            <span className="min-w-[60px] text-center text-sm">
              {(jewelryAdjustments.scaleY * 100).toFixed(0)}%
            </span>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => setJewelryAdjustments(prev => ({ ...prev, scaleY: Math.min(1.5, prev.scaleY + 0.05) }))}
            >
              +
            </Button>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">Opacity</label>
          <div className="flex items-center gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => setJewelryAdjustments(prev => ({ ...prev, opacity: Math.max(0.1, prev.opacity - 0.1) }))}
            >
              -
            </Button>
            <span className="min-w-[60px] text-center text-sm">
              {(jewelryAdjustments.opacity * 100).toFixed(0)}%
            </span>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => setJewelryAdjustments(prev => ({ ...prev, opacity: Math.min(1, prev.opacity + 0.1) }))}
            >
              +
            </Button>
          </div>
        </div>
      </div>
      
      <div 
        ref={containerRef}
        className="relative border-2 border-gray-300 rounded-lg overflow-hidden bg-gray-50"
      >
        <canvas
          ref={canvasRef}
          width={1200}
          height={900}
          className="w-full h-auto cursor-grab touch-none"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        />
        
        {/* Enhanced position and transformation indicators */}
        <div className="absolute bottom-4 left-4 bg-black bg-opacity-70 text-white px-3 py-2 rounded text-sm max-w-xs">
          <div>Position: {Math.round(jewelryPosition.x)}, {Math.round(jewelryPosition.y)}</div>
          <div>Scale: W{(jewelryScale.width * 100).toFixed(0)}% × H{(jewelryScale.height * 100).toFixed(0)}%</div>
          <div>Rotation: {jewelryRotation.toFixed(1)}°</div>
          <div>Adjustments: {(jewelryAdjustments.scaleX * 100).toFixed(0)}%x{(jewelryAdjustments.scaleY * 100).toFixed(0)}% α{(jewelryAdjustments.opacity * 100).toFixed(0)}%</div>
          {aiConfidence !== null && (
            <div>AI Confidence: {(aiConfidence * 100).toFixed(1)}%</div>
          )}
        </div>
        
        {/* Instructions */}
        <div className="absolute top-4 right-4 bg-blue-500 bg-opacity-90 text-white px-3 py-2 rounded text-sm max-w-xs">
          <strong>💡 Interactive Controls:</strong><br/>
          • Click & drag jewelry to reposition<br/>
          • Use zoom buttons to resize<br/>
          • Try 🤖 Smart Position for AI placement<br/>
          • Works on mobile with touch
        </div>
      </div>
      
      {/* Hidden images for canvas rendering */}
      <div className="hidden">
        <img
          ref={modelImgRef}
          src={modelImage}
          alt="Model"
          onLoad={drawCanvas}
          crossOrigin="anonymous"
        />
        <img
          ref={jewelryImgRef}
          src={jewelryImage}
          alt="Jewelry"
          onLoad={drawCanvas}
          crossOrigin="anonymous"
          style={{ 
            imageRendering: 'crisp-edges', // Better for PNG transparency
          }}
        />
      </div>
      
      <p className="text-sm text-muted-foreground">
        🎯 <strong>Enhanced Experience:</strong> Drag jewelry with mouse or touch, use AI-powered smart positioning with Gemini Vision, and enjoy real-time editing with 1200×900 high-resolution canvas. No tokens consumed for manual positioning.
      </p>
    </div>
  );
}

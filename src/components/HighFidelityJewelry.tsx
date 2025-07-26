// Simplified high-fidelity jewelry overlay component
'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Sparkles, Download, RotateCcw } from 'lucide-react';

interface HighFidelityJewelryProps {
  personImage: string;
  jewelryImage: string;
  jewelryType: string;
}

interface Position {
  x: number;
  y: number;
  scale: number;
}

export default function HighFidelityJewelry({
  personImage,
  jewelryImage,
  jewelryType
}: HighFidelityJewelryProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [position, setPosition] = useState<Position>({ x: 300, y: 200, scale: 1 });
  const [enhancedImage, setEnhancedImage] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  // Draw composite image on canvas
  const drawComposite = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    try {
      // Draw person image
      const personImg = new Image();
      await new Promise((resolve, reject) => {
        personImg.onload = resolve;
        personImg.onerror = reject;
        personImg.src = personImage;
      });

      ctx.drawImage(personImg, 0, 0, canvas.width, canvas.height);

      // Draw jewelry image
      const jewelryImg = new Image();
      await new Promise((resolve, reject) => {
        jewelryImg.onload = resolve;
        jewelryImg.onerror = reject;
        jewelryImg.src = jewelryImage;
      });

      const scaledWidth = jewelryImg.width * position.scale;
      const scaledHeight = jewelryImg.height * position.scale;

      ctx.drawImage(
        jewelryImg,
        position.x - scaledWidth / 2,
        position.y - scaledHeight / 2,
        scaledWidth,
        scaledHeight
      );

    } catch (error) {
      console.error('Error drawing composite:', error);
    }
  }, [personImage, jewelryImage, position]);

  // Initialize canvas
  useEffect(() => {
    drawComposite();
  }, [drawComposite]);

  // Mouse event handlers for simple dragging
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    setIsDragging(true);
    setDragStart({ x: x - position.x, y: y - position.y });
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDragging) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    setPosition(prev => ({
      ...prev,
      x: x - dragStart.x,
      y: y - dragStart.y
    }));
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Generate high-fidelity image
  const generateHighFidelityImage = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    setIsGenerating(true);
    
    try {
      // Get composite image as base64
      const compositeDataUrl = canvas.toDataURL('image/png');
      const base64Data = compositeDataUrl.split(',')[1];

      console.log(`🎨 Generating high-fidelity ${jewelryType} image...`);

      const response = await fetch('/api/high-fidelity-jewelry', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          compositeImage: base64Data,
          jewelryType,
          enhancementPrompt: null // Use default prompts
        }),
      });

      const result = await response.json();

      if (result.success && result.enhancedImage) {
        setEnhancedImage(`data:image/jpeg;base64,${result.enhancedImage}`);
        console.log('✅ High-fidelity image generated successfully');
      } else {
        console.error('Generation failed:', result.error);
        alert(`Failed to generate high-fidelity image: ${result.error}`);
      }

    } catch (error) {
      console.error('Error generating high-fidelity image:', error);
      alert('Failed to generate high-fidelity image. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  };

  // Download enhanced image
  const downloadImage = () => {
    if (!enhancedImage) return;

    const link = document.createElement('a');
    link.href = enhancedImage;
    link.download = `high-fidelity-${jewelryType}-${Date.now()}.jpg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Reset to original
  const resetToOriginal = () => {
    setEnhancedImage(null);
    setPosition({ x: 300, y: 200, scale: 1 });
  };

  return (
    <div className=" max-w-7xl mx-auto p-6 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-yellow-500" />
            High-Fidelity Jewelry Preview
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Position the jewelry roughly, then generate a photorealistic enhanced version
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-2 gap-6">
            {/* Positioning Canvas */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">1. Position Jewelry</h3>
                <span className="px-2 py-1 text-xs font-medium bg-gray-100 text-gray-800 rounded-full capitalize">
                  {jewelryType}
                </span>
              </div>
              
              <canvas
                ref={canvasRef}
                width={600}
                height={600}
                className="border border-gray-300 rounded-lg cursor-move bg-white shadow-sm"
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
              />

              {/* Simple Controls */}
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Scale: {position.scale.toFixed(1)}x
                  </label>
                  <input
                    type="range"
                    min="0.1"
                    max="3"
                    step="0.1"
                    value={position.scale}
                    onChange={(e) => 
                      setPosition(prev => ({ ...prev, scale: parseFloat(e.target.value) }))
                    }
                    className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer slider"
                  />
                </div>

                <Button
                  onClick={generateHighFidelityImage}
                  disabled={isGenerating}
                  className="w-full"
                  size="lg"
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Generating High-Fidelity Image...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4 mr-2" />
                      Generate High-Fidelity Image
                    </>
                  )}
                </Button>
              </div>
            </div>

            {/* Enhanced Result */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">2. Enhanced Result</h3>
                {enhancedImage && (
                  <div className="flex gap-2">
                    <Button
                      onClick={downloadImage}
                      variant="outline"
                      size="sm"
                    >
                      <Download className="w-4 h-4 mr-2" />
                      Download
                    </Button>
                    <Button
                      onClick={resetToOriginal}
                      variant="outline"
                      size="sm"
                    >
                      <RotateCcw className="w-4 h-4 mr-2" />
                      Reset
                    </Button>
                  </div>
                )}
              </div>

              <div className="relative">
                {enhancedImage ? (
                  <img
                    src={enhancedImage}
                    alt="High-fidelity enhanced jewelry"
                    className="w-full h-[600px] object-cover rounded-lg border border-gray-300 shadow-sm"
                  />
                ) : (
                  <div className="w-full h-[600px] border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center bg-gray-50">
                    <div className="text-center text-gray-500">
                      <Sparkles className="w-12 h-12 mx-auto mb-4 opacity-50" />
                      <p className="text-lg font-medium mb-2">Enhanced Image Will Appear Here</p>
                      <p className="text-sm">
                        Position your jewelry and click "Generate High-Fidelity Image"
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Instructions */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid md:grid-cols-3 gap-4 text-sm">
            <div className="text-center">
              <div className="w-8 h-8 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-2 font-semibold">
                1
              </div>
              <p className="font-medium">Position</p>
              <p className="text-muted-foreground">Drag jewelry to desired location</p>
            </div>
            <div className="text-center">
              <div className="w-8 h-8 bg-yellow-100 text-yellow-600 rounded-full flex items-center justify-center mx-auto mb-2 font-semibold">
                2
              </div>
              <p className="font-medium">Scale</p>
              <p className="text-muted-foreground">Adjust size with slider</p>
            </div>
            <div className="text-center">
              <div className="w-8 h-8 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-2 font-semibold">
                3
              </div>
              <p className="font-medium">Generate</p>
              <p className="text-muted-foreground">Create photorealistic result</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

'use client';

import React, { useState, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Upload, Image as ImageIcon, Loader2, CheckCircle, XCircle } from "lucide-react";
import { toast } from "sonner";
import HighFidelityJewelry from "./HighFidelityJewelry";

interface JobStatus {
  jobId: string;
  status: 'waiting' | 'active' | 'completed' | 'failed' | 'delayed' | 'paused' | 'stuck';
  progress: number;
  result?: {
    success: boolean;
    result?: {
      success: boolean;
      resultImage?: string;
      validation?: {
        isValid: boolean;
        similarity: number;
        deviations: string[];
      };
      error?: string;
      processingTime: number;
    };
  };
  error?: string;
}

export function VirtualTryOnInterface() {
  const [jewelryImage, setJewelryImage] = useState<File | null>(null);
  const [customModel, setCustomModel] = useState<File | null>(null);
  const [jewelryType, setJewelryType] = useState<string>('');
  const [dimensions, setDimensions] = useState({
    width: '',
    height: '',
    depth: ''
  });
  // Remove demographics, add systemPrompt
  const [systemPrompt, setSystemPrompt] = useState<string>('');
  const [currentJob, setCurrentJob] = useState<JobStatus | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [resultImage, setResultImage] = useState<string | null>(null);
  const [currentPosition, setCurrentPosition] = useState({ x: 0, y: 0 });
  
  // For real-time canvas
  const [modelImageData, setModelImageData] = useState<string | null>(null);
  const [jewelryImageData, setJewelryImageData] = useState<string | null>(null);
  
  const jewelryFileRef = useRef<HTMLInputElement>(null);
  const modelFileRef = useRef<HTMLInputElement>(null);
  
  const handleJewelryImageChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (file.type.startsWith('image/')) {
        setJewelryImage(file);
        toast.success('Jewelry image uploaded successfully');
      } else {
        toast.error('Please select a valid image file');
      }
    }
  };
  
  const handleCustomModelChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (file.type.startsWith('image/')) {
        setCustomModel(file);
        toast.success('Custom model image uploaded successfully');
      } else {
        toast.error('Please select a valid image file');
      }
    }
  };
  
  const validateForm = (): boolean => {
    if (!jewelryImage) {
      toast.error('Please upload a jewelry image');
      return false;
    }
    if (!jewelryType) {
      toast.error('Please select a jewelry type');
      return false;
    }
    if (!dimensions.width || !dimensions.height || !dimensions.depth) {
      toast.error('Please enter all jewelry dimensions');
      return false;
    }
    if (!systemPrompt && !customModel) {
      toast.error('Please enter a model system prompt or upload a custom model');
      return false;
    }
    return true;
  };
  
  const handleSubmit = async (positionOffset = { x: 0, y: 0 }) => {
    if (!validateForm()) return;
    
    setIsProcessing(true);
    setResultImage(null);
    setCurrentJob(null);
    
    try {
      const formData = new FormData();
      formData.append('jewelryImage', jewelryImage!);
      formData.append('jewelryType', jewelryType);
      formData.append('width', dimensions.width);
      formData.append('height', dimensions.height);
      formData.append('depth', dimensions.depth);
      formData.append('systemPrompt', systemPrompt || 'Custom model');
      formData.append('offsetX', positionOffset.x.toString());
      formData.append('offsetY', positionOffset.y.toString());
      
      if (customModel) {
        formData.append('customModel', customModel);
      }

      toast.info('Processing virtual try-on... This may take 30-60 seconds.');
      
      const response = await fetch('/api/virtual-tryon', {
        method: 'POST',
        body: formData,
      });
      
      const data = await response.json();
      
      if (data.success && data.result?.imageData) {
        // Image processing completed immediately
        setResultImage(data.result.imageData);
        
        // Set up real-time canvas data if available
        if (data.result.modelImageData && data.result.jewelryImageData) {
          setModelImageData(data.result.modelImageData);
          setJewelryImageData(data.result.jewelryImageData);
        }
        
        toast.success('Virtual try-on completed successfully!');
      } else {
        throw new Error(data.message || data.error || 'Failed to process virtual try-on');
      }
      
    } catch (error) {
      console.error('Submission error:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to submit request');
    } finally {
      setIsProcessing(false);
    }
  };

  const resetForm = () => {
    setJewelryImage(null);
    setCustomModel(null);
    setJewelryType('');
    setDimensions({ width: '', height: '', depth: '' });
    setSystemPrompt('');
    setCurrentJob(null);
    setIsProcessing(false);
    setResultImage(null);
    setCurrentPosition({ x: 0, y: 0 });
    setModelImageData(null);
    setJewelryImageData(null);
    setCurrentPosition({ x: 0, y: 0 });
    
    if (jewelryFileRef.current) jewelryFileRef.current.value = '';
    if (modelFileRef.current) modelFileRef.current.value = '';
  };
  
  return (
    <div className="container mx-auto p-6 space-y-6 max-w-4xl">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl font-bold text-center">
            Virtual Jewelry Try-On
          </CardTitle>
          <p className="text-center text-muted-foreground">
            Upload jewelry and see it placed on a model with perfect accuracy
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Jewelry Upload */}
          <div className="space-y-2">
            <Label htmlFor="jewelry" className="text-base font-medium">
              Jewelry Image *
            </Label>
            <div className="flex items-center gap-4">
              <Button
                variant="outline"
                onClick={() => jewelryFileRef.current?.click()}
                className="flex items-center gap-2"
              >
                <Upload className="w-4 h-4" />
                Choose Jewelry Image
              </Button>
              <Input
                ref={jewelryFileRef}
                id="jewelry"
                type="file"
                accept="image/*"
                onChange={handleJewelryImageChange}
                className="hidden"
              />
              {jewelryImage && (
                <span className="text-sm text-muted-foreground">
                  {jewelryImage.name}
                </span>
              )}
            </div>
          </div>
          
          {/* Jewelry Type */}
          <div className="space-y-2">
            <Label htmlFor="jewelry-type" className="text-base font-medium">
              Jewelry Type *
            </Label>
            <Select value={jewelryType} onValueChange={setJewelryType}>
              <SelectTrigger>
                <SelectValue placeholder="Select jewelry type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ring">Ring</SelectItem>
                <SelectItem value="necklace">Necklace</SelectItem>
                <SelectItem value="earrings">Earrings</SelectItem>
                <SelectItem value="bracelet">Bracelet</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          {/* Sizing Input */}
          <div className="space-y-2">
            <Label className="text-base font-medium">
              Jewelry Dimensions (mm) *
            </Label>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label htmlFor="width" className="text-sm">Width</Label>
                <Input
                  id="width"
                  type="number"
                  placeholder="42"
                  value={dimensions.width}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDimensions(prev => ({ ...prev, width: e.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="height" className="text-sm">Height</Label>
                <Input
                  id="height"
                  type="number"
                  placeholder="12"
                  value={dimensions.height}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDimensions(prev => ({ ...prev, height: e.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="depth" className="text-sm">Depth</Label>
                <Input
                  id="depth"
                  type="number"
                  placeholder="5"
                  value={dimensions.depth}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDimensions(prev => ({ ...prev, depth: e.target.value }))}
                />
              </div>
            </div>
          </div>
          
          {/* Model Prompt or Custom Model Upload */}
          <div className="space-y-4">
            <Label className="text-base font-medium">
              Model System Prompt *
            </Label>
            <Input
              id="system-prompt"
              type="text"
              placeholder="Describe the model you want (e.g. 'High-fashion portrait photograph of a South Asian woman...')"
              value={systemPrompt}
              onChange={e => setSystemPrompt(e.target.value)}
              className="w-full"
              maxLength={400}
            />
            <div className="text-center text-muted-foreground">OR</div>
            <div className="space-y-2">
              <Label htmlFor="custom-model">Upload Custom Model</Label>
              <div className="flex items-center gap-4">
                <Button
                  variant="outline"
                  onClick={() => modelFileRef.current?.click()}
                  className="flex items-center gap-2"
                >
                  <ImageIcon className="w-4 h-4" />
                  Choose Model Image
                </Button>
                <Input
                  ref={modelFileRef}
                  id="custom-model"
                  type="file"
                  accept="image/*"
                  onChange={handleCustomModelChange}
                  className="hidden"
                />
                {customModel && (
                  <span className="text-sm text-muted-foreground">
                    {customModel.name}
                  </span>
                )}
              </div>
            </div>
          </div>
          
          {/* Processing Status */}
          {currentJob && (
            <Card className="bg-muted/50">
              <CardContent className="pt-6">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">Processing Status</span>
                    <div className="flex items-center gap-2">
                      {currentJob.status === 'completed' ? (
                        <CheckCircle className="w-5 h-5 text-green-600" />
                      ) : currentJob.status === 'failed' ? (
                        <XCircle className="w-5 h-5 text-red-600" />
                      ) : (
                        <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
                      )}
                      <span className="capitalize">{currentJob.status}</span>
                    </div>
                  </div>
                  
                  <Progress value={currentJob.progress} className="w-full" />
                  
                  <div className="text-sm text-muted-foreground">
                    Progress: {currentJob.progress}%
                  </div>
                  
                  {currentJob.result?.result?.validation && (
                    <div className="text-sm">
                      <div className="font-medium">Validation Results:</div>
                      <div>Similarity: {(currentJob.result.result.validation.similarity * 100).toFixed(1)}%</div>
                      {currentJob.result.result.validation.deviations.length > 0 && (
                        <div className="text-red-600">
                          Issues: {currentJob.result.result.validation.deviations.join(', ')}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
          
          {/* Submit Button */}
          <div className="flex gap-4">
            <Button
              onClick={() => handleSubmit()}
              disabled={isProcessing}
              className="flex-1 h-12"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  Processing...
                </>
              ) : (
                'Generate Virtual Try-On'
              )}
            </Button>
            
            <Button
              variant="outline"
              onClick={resetForm}
              disabled={isProcessing}
              className="h-12"
            >
              Reset
            </Button>
          </div>
        </CardContent>
      </Card>
      
      {/* High-Fidelity Jewelry Preview */}
      {modelImageData && jewelryImageData && (
        <HighFidelityJewelry
          personImage={modelImageData}
          jewelryImage={jewelryImageData}
          jewelryType={jewelryType}
        />
      )}
      
      {/* Fallback: Static Result Display */}
      {resultImage && !modelImageData && (
        <Card>
          <CardContent className="p-6">
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Virtual Try-On Result</h3>
              <div className="flex justify-center">
                <img
                  src={resultImage}
                  alt="Virtual try-on result"
                  className="max-w-full max-h-96 rounded-lg shadow-lg"
                />
              </div>
              <div className="text-center">
                <Button
                  onClick={() => {
                    const link = document.createElement('a');
                    link.href = resultImage;
                    link.download = 'virtual-tryon-result.png';
                    link.click();
                  }}
                  variant="outline"
                >
                  Download Result
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

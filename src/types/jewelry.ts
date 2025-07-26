export interface JewelryDimensions {
  width: number;  
  height: number;
  depth: number;  
}

export interface JewelrySegmentation {
  jewelryMask: any; 
  jewelryImage: any; 
  boundingBox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  cleanedJewelry: any; 
}

export interface ModelGenerationParams {
  pose: 'hand-extended' | 'neck-visible' | 'ear-visible';
  demographics: string;
  lighting: 'studio' | 'natural';
  background: 'neutral' | 'white';
}

export interface PlacementCalculation {
  x: number;
  y: number;
  scale: number;
  rotation: number;
  perspective: 'front' | 'side' | 'angled';
}

export interface ShadowConfig {
  opacity: number;
  blur: number;
  offsetX: number;
  offsetY: number;
  color: string;
}

export interface ValidationResult {
  isValid: boolean;
  similarity: number; 
  deviations: string[];
}

export interface BodyLandmarks {
  face?: any[];
  hands?: any[];
  pose?: any[];
}

export type JewelryType = 'ring' | 'necklace' | 'earrings' | 'bracelet';

export interface VirtualTryOnRequest {
  jewelryImage: File;
  jewelryType: JewelryType;
  dimensions: JewelryDimensions;
  modelParams: ModelGenerationParams;
  customModel?: File;
}

export interface VirtualTryOnResult {
  success: boolean;
  resultImage?: Buffer;
  validation?: ValidationResult;
  error?: string;
  processingTime: number;
}

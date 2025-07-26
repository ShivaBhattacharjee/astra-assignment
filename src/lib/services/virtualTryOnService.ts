import { removeJewelryBackground } from '@/lib/ai/backgroundRemoval';
import { generateBaseModel } from '@/lib/ai/modelGeneration';
import { calculateJewelryPlacement } from '@/lib/image/placement';
import { compositeJewelryOnModel } from '@/lib/image/composition';
import { validateJewelryIntegrity } from '@/lib/validation/jewelryValidator';
import { JewelryType } from '@/types/jewelry';
import sharp from 'sharp';

export interface VirtualTryOnServiceRequest {
  jewelryImageBuffer: Buffer;
  jewelryType: string;
  dimensions: {
    width: number;
    height: number;
    depth: number;
  };
  demographics?: string;
  customModelBuffer?: Buffer;
  positionOffset?: {
    x: number;
    y: number;
  };
  returnSeparateImages?: boolean; // For real-time canvas
  onProgress?: (progress: number) => Promise<void>;
}

export interface VirtualTryOnServiceResult {
  imageBuffer: Buffer;
  imageUrl?: string;
  // For real-time canvas
  modelImageBuffer?: Buffer;
  segmentedJewelryBuffer?: Buffer;
  metadata: {
    processingSteps: string[];
    jewelryDimensions: {
      width: number;
      height: number;
      depth: number;
    };
    confidence: number;
  };
}

export async function processVirtualTryOn(
  request: VirtualTryOnServiceRequest
): Promise<VirtualTryOnServiceResult> {
  const processingSteps: string[] = [];
  
  try {
    // Step 1: Remove jewelry background using AI
    await request.onProgress?.(20);
    processingSteps.push('jewelry_background_removal');
    
    console.log('Removing jewelry background with AI...');
    const backgroundRemovalResult = await removeJewelryBackground(request.jewelryImageBuffer);
    
    const cleanJewelryBuffer = backgroundRemovalResult.cleanedImage;
    console.log(`Background removal completed with ${(backgroundRemovalResult.confidence * 100).toFixed(1)}% confidence`);

    // Step 2: Generate or use provided model (ensuring no jewelry)
    await request.onProgress?.(40);
    processingSteps.push('clean_model_generation');
    
    let modelBuffer: Buffer;
    if (request.customModelBuffer) {
      modelBuffer = request.customModelBuffer;
      console.log('Using custom model provided by user');
    } else {
      console.log(`Generating clean model for demographics: "${request.demographics}"`);
      modelBuffer = await generateBaseModel({
        pose: request.jewelryType === 'ring' || request.jewelryType === 'bracelet' ? 'hand-extended' :
              request.jewelryType === 'necklace' ? 'neck-visible' : 'ear-visible',
        demographics: request.demographics || 'adult_female',
        lighting: 'studio',
        background: 'neutral'
      });
      console.log('Clean model generation completed');
    }

    // Step 3: Calculate jewelry placement using AI positioning
    await request.onProgress?.(60);
    processingSteps.push('ai_placement_calculation');
    
    const placementData = await calculateJewelryPlacement(
      modelBuffer,
      {
        width: request.dimensions.width,
        height: request.dimensions.height,
        depth: request.dimensions.depth
      },
      request.jewelryType as JewelryType
    );

    // Step 4: Composite clean jewelry onto model
    await request.onProgress?.(80);
    processingSteps.push('jewelry_composition');
    
    console.log('Starting jewelry composition with clean background...');
    console.log('Placement data:', placementData);
    
    const compositeResult = await compositeJewelryOnModel(
      modelBuffer,
      {
        jewelryMask: null, // Not needed for clean jewelry
        jewelryImage: request.jewelryImageBuffer,
        cleanedJewelry: cleanJewelryBuffer,
        boundingBox: {
          x: 0,
          y: 0,
          width: (await sharp(cleanJewelryBuffer).metadata()).width || 100,
          height: (await sharp(cleanJewelryBuffer).metadata()).height || 100
        },
        // confidence: backgroundRemovalResult.confidence
      },
      placementData,
      {
        opacity: 0.9, // Higher opacity for clean jewelry
        blur: 1,
        color: '#000000',
        offsetX: 1,
        offsetY: 1
      },
      request.positionOffset, // Pass position offset to composition
      request.jewelryType // Pass jewelry type for better positioning
    );
    
    console.log('Composition completed, result buffer size:', compositeResult.length);

    // Step 5: Validate result
    await request.onProgress?.(90);
    processingSteps.push('validation');
    
    const validationResult = await validateJewelryIntegrity(
      request.jewelryImageBuffer,
      compositeResult,
      0.02
    );

    if (!validationResult.isValid) {
      console.warn('Validation warnings:', validationResult.deviations);
    }

    // Step 6: Final processing
    await request.onProgress?.(100);
    processingSteps.push('final_processing');
    
    // Optimize the final image
    const optimizedBuffer = await sharp(compositeResult)
      .png({ quality: 95 })
      .toBuffer();

    return {
      imageBuffer: optimizedBuffer,
      modelImageBuffer: request.returnSeparateImages ? modelBuffer : undefined,
      segmentedJewelryBuffer: request.returnSeparateImages ? cleanJewelryBuffer : undefined,
      metadata: {
        processingSteps,
        jewelryDimensions: request.dimensions,
        confidence: validationResult.similarity
      }
    };

  } catch (error) {
    console.error('Virtual try-on processing error:', error);
    throw error;
  }
}

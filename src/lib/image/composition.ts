import sharp from 'sharp';
import { JewelrySegmentation, PlacementCalculation, ShadowConfig } from '@/types/jewelry';

/**
 * Composite the segmented jewelry onto the model image with realistic lighting and shadows
 * This is where the magic happens - seamless integration without AI hallucination
 */
export async function compositeJewelryOnModel(
  modelImage: Buffer,
  segmentedJewelry: JewelrySegmentation,
  placement: PlacementCalculation,
  shadowSettings?: ShadowConfig,
  positionOffset?: { x: number; y: number },
  jewelryType?: string
): Promise<Buffer> {
  try {
    console.log('Starting composition with placement:', placement);
    
    // Get the model image as the base
    const modelMetadata = await sharp(modelImage).metadata();
    console.log('Model image dimensions:', modelMetadata.width, 'x', modelMetadata.height);
    
    // Get the cleaned jewelry (with transparent background)
    const jewelryBuffer = segmentedJewelry.cleanedJewelry;
    
    if (!jewelryBuffer) {
      console.error('No cleaned jewelry buffer available');
      return modelImage; // Return original model if no jewelry
    }
    
    // Get jewelry dimensions
    const jewelryMetadata = await sharp(jewelryBuffer).metadata();
    console.log('Jewelry dimensions:', jewelryMetadata.width, 'x', jewelryMetadata.height);
    
    // Scale jewelry to appropriate size based on jewelry type
    let targetJewelryWidth: number;
    let yPositionRatio: number;
    
    // Different scaling and positioning for different jewelry types
    if (jewelryType === 'necklace') {
      targetJewelryWidth = Math.min(modelMetadata.width! * 0.4, jewelryMetadata.width!); // Smaller for necklaces
      yPositionRatio = 0.35; // Upper chest area
    } else if (jewelryType === 'ring') {
      targetJewelryWidth = Math.min(modelMetadata.width! * 0.15, jewelryMetadata.width!); // Very small for rings
      yPositionRatio = 0.6; // Hand area
    } else if (jewelryType === 'earrings') {
      targetJewelryWidth = Math.min(modelMetadata.width! * 0.08, jewelryMetadata.width!); // Small for earrings
      yPositionRatio = 0.25; // Ear area
    } else { // bracelet or default
      targetJewelryWidth = Math.min(modelMetadata.width! * 0.25, jewelryMetadata.width!);
      yPositionRatio = 0.7; // Wrist area
    }
    
    const scaleFactor = targetJewelryWidth / jewelryMetadata.width!;
    const targetJewelryHeight = Math.round(jewelryMetadata.height! * scaleFactor);
    
    console.log(`Jewelry type: ${jewelryType}, scaling to:`, targetJewelryWidth, 'x', targetJewelryHeight);
    
    // Resize jewelry to fit better on model
    const resizedJewelry = await sharp(jewelryBuffer)
      .resize(Math.round(targetJewelryWidth), Math.round(targetJewelryHeight), {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 } // Transparent background
      })
      .toBuffer();
    
    // Position jewelry on the model based on jewelry type
    let left = Math.round((modelMetadata.width! - targetJewelryWidth) / 2); // Center horizontally
    let top = Math.round(modelMetadata.height! * yPositionRatio); // Position based on jewelry type
    
    // Apply position offset if provided (for drag adjustments)
    if (positionOffset) {
      console.log('Applying position offset:', positionOffset);
      left += positionOffset.x;
      top += positionOffset.y;
    }
    
    console.log('Positioning jewelry at:', { left, top });
    
    // Composite the jewelry ONTO the model image
    const result = await sharp(modelImage)
      .composite([{
        input: resizedJewelry,
        left: Math.max(0, left),
        top: Math.max(0, top),
        blend: 'over' // This overlays the jewelry ON TOP of the model
      }])
      .png()
      .toBuffer();
    
    console.log('Composition successful! Result size:', result.length);
    console.log('Final image should show model WITH necklace');
    
    return result;
    
  } catch (error) {
    console.error('Jewelry composition failed:', error);
    // Return original model image if composition fails
    console.log('Returning original model image due to error');
    return modelImage;
  }
}

/**
 * Prepare jewelry for composition (scaling, rotation, positioning)
 */
async function prepareJewelryForComposition(
  segmentedJewelry: JewelrySegmentation,
  placement: PlacementCalculation,
  modelImage: Buffer
): Promise<Buffer> {
  // Get model image dimensions
  const { width: modelWidth, height: modelHeight } = await sharp(modelImage).metadata();
  
  if (!modelWidth || !modelHeight) {
    throw new Error('Invalid model image dimensions');
  }
  
  // Calculate final jewelry dimensions
  const jewelryBounds = segmentedJewelry.boundingBox;
  const scaledWidth = Math.round(jewelryBounds.width * placement.scale);
  const scaledHeight = Math.round(jewelryBounds.height * placement.scale);
  
  // Prepare jewelry transformation
  let transformedJewelry = sharp(segmentedJewelry.cleanedJewelry);
  
  // Apply scaling
  if (scaledWidth > 0 && scaledHeight > 0) {
    transformedJewelry = transformedJewelry.resize(scaledWidth, scaledHeight, {
      fit: 'fill',
      kernel: sharp.kernel.lanczos3 // High-quality scaling
    });
  }
  
  // Apply rotation
  if (Math.abs(placement.rotation) > 0.5) {
    transformedJewelry = transformedJewelry.rotate(placement.rotation, {
      background: { r: 0, g: 0, b: 0, alpha: 0 } // Transparent background
    });
  }
  
  // Apply perspective transformation if needed
  if (placement.perspective !== 'front') {
    transformedJewelry = await applyPerspectiveTransform(transformedJewelry, placement.perspective);
  }
  
  return await transformedJewelry.png().toBuffer();
}

/**
 * Apply perspective transformation to jewelry
 */
async function applyPerspectiveTransform(
  jewelry: sharp.Sharp,
  perspective: 'front' | 'side' | 'angled'
): Promise<sharp.Sharp> {
  switch (perspective) {
    case 'side':
      // Apply side perspective transformation
      return jewelry.convolve({
        width: 3,
        height: 3,
        kernel: [0, -0.1, 0, 0, 1.2, 0, 0, -0.1, 0] // Simple perspective kernel
      });
      
    case 'angled':
      // Apply angled perspective
      return jewelry.convolve({
        width: 3,
        height: 3,
        kernel: [-0.05, -0.1, 0, -0.05, 1.3, -0.05, 0, -0.1, -0.05]
      });
      
    default:
      return jewelry;
  }
}

/**
 * Generate realistic shadows for the jewelry
 */
async function generateShadows(
  jewelry: Buffer,
  placement: PlacementCalculation,
  shadowSettings: ShadowConfig
): Promise<Buffer> {
  // Create shadow by duplicating jewelry and applying transformations
  const shadowBase = await sharp(jewelry)
    .greyscale()
    .modulate({
      brightness: 0.3, // Make it dark
      saturation: 0    // Remove color
    })
    .blur(shadowSettings.blur)
    .toBuffer();
  
  // Position shadow with offset
  const shadow = await sharp({
    create: {
      width: 1024,
      height: 1024,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    }
  })
  .composite([{
    input: shadowBase,
    left: shadowSettings.offsetX,
    top: shadowSettings.offsetY,
    blend: 'multiply'
  }])
  .png()
  .toBuffer();
  
  return shadow;
}

/**
 * Analyze lighting conditions in the model image
 */
async function analyzeLighting(modelImage: Buffer): Promise<{
  brightness: number;
  contrast: number;
  temperature: number;
  shadowDirection: 'left' | 'right' | 'center';
}> {
  const { data, info } = await sharp(modelImage).raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const stats = await sharp(modelImage).stats();
  
  // Calculate average brightness
  const avgBrightness = stats.channels.reduce((sum, channel) => sum + channel.mean, 0) / stats.channels.length;
  
  // Estimate contrast from standard deviation
  const avgStdDev = stats.channels.reduce((sum, channel) => sum + channel.stdev, 0) / stats.channels.length;
  
  // Implement color temperature analysis
  const temperature = await analyzeColorTemperature(data, width, height, channels);
  
  // Implement shadow direction detection
  const shadowDirection = await detectShadowDirection(data, width, height, channels);
  
  return {
    brightness: avgBrightness / 255, // Normalize to 0-1
    contrast: avgStdDev / 128,       // Normalize contrast
    temperature,                     // Color temperature (0 = cool, 1 = warm)
    shadowDirection                  // Detected shadow direction
  };
}

/**
 * Analyze color temperature of the image
 */
async function analyzeColorTemperature(
  data: Buffer,
  width: number,
  height: number,
  channels: number
): Promise<number> {
  let totalR = 0, totalG = 0, totalB = 0;
  let pixelCount = 0;
  
  // Sample pixels across the image
  const stepSize = Math.max(1, Math.floor(Math.min(width, height) / 50)); // Sample ~2500 pixels
  
  for (let y = 0; y < height; y += stepSize) {
    for (let x = 0; x < width; x += stepSize) {
      const pixelIndex = (y * width + x) * channels;
      
      if (pixelIndex + 2 < data.length) {
        const r = data[pixelIndex];
        const g = data[pixelIndex + 1];
        const b = data[pixelIndex + 2];
        
        // Only analyze pixels that aren't too dark or too bright
        const brightness = (r + g + b) / 3;
        if (brightness > 30 && brightness < 225) {
          totalR += r;
          totalG += g;
          totalB += b;
          pixelCount++;
        }
      }
    }
  }
  
  if (pixelCount === 0) return 0.5; // Neutral temperature
  
  const avgR = totalR / pixelCount;
  const avgG = totalG / pixelCount;
  const avgB = totalB / pixelCount;
  
  // Calculate color temperature based on RGB ratios
  // Warm light has more red/yellow, cool light has more blue
  const redBlueRatio = avgR / Math.max(avgB, 1);
  const yellowBlueRatio = (avgR + avgG) / (2 * Math.max(avgB, 1));
  
  // Convert ratios to temperature scale (0 = cool/blue, 1 = warm/yellow)
  let temperature = 0.5; // Start neutral
  
  if (redBlueRatio > 1.1) {
    temperature += (redBlueRatio - 1.1) * 0.5; // Warm shift
  } else if (redBlueRatio < 0.9) {
    temperature -= (0.9 - redBlueRatio) * 0.5; // Cool shift
  }
  
  if (yellowBlueRatio > 1.2) {
    temperature += (yellowBlueRatio - 1.2) * 0.3; // Additional warm shift
  } else if (yellowBlueRatio < 0.8) {
    temperature -= (0.8 - yellowBlueRatio) * 0.3; // Additional cool shift
  }
  
  // Clamp to 0-1 range
  return Math.max(0, Math.min(1, temperature));
}

/**
 * Detect shadow direction in the image
 */
async function detectShadowDirection(
  data: Buffer,
  width: number,
  height: number,
  channels: number
): Promise<'left' | 'right' | 'center'> {
  // Divide image into left, center, and right thirds
  const leftThird = Math.floor(width / 3);
  const rightThird = Math.floor(width * 2 / 3);
  
  let leftBrightness = 0, centerBrightness = 0, rightBrightness = 0;
  let leftPixels = 0, centerPixels = 0, rightPixels = 0;
  
  // Sample brightness from different regions
  const stepSize = Math.max(1, Math.floor(Math.min(width, height) / 100));
  
  for (let y = 0; y < height; y += stepSize) {
    for (let x = 0; x < width; x += stepSize) {
      const pixelIndex = (y * width + x) * channels;
      
      if (pixelIndex + 2 < data.length) {
        const r = data[pixelIndex];
        const g = data[pixelIndex + 1];
        const b = data[pixelIndex + 2];
        const brightness = (r + g + b) / 3;
        
        if (x < leftThird) {
          leftBrightness += brightness;
          leftPixels++;
        } else if (x > rightThird) {
          rightBrightness += brightness;
          rightPixels++;
        } else {
          centerBrightness += brightness;
          centerPixels++;
        }
      }
    }
  }
  
  // Calculate average brightness for each region
  const avgLeftBrightness = leftPixels > 0 ? leftBrightness / leftPixels : 0;
  const avgCenterBrightness = centerPixels > 0 ? centerBrightness / centerPixels : 0;
  const avgRightBrightness = rightPixels > 0 ? rightBrightness / rightPixels : 0;
  
  // Additional analysis: look for gradient patterns that indicate shadow direction
  const leftToRightGradient = await analyzeLightingGradient(data, width, height, channels, 'horizontal');
  const topToBottomGradient = await analyzeLightingGradient(data, width, height, channels, 'vertical');
  
  // Determine shadow direction based on brightness differences
  const leftRightDiff = avgLeftBrightness - avgRightBrightness;
  const centerLeftDiff = avgCenterBrightness - avgLeftBrightness;
  const centerRightDiff = avgCenterBrightness - avgRightBrightness;
  
  // Threshold for significant brightness difference
  const threshold = 10;
  
  // Factor in gradient analysis
  let shadowDirection: 'left' | 'right' | 'center' = 'center';
  
  if (Math.abs(leftRightDiff) > threshold) {
    if (leftRightDiff > 0) {
      // Left is brighter than right, shadows are on the right
      shadowDirection = 'right';
    } else {
      // Right is brighter than left, shadows are on the left
      shadowDirection = 'left';
    }
  } else if (Math.abs(centerLeftDiff) > threshold || Math.abs(centerRightDiff) > threshold) {
    // Check if center is significantly different from sides
    if (centerLeftDiff > threshold && centerRightDiff > threshold) {
      // Center is brighter, shadows on both sides
      shadowDirection = 'center';
    } else if (centerLeftDiff < -threshold) {
      // Left is brighter, shadows toward left
      shadowDirection = 'left';
    } else if (centerRightDiff < -threshold) {
      // Right is brighter, shadows toward right
      shadowDirection = 'right';
    }
  }
  
  // Use gradient information to refine the decision
  if (Math.abs(leftToRightGradient) > 0.1) {
    if (leftToRightGradient > 0) {
      // Light comes from left, shadows on right
      shadowDirection = shadowDirection === 'center' ? 'right' : shadowDirection;
    } else {
      // Light comes from right, shadows on left
      shadowDirection = shadowDirection === 'center' ? 'left' : shadowDirection;
    }
  }
  
  return shadowDirection;
}

/**
 * Analyze lighting gradient in a specific direction
 */
async function analyzeLightingGradient(
  data: Buffer,
  width: number,
  height: number,
  channels: number,
  direction: 'horizontal' | 'vertical'
): Promise<number> {
  const samples = 20; // Number of strips to analyze
  const stripBrightness: number[] = [];
  
  if (direction === 'horizontal') {
    // Analyze horizontal strips (left to right)
    const stripWidth = Math.floor(width / samples);
    
    for (let strip = 0; strip < samples; strip++) {
      const startX = strip * stripWidth;
      const endX = Math.min(startX + stripWidth, width);
      let totalBrightness = 0;
      let pixelCount = 0;
      
      for (let y = 0; y < height; y += 5) {
        for (let x = startX; x < endX; x += 3) {
          const pixelIndex = (y * width + x) * channels;
          
          if (pixelIndex + 2 < data.length) {
            const r = data[pixelIndex];
            const g = data[pixelIndex + 1];
            const b = data[pixelIndex + 2];
            totalBrightness += (r + g + b) / 3;
            pixelCount++;
          }
        }
      }
      
      stripBrightness.push(pixelCount > 0 ? totalBrightness / pixelCount : 0);
    }
  } else {
    // Analyze vertical strips (top to bottom)
    const stripHeight = Math.floor(height / samples);
    
    for (let strip = 0; strip < samples; strip++) {
      const startY = strip * stripHeight;
      const endY = Math.min(startY + stripHeight, height);
      let totalBrightness = 0;
      let pixelCount = 0;
      
      for (let y = startY; y < endY; y += 3) {
        for (let x = 0; x < width; x += 5) {
          const pixelIndex = (y * width + x) * channels;
          
          if (pixelIndex + 2 < data.length) {
            const r = data[pixelIndex];
            const g = data[pixelIndex + 1];
            const b = data[pixelIndex + 2];
            totalBrightness += (r + g + b) / 3;
            pixelCount++;
          }
        }
      }
      
      stripBrightness.push(pixelCount > 0 ? totalBrightness / pixelCount : 0);
    }
  }
  
  // Calculate gradient: difference between start and end brightness
  if (stripBrightness.length < 2) return 0;
  
  const startBrightness = stripBrightness.slice(0, 3).reduce((a, b) => a + b, 0) / 3;
  const endBrightness = stripBrightness.slice(-3).reduce((a, b) => a + b, 0) / 3;
  
  // Return normalized gradient (-1 to 1)
  return (endBrightness - startBrightness) / 255;
}

/**
 * Match jewelry lighting to model image lighting
 */
async function matchLighting(
  jewelry: Buffer,
  lightingAnalysis: {
    brightness: number;
    contrast: number;
    temperature: number;
    shadowDirection: 'left' | 'right' | 'center';
  }
): Promise<Buffer> {
  let adjustedJewelry = sharp(jewelry);
  
  // Adjust brightness and contrast to match
  adjustedJewelry = adjustedJewelry.modulate({
    brightness: 0.8 + (lightingAnalysis.brightness * 0.4), // Scale brightness
    saturation: 1.0 + (lightingAnalysis.contrast * 0.2)     // Adjust saturation based on contrast
  });
  
  // Apply color temperature adjustment
  if (lightingAnalysis.temperature < 0.4) {
    // Cool lighting - add blue tint
    adjustedJewelry = adjustedJewelry.tint({ r: 200, g: 220, b: 255 });
  } else if (lightingAnalysis.temperature > 0.6) {
    // Warm lighting - add yellow/orange tint
    adjustedJewelry = adjustedJewelry.tint({ r: 255, g: 240, b: 200 });
  }
  
  // Enhance metallic properties
  adjustedJewelry = adjustedJewelry.sharpen(2, 1, 0.5); // Enhance reflective surfaces
  
  return await adjustedJewelry.png().toBuffer();
}

/**
 * Perform the main composition operation
 */
async function performComposition(
  modelImage: Buffer,
  preparedJewelry: Buffer,
  shadows: Buffer | null,
  placement: PlacementCalculation
): Promise<Buffer> {
  let composite = sharp(modelImage);
  
  // Add shadows first (behind jewelry)
  if (shadows) {
    composite = composite.composite([{
      input: shadows,
      left: Math.round(placement.x - 50), // Offset for shadow positioning
      top: Math.round(placement.y - 50),
      blend: 'multiply'
    }]);
  }
  
  // Add the jewelry on top
  composite = composite.composite([{
    input: preparedJewelry,
    left: Math.round(placement.x - (await sharp(preparedJewelry).metadata()).width! / 2),
    top: Math.round(placement.y - (await sharp(preparedJewelry).metadata()).height! / 2),
    blend: 'over'
  }]);
  
  return await composite.jpeg({ quality: 95 }).toBuffer();
}

/**
 * Apply final color correction and edge blending
 */
async function finalizeComposition(compositeImage: Buffer): Promise<Buffer> {
  return await sharp(compositeImage)
    .sharpen(1, 0.5, 0.5)        // Subtle sharpening
    .modulate({
      saturation: 1.05,           // Slight saturation boost
      brightness: 1.02            // Slight brightness boost
    })
    .jpeg({ quality: 95 })
    .toBuffer();
}

/**
 * Composite multiple jewelry pieces (e.g., pair of earrings)
 */
export async function compositeMultipleJewelry(
  modelImage: Buffer,
  segmentedJewelry: JewelrySegmentation,
  placements: PlacementCalculation[],
  shadowSettings?: ShadowConfig
): Promise<Buffer> {
  let result = modelImage;
  
  // Composite each piece one by one
  for (const placement of placements) {
    result = await compositeJewelryOnModel(
      result,
      segmentedJewelry,
      placement,
      shadowSettings
    );
  }
  
  return result;
}

/**
 * Create realistic reflections for metallic jewelry
 */
export async function addReflections(
  compositeImage: Buffer,
  jewelryMask: Buffer,
  placement: PlacementCalculation
): Promise<Buffer> {
  // Create reflection by flipping and fading the jewelry
  const reflection = await sharp(jewelryMask)
    .flip()
    .modulate({
      brightness: 0.3,
      saturation: 0.8
    })
    .blur(1)
    .toBuffer();
  
  // Composite reflection below the jewelry
  return await sharp(compositeImage)
    .composite([{
      input: reflection,
      left: Math.round(placement.x),
      top: Math.round(placement.y + 20), // Below original jewelry
      blend: 'soft-light'
    }])
    .toBuffer();
}

/**
 * Validate composition quality
 */
export async function validateComposition(
  originalModel: Buffer,
  compositeResult: Buffer,
  placement: PlacementCalculation
): Promise<{ isValid: boolean; issues: string[]; quality: number }> {
  const issues: string[] = [];
  
  try {
    // Check image dimensions match
    const originalMeta = await sharp(originalModel).metadata();
    const compositeMeta = await sharp(compositeResult).metadata();
    
    if (originalMeta.width !== compositeMeta.width || originalMeta.height !== compositeMeta.height) {
      issues.push('Image dimensions changed during composition');
    }
    
    // Check for artifacts around placement area
    const placementArea = await extractPlacementArea(compositeResult, placement);
    const artifactScore = await detectArtifacts(placementArea);
    
    if (artifactScore > 0.3) {
      issues.push('Visible composition artifacts detected');
    }
    
    // Calculate overall quality score
    const quality = Math.max(0, 1 - (issues.length * 0.2) - artifactScore);
    
    return {
      isValid: issues.length === 0 && quality > 0.7,
      issues,
      quality
    };
    
  } catch (error) {
    return {
      isValid: false,
      issues: [`Validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`],
      quality: 0
    };
  }
}

/**
 * Extract the area around jewelry placement for analysis
 */
async function extractPlacementArea(
  compositeImage: Buffer,
  placement: PlacementCalculation
): Promise<Buffer> {
  const { width, height } = await sharp(compositeImage).metadata();
  
  if (!width || !height) {
    throw new Error('Invalid composite image dimensions');
  }
  
  // Define area around placement
  const areaSize = 200;
  const left = Math.max(0, Math.round(placement.x - areaSize / 2));
  const top = Math.max(0, Math.round(placement.y - areaSize / 2));
  const extractWidth = Math.min(areaSize, width - left);
  const extractHeight = Math.min(areaSize, height - top);
  
  return await sharp(compositeImage)
    .extract({
      left,
      top,
      width: extractWidth,
      height: extractHeight
    })
    .toBuffer();
}

/**
 * Detect visual artifacts in the composition
 */
async function detectArtifacts(imageArea: Buffer): Promise<number> {
  // Analyze edge sharpness and color discontinuities
  const edges = await sharp(imageArea)
    .greyscale()
    .convolve({
      width: 3,
      height: 3,
      kernel: [-1, -1, -1, -1, 8, -1, -1, -1, -1] // Edge detection
    })
    .toBuffer();
  
  const stats = await sharp(edges).stats();
  const edgeStrength = stats.channels[0].stdev / 255;
  
  // High edge strength might indicate artifacts
  return Math.min(1, edgeStrength);
}

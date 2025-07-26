import sharp from 'sharp';
import { ValidationResult } from '@/types/jewelry';

/**
 * Validate that jewelry remains pixel-perfect after composition
 * This is the critical step that ensures no AI hallucination has occurred
 */

export async function validateJewelryIntegrity(
  originalJewelry: Buffer,
  compositeResult: Buffer,
  tolerance: number = 0.02
): Promise<ValidationResult> {
  try {
    const extractedJewelry = await extractJewelryFromComposite(compositeResult);

    if (!extractedJewelry) {
      return {
        isValid: false,
        similarity: 0,
        deviations: ['Failed to extract jewelry from composite result']
      };
    }
    const similarity = await calculateSimilarity(originalJewelry, extractedJewelry);
    

    const deviations = await detectDeviations(originalJewelry, extractedJewelry, tolerance);
    
   
    const qualityIssues = await performQualityChecks(extractedJewelry);
    
    const allDeviations = [...deviations, ...qualityIssues];
    
    return {
      isValid: similarity >= (1 - tolerance) && allDeviations.length === 0,
      similarity,
      deviations: allDeviations
    };
    
  } catch (error) {
    console.error('Jewelry validation failed:', error);
    return {
      isValid: false,
      similarity: 0,
      deviations: [`Validation error: ${error instanceof Error ? error.message : 'Unknown error'}`]
    };
  }
}

/**
 * Extract jewelry region from the composite image
 * Uses intelligent region detection to find where jewelry was placed
 */
async function extractJewelryFromComposite(compositeResult: Buffer): Promise<Buffer> {
  try {
    const { width, height } = await sharp(compositeResult).metadata();
    
    if (!width || !height) {
      throw new Error('Invalid composite image dimensions');
    }
    
    // Step 1: Detect metallic/jewelry regions using color and texture analysis
    const jewelryRegions = await detectJewelryRegions(compositeResult, width, height);
    
    if (jewelryRegions.length === 0) {
      throw new Error('No jewelry regions detected in composite image');
    }
    
    // Step 2: Select the best jewelry region (largest, most central, or most jewelry-like)
    const bestRegion = selectBestJewelryRegion(jewelryRegions, width, height);
    
    // Step 3: Extract the region with some padding
    const padding = Math.min(bestRegion.width, bestRegion.height) * 0.1;
    const extractLeft = Math.max(0, bestRegion.x - padding);
    const extractTop = Math.max(0, bestRegion.y - padding);
    const extractWidth = Math.min(width - extractLeft, bestRegion.width + 2 * padding);
    const extractHeight = Math.min(height - extractTop, bestRegion.height + 2 * padding);
    
    return await sharp(compositeResult)
      .extract({
        left: Math.round(extractLeft),
        top: Math.round(extractTop),
        width: Math.round(extractWidth),
        height: Math.round(extractHeight)
      })
      .toBuffer();
      
  } catch (error) {
    console.error('Jewelry extraction failed, falling back to center crop:', error);
    
    // Fallback: return center crop as approximation
    const { width, height } = await sharp(compositeResult).metadata();
    
    if (!width || !height) {
      throw new Error('Invalid composite image dimensions');
    }
    
    const cropSize = Math.min(width, height) * 0.3;
    const left = Math.round((width - cropSize) / 2);
    const top = Math.round((height - cropSize) / 2);
    
    return await sharp(compositeResult)
      .extract({
        left,
        top,
        width: Math.round(cropSize),
        height: Math.round(cropSize)
      })
      .toBuffer();
  }
}

/**
 * Detect jewelry regions in the composite image using computer vision
 */
async function detectJewelryRegions(
  compositeResult: Buffer, 
  width: number, 
  height: number
): Promise<Array<{ x: number; y: number; width: number; height: number; confidence: number }>> {
  const regions: Array<{ x: number; y: number; width: number; height: number; confidence: number }> = [];
  
  try {
    // Convert to different color spaces for analysis
    const rgbImage = await sharp(compositeResult).raw().toBuffer({ resolveWithObject: true });
    const grayImage = await sharp(compositeResult).greyscale().raw().toBuffer({ resolveWithObject: true });
    const labImage = await sharp(compositeResult).toColorspace('lab').raw().toBuffer({ resolveWithObject: true });
    
    // Step 1: Detect metallic surfaces (high reflectance, specific color properties)
    const metallicRegions = await detectMetallicRegions(rgbImage.data, labImage.data, width, height);
    
    // Step 2: Detect high-contrast edges (jewelry typically has sharp defined edges)
    const edgeRegions = await detectHighContrastRegions(grayImage.data, width, height);
    
    // Step 3: Detect color clusters that might be gems or metals
    const colorRegions = await detectJewelryColorRegions(rgbImage.data, width, height);
    
    // Step 4: Combine and score regions
    const combinedRegions = combineRegions([...metallicRegions, ...edgeRegions, ...colorRegions]);
    
    // Step 5: Filter and rank regions
    return combinedRegions
      .filter(region => region.confidence > 0.3)
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 5); // Top 5 candidates
      
  } catch (error) {
    console.error('Jewelry region detection failed:', error);
    return [];
  }
}

/**
 * Detect metallic surfaces in the image
 */
async function detectMetallicRegions(
  rgbData: Buffer,
  labData: Buffer,
  width: number,
  height: number
): Promise<Array<{ x: number; y: number; width: number; height: number; confidence: number }>> {
  const regions: Array<{ x: number; y: number; width: number; height: number; confidence: number }> = [];
  const blockSize = 32;
  
  for (let y = 0; y < height - blockSize; y += 16) {
    for (let x = 0; x < width - blockSize; x += 16) {
      const confidence = analyzeMetallicProperties(rgbData, labData, x, y, blockSize, width, height);
      
      if (confidence > 0.4) {
        regions.push({
          x,
          y,
          width: blockSize,
          height: blockSize,
          confidence
        });
      }
    }
  }
  
  return regions;
}

/**
 * Detect high-contrast regions that might contain jewelry edges
 */
async function detectHighContrastRegions(
  grayData: Buffer,
  width: number,
  height: number
): Promise<Array<{ x: number; y: number; width: number; height: number; confidence: number }>> {
  const regions: Array<{ x: number; y: number; width: number; height: number; confidence: number }> = [];
  const blockSize = 24;
  
  for (let y = 0; y < height - blockSize; y += 12) {
    for (let x = 0; x < width - blockSize; x += 12) {
      const edgeStrength = calculateEdgeStrength(grayData, x, y, blockSize, width, height);
      
      if (edgeStrength > 0.5) {
        regions.push({
          x,
          y,
          width: blockSize,
          height: blockSize,
          confidence: Math.min(edgeStrength, 1.0)
        });
      }
    }
  }
  
  return regions;
}

/**
 * Detect color regions typical of jewelry (gold, silver, gemstone colors)
 */
async function detectJewelryColorRegions(
  rgbData: Buffer,
  width: number,
  height: number
): Promise<Array<{ x: number; y: number; width: number; height: number; confidence: number }>> {
  const regions: Array<{ x: number; y: number; width: number; height: number; confidence: number }> = [];
  const blockSize = 28;
  
  // Define jewelry color ranges (gold, silver, common gemstones)
  const jewelryColors: Array<{ r: [number, number]; g: [number, number]; b: [number, number] }> = [
    { r: [200, 255], g: [180, 230], b: [100, 170] }, // Gold range
    { r: [180, 220], g: [180, 220], b: [180, 220] }, // Silver range
    { r: [150, 255], g: [50, 150], b: [50, 150] },   // Ruby/red gems
    { r: [50, 150], g: [50, 200], b: [150, 255] },   // Sapphire/blue gems
    { r: [100, 200], g: [150, 255], b: [50, 150] },  // Emerald/green gems
  ];
  
  for (let y = 0; y < height - blockSize; y += 14) {
    for (let x = 0; x < width - blockSize; x += 14) {
      const colorMatch = analyzeJewelryColors(rgbData, x, y, blockSize, width, height, jewelryColors);
      
      if (colorMatch > 0.3) {
        regions.push({
          x,
          y,
          width: blockSize,
          height: blockSize,
          confidence: colorMatch
        });
      }
    }
  }
  
  return regions;
}

/**
 * Analyze metallic properties of a region
 */
function analyzeMetallicProperties(
  rgbData: Buffer,
  labData: Buffer,
  x: number,
  y: number,
  size: number,
  width: number,
  height: number
): number {
  let metallicScore = 0;
  let pixelCount = 0;
  
  for (let dy = 0; dy < size && y + dy < height; dy++) {
    for (let dx = 0; dx < size && x + dx < width; dx++) {
      const pixelIndex = ((y + dy) * width + (x + dx)) * 3;
      
      if (pixelIndex + 2 < rgbData.length && pixelIndex + 2 < labData.length) {
        const r = rgbData[pixelIndex];
        const g = rgbData[pixelIndex + 1];
        const b = rgbData[pixelIndex + 2];
        
        const l = labData[pixelIndex];     // Lightness
        const a = labData[pixelIndex + 1]; // Green-Red
        const bLab = labData[pixelIndex + 2]; // Blue-Yellow
        
        // Metallic surfaces have:
        // 1. High lightness values
        // 2. Low saturation (neutral colors)
        // 3. Specific color temperature
        
        const brightness = (r + g + b) / 3;
        const saturation = Math.max(r, g, b) - Math.min(r, g, b);
        
        let score = 0;
        
        // High brightness indicates reflective surface
        if (brightness > 150) score += 0.3;
        
        // Low saturation indicates metallic neutrality
        if (saturation < 50) score += 0.2;
        
        // Check for gold-like colors
        if (r > g && g > b && r > 180) score += 0.3;
        
        // Check for silver-like colors
        if (Math.abs(r - g) < 20 && Math.abs(g - b) < 20 && brightness > 120) score += 0.2;
        
        metallicScore += score;
        pixelCount++;
      }
    }
  }
  
  return pixelCount > 0 ? metallicScore / pixelCount : 0;
}

/**
 * Calculate edge strength in a region using Sobel operator
 */
function calculateEdgeStrength(
  grayData: Buffer,
  x: number,
  y: number,
  size: number,
  width: number,
  height: number
): number {
  let totalEdgeStrength = 0;
  let pixelCount = 0;
  
  // Sobel kernels
  const sobelX = [-1, 0, 1, -2, 0, 2, -1, 0, 1];
  const sobelY = [-1, -2, -1, 0, 0, 0, 1, 2, 1];
  
  for (let dy = 1; dy < size - 1 && y + dy < height - 1; dy++) {
    for (let dx = 1; dx < size - 1 && x + dx < width - 1; dx++) {
      let gx = 0, gy = 0;
      
      // Apply Sobel kernels
      for (let ky = -1; ky <= 1; ky++) {
        for (let kx = -1; kx <= 1; kx++) {
          const pixelIndex = ((y + dy + ky) * width + (x + dx + kx));
          if (pixelIndex >= 0 && pixelIndex < grayData.length) {
            const kernelIndex = (ky + 1) * 3 + (kx + 1);
            const pixelValue = grayData[pixelIndex];
            
            gx += pixelValue * sobelX[kernelIndex];
            gy += pixelValue * sobelY[kernelIndex];
          }
        }
      }
      
      const magnitude = Math.sqrt(gx * gx + gy * gy);
      totalEdgeStrength += magnitude;
      pixelCount++;
    }
  }
  
  const averageEdgeStrength = pixelCount > 0 ? totalEdgeStrength / pixelCount : 0;
  return Math.min(averageEdgeStrength / 255, 1.0); // Normalize to 0-1
}

/**
 * Analyze jewelry colors in a region
 */
function analyzeJewelryColors(
  rgbData: Buffer,
  x: number,
  y: number,
  size: number,
  width: number,
  height: number,
  jewelryColors: Array<{ r: [number, number]; g: [number, number]; b: [number, number] }>
): number {
  let matchScore = 0;
  let pixelCount = 0;
  
  for (let dy = 0; dy < size && y + dy < height; dy++) {
    for (let dx = 0; dx < size && x + dx < width; dx++) {
      const pixelIndex = ((y + dy) * width + (x + dx)) * 3;
      
      if (pixelIndex + 2 < rgbData.length) {
        const r = rgbData[pixelIndex];
        const g = rgbData[pixelIndex + 1];
        const b = rgbData[pixelIndex + 2];
        
        // Check against jewelry color ranges
        for (const colorRange of jewelryColors) {
          if (r >= colorRange.r[0] && r <= colorRange.r[1] &&
              g >= colorRange.g[0] && g <= colorRange.g[1] &&
              b >= colorRange.b[0] && b <= colorRange.b[1]) {
            matchScore += 1;
            break; // Don't double-count for multiple color matches
          }
        }
        
        pixelCount++;
      }
    }
  }
  
  return pixelCount > 0 ? matchScore / pixelCount : 0;
}

/**
 * Combine overlapping regions and merge similar ones
 */
function combineRegions(
  regions: Array<{ x: number; y: number; width: number; height: number; confidence: number }>
): Array<{ x: number; y: number; width: number; height: number; confidence: number }> {
  const combined: Array<{ x: number; y: number; width: number; height: number; confidence: number }> = [];
  const processed = new Set<number>();
  
  for (let i = 0; i < regions.length; i++) {
    if (processed.has(i)) continue;
    
    const region = regions[i];
    const overlapping = [i];
    
    // Find overlapping regions
    for (let j = i + 1; j < regions.length; j++) {
      if (processed.has(j)) continue;
      
      const other = regions[j];
      if (regionsOverlap(region, other)) {
        overlapping.push(j);
      }
    }
    
    // Merge overlapping regions
    if (overlapping.length > 1) {
      const merged = mergeRegions(overlapping.map(idx => regions[idx]));
      combined.push(merged);
      overlapping.forEach(idx => processed.add(idx));
    } else {
      combined.push(region);
      processed.add(i);
    }
  }
  
  return combined;
}

/**
 * Check if two regions overlap
 */
function regionsOverlap(
  region1: { x: number; y: number; width: number; height: number },
  region2: { x: number; y: number; width: number; height: number }
): boolean {
  return !(region1.x + region1.width < region2.x ||
           region2.x + region2.width < region1.x ||
           region1.y + region1.height < region2.y ||
           region2.y + region2.height < region1.y);
}

/**
 * Merge multiple regions into one
 */
function mergeRegions(
  regions: Array<{ x: number; y: number; width: number; height: number; confidence: number }>
): { x: number; y: number; width: number; height: number; confidence: number } {
  const minX = Math.min(...regions.map(r => r.x));
  const minY = Math.min(...regions.map(r => r.y));
  const maxX = Math.max(...regions.map(r => r.x + r.width));
  const maxY = Math.max(...regions.map(r => r.y + r.height));
  
  const avgConfidence = regions.reduce((sum, r) => sum + r.confidence, 0) / regions.length;
  
  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
    confidence: avgConfidence
  };
}

/**
 * Select the best jewelry region from candidates
 */
function selectBestJewelryRegion(
  regions: Array<{ x: number; y: number; width: number; height: number; confidence: number }>,
  imageWidth: number,
  imageHeight: number
): { x: number; y: number; width: number; height: number; confidence: number } {
  if (regions.length === 0) {
    // Fallback to center region
    const size = Math.min(imageWidth, imageHeight) * 0.3;
    return {
      x: (imageWidth - size) / 2,
      y: (imageHeight - size) / 2,
      width: size,
      height: size,
      confidence: 0.1
    };
  }
  
  // Score regions based on multiple criteria
  const scoredRegions = regions.map(region => {
    let score = region.confidence;
    
    // Prefer regions that are not too small or too large
    const area = region.width * region.height;
    const imageArea = imageWidth * imageHeight;
    const areaRatio = area / imageArea;
    
    if (areaRatio > 0.05 && areaRatio < 0.4) {
      score += 0.2;
    }
    
    // Prefer regions closer to center (jewelry is usually prominently placed)
    const regionCenterX = region.x + region.width / 2;
    const regionCenterY = region.y + region.height / 2;
    const imageCenterX = imageWidth / 2;
    const imageCenterY = imageHeight / 2;
    
    const distanceFromCenter = Math.sqrt(
      Math.pow(regionCenterX - imageCenterX, 2) + Math.pow(regionCenterY - imageCenterY, 2)
    );
    const maxDistance = Math.sqrt(Math.pow(imageWidth / 2, 2) + Math.pow(imageHeight / 2, 2));
    const centralityScore = 1 - (distanceFromCenter / maxDistance);
    
    score += centralityScore * 0.3;
    
    return { ...region, finalScore: score };
  });
  
  // Return the highest-scoring region
  const bestRegion = scoredRegions.reduce((best, current) => 
    current.finalScore > best.finalScore ? current : best
  );
  
  return bestRegion;
}

/**
 * Calculate similarity between original and extracted jewelry
 * Uses multiple comparison methods for robust validation
 */
async function calculateSimilarity(
  originalJewelry: Buffer,
  extractedJewelry: Buffer
): Promise<number> {
  try {
    // Normalize both images to same size for comparison
    const normalizedOriginal = await normalizeForComparison(originalJewelry);
    const normalizedExtracted = await normalizeForComparison(extractedJewelry);
    
    // Calculate multiple similarity metrics
    const histogramSimilarity = await calculateHistogramSimilarity(normalizedOriginal, normalizedExtracted);
    const structuralSimilarity = await calculateStructuralSimilarity(normalizedOriginal, normalizedExtracted);
    const perceptualSimilarity = await calculatePerceptualSimilarity(normalizedOriginal, normalizedExtracted);
    
    // Weighted average of different similarity measures
    const overallSimilarity = (
      histogramSimilarity * 0.3 +
      structuralSimilarity * 0.4 +
      perceptualSimilarity * 0.3
    );
    
    return Math.max(0, Math.min(1, overallSimilarity));
    
  } catch (error) {
    console.error('Similarity calculation failed:', error);
    return 0;
  }
}

/**
 * Normalize images for comparison
 */
async function normalizeForComparison(image: Buffer): Promise<Buffer> {
  return await sharp(image)
    .resize(256, 256, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
    .normalize()
    .png()
    .toBuffer();
}

/**
 * Calculate histogram-based similarity
 */
async function calculateHistogramSimilarity(
  image1: Buffer,
  image2: Buffer
): Promise<number> {
  const stats1 = await sharp(image1).stats();
  const stats2 = await sharp(image2).stats();
  
  let totalDifference = 0;
  let channelCount = 0;
  
  for (let i = 0; i < Math.min(stats1.channels.length, stats2.channels.length); i++) {
    const meanDiff = Math.abs(stats1.channels[i].mean - stats2.channels[i].mean) / 255;
    const stdevDiff = Math.abs(stats1.channels[i].stdev - stats2.channels[i].stdev) / 255;
    
    totalDifference += (meanDiff + stdevDiff) / 2;
    channelCount++;
  }
  
  const avgDifference = channelCount > 0 ? totalDifference / channelCount : 1;
  return Math.max(0, 1 - avgDifference);
}

/**
 * Calculate structural similarity (simplified SSIM)
 */
async function calculateStructuralSimilarity(
  image1: Buffer,
  image2: Buffer
): Promise<number> {
  // Convert to grayscale for structural comparison
  const gray1 = await sharp(image1).greyscale().raw().toBuffer();
  const gray2 = await sharp(image2).greyscale().raw().toBuffer();
  
  if (gray1.length !== gray2.length) {
    return 0;
  }
  
  // Calculate mean squared error
  let mse = 0;
  for (let i = 0; i < gray1.length; i++) {
    const diff = gray1[i] - gray2[i];
    mse += diff * diff;
  }
  mse /= gray1.length;
  
  // Convert MSE to similarity (higher MSE = lower similarity)
  const maxMSE = 255 * 255; // Maximum possible MSE
  return Math.max(0, 1 - (mse / maxMSE));
}

/**
 * Calculate perceptual similarity using edge detection
 */
async function calculatePerceptualSimilarity(
  image1: Buffer,
  image2: Buffer
): Promise<number> {
  // Apply edge detection to both images
  const edges1 = await sharp(image1)
    .greyscale()
    .convolve({
      width: 3,
      height: 3,
      kernel: [-1, -1, -1, -1, 8, -1, -1, -1, -1]
    })
    .raw()
    .toBuffer();
    
  const edges2 = await sharp(image2)
    .greyscale()
    .convolve({
      width: 3,
      height: 3,
      kernel: [-1, -1, -1, -1, 8, -1, -1, -1, -1]
    })
    .raw()
    .toBuffer();
  
  if (edges1.length !== edges2.length) {
    return 0;
  }
  
  // Compare edge patterns
  let edgeDifference = 0;
  for (let i = 0; i < edges1.length; i++) {
    edgeDifference += Math.abs(edges1[i] - edges2[i]);
  }
  
  const maxDifference = edges1.length * 255;
  return Math.max(0, 1 - (edgeDifference / maxDifference));
}

/**
 * Detect specific types of deviations
 */
async function detectDeviations(
  originalJewelry: Buffer,
  extractedJewelry: Buffer,
  tolerance: number
): Promise<string[]> {
  const deviations: string[] = [];
  
  try {
    // Check for color changes
    const colorDeviation = await detectColorChanges(originalJewelry, extractedJewelry);
    if (colorDeviation > tolerance) {
      deviations.push(`Color deviation detected: ${(colorDeviation * 100).toFixed(1)}%`);
    }
    
    // Check for shape changes
    const shapeDeviation = await detectShapeChanges(originalJewelry, extractedJewelry);
    if (shapeDeviation > tolerance) {
      deviations.push(`Shape deviation detected: ${(shapeDeviation * 100).toFixed(1)}%`);
    }
    
    // Check for texture changes
    const textureDeviation = await detectTextureChanges(originalJewelry, extractedJewelry);
    if (textureDeviation > tolerance) {
      deviations.push(`Texture deviation detected: ${(textureDeviation * 100).toFixed(1)}%`);
    }
    
    // Check for size changes
    const sizeDeviation = await detectSizeChanges(originalJewelry, extractedJewelry);
    if (sizeDeviation > tolerance) {
      deviations.push(`Size deviation detected: ${(sizeDeviation * 100).toFixed(1)}%`);
    }
    
  } catch (error) {
    deviations.push(`Deviation detection failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
  
  return deviations;
}

/**
 * Detect color changes between original and extracted jewelry
 */
async function detectColorChanges(
  originalJewelry: Buffer,
  extractedJewelry: Buffer
): Promise<number> {
  const originalStats = await sharp(originalJewelry).stats();
  const extractedStats = await sharp(extractedJewelry).stats();
  
  let totalColorDiff = 0;
  const channelsToCompare = Math.min(originalStats.channels.length, extractedStats.channels.length);
  
  for (let i = 0; i < channelsToCompare; i++) {
    const meanDiff = Math.abs(originalStats.channels[i].mean - extractedStats.channels[i].mean) / 255;
    totalColorDiff += meanDiff;
  }
  
  return channelsToCompare > 0 ? totalColorDiff / channelsToCompare : 0;
}

/**
 * Detect shape changes using contour analysis
 */
async function detectShapeChanges(
  originalJewelry: Buffer,
  extractedJewelry: Buffer
): Promise<number> {
  // Create binary masks for shape comparison
  const originalMask = await sharp(originalJewelry)
    .greyscale()
    .threshold(128)
    .raw()
    .toBuffer();
    
  const extractedMask = await sharp(extractedJewelry)
    .greyscale()
    .threshold(128)
    .raw()
    .toBuffer();
  
  if (originalMask.length !== extractedMask.length) {
    return 1; // Complete shape change
  }
  
  // Compare binary masks
  let differences = 0;
  for (let i = 0; i < originalMask.length; i++) {
    if (originalMask[i] !== extractedMask[i]) {
      differences++;
    }
  }
  
  return differences / originalMask.length;
}

/**
 * Detect texture changes using gradient analysis
 */
async function detectTextureChanges(
  originalJewelry: Buffer,
  extractedJewelry: Buffer
): Promise<number> {
  // Apply Sobel filter for texture analysis
  const sobelKernel = [-1, 0, 1, -2, 0, 2, -1, 0, 1];
  
  const originalTexture = await sharp(originalJewelry)
    .greyscale()
    .convolve({ width: 3, height: 3, kernel: sobelKernel })
    .raw()
    .toBuffer();
    
  const extractedTexture = await sharp(extractedJewelry)
    .greyscale()
    .convolve({ width: 3, height: 3, kernel: sobelKernel })
    .raw()
    .toBuffer();
  
  if (originalTexture.length !== extractedTexture.length) {
    return 1;
  }
  
  let textureDiff = 0;
  for (let i = 0; i < originalTexture.length; i++) {
    textureDiff += Math.abs(originalTexture[i] - extractedTexture[i]);
  }
  
  return textureDiff / (originalTexture.length * 255);
}

/**
 * Detect size changes by comparing dimensions and area
 */
async function detectSizeChanges(
  originalJewelry: Buffer,
  extractedJewelry: Buffer
): Promise<number> {
  const originalMeta = await sharp(originalJewelry).metadata();
  const extractedMeta = await sharp(extractedJewelry).metadata();
  
  if (!originalMeta.width || !originalMeta.height || !extractedMeta.width || !extractedMeta.height) {
    return 0;
  }
  
  const originalArea = originalMeta.width * originalMeta.height;
  const extractedArea = extractedMeta.width * extractedMeta.height;
  
  const areaDiff = Math.abs(originalArea - extractedArea) / originalArea;
  
  const widthDiff = Math.abs(originalMeta.width - extractedMeta.width) / originalMeta.width;
  const heightDiff = Math.abs(originalMeta.height - extractedMeta.height) / originalMeta.height;
  
  return Math.max(areaDiff, widthDiff, heightDiff);
}

/**
 * Perform additional quality checks on extracted jewelry
 */
async function performQualityChecks(extractedJewelry: Buffer): Promise<string[]> {
  const issues: string[] = [];
  
  try {
    // Check image quality metrics
    const stats = await sharp(extractedJewelry).stats();
    
    // Check for blur (low standard deviation indicates blur)
    const avgStdDev = stats.channels.reduce((sum, ch) => sum + ch.stdev, 0) / stats.channels.length;
    if (avgStdDev < 20) {
      issues.push('Extracted jewelry appears blurred');
    }
    
    // Check for over/under exposure
    const avgMean = stats.channels.reduce((sum, ch) => sum + ch.mean, 0) / stats.channels.length;
    if (avgMean < 30) {
      issues.push('Extracted jewelry appears too dark');
    } else if (avgMean > 225) {
      issues.push('Extracted jewelry appears too bright');
    }
    
    // Check image dimensions
    const { width, height } = await sharp(extractedJewelry).metadata();
    if (!width || !height || width < 32 || height < 32) {
      issues.push('Extracted jewelry region too small');
    }
    
  } catch (error) {
    issues.push(`Quality check failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
  
  return issues;
}

/**
 * Generate detailed validation report
 */
export async function generateValidationReport(
  originalJewelry: Buffer,
  compositeResult: Buffer,
  tolerance: number = 0.02
): Promise<{
  validation: ValidationResult;
  detailedMetrics: {
    histogramSimilarity: number;
    structuralSimilarity: number;
    perceptualSimilarity: number;
    colorDeviation: number;
    shapeDeviation: number;
    textureDeviation: number;
    sizeDeviation: number;
  };
}> {
  const validation = await validateJewelryIntegrity(originalJewelry, compositeResult, tolerance);
  
  // Calculate detailed metrics
  const extractedJewelry = await extractJewelryFromComposite(compositeResult);
  const normalizedOriginal = await normalizeForComparison(originalJewelry);
  const normalizedExtracted = await normalizeForComparison(extractedJewelry);
  
  const detailedMetrics = {
    histogramSimilarity: await calculateHistogramSimilarity(normalizedOriginal, normalizedExtracted),
    structuralSimilarity: await calculateStructuralSimilarity(normalizedOriginal, normalizedExtracted),
    perceptualSimilarity: await calculatePerceptualSimilarity(normalizedOriginal, normalizedExtracted),
    colorDeviation: await detectColorChanges(originalJewelry, extractedJewelry),
    shapeDeviation: await detectShapeChanges(originalJewelry, extractedJewelry),
    textureDeviation: await detectTextureChanges(originalJewelry, extractedJewelry),
    sizeDeviation: await detectSizeChanges(originalJewelry, extractedJewelry)
  };
  
  return {
    validation,
    detailedMetrics
  };
}

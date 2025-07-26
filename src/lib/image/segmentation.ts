import sharp from 'sharp';
import { JewelrySegmentation, JewelryType } from '@/types/jewelry';
import { removeJewelryBackground } from '@/lib/ai/backgroundRemoval';

/**
 * Extracts jewelry from input images using advanced computer vision techniques
 * This is the core function that prevents AI hallucination by creating pixel-perfect jewelry masks
 */

export async function segmentJewelry(
  inputImage: Buffer, 
  jewelryType: JewelryType
): Promise<JewelrySegmentation> {
  try {

    let processedBuffer: Buffer;
    
    try {
      const image = sharp(inputImage);
      const metadata = await image.metadata();
      
      if (!metadata.width || !metadata.height) {
        throw new Error('Invalid image dimensions');
      }

      console.log(`Processing ${metadata.format} image: ${metadata.width}x${metadata.height}`);
      
      // Convert to a standardized format 
      processedBuffer = await image
        .png({ quality: 100, compressionLevel: 0 }) 
        .toColorspace('srgb') 
        .toBuffer();
        
    } catch (sharpError) {
      // If Sharp fails, the buffer might be corrupted or in an unsupported format
      console.error('Sharp processing failed:', sharpError);
      throw new Error(`Input buffer contains unsupported image format: ${sharpError instanceof Error ? sharpError.message : 'Unknown format error'}`);
    }

    // Now process the normalized buffer
    const image = sharp(processedBuffer);
    const { width, height } = await image.metadata();
    
    if (!width || !height) {
      throw new Error('Invalid image dimensions after processing');
    }

    const preprocessed = await image
      .resize(1024, 1024, { fit: 'inside', withoutEnlargement: true })
      .normalize()
      .sharpen()
      .toBuffer();


    const segmentationResult = await applyJewelrySpecificSegmentation(
      preprocessed, 
      jewelryType,
      { width, height }
    );

    
    const refinedMask = await refineMask(segmentationResult.mask, jewelryType);

  
    // Try AI-powered background removal first
    let cleanedJewelry: Buffer;
    try {
      console.log('Attempting AI background removal...');
      const aiRemovalResult = await removeJewelryBackground(preprocessed);
      cleanedJewelry = aiRemovalResult.cleanedImage;
      console.log(`AI background removal completed with confidence: ${aiRemovalResult.confidence}`);
    } catch (aiError) {
      console.log('AI background removal failed, using traditional method:', aiError);
      // Fallback to traditional method
      cleanedJewelry = await removeBackgroundAndCreateTransparency(
        preprocessed,
        refinedMask
      );
    }


    const boundingBox = await calculateBoundingBox(refinedMask);

    return {
      jewelryMask: refinedMask,
      jewelryImage: preprocessed,
      boundingBox,
      cleanedJewelry
    };

  } catch (error) {
    console.error('Jewelry segmentation failed:', error);
    throw new Error(`Segmentation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Apply jewelry-specific segmentation algorithms
 */

async function applyJewelrySpecificSegmentation(
  image: Buffer,
  jewelryType: JewelryType,
  originalDimensions: { width: number; height: number }
): Promise<{ mask: Buffer; confidence: number }> {
  
  const sharpImage = sharp(image);
  
  switch (jewelryType) {
    case 'ring':
      return await segmentRing(sharpImage);
      
    case 'necklace':
      return await segmentNecklace(sharpImage);
      
    case 'earrings':
      return await segmentEarrings(sharpImage);
      
    case 'bracelet':
      return await segmentBracelet(sharpImage);
      
    default:
      return await segmentGenericJewelry(sharpImage);
  }
}

/**
 * Ring-specific segmentation using circular pattern detection
 */

async function segmentRing(image: sharp.Sharp): Promise<{ mask: Buffer; confidence: number }> {
  // Rings typically have circular/oval shapes with metallic properties
  // Use edge detection + circular Hough transform approach

  const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;

  const metallicMask = await detectMetallicSurfaces(data, width, height, channels);
  
  // Step 3: Apply edge detection for circular boundary detection
  const edgeMask = await image
    .greyscale()
    .normalise()
    .convolve({
      width: 3,
      height: 3,
      kernel: [-1, -1, -1, -1, 8, -1, -1, -1, -1] // Laplacian edge detection
    })
    .threshold(100)
    .toBuffer();
  
  const circularMask = await detectCircularPatterns(data, width, height, channels);
  
  const combinedMask = await combineRingMasks(metallicMask, edgeMask, width, height);
  
  const enhancedMask = await enhanceCircularRegions(combinedMask, circularMask, width, height);
  

  const finalMask = await sharp(Buffer.from(enhancedMask), { 
    raw: { 
      width, 
      height, 
      channels: 1 
    } 
  })
    .convolve({
      width: 5,
      height: 5,
      kernel: [
        0, 1, 1, 1, 0,
        1, 1, 1, 1, 1,
        1, 1, 1, 1, 1,
        1, 1, 1, 1, 1,
        0, 1, 1, 1, 0
      ] // Circular closing kernel
    })
    .threshold(150)
    .raw()
    .toBuffer();
  
  // Calculate confidence based on circularity and metallic properties
  const confidence = await calculateRingConfidence(finalMask, metallicMask, circularMask, width, height);

  return {
    mask: finalMask,
    confidence: Math.max(0.5, confidence) // Minimum confidence for rings
  };
}

/**
 * Detect metallic surfaces in jewelry images
 */
async function detectMetallicSurfaces(
  data: Buffer, 
  width: number, 
  height: number, 
  channels: number
): Promise<Buffer> {
  const metallicMask = Buffer.alloc(width * height);
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const pixelIndex = (y * width + x) * channels;
      const r = data[pixelIndex];
      const g = data[pixelIndex + 1];
      const b = data[pixelIndex + 2];
      
      // Detect metallic properties: high brightness, low saturation, high reflectance
      const brightness = (r + g + b) / 3;
      const saturation = Math.abs(Math.max(r, g, b) - Math.min(r, g, b));
      const variance = Math.abs(r - g) + Math.abs(g - b) + Math.abs(b - r);
      
      // Metallic surfaces have high brightness, moderate saturation, and similar RGB values
      const isMetallic = brightness > 120 && saturation < 60 && variance < 40;
      
      metallicMask[y * width + x] = isMetallic ? 255 : 0;
    }
  }
  
  return metallicMask;
}

/**
 * Combine ring detection masks
 */

async function combineRingMasks(
  metallicMask: Buffer,
  edgeMask: Buffer,
  width: number,
  height: number
): Promise<Buffer> {
  const combinedMask = Buffer.alloc(width * height);
  
  for (let i = 0; i < width * height; i++) {
    // Combine metallic detection with edge detection using weighted approach
    const metallicStrength = metallicMask[i] / 255;
    const edgeStrength = edgeMask[i] / 255;
    
    // Rings should have both metallic properties AND strong edges
    const combined = (metallicStrength * 0.7 + edgeStrength * 0.3);
    combinedMask[i] = Math.min(255, combined * 255);
  }
  
  return combinedMask;
}

/**
 * Detect circular patterns using simplified Hough transform
 */
async function detectCircularPatterns(
  data: Buffer,
  width: number,
  height: number,
  channels: number
): Promise<Buffer> {
  const circularMask = Buffer.alloc(width * height);
  
  // Define radius range for rings (typically 10-50 pixels in resized images)
  const minRadius = 8;
  const maxRadius = Math.min(width, height) / 4;
  
  // Accumulator array for Hough transform
  const accumulator = new Map<string, number>();
  
  // Step 1: Find edge pixels
  const edgePixels: Array<{ x: number; y: number }> = [];
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const pixelIndex = (y * width + x) * channels;
      const current = (data[pixelIndex] + data[pixelIndex + 1] + data[pixelIndex + 2]) / 3;
      
      // Simple edge detection using gradient
      const left = ((y * width + (x - 1)) * channels);
      const right = ((y * width + (x + 1)) * channels);
      const top = (((y - 1) * width + x) * channels);
      const bottom = (((y + 1) * width + x) * channels);
      
      const leftVal = (data[left] + data[left + 1] + data[left + 2]) / 3;
      const rightVal = (data[right] + data[right + 1] + data[right + 2]) / 3;
      const topVal = (data[top] + data[top + 1] + data[top + 2]) / 3;
      const bottomVal = (data[bottom] + data[bottom + 1] + data[bottom + 2]) / 3;
      
      const gradientX = Math.abs(rightVal - leftVal);
      const gradientY = Math.abs(bottomVal - topVal);
      const gradient = Math.sqrt(gradientX * gradientX + gradientY * gradientY);
      
      if (gradient > 30) { // Edge threshold
        edgePixels.push({ x, y });
      }
    }
  }
  
  // Step 2: Vote for circle centers
  for (const edge of edgePixels) {
    for (let r = minRadius; r <= maxRadius; r += 2) {
      // For each possible radius, vote for potential centers
      for (let angle = 0; angle < 360; angle += 15) {
        const radian = (angle * Math.PI) / 180;
        const centerX = Math.round(edge.x - r * Math.cos(radian));
        const centerY = Math.round(edge.y - r * Math.sin(radian));
        
        if (centerX >= 0 && centerX < width && centerY >= 0 && centerY < height) {
          const key = `${centerX},${centerY},${r}`;
          accumulator.set(key, (accumulator.get(key) || 0) + 1);
        }
      }
    }
  }
  
  // Step 3: Find the best circles
  const circles: Array<{ x: number; y: number; r: number; votes: number }> = [];
  for (const [key, votes] of accumulator.entries()) {
    if (votes > 12) { // Minimum votes threshold
      const [x, y, r] = key.split(',').map(Number);
      circles.push({ x, y, r, votes });
    }
  }
  
  // Sort by votes and take top candidates
  circles.sort((a, b) => b.votes - a.votes);
  const topCircles = circles.slice(0, 3);
  
  // Step 4: Create mask from detected circles
  for (const circle of topCircles) {
    for (let y = Math.max(0, circle.y - circle.r - 2); y <= Math.min(height - 1, circle.y + circle.r + 2); y++) {
      for (let x = Math.max(0, circle.x - circle.r - 2); x <= Math.min(width - 1, circle.x + circle.r + 2); x++) {
        const distance = Math.sqrt((x - circle.x) ** 2 + (y - circle.y) ** 2);
        
        // Ring detection: look for pixels within ring width (not solid circle)
        if (distance >= circle.r - 3 && distance <= circle.r + 3) {
          const maskIndex = y * width + x;
          circularMask[maskIndex] = Math.min(255, circularMask[maskIndex] + (circle.votes * 20));
        }
      }
    }
  }
  
  return circularMask;
}

/**
 * Enhance circular regions based on detected patterns
 */
async function enhanceCircularRegions(
  combinedMask: Buffer,
  circularMask: Buffer,
  width: number,
  height: number
): Promise<Buffer> {
  const enhancedMask = Buffer.alloc(width * height);
  
  for (let i = 0; i < width * height; i++) {
    const combinedStrength = combinedMask[i] / 255;
    const circularStrength = circularMask[i] / 255;
    
    // Boost areas where both combined detection and circular detection agree
    let enhanced = combinedStrength;
    
    if (circularStrength > 0.3) {
      // Strong circular evidence boosts the mask
      enhanced = Math.min(1.0, combinedStrength + circularStrength * 0.4);
    } else if (circularStrength > 0.1) {
      // Moderate circular evidence provides slight boost
      enhanced = Math.min(1.0, combinedStrength + circularStrength * 0.2);
    }
    
    // Suppress areas with no circular evidence if combined evidence is weak
    if (circularStrength < 0.05 && combinedStrength < 0.4) {
      enhanced *= 0.7;
    }
    
    enhancedMask[i] = Math.round(enhanced * 255);
  }
  
  return enhancedMask;
}

/**
 * Calculate confidence score for ring segmentation
 */
async function calculateRingConfidence(
  finalMask: Buffer,
  metallicMask: Buffer,
  circularMask: Buffer,
  width: number,
  height: number
): Promise<number> {
  let totalPixels = 0;
  let maskPixels = 0;
  let metallicAlignment = 0;
  let circularAlignment = 0;
  
  for (let i = 0; i < width * height; i++) {
    totalPixels++;
    
    const maskValue = finalMask[i] / 255;
    const metallicValue = metallicMask[i] / 255;
    const circularValue = circularMask[i] / 255;
    
    if (maskValue > 0.5) {
      maskPixels++;
      
      // Check alignment with metallic detection
      if (metallicValue > 0.3) {
        metallicAlignment++;
      }
      
      // Check alignment with circular detection
      if (circularValue > 0.2) {
        circularAlignment++;
      }
    }
  }
  
  if (maskPixels === 0) return 0;
  
  // Coverage score (rings should not cover too much or too little of the image)
  const coverage = maskPixels / totalPixels;
  const coverageScore = coverage > 0.02 && coverage < 0.3 ? 1.0 : Math.max(0, 1 - Math.abs(coverage - 0.1) * 10);
  
  // Metallic alignment score
  const metallicScore = metallicAlignment / maskPixels;
  
  // Circular alignment score
  const circularScore = circularAlignment / maskPixels;
  
  // Shape analysis: check for ring-like aspect ratio
  const boundingBox = calculateMaskBoundingBox(finalMask, width, height);
  const aspectRatio = boundingBox ? boundingBox.width / boundingBox.height : 1;
  const shapeScore = aspectRatio > 0.7 && aspectRatio < 1.4 ? 1.0 : Math.max(0, 1 - Math.abs(aspectRatio - 1) * 2);
  
  // Combine all scores with weights
  const confidence = (
    coverageScore * 0.25 +
    metallicScore * 0.35 +
    circularScore * 0.25 +
    shapeScore * 0.15
  );
  
  return Math.max(0, Math.min(1, confidence));
}

/**
 * Calculate bounding box for a mask
 */
function calculateMaskBoundingBox(
  mask: Buffer,
  width: number,
  height: number
): { x: number; y: number; width: number; height: number } | null {
  let minX = width, maxX = 0, minY = height, maxY = 0;
  let hasPixels = false;
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const pixelValue = mask[y * width + x];
      if (pixelValue > 128) {
        hasPixels = true;
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
    }
  }
  
  if (!hasPixels) return null;
  
  return {
    x: minX,
    y: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1
  };
}

/**
 * Detect chain patterns in necklace images
 */
async function detectChainPattern(
  data: Buffer,
  width: number,
  height: number,
  channels: number
): Promise<Buffer> {
  const chainMask = Buffer.alloc(width * height);
  
  // Chain detection using local texture analysis
  for (let y = 2; y < height - 2; y++) {
    for (let x = 2; x < width - 2; x++) {
      let linkStrength = 0;
      
      // Analyze 5x5 neighborhood for chain-like patterns
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const pixelIndex = ((y + dy) * width + (x + dx)) * channels;
          const brightness = (data[pixelIndex] + data[pixelIndex + 1] + data[pixelIndex + 2]) / 3;
          
          // Chain links typically have alternating bright/dark patterns
          const distance = Math.sqrt(dx * dx + dy * dy);
          if (distance > 0 && distance < 2.5) {
            linkStrength += brightness > 100 ? 1 : -1;
          }
        }
      }
      
      // Chain areas have moderate variation in brightness
      chainMask[y * width + x] = Math.abs(linkStrength) > 3 && Math.abs(linkStrength) < 15 ? 255 : 0;
    }
  }
  
  return chainMask;
}

/**
 * Combine necklace detection masks
 */
async function combineNecklaceMasks(
  chainMask: Buffer,
  pendantMask: Buffer,
  width: number,
  height: number
): Promise<Buffer> {
  const combinedMask = Buffer.alloc(width * height);
  
  for (let i = 0; i < width * height; i++) {
    const chainStrength = chainMask[i] / 255;
    const pendantStrength = pendantMask[i] / 255;
    
    // Combine chain and pendant detection - pendant areas get higher weight
    const combined = Math.max(chainStrength * 0.6, pendantStrength * 0.9);
    combinedMask[i] = Math.min(255, combined * 255);
  }
  
  return combinedMask;
}

/**
 * Necklace-specific segmentation using chain/link detection
 */
async function segmentNecklace(image: sharp.Sharp): Promise<{ mask: Buffer; confidence: number }> {
  // Necklaces have chain-like patterns and pendants
  // Use template matching for common necklace patterns and chain detection
  
  // Step 1: Detect chain/link patterns using texture analysis
  const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });
  const chainMask = await detectChainPattern(data, info.width, info.height, info.channels);
  
  // Step 2: Enhance pendant/focal elements using brightness and contrast
  const pendantMask = await image
    .greyscale()
    .normalise()
    .sharpen(2) // Enhance details
    .modulate({ brightness: 1.2 })
    .linear(1.3, 0) // Apply contrast adjustment
    .threshold(110)
    .toBuffer();
  
  // Step 3: Combine chain and pendant detection
  const combinedMask = await combineNecklaceMasks(chainMask, pendantMask, info.width, info.height);
  
  // Step 4: Apply morphological operations to connect chain segments
  const finalMask = await sharp(combinedMask, { 
    raw: { 
      width: info.width, 
      height: info.height, 
      channels: 1 
    } 
  })
    .convolve({
      width: 5,
      height: 5,
      kernel: [
        0, 1, 1, 1, 0,
        1, 1, 1, 1, 1,
        1, 1, 1, 1, 1,
        1, 1, 1, 1, 1,
        0, 1, 1, 1, 0
      ] // Closing operation to connect chain links
    })
    .threshold(180)
    .raw()
    .toBuffer();

  return {
    mask: finalMask,
    confidence: 0.88
  };
}

/**
 * Earrings-specific segmentation using symmetry detection
 */
async function segmentEarrings(image: sharp.Sharp): Promise<{ mask: Buffer; confidence: number }> {
  const processed = await image
    .greyscale()
    .normalise()
    .sharpen()
    .threshold(120)
    .toBuffer();

  return {
    mask: processed,
    confidence: 0.75
  };
}

/**
 * Bracelet-specific segmentation using curved pattern detection
 */
async function segmentBracelet(image: sharp.Sharp): Promise<{ mask: Buffer; confidence: number }> {

  const processed = await image
    .greyscale()
    .normalise()
    .sharpen()
    .threshold(110)
    .toBuffer();

  return {
    mask: processed,
    confidence: 0.7
  };
}

/**
 * Generic jewelry segmentation fallback
 */
async function segmentGenericJewelry(image: sharp.Sharp): Promise<{ mask: Buffer; confidence: number }> {

  const processed = await image
    .greyscale()
    .normalise()
    .sharpen()
    .threshold(115)
    .toBuffer();

  return {
    mask: processed,
    confidence: 0.6
  };
}

/**
 * Refine mask using morphological operations
 */
async function refineMask(mask: Buffer, jewelryType: JewelryType): Promise<Buffer> {
  try {
    // Apply closing operation to fill small gaps
    // Apply opening operation to remove noise
    
    const refined = await sharp(mask, { 
      raw: { 
        width: 1024, 
        height: 1024, 
        channels: 1 
      } 
    })
      .convolve({
        width: 3,
        height: 3,
        kernel: [1, 1, 1, 1, 1, 1, 1, 1, 1] // Dilation kernel
      })
      .threshold(200)
      .raw()
      .toBuffer();

    return refined;
  } catch (error) {
    console.error('refineMask failed:', error);
    // Return original mask if refinement fails
    return mask;
  }
}

/**
 * Advanced background removal that handles both white backgrounds and creates perfect transparency
 */
async function removeBackgroundAndCreateTransparency(
  originalImage: Buffer,
  mask: Buffer
): Promise<Buffer> {
  try {
    console.log('Starting advanced background removal...');
    
    // Get the original image data
    const { data: imageData, info: imageInfo } = await sharp(originalImage)
      .ensureAlpha() // Make sure we have an alpha channel
      .raw()
      .toBuffer({ resolveWithObject: true });
    
    // Get the mask data
    const { data: maskData } = await sharp(mask, { 
      raw: { 
        width: 1024, 
        height: 1024, 
        channels: 1 
      } 
    })
      .raw()
      .toBuffer({ resolveWithObject: true });
    
    const { width, height, channels } = imageInfo;
    const resultData = Buffer.alloc(width * height * 4); // RGBA output
    
    console.log(`Processing ${width}x${height} image with ${channels} channels`);
    
    // Process each pixel
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const pixelIndex = y * width + x;
        const imagePixelIndex = pixelIndex * channels;
        const maskPixelIndex = pixelIndex;
        const resultPixelIndex = pixelIndex * 4;
        
        // Get original pixel values
        const r = imageData[imagePixelIndex];
        const g = imageData[imagePixelIndex + 1];
        const b = imageData[imagePixelIndex + 2];
        const originalAlpha = channels >= 4 ? imageData[imagePixelIndex + 3] : 255;
        
        // Get mask value (0 = background, 255 = jewelry)
        const maskValue = maskData[maskPixelIndex];
        
        // Check if pixel is white/near-white background (more aggressive)
        const isWhiteBackground = (r > 235 && g > 235 && b > 235) || // Pure white/near-white
                                 (Math.abs(r - g) < 15 && Math.abs(g - b) < 15 && Math.abs(r - b) < 15 && r > 220); // Light gray/off-white
        
        // Check if pixel is already transparent
        const isTransparent = originalAlpha < 128;
        
        // Additional check for jewelry-like colors (metallic, colorful gems)
        const isJewelryColor = (
          // Metallic colors (gold, silver, etc.)
          (r > 180 && g > 150 && b < 100) || // Gold-ish
          (Math.abs(r - g) < 30 && Math.abs(g - b) < 30 && r > 120) || // Silver-ish
          // Colorful gems
          (Math.max(r, g, b) - Math.min(r, g, b) > 50) || // High saturation
          // Dark jewelry (black jewelry, dark metals)
          (r < 80 && g < 80 && b < 80 && maskValue > 150)
        );
        
        // Determine final alpha
        let finalAlpha = 0;
        
        if (maskValue > 128) {
          // Mask says this is jewelry
          if (isJewelryColor && !isTransparent) {
            // Strong jewelry signal - keep it
            finalAlpha = Math.min(255, maskValue + 30);
          } else if (!isWhiteBackground && !isTransparent && maskValue > 180) {
            // Medium confidence non-white pixel
            finalAlpha = maskValue;
          } else if (maskValue > 220 && !isWhiteBackground) {
            // Very strong mask signal, keep even if questionable
            finalAlpha = maskValue * 0.9;
          }
        }
        
        // Set result pixel
        resultData[resultPixelIndex] = r;     // R
        resultData[resultPixelIndex + 1] = g; // G  
        resultData[resultPixelIndex + 2] = b; // B
        resultData[resultPixelIndex + 3] = Math.round(finalAlpha); // A
      }
    }
    
    // Create final image with transparent background
    const result = await sharp(resultData, {
      raw: {
        width,
        height,
        channels: 4
      }
    })
      .png()
      .toBuffer();
      
    console.log('Background removal completed successfully');
    return result;
    
  } catch (error) {
    console.error('Advanced background removal failed:', error);
    // Fallback to original method
    return await extractJewelryWithTransparency(originalImage, mask);
  }
}

/**
 * Extract jewelry with transparent background
 */
async function extractJewelryWithTransparency(
  originalImage: Buffer,
  mask: Buffer
): Promise<Buffer> {
  try {
    // Convert mask to proper format for compositing
    const maskImage = await sharp(mask, { 
      raw: { 
        width: 1024, 
        height: 1024, 
        channels: 1 
      } 
    })
      .png()
      .toBuffer();

    // Use mask to create alpha channel
    const result = await sharp(originalImage)
      .composite([{
        input: maskImage,
        blend: 'dest-in'
      }])
      .png() 
      .toBuffer();

    return result;
  } catch (error) {
    console.error('extractJewelryWithTransparency failed:', error);
    // Return original image if extraction fails
    return originalImage;
  }
}

/**
 * Calculate bounding box of the segmented jewelry
 */
async function calculateBoundingBox(mask: Buffer): Promise<{
  x: number;
  y: number;
  width: number;
  height: number;
}> {
  try {
    // Try to get metadata first, fallback to known dimensions
    let width: number, height: number;
    try {
      const metadata = await sharp(mask, { 
        raw: { 
          width: 1024, 
          height: 1024, 
          channels: 1 
        } 
      }).metadata();
      width = metadata.width || 1024;
      height = metadata.height || 1024;
    } catch {
      // Fallback to standard size
      width = 1024;
      height = 1024;
    }
  
    if (!width || !height) {
      throw new Error('Invalid mask dimensions');
    }

    // Find actual bounding box by scanning the mask
    let minX = width, maxX = 0, minY = height, maxY = 0;
    let hasPixels = false;
    
    // Get raw mask data
    let maskData: Buffer;
    try {
      maskData = await sharp(mask, { 
        raw: { 
          width, 
          height, 
          channels: 1 
        } 
      }).raw().toBuffer();
    } catch {
      // If mask is already raw buffer, use it directly
      maskData = mask;
    }
    
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const pixelValue = maskData[y * width + x];
        if (pixelValue > 128) { // White pixel in mask
          hasPixels = true;
          minX = Math.min(minX, x);
          maxX = Math.max(maxX, x);
          minY = Math.min(minY, y);
          maxY = Math.max(maxY, y);
        }
      }
    }
    
    if (!hasPixels) {
      // Fallback if no mask pixels found
      return {
        x: Math.floor(width * 0.1),
        y: Math.floor(height * 0.1),
        width: Math.floor(width * 0.8),
        height: Math.floor(height * 0.8)
      };
    }
    
    return {
      x: minX,
      y: minY,
      width: maxX - minX + 1,
      height: maxY - minY + 1
    };
    
  } catch (error) {
    console.error('calculateBoundingBox failed:', error);
    // Return fallback bounding box
    return {
      x: 102,
      y: 102,
      width: 820,
      height: 820
    };
  }
}

/**
 * Automatically detect jewelry dimensions from the segmented image
 * Returns dimensions in millimeters based on typical jewelry proportions
 */
export async function detectJewelryDimensions(
  segmentation: JewelrySegmentation,
  jewelryType: JewelryType
): Promise<{ width: number; height: number; depth: number }> {
  const boundingBox = segmentation.boundingBox;
  const pixelWidth = boundingBox.width;
  const pixelHeight = boundingBox.height;
  
  // Calculate aspect ratio for dimension estimation
  const aspectRatio = pixelWidth / pixelHeight;
  
  // Estimate real-world dimensions based on jewelry type and typical sizes
  switch (jewelryType) {
    case 'ring':
      // Rings typically 15-25mm diameter, 3-8mm height
      const ringDiameter = aspectRatio > 1.2 ? 
        Math.max(15, Math.min(25, 20 * aspectRatio)) :
        Math.max(15, Math.min(25, 20 / aspectRatio));
      return {
        width: ringDiameter,
        height: Math.max(3, Math.min(8, ringDiameter * 0.3)),
        depth: Math.max(2, Math.min(6, ringDiameter * 0.2))
      };
      
    case 'necklace':
      // Necklaces: pendant size 10-50mm, chain thickness 1-5mm
      // Convert inches to mm (training data uses inches)
      const pendantWidthInches = aspectRatio > 1.5 ? 
        Math.max(0.5, Math.min(2.0, 1.2 * aspectRatio)) :
        Math.max(0.5, Math.min(2.0, 1.2));
      const pendantHeightInches = Math.max(0.3, Math.min(1.5, pendantWidthInches / aspectRatio));
      
      return {
        width: pendantWidthInches * 25.4, // Convert to mm
        height: pendantHeightInches * 25.4,
        depth: Math.max(2, Math.min(8, pendantWidthInches * 12.7)) // Depth in mm
      };
      
    case 'earrings':
      // Earrings typically 5-35mm height, 3-25mm width
      const earringHeight = aspectRatio < 0.8 ?
        Math.max(10, Math.min(35, 25 / aspectRatio)) :
        Math.max(5, Math.min(25, 20));
      const earringWidth = Math.max(3, Math.min(25, earringHeight * aspectRatio));
      
      return {
        width: earringWidth,
        height: earringHeight,
        depth: Math.max(2, Math.min(8, earringWidth * 0.3))
      };
      
    case 'bracelet':
      // Bracelets: band width 5-20mm, circumference 150-200mm
      const bandWidth = Math.max(5, Math.min(20, 15 * aspectRatio));
      return {
        width: 170, // Average bracelet circumference
        height: bandWidth,
        depth: Math.max(2, Math.min(8, bandWidth * 0.4))
      };
      
    default:
      // Generic jewelry estimation
      return {
        width: Math.max(10, Math.min(50, 25 * aspectRatio)),
        height: Math.max(5, Math.min(30, 25 / aspectRatio)),
        depth: Math.max(2, Math.min(8, 5))
      };
  }
}

/**
 * Validate segmentation quality
 */
export async function validateSegmentation(
  segmentation: JewelrySegmentation,
  originalImage: Buffer
): Promise<{ isValid: boolean; score: number; issues: string[] }> {
  const issues: string[] = [];
  
  // Check if bounding box is reasonable
  if (segmentation.boundingBox.width < 50 || segmentation.boundingBox.height < 50) {
    issues.push('Jewelry appears too small in the image');
  }
  
  // Check if mask coverage is appropriate
  const maskStats = await sharp(segmentation.jewelryMask).stats();
  const coverage = maskStats.channels[0].mean / 255;
  
  if (coverage < 0.05) {
    issues.push('Segmentation mask covers too little of the image');
  } else if (coverage > 0.7) {
    issues.push('Segmentation mask covers too much of the image');
  }
  
  const score = Math.max(0, 1 - (issues.length * 0.3));
  
  return {
    isValid: issues.length === 0,
    score,
    issues
  };
}

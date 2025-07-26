import sharp from 'sharp';

/**
 * Remove background from jewelry images using traditional computer vision
 * This approach works well for jewelry with transparent/white backgrounds
 */
export async function removeBackground(imageBuffer: Buffer): Promise<Buffer> {
  try {
    const image = sharp(imageBuffer);
    const { width, height } = await image.metadata();
    
    if (!width || !height) {
      throw new Error('Invalid image dimensions');
    }

    // Get raw pixel data
    const { data, info } = await image
      .raw()
      .toBuffer({ resolveWithObject: true });

    const channels = info.channels;
    const processedData = Buffer.alloc(data.length);

    // Process each pixel
    for (let i = 0; i < data.length; i += channels) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const a = channels === 4 ? data[i + 3] : 255;

      // Check if pixel should be transparent
      const shouldBeTransparent = isBackgroundPixel(r, g, b, a);

      if (shouldBeTransparent) {
        // Make pixel transparent
        processedData[i] = r;     // R
        processedData[i + 1] = g; // G
        processedData[i + 2] = b; // B
        processedData[i + 3] = 0; // A (transparent)
      } else {
        // Keep original pixel
        processedData[i] = r;     // R
        processedData[i + 1] = g; // G
        processedData[i + 2] = b; // B
        processedData[i + 3] = a; // A (original alpha)
      }
    }

    // Create image with transparent background
    const result = await sharp(processedData, {
      raw: {
        width,
        height,
        channels: 4
      }
    })
    .png()
    .toBuffer();

    return result;

  } catch (error) {
    console.error('Background removal failed:', error);
    throw new Error(`Background removal failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Determine if a pixel should be considered background
 */
function isBackgroundPixel(r: number, g: number, b: number, a: number): boolean {
  // If already transparent, keep it transparent
  if (a < 128) {
    return true;
  }

  // White/light background detection
  const brightness = (r + g + b) / 3;
  const isWhitish = brightness > 240 && Math.abs(r - g) < 10 && Math.abs(g - b) < 10 && Math.abs(r - b) < 10;
  
  if (isWhitish) {
    return true;
  }

  // Very light gray detection
  const isLightGray = brightness > 230 && Math.abs(r - g) < 15 && Math.abs(g - b) < 15 && Math.abs(r - b) < 15;
  
  if (isLightGray) {
    return true;
  }

  return false;
}

/**
 * Enhanced background removal with edge detection
 */
export async function removeBackgroundAdvanced(imageBuffer: Buffer): Promise<Buffer> {
  try {
    const image = sharp(imageBuffer);
    const { width, height } = await image.metadata();
    
    if (!width || !height) {
      throw new Error('Invalid image dimensions');
    }

    // Get raw pixel data
    const { data, info } = await image
      .raw()
      .toBuffer({ resolveWithObject: true });

    const channels = info.channels;
    const processedData = Buffer.alloc(width * height * 4); // Always RGBA output

    // Create edge map for better jewelry detection
    const edgeMap = createEdgeMap(data, width, height, channels);
    
    // Process each pixel with edge information
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const pixelIndex = (y * width + x) * channels;
        const outputIndex = (y * width + x) * 4;
        
        const r = data[pixelIndex];
        const g = data[pixelIndex + 1];
        const b = data[pixelIndex + 2];
        const a = channels === 4 ? data[pixelIndex + 3] : 255;
        
        const edgeStrength = edgeMap[y * width + x];
        
        // Enhanced background detection using edge information
        const shouldBeTransparent = isBackgroundPixelAdvanced(r, g, b, a, edgeStrength, x, y, width, height);

        if (shouldBeTransparent) {
          // Make pixel transparent
          processedData[outputIndex] = r;     // R
          processedData[outputIndex + 1] = g; // G
          processedData[outputIndex + 2] = b; // B
          processedData[outputIndex + 3] = 0; // A (transparent)
        } else {
          // Keep original pixel
          processedData[outputIndex] = r;     // R
          processedData[outputIndex + 1] = g; // G
          processedData[outputIndex + 2] = b; // B
          processedData[outputIndex + 3] = a; // A (original alpha)
        }
      }
    }

    // Create image with transparent background
    const result = await sharp(processedData, {
      raw: {
        width,
        height,
        channels: 4
      }
    })
    .png()
    .toBuffer();

    return result;

  } catch (error) {
    console.error('Advanced background removal failed:', error);
    throw new Error(`Advanced background removal failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Create edge map for jewelry detection
 */
function createEdgeMap(data: Buffer, width: number, height: number, channels: number): Float32Array {
  const edgeMap = new Float32Array(width * height);
  
  // Sobel edge detection
  const sobelX = [-1, 0, 1, -2, 0, 2, -1, 0, 1];
  const sobelY = [-1, -2, -1, 0, 0, 0, 1, 2, 1];
  
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      let gx = 0, gy = 0;
      
      // Apply Sobel operators
      for (let ky = -1; ky <= 1; ky++) {
        for (let kx = -1; kx <= 1; kx++) {
          const pixelIndex = ((y + ky) * width + (x + kx)) * channels;
          const brightness = (data[pixelIndex] + data[pixelIndex + 1] + data[pixelIndex + 2]) / 3;
          
          const kernelIndex = (ky + 1) * 3 + (kx + 1);
          gx += brightness * sobelX[kernelIndex];
          gy += brightness * sobelY[kernelIndex];
        }
      }
      
      const magnitude = Math.sqrt(gx * gx + gy * gy);
      edgeMap[y * width + x] = magnitude;
    }
  }
  
  return edgeMap;
}

/**
 * Advanced background pixel detection with edge information
 */
function isBackgroundPixelAdvanced(
  r: number, 
  g: number, 
  b: number, 
  a: number, 
  edgeStrength: number,
  x: number,
  y: number,
  width: number,
  height: number
): boolean {
  // If already transparent, keep it transparent
  if (a < 128) {
    return true;
  }

  // Strong edges are likely jewelry, so don't make them transparent
  if (edgeStrength > 50) {
    return false;
  }

  // White/light background detection (more aggressive near edges)
  const brightness = (r + g + b) / 3;
  const colorVariance = Math.abs(r - g) + Math.abs(g - b) + Math.abs(r - b);
  
  // Very white pixels
  if (brightness > 245 && colorVariance < 15) {
    return true;
  }
  
  // Light background pixels
  if (brightness > 235 && colorVariance < 20) {
    return true;
  }
  
  // Near image borders, be more aggressive with light pixels
  const nearBorder = x < 10 || y < 10 || x > width - 10 || y > height - 10;
  if (nearBorder && brightness > 220 && colorVariance < 30) {
    return true;
  }

  return false;
}

/**
 * Simple background removal for jewelry with solid backgrounds
 */
export async function removeSimpleBackground(imageBuffer: Buffer, threshold: number = 240): Promise<Buffer> {
  try {
    const image = sharp(imageBuffer);
    const { width, height } = await image.metadata();
    
    if (!width || !height) {
      throw new Error('Invalid image dimensions');
    }

    // Convert to RGBA and process
    const result = await image
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const { data } = result;
    
    // Process each pixel
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      
      const brightness = (r + g + b) / 3;
      
      // Make bright pixels transparent
      if (brightness > threshold) {
        data[i + 3] = 0; // Set alpha to 0 (transparent)
      }
    }

    // Create final image
    const finalResult = await sharp(data, {
      raw: {
        width,
        height,
        channels: 4
      }
    })
    .png()
    .toBuffer();

    return finalResult;

  } catch (error) {
    console.error('Simple background removal failed:', error);
    throw new Error(`Simple background removal failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Auto-detect best background removal method
 */
export async function autoRemoveBackground(imageBuffer: Buffer): Promise<Buffer> {
  try {
    // Analyze image to determine best approach
    const image = sharp(imageBuffer);
    const stats = await image.stats();
    
    // Check if image has high contrast (likely detailed jewelry)
    const hasHighContrast = stats.channels.some(channel => 
      channel.max - channel.min > 200
    );

    // Use advanced method for complex images, simple for clean backgrounds
    if (hasHighContrast) {
      console.log('Using advanced background removal for high-contrast image');
      return await removeBackgroundAdvanced(imageBuffer);
    } else {
      console.log('Using simple background removal for clean image');
      return await removeSimpleBackground(imageBuffer);
    }

  } catch (error) {
    console.error('Auto background removal failed, falling back to basic method:', error);
    return await removeBackground(imageBuffer);
  }
}

/**
 * Remove jewelry background - main interface for virtual try-on service
 * Returns both cleaned image and confidence score
 */
export async function removeJewelryBackground(imageBuffer: Buffer): Promise<{
  cleanedImage: Buffer;
  confidence: number;
}> {
  try {
    console.log('Starting jewelry background removal...');
    
    // Use auto-detection to get the best result
    const cleanedImage = await autoRemoveBackground(imageBuffer);
    
    // Calculate confidence based on transparency ratio
    const { width, height } = await sharp(cleanedImage).metadata();
    if (!width || !height) {
      throw new Error('Invalid processed image dimensions');
    }
    
    // Get raw data to calculate transparency
    const { data } = await sharp(cleanedImage).raw().toBuffer({ resolveWithObject: true });
    
    let transparentPixels = 0;
    let totalPixels = 0;
    
    // Count transparent pixels (alpha channel = 0)
    for (let i = 3; i < data.length; i += 4) { // Every 4th byte is alpha
      totalPixels++;
      if (data[i] === 0) {
        transparentPixels++;
      }
    }
    
    // Calculate confidence based on reasonable transparency ratio
    const transparencyRatio = transparentPixels / totalPixels;
    let confidence = 0.8; // Default confidence
    
    if (transparencyRatio > 0.1 && transparencyRatio < 0.8) {
      // Good transparency ratio suggests successful background removal
      confidence = 0.9;
    } else if (transparencyRatio < 0.05) {
      // Very little transparency - might not have removed much background
      confidence = 0.6;
    } else if (transparencyRatio > 0.9) {
      // Too much transparency - might have removed jewelry
      confidence = 0.5;
    }
    
    console.log(`Background removal completed. Transparency ratio: ${(transparencyRatio * 100).toFixed(1)}%, Confidence: ${(confidence * 100).toFixed(1)}%`);
    
    return {
      cleanedImage,
      confidence
    };
    
  } catch (error) {
    console.error('Jewelry background removal failed:', error);
    throw new Error(`Jewelry background removal failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

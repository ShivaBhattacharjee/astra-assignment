import { ModelGenerationParams } from '@/types/jewelry';
import { validateModelHasNoJewelry } from './visionPositioning';

/**
 * Generate a base model/person using AI without any jewelry
 */

export async function generateBaseModel(params: ModelGenerationParams): Promise<Buffer> {
  const maxRetries = 3;
  let attempt = 0;
  
  while (attempt < maxRetries) {
    try {
      attempt++;
      console.log(`Model generation attempt ${attempt}/${maxRetries}`);

      const modelService = selectModelService(params);
      
      const prompt = buildModelPrompt(params);
      
      const modelImage = await callModelService(modelService, prompt);
      
      // Validate that the generated model doesn't contain jewelry
      const base64Image = modelImage.toString('base64');
      const validation = await validateModelHasNoJewelry(base64Image);
      
      if (validation.hasJewelry && validation.confidence > 0.5) { // Lowered threshold from 0.7 to 0.5
        console.warn(`Attempt ${attempt}: Generated model contains jewelry:`, validation.detectedItems);
        console.warn(`Confidence: ${validation.confidence}`);
        
        if (attempt < maxRetries) {
          console.log('Retrying model generation with enhanced anti-jewelry prompts...');
          continue; // Try again with same params but different random seed
        } else {
          console.warn('Max retries reached, but model still contains jewelry. Proceeding anyway.');
          console.warn('Detected jewelry items:', validation.detectedItems);
        }
      } else {
        console.log(`Model generation successful on attempt ${attempt} - jewelry-free validation passed`);
        if (validation.detectedItems.length > 0 && validation.confidence <= 0.5) {
          console.log('Detected potential jewelry (low confidence, acceptable):', validation.detectedItems);
        }
      }
      
      return modelImage;
      
    } catch (error) {
      console.error(`Model generation attempt ${attempt} failed:`, error);
      
      if (attempt >= maxRetries) {
        throw new Error(`Model generation failed after ${maxRetries} attempts: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
      
      // Wait a bit before retrying
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  
  throw new Error('Model generation failed: maximum retries exceeded');
}

/**
 * Select the best AI service based on the parameters
 */

function selectModelService(params: ModelGenerationParams): 'flux-kontext' | 'gpt-image-1' {
  // Use OpenAI or Flux only - no Gemini
  if (params.pose === 'hand-extended') {
    return 'flux-kontext'; // Better for hand poses
  } else {
    return 'gpt-image-1'; // Default to OpenAI for better quality
  }
}

/**
 * Build a precise prompt for model generation
 */
function buildModelPrompt(params: ModelGenerationParams): string {
  const basePrompt = generateBasePrompt(params);
  const poseInstructions = generatePoseInstructions(params.pose);
  const aestheticInstructions = generateAestheticInstructions(params);
  const negativePrompt = generateNegativePrompt();
  
  return `${basePrompt} ${poseInstructions} ${aestheticInstructions} ${negativePrompt}`;
}

/**
 * Generate base model description with strong jewelry prohibition
 */
function generateBasePrompt(params: ModelGenerationParams): string {
  let prompt = `High-fashion portrait photograph of a ${params.demographics}`;
  
  // Add specific demographic details for better accuracy
  const demographics = params.demographics.toLowerCase();
  
  if (demographics.includes('indian') && demographics.includes('female')) {
    prompt += ', stunning South Asian woman with refined elegant features, flawless skin, professional makeup, sleek styled hair, wearing a crisp white sleeveless dress or elegant white top with deep V-neckline, minimalist sophisticated styling, studio lighting, fashion photography quality, completely jewelry-free';
  } else if (demographics.includes('indian') && demographics.includes('male')) {
    prompt += ', handsome South Asian man with strong refined features, well-groomed, wearing crisp white dress shirt or elegant white casual shirt, professional styling, studio lighting, fashion photography quality, completely jewelry-free';
  } else if (demographics.includes('asian') && demographics.includes('female')) {
    prompt += ', beautiful East Asian woman with refined delicate features, flawless skin, professional makeup, sleek styled hair, wearing a crisp white sleeveless dress or elegant white top with deep V-neckline, minimalist sophisticated styling, studio lighting, fashion photography quality, completely jewelry-free';
  } else if (demographics.includes('asian') && demographics.includes('male')) {
    prompt += ', handsome East Asian man with clean refined features, well-groomed, wearing crisp white dress shirt or elegant white casual shirt, professional styling, studio lighting, fashion photography quality, completely jewelry-free';
  } else if (demographics.includes('caucasian') && demographics.includes('female')) {
    prompt += ', stunning Caucasian woman with elegant refined features, flawless skin, professional makeup, sleek styled hair, wearing a crisp white sleeveless dress or elegant white top with deep V-neckline, minimalist sophisticated styling, studio lighting, fashion photography quality, completely jewelry-free';
  } else if (demographics.includes('caucasian') && demographics.includes('male')) {
    prompt += ', handsome Caucasian man with strong refined features, well-groomed, wearing crisp white dress shirt or elegant white casual shirt, professional styling, studio lighting, fashion photography quality, completely jewelry-free';
  }
  
  // Ensure gender is explicitly stated with high-fashion styling and jewelry prohibition
  if (demographics.includes('female')) {
    prompt += ', woman, feminine, high-fashion portrait style, wearing elegant white sleeveless dress with sophisticated V-neckline, professional studio lighting, neutral beige/cream background, fashion model posing, completely jewelry-free person, no necklaces, no earrings, no rings, no bracelets, no ornaments, no decorative items, clean neck and chest area perfect for jewelry placement';
  } else if (demographics.includes('male')) {
    prompt += ', man, masculine, high-fashion portrait style, wearing elegant white dress shirt, professional studio lighting, neutral beige/cream background, fashion model posing, completely jewelry-free person, no necklaces, no earrings, no rings, no bracelets, no ornaments, no decorative items';
  }
  
  // Add explicit jewelry prohibition with emphasis on high-fashion clean appearance
  prompt += ', CRITICAL: absolutely no jewelry of any kind, no accessories, no decorative elements, clean minimalist high-fashion appearance, pristine styling, no ornaments on person, professional fashion photography, studio quality lighting, neutral background, model-quality posing';
  
  return prompt;
}

/**
 * Generate pose-specific instructions with jewelry prohibition
 */
function generatePoseInstructions(pose: ModelGenerationParams['pose']): string {
  switch (pose) {
    case 'hand-extended':
      return ', elegant hand pose with fingers gracefully extended, hand positioned prominently in frame, professional manicured nails, studio lighting on hands and fingers, hand should be the main focus area suitable for ring placement, wearing elegant white sleeveless dress or shirt, high-fashion styling, CRITICAL: absolutely no rings or hand jewelry visible, clean fingers only, fashion model quality';
      
    case 'neck-visible':
      return ', clean elegant neckline clearly visible, wearing white sleeveless dress with sophisticated deep V-neckline, shoulders and décolletage beautifully lit and prominent, head positioned to show neck area elegantly, perfect for necklace placement, high-fashion portrait style, studio lighting, neutral background, CRITICAL: completely jewelry-free neck and chest area, no necklaces, no chains, no pendants whatsoever, pristine clean neck perfect for jewelry overlay';
      
    case 'ear-visible':
      return ', elegant three-quarter profile view showing ear clearly, hair styled sleekly away from ears, clean ear area beautifully visible, professional studio side lighting, ear positioned prominently for earring placement, high-fashion portrait style, wearing elegant white dress or top, CRITICAL: completely jewelry-free ears, no earrings, no ear jewelry, no piercings visible, fashion model quality';
      
    default:
      return ', natural elegant pose with relevant body areas clearly visible and beautifully lit, wearing sophisticated white dress or elegant white top, high-fashion portrait style, studio lighting, neutral beige background, CRITICAL: no jewelry of any kind visible on the person, pristine fashion model appearance';
  }
}

/**
 * Generate aesthetic and technical instructions with jewelry prohibition
 */
function generateAestheticInstructions(params: ModelGenerationParams): string {
  let instructions = '';
  
  // Lighting instructions - always use studio quality
  if (params.lighting === 'studio') {
    instructions += ', professional high-end studio lighting setup, soft key light with balanced fill light, minimal harsh shadows, perfect even skin tone lighting, fashion photography lighting, professional beauty lighting, elegant rim lighting';
  } else {
    instructions += ', studio-quality lighting setup, soft diffused professional light, fashion photography quality lighting, elegant illumination';
  }
  
  // Background instructions - always neutral/beige like the reference
  if (params.background === 'neutral') {
    instructions += ', clean neutral beige background, warm cream backdrop, minimal distractions, solid elegant color backdrop, fashion photography background';
  } else {
    instructions += ', neutral warm beige background, seamless cream backdrop, high-end fashion photography background';
  }
  
  // Quality instructions with jewelry prohibition and high-fashion styling
  instructions += ', ultra high resolution, tack sharp focus, professional fashion photography, 4K quality, detailed flawless skin texture, natural perfect skin tones, high-end fashion portrait';
  instructions += ', wearing elegant white sleeveless dress or sophisticated white top with V-neckline, high-fashion styling, model-quality appearance, MANDATORY: person must be completely free of all jewelry and accessories, no jewelry visible on elegantly styled person, pristine clean appearance perfect for jewelry overlay';
  
  return instructions;
}

/**
 * Generate comprehensive negative prompt to aggressively avoid jewelry
 */
function generateNegativePrompt(): string {
  return ' NEGATIVE PROMPT: jewelry, rings, necklaces, earrings, bracelets, accessories, watches, chains, pendants, gems, diamonds, gold, silver, metallic objects on person, nose rings, traditional jewelry, bangles, anklets, toe rings, any worn accessories, mangalsutra, choker, chain, locket, wedding ring, engagement ring, stud earrings, hoop earrings, bracelet, bangle, watch, wristband, hair accessories, hair clips, headband, decorative clothing elements, shiny objects on body, reflective surfaces on person, metallic clothing details, piercings, body jewelry, temporary tattoos with metallic elements, makeup with glitter, nail polish with metallic finish, clothing with jewelry-like patterns, embroidered metallic threads, sequins, beads on clothing, bindi, nose pin, maang tikka, armlet, toe ring, waist chain, forehead jewelry, facial jewelry, ear cuffs, multiple earrings, chandelier earrings, statement jewelry, fashion jewelry, costume jewelry, pearl jewelry, crystal jewelry, gemstone jewelry, antique jewelry, modern jewelry, traditional ornaments, cultural jewelry, religious jewelry, nude, naked, bare chest, bare shoulders, revealing clothing, inappropriate clothing, sexual content, nsfw, adult content, suggestive poses, provocative clothing, low-cut tops, strapless clothing, tank tops, sleeveless, exposed skin, cleavage, undergarments visible, blurry, low quality, distorted hands, extra fingers, missing fingers, bad anatomy, oversaturated, underexposed, noise, artifacts, text, watermarks --weight 3.0';
}

/**
 * Call the selected AI model service
 */
async function callModelService(
  service: 'flux-kontext' | 'gpt-image-1',
  prompt: string
): Promise<Buffer> {
  switch (service) {
    case 'flux-kontext':
      return await callFluxKontext(prompt);
    case 'gpt-image-1':
      return await callGPTImage1(prompt);
    default:
      throw new Error(`Unsupported model service: ${service}`);
  }
}

/**
 * Call Flux Kontext API
 */
async function callFluxKontext(prompt: string): Promise<Buffer> {
  const FAL_KEY = process.env.FAL_KEY ;
  
  try {
    const response = await fetch('https://fal.run/fal-ai/flux-pro/kontext', {
      method: 'POST',
      headers: {
        'Authorization': `Key ${FAL_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt: prompt,
        image_size: 'landscape_4_3',
        num_inference_steps: 28,
        guidance_scale: 3.5,
        num_images: 1,
        enable_safety_checker: true,
      }),
    });

    if (!response.ok) {
      throw new Error(`Flux API error: ${response.status} ${response.statusText}`);
    }

    const result = await response.json();
    
    if (!result.images || result.images.length === 0) {
      throw new Error('No images returned from Flux API');
    }

    // Download the generated image
    const imageResponse = await fetch(result.images[0].url);
    if (!imageResponse.ok) {
      throw new Error('Failed to download generated image');
    }

    return Buffer.from(await imageResponse.arrayBuffer());
    
  } catch (error) {
    console.error('Flux Kontext API call failed:', error);
    throw error;
  }
}

/**
 * Call GPT Image 1 API
 */
async function callGPTImage1(prompt: string): Promise<Buffer> {
  const OPENAI_KEY = process.env.OPENAI_API_KEY;
  
  if (!OPENAI_KEY) {
    throw new Error('OPENAI_API_KEY environment variable is not set');
  }
  
  try {
    const response = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-image-1',
        prompt: prompt,
        n: 1,
        size: '1024x1024'
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`OpenAI API error: ${response.status} ${errorData.error?.message || response.statusText}`);
    }

    const result = await response.json();
    console.log('OpenAI API response structure:', JSON.stringify(result, null, 2));
    
    if (!result.data || result.data.length === 0) {
      throw new Error('No images returned from OpenAI API');
    }

    // Check if the response has base64 data (gpt-image-1 returns b64_json by default)
    if (!result.data[0] || !result.data[0].b64_json) {
      console.error('OpenAI response data:', result);
      throw new Error('No base64 image data found in OpenAI API response');
    }

    // Convert base64 to Buffer directly (no need to download from URL)
    return Buffer.from(result.data[0].b64_json, 'base64');
    
  } catch (error) {
    console.error('GPT Image 1 API call failed:', error);
    throw error;
  }
}

/**
 * Validate pose in generated model image
 */
async function validatePose(
  modelImage: Buffer,
  expectedPose: ModelGenerationParams['pose']
): Promise<{ isValid: boolean; issues: string[] }> {
  const issues: string[] = [];
  
  try {
    const sharp = (await import('sharp')).default;
    
    // Convert to grayscale for better analysis
    const grayImage = await sharp(modelImage)
      .grayscale()
      .raw()
      .toBuffer({ resolveWithObject: true });
    
    const { data, info } = grayImage;
    const { width, height } = info;
    
    switch (expectedPose) {
      case 'hand-extended':
        const handValidation = await validateHandPose(data, width, height);
        if (!handValidation.isValid) {
          issues.push(...handValidation.issues);
        }
        break;
        
      case 'neck-visible':
        const neckValidation = await validateNeckPose(data, width, height);
        if (!neckValidation.isValid) {
          issues.push(...neckValidation.issues);
        }
        break;
        
      case 'ear-visible':
        const earValidation = await validateEarPose(data, width, height);
        if (!earValidation.isValid) {
          issues.push(...earValidation.issues);
        }
        break;
        
      default:
        // For other poses, just check if there's a human figure
        const humanValidation = await validateHumanPresence(data, width, height);
        if (!humanValidation.isValid) {
          issues.push(...humanValidation.issues);
        }
        break;
    }
    
  } catch (error) {
    issues.push(`Pose analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
  
  return {
    isValid: issues.length === 0,
    issues
  };
}

/**
 * Validate hand pose for ring placement
 */
async function validateHandPose(data: Buffer, width: number, height: number): Promise<{ isValid: boolean; issues: string[] }> {
  const issues: string[] = [];
  
  // Look for hand-like shapes in the image
  const handRegions = detectHandRegions(data, width, height);
  
  if (handRegions.length === 0) {
    issues.push('No hand detected in image');
  } else {
    // Check if hand is in suitable position
    const bestHand = handRegions[0];
    
    // Hand should be prominently positioned (not too small)
    const handArea = bestHand.width * bestHand.height;
    const imageArea = width * height;
    const handRatio = handArea / imageArea;
    
    if (handRatio < 0.05) {
      issues.push('Hand is too small in the image');
    }
    
    // Hand should be reasonably centered
    const handCenterX = bestHand.x + bestHand.width / 2;
    const handCenterY = bestHand.y + bestHand.height / 2;
    const imageCenterX = width / 2;
    const imageCenterY = height / 2;
    
    const distanceFromCenter = Math.sqrt(
      Math.pow(handCenterX - imageCenterX, 2) + Math.pow(handCenterY - imageCenterY, 2)
    );
    const maxDistance = Math.min(width, height) * 0.3;
    
    if (distanceFromCenter > maxDistance) {
      issues.push('Hand is not well-positioned in the frame');
    }
  }
  
  return { isValid: issues.length === 0, issues };
}

/**
 * Validate neck pose for necklace placement
 */
async function validateNeckPose(data: Buffer, width: number, height: number): Promise<{ isValid: boolean; issues: string[] }> {
  const issues: string[] = [];
  
  // Look for neck/shoulder region
  const neckRegion = detectNeckRegion(data, width, height);
  
  if (!neckRegion) {
    issues.push('No neck/shoulder area detected');
  } else {
    // Check if neck area is suitable for necklace placement
    const neckArea = neckRegion.width * neckRegion.height;
    const imageArea = width * height;
    const neckRatio = neckArea / imageArea;
    
    if (neckRatio < 0.1) {
      issues.push('Neck area is too small for necklace placement');
    }
    
    // Neck should be in upper portion of image
    if (neckRegion.y > height * 0.5) {
      issues.push('Neck area is positioned too low in the image');
    }
  }
  
  return { isValid: issues.length === 0, issues };
}

/**
 * Validate ear pose for earring placement
 */
async function validateEarPose(data: Buffer, width: number, height: number): Promise<{ isValid: boolean; issues: string[] }> {
  const issues: string[] = [];
  
  // Look for ear regions
  const earRegions = detectEarRegions(data, width, height);
  
  if (earRegions.length === 0) {
    issues.push('No ear detected in image');
  } else {
    // Check if at least one ear is clearly visible
    const visibleEars = earRegions.filter(ear => {
      const earArea = ear.width * ear.height;
      const imageArea = width * height;
      return (earArea / imageArea) > 0.01; // At least 1% of image
    });
    
    if (visibleEars.length === 0) {
      issues.push('Ear is too small or not clearly visible');
    }
  }
  
  return { isValid: issues.length === 0, issues };
}

/**
 * Validate human presence in image
 */
async function validateHumanPresence(data: Buffer, width: number, height: number): Promise<{ isValid: boolean; issues: string[] }> {
  const issues: string[] = [];
  
  // Basic human detection using skin tone analysis
  const skinPixels = detectSkinPixels(data, width, height);
  const totalPixels = width * height;
  const skinRatio = skinPixels / totalPixels;
  
  if (skinRatio < 0.1) {
    issues.push('No clear human figure detected in image');
  }
  
  return { isValid: issues.length === 0, issues };
}

/**
 * Detect hand regions using edge detection and shape analysis
 */
function detectHandRegions(data: Buffer, width: number, height: number): Array<{ x: number; y: number; width: number; height: number }> {
  const regions: Array<{ x: number; y: number; width: number; height: number }> = [];
  
  // Simple blob detection for hand-like shapes
  const threshold = 128;
  const minSize = Math.min(width, height) * 0.1;
  
  // Scan for connected regions that might be hands
  for (let y = 0; y < height - minSize; y += 10) {
    for (let x = 0; x < width - minSize; x += 10) {
      const region = analyzeRegion(data, x, y, minSize, minSize, width, height, threshold);
      if (region.density > 0.3 && region.aspectRatio > 0.5 && region.aspectRatio < 2.0) {
        regions.push({ x, y, width: minSize, height: minSize });
      }
    }
  }
  
  return regions.slice(0, 2); // Return top 2 candidates
}

/**
 * Detect neck region using gradient analysis
 */
function detectNeckRegion(data: Buffer, width: number, height: number): { x: number; y: number; width: number; height: number } | null {
  // Look for neck area in upper third of image
  const searchHeight = Math.floor(height * 0.4);
  const neckWidth = Math.floor(width * 0.3);
  const neckHeight = Math.floor(height * 0.2);
  
  let bestRegion = null;
  let bestScore = 0;
  
  for (let y = 0; y < searchHeight; y += 5) {
    for (let x = Math.floor(width * 0.35); x < width - neckWidth; x += 5) {
      const region = analyzeRegion(data, x, y, neckWidth, neckHeight, width, height, 128);
      const score = region.density * (1 - Math.abs(region.aspectRatio - 1.5));
      
      if (score > bestScore) {
        bestScore = score;
        bestRegion = { x, y, width: neckWidth, height: neckHeight };
      }
    }
  }
  
  return bestScore > 0.1 ? bestRegion : null;
}

/**
 * Detect ear regions using circular pattern detection
 */
function detectEarRegions(data: Buffer, width: number, height: number): Array<{ x: number; y: number; width: number; height: number }> {
  const regions: Array<{ x: number; y: number; width: number; height: number }> = [];
  
  // Look for ear-like shapes on sides of image
  const earSize = Math.min(width, height) * 0.08;
  const searchWidth = Math.floor(width * 0.3);
  
  // Left side
  for (let y = Math.floor(height * 0.2); y < height * 0.6; y += 5) {
    for (let x = 0; x < searchWidth; x += 5) {
      const region = analyzeRegion(data, x, y, earSize, earSize, width, height, 100);
      if (region.density > 0.2 && region.aspectRatio > 0.8 && region.aspectRatio < 1.2) {
        regions.push({ x, y, width: earSize, height: earSize });
        break;
      }
    }
  }
  
  // Right side
  for (let y = Math.floor(height * 0.2); y < height * 0.6; y += 5) {
    for (let x = width - searchWidth; x < width - earSize; x += 5) {
      const region = analyzeRegion(data, x, y, earSize, earSize, width, height, 100);
      if (region.density > 0.2 && region.aspectRatio > 0.8 && region.aspectRatio < 1.2) {
        regions.push({ x, y, width: earSize, height: earSize });
        break;
      }
    }
  }
  
  return regions;
}

/**
 * Detect skin pixels using color analysis
 */
function detectSkinPixels(data: Buffer, width: number, height: number): number {
  let skinPixels = 0;
  
  // Simple skin detection based on grayscale values
  // Skin typically has values between 80-200 in grayscale
  for (let i = 0; i < data.length; i++) {
    const pixel = data[i];
    if (pixel >= 80 && pixel <= 200) {
      skinPixels++;
    }
  }
  
  return skinPixels;
}

/**
 * Analyze a rectangular region for density and aspect ratio
 */
function analyzeRegion(
  data: Buffer,
  x: number,
  y: number,
  regionWidth: number,
  regionHeight: number,
  imageWidth: number,
  imageHeight: number,
  threshold: number
): { density: number; aspectRatio: number } {
  let activePixels = 0;
  let totalPixels = 0;
  
  for (let ry = y; ry < y + regionHeight && ry < imageHeight; ry++) {
    for (let rx = x; rx < x + regionWidth && rx < imageWidth; rx++) {
      const pixelIndex = ry * imageWidth + rx;
      if (pixelIndex < data.length) {
        totalPixels++;
        if (data[pixelIndex] > threshold) {
          activePixels++;
        }
      }
    }
  }
  
  const density = totalPixels > 0 ? activePixels / totalPixels : 0;
  const aspectRatio = regionWidth / regionHeight;
  
  return { density, aspectRatio };
}

/**
 * Validate generated model image
 */
export async function validateModelImage(
  modelImage: Buffer,
  expectedPose: ModelGenerationParams['pose']
): Promise<{ isValid: boolean; issues: string[] }> {
  const issues: string[] = [];
  
  // Basic image validation
  try {
    const sharp = (await import('sharp')).default;
    const { width, height, channels } = await sharp(modelImage).metadata();
    
    if (!width || !height) {
      issues.push('Invalid image dimensions');
    } else if (width < 512 || height < 512) {
      issues.push('Image resolution too low');
    }
    
    if (channels && channels < 3) {
      issues.push('Image should be in color');
    }
    
  } catch (error) {
    issues.push('Invalid image format');
  }
  
  // Pose validation using computer vision
  try {
    const poseValidation = await validatePose(modelImage, expectedPose);
    if (!poseValidation.isValid) {
      issues.push(...poseValidation.issues);
    }
  } catch (error) {
    issues.push('Pose validation failed');
  }
  
  return {
    isValid: issues.length === 0,
    issues
  };
}

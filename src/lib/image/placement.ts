import sharp from 'sharp';
import { PlacementCalculation, JewelryDimensions, BodyLandmarks, JewelryType } from '@/types/jewelry';

/**
 * Calculate precise jewelry placement coordinates based on anatomy and real-world sizing
 * This is critical for maintaining accurate proportions and realistic placement
 */
export async function calculateJewelryPlacement(
  modelImage: Buffer,
  jewelryDimensions: JewelryDimensions,
  jewelryType: JewelryType
): Promise<PlacementCalculation> {
  try {
    // First, try to detect body landmarks using computer vision
    const landmarks = await detectBodyLandmarks(modelImage, jewelryType);
    
    // Calculate position and properties based on jewelry type and landmarks
    let x = 0.5, y = 0.5; // Default center position
    let scale = 1.0;
    
    // Calculate perspective based on body/face orientation
    const perspective = calculatePerspective(jewelryType, landmarks);
    
    // Calculate rotation based on jewelry type, landmarks, and perspective
    const rotation = calculateRotation(jewelryType, landmarks, perspective);
    
    switch (jewelryType) {
      case 'ring':
        if (landmarks.hands && landmarks.hands.length > 0) {
          x = landmarks.hands[0].x;
          y = landmarks.hands[0].y;
          scale = calculateRingScale(jewelryDimensions);
        }
        break;
        
      case 'necklace':
        if (landmarks.face && landmarks.face.length > 0) {
          x = landmarks.face[0].x;
          y = landmarks.face[0].y + 0.15; // Below face
          scale = calculateNecklaceScale(jewelryDimensions);
        }
        break;
        
      case 'earrings':
        if (landmarks.face && landmarks.face.length >= 2) {
          x = (landmarks.face[0].x + landmarks.face[1].x) / 2;
          y = landmarks.face[0].y;
          scale = calculateEarringScale(jewelryDimensions);
        }
        break;
        
      case 'bracelet':
        if (landmarks.hands && landmarks.hands.length > 0) {
          x = landmarks.hands[0].x;
          y = landmarks.hands[0].y + 0.1;
          scale = calculateBraceletScale(jewelryDimensions);
        }
        break;
    }
    
    return {
      x,
      y,
      scale,
      rotation,
      perspective
    };
  } catch (error) {
    console.error('Error calculating jewelry placement:', error);
    
    // Fallback to default placement
    return {
      x: 0.5,
      y: 0.5,
      scale: 1.0,
      rotation: 0,
      perspective: 'front'
    };
  }
}

/**
 * Get image dimensions from buffer
 */
async function getImageDimensions(imageBuffer: Buffer): Promise<{ width: number; height: number }> {
  const { width, height } = await sharp(imageBuffer).metadata();
  if (!width || !height) {
    throw new Error('Could not determine image dimensions');
  }
  return { width, height };
}

/**
 * Detect body landmarks using computer vision techniques
 */
async function detectBodyLandmarks(modelImage: Buffer, jewelryType: JewelryType): Promise<BodyLandmarks> {
  // Use computer vision to detect key body landmarks
  try {
    const landmarks = await analyzeImageForLandmarks(modelImage, jewelryType);
    return landmarks;
  } catch (error) {
    console.warn('Landmark detection failed, using fallback estimation:', error);
    return estimateLandmarks(modelImage, jewelryType);
  }
}

/**
 * Analyze image for body landmarks using computer vision
 */
async function analyzeImageForLandmarks(modelImage: Buffer, jewelryType: JewelryType): Promise<BodyLandmarks> {
  const { data, info } = await sharp(modelImage).raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  
  const landmarks: BodyLandmarks = {};
  
  switch (jewelryType) {
    case 'ring':
    case 'bracelet':
      landmarks.hands = await detectHandLandmarks(data, width, height, channels);
      break;
      
    case 'necklace':
      landmarks.face = await detectNeckLandmarks(data, width, height, channels);
      break;
      
    case 'earrings':
      landmarks.face = await detectEarLandmarks(data, width, height, channels);
      break;
  }
  
  return landmarks;
}

/**
 * Detect hand landmarks for rings and bracelets
 */
async function detectHandLandmarks(
  data: Buffer,
  width: number,
  height: number,
  channels: number
): Promise<any[]> {
  const landmarks = [];
  
  // Detect skin-colored regions that could be hands
  const skinMask = detectSkinRegions(data, width, height, channels);
  
  // Find the largest skin region (likely the hand)
  const handRegion = findLargestRegion(skinMask, width, height);
  
  if (handRegion) {
    // Detect finger-like structures within the hand region
    const fingerTips = detectFingerTips(data, width, height, channels, handRegion);
    
    if (fingerTips.length > 0) {
      // Use the most prominent finger tip for ring placement
      landmarks.push({
        x: fingerTips[0].x / width,
        y: fingerTips[0].y / height,
        z: 0
      });
    } else {
      // Fallback to hand center
      landmarks.push({
        x: handRegion.centerX / width,
        y: handRegion.centerY / height,
        z: 0
      });
    }
  } else {
    // Fallback positioning
    landmarks.push({ x: 0.6, y: 0.5, z: 0 });
  }
  
  return landmarks;
}

/**
 * Detect neck landmarks for necklaces
 */
async function detectNeckLandmarks(
  data: Buffer,
  width: number,
  height: number,
  channels: number
): Promise<any[]> {
  const landmarks = [];
  
  // Detect face region first
  const faceRegion = detectFaceRegion(data, width, height, channels);
  
  if (faceRegion) {
    // Neck is typically below the face
    const neckY = faceRegion.bottom + (height - faceRegion.bottom) * 0.1;
    landmarks.push({
      x: faceRegion.centerX / width,
      y: neckY / height,
      z: 0
    });
  } else {
    // Fallback to upper center
    landmarks.push({ x: 0.5, y: 0.35, z: 0 });
  }
  
  return landmarks;
}

/**
 * Detect ear landmarks for earrings
 */
async function detectEarLandmarks(
  data: Buffer,
  width: number,
  height: number,
  channels: number
): Promise<any[]> {
  const landmarks = [];
  
  // Detect face region
  const faceRegion = detectFaceRegion(data, width, height, channels);
  
  if (faceRegion) {
    // Ears are typically on the sides of the face
    const earY = faceRegion.centerY;
    
    // Left ear
    landmarks.push({
      x: (faceRegion.left - 20) / width,
      y: earY / height,
      z: 0
    });
    
    // Right ear
    landmarks.push({
      x: (faceRegion.right + 20) / width,
      y: earY / height,
      z: 0
    });
  } else {
    // Fallback ear positions
    landmarks.push(
      { x: 0.35, y: 0.25, z: 0 },
      { x: 0.65, y: 0.25, z: 0 }
    );
  }
  
  return landmarks;
}

/**
 * Calculate scale for different jewelry types based on dimensions
 */
function calculateRingScale(dimensions: JewelryDimensions): number {
  // Ring scale based on diameter (typical finger width ~17-20mm)
  const baseFingerWidth = 18; // mm
  return dimensions.width / baseFingerWidth;
}

function calculateNecklaceScale(dimensions: JewelryDimensions): number {
  // Necklace scale based on chain width and pendant size
  const baseNeckWidth = 120; // mm (average neck circumference portion visible)
  return Math.min(dimensions.width / baseNeckWidth, 1.5); // Cap at 1.5x
}

function calculateEarringScale(dimensions: JewelryDimensions): number {
  // Earring scale based on ear size (typical earlobe ~15-20mm)
  const baseEarSize = 17; // mm
  return dimensions.height / baseEarSize;
}

function calculateBraceletScale(dimensions: JewelryDimensions): number {
  // Bracelet scale based on wrist width (typical wrist ~60-70mm)
  const baseWristWidth = 65; // mm
  return dimensions.width / baseWristWidth;
}

/**
 * Estimate landmarks based on image analysis (fallback method)
 */
async function estimateLandmarks(modelImage: Buffer, jewelryType: JewelryType): Promise<BodyLandmarks> {
  // Basic estimation - in production, use proper computer vision
  const landmarks: BodyLandmarks = {};
  
  switch (jewelryType) {
    case 'ring':
      landmarks.hands = [
        { x: 0.6, y: 0.5, z: 0 } // Normalized coordinates
      ];
      break;
      
    case 'necklace':
      landmarks.face = [
        { x: 0.5, y: 0.3, z: 0 } // Neck area
      ];
      break;
      
    case 'earrings':
      landmarks.face = [
        { x: 0.35, y: 0.25, z: 0 }, // Left ear
        { x: 0.65, y: 0.25, z: 0 }  // Right ear
      ];
      break;
      
    case 'bracelet':
      landmarks.hands = [
        { x: 0.4, y: 0.6, z: 0 } // Wrist area
      ];
      break;
  }
  
  return landmarks;
}

/**
 * Calculate scale ratio to convert jewelry dimensions to pixel dimensions
 */
function calculateScaleRatio(
  jewelryDimensions: JewelryDimensions,
  jewelryType: JewelryType,
  landmarks: BodyLandmarks,
  imageDimensions: { width: number; height: number }
): number {
  // Real-world reference measurements for human anatomy (in mm)
  const anatomyReferences = {
    fingerWidth: 18,      // Average adult finger width
    neckCircumference: 350, // Average neck circumference  
    earHeight: 25,        // Average ear height
    wristCircumference: 170 // Average wrist circumference
  };
  
  let referenceSize: number;
  let realWorldSize: number;
  
  switch (jewelryType) {
    case 'ring':
      referenceSize = anatomyReferences.fingerWidth;
      realWorldSize = Math.max(jewelryDimensions.width, jewelryDimensions.height);
      break;
      
    case 'necklace':
      referenceSize = anatomyReferences.neckCircumference;
      realWorldSize = calculateNecklaceLength(jewelryDimensions);
      break;
      
    case 'earrings':
      referenceSize = anatomyReferences.earHeight;
      realWorldSize = jewelryDimensions.height;
      break;
      
    case 'bracelet':
      referenceSize = anatomyReferences.wristCircumference;
      realWorldSize = calculateBraceletLength(jewelryDimensions);
      break;
      
    default:
      referenceSize = 50; // Default reference
      realWorldSize = Math.max(jewelryDimensions.width, jewelryDimensions.height);
  }
  
  // Calculate pixel size of reference anatomy in the image
  const referencePixelSize = estimateAnatomyPixelSize(jewelryType, landmarks, imageDimensions);
  
  // Calculate scale ratio: (real jewelry size / reference anatomy size) * reference pixel size
  const scaleRatio = (realWorldSize / referenceSize) * (referencePixelSize / 100); // Normalize to reasonable scale
  
  // Clamp scale ratio to reasonable bounds
  return Math.max(0.1, Math.min(3.0, scaleRatio));
}

/**
 * Calculate necklace length based on dimensions
 */
function calculateNecklaceLength(dimensions: JewelryDimensions): number {
  // For necklaces, width usually represents the chain length or pendant width
  // Use the larger dimension as the reference
  return Math.max(dimensions.width, dimensions.height);
}

/**
 * Calculate bracelet length based on dimensions  
 */
function calculateBraceletLength(dimensions: JewelryDimensions): number {
  // For bracelets, width usually represents the band circumference
  return dimensions.width;
}

/**
 * Estimate anatomy pixel size in the image
 */
function estimateAnatomyPixelSize(
  jewelryType: JewelryType,
  landmarks: BodyLandmarks,
  imageDimensions: { width: number; height: number }
): number {
  switch (jewelryType) {
    case 'ring':
      // Estimate finger width in pixels
      return imageDimensions.width * 0.03; // ~3% of image width
      
    case 'necklace':
      // Estimate neck area in pixels
      return imageDimensions.width * 0.25; // ~25% of image width
      
    case 'earrings':
      // Estimate ear height in pixels
      return imageDimensions.height * 0.08; // ~8% of image height
      
    case 'bracelet':
      // Estimate wrist width in pixels
      return imageDimensions.width * 0.04; // ~4% of image width
      
    default:
      return imageDimensions.width * 0.05;
  }
}

/**
 * Calculate base coordinates for jewelry placement
 */
function calculateBaseCoordinates(
  jewelryType: JewelryType,
  landmarks: BodyLandmarks,
  imageDimensions: { width: number; height: number }
): { x: number; y: number } {
  switch (jewelryType) {
    case 'ring':
      if (landmarks.hands && landmarks.hands.length > 0) {
        const hand = landmarks.hands[0];
        return {
          x: hand.x * imageDimensions.width,
          y: hand.y * imageDimensions.height
        };
      }
      // Fallback: assume hand is in center-right area
      return {
        x: imageDimensions.width * 0.6,
        y: imageDimensions.height * 0.5
      };
      
    case 'necklace':
      if (landmarks.face && landmarks.face.length > 0) {
        const neckArea = landmarks.face[0];
        return {
          x: neckArea.x * imageDimensions.width,
          y: neckArea.y * imageDimensions.height + (imageDimensions.height * 0.1) // Slightly below face
        };
      }
      // Fallback: center upper area
      return {
        x: imageDimensions.width * 0.5,
        y: imageDimensions.height * 0.35
      };
      
    case 'earrings':
      if (landmarks.face && landmarks.face.length >= 2) {
        // Return position for first earring (left ear)
        const leftEar = landmarks.face[0];
        return {
          x: leftEar.x * imageDimensions.width,
          y: leftEar.y * imageDimensions.height
        };
      }
      // Fallback: left ear area
      return {
        x: imageDimensions.width * 0.35,
        y: imageDimensions.height * 0.25
      };
      
    case 'bracelet':
      if (landmarks.hands && landmarks.hands.length > 0) {
        const wrist = landmarks.hands[0];
        return {
          x: wrist.x * imageDimensions.width,
          y: wrist.y * imageDimensions.height + (imageDimensions.height * 0.05) // Slightly below hand
        };
      }
      // Fallback: wrist area
      return {
        x: imageDimensions.width * 0.4,
        y: imageDimensions.height * 0.6
      };
      
    default:
      return {
        x: imageDimensions.width * 0.5,
        y: imageDimensions.height * 0.5
      };
  }
}

/**
 * Calculate perspective transformation needed
 */
function calculatePerspective(
  jewelryType: JewelryType,
  landmarks: BodyLandmarks
): 'front' | 'side' | 'angled' {
  // Analyze face/body orientation from landmarks
  const orientation = analyzeLandmarkOrientation(landmarks);
  
  // Determine perspective based on both jewelry type and detected orientation
  switch (jewelryType) {
    case 'ring':
      // Rings look good at various angles, adjust based on hand orientation
      if (orientation.handAngle !== null) {
        return Math.abs(orientation.handAngle) > 30 ? 'angled' : 'front';
      }
      return 'angled'; // Default for rings
      
    case 'necklace':
      // Necklaces typically front-facing unless person is in profile
      if (orientation.faceProfile > 0.7) {
        return 'side';
      } else if (orientation.faceProfile > 0.3) {
        return 'angled';
      }
      return 'front';
      
    case 'earrings':
      // Earrings adapt to face orientation
      if (orientation.faceProfile > 0.5) {
        return 'side';
      } else if (orientation.faceProfile > 0.2) {
        return 'angled';
      }
      return 'front';
      
    case 'bracelet':
      // Bracelets follow hand/wrist orientation
      if (orientation.handAngle !== null) {
        return Math.abs(orientation.handAngle) > 45 ? 'side' : 'angled';
      }
      return 'angled'; // Default for bracelets
      
    default:
      return orientation.faceProfile > 0.4 ? 'side' : 'front';
  }
}

/**
 * Analyze landmark orientation to determine face/body pose
 */
function analyzeLandmarkOrientation(landmarks: BodyLandmarks): {
  faceProfile: number; // 0 = front-facing, 1 = full profile
  handAngle: number | null; // Hand rotation angle in degrees
  bodyTilt: number; // Body tilt angle
} {
  let faceProfile = 0;
  let handAngle: number | null = null;
  let bodyTilt = 0;
  
  // Analyze face orientation if face landmarks are available
  if (landmarks.face && landmarks.face.length >= 2) {
    const leftEar = landmarks.face[0];
    const rightEar = landmarks.face[1];
    
    // Calculate face profile based on ear positions
    const earDistance = Math.abs(leftEar.x - rightEar.x);
    const earYDifference = Math.abs(leftEar.y - rightEar.y);
    
    // Profile detection: closer ears = more profile view
    // Typical front view: ears are ~0.3 image width apart
    // Profile view: ears are much closer or one is hidden
    if (earDistance < 0.15) {
      faceProfile = 0.9; // Strong profile
    } else if (earDistance < 0.25) {
      faceProfile = 0.6; // Moderate angle
    } else if (earDistance < 0.35) {
      faceProfile = 0.3; // Slight angle
    } else {
      faceProfile = 0.1; // Front-facing
    }
    
    // Adjust for ear height difference (head tilt)
    if (earYDifference > 0.05) {
      faceProfile = Math.min(1.0, faceProfile + 0.2); // Head tilt increases profile score
      bodyTilt = (leftEar.y - rightEar.y) * 180; // Convert to degrees
    }
  }
  
  // Analyze hand orientation if hand landmarks are available
  if (landmarks.hands && landmarks.hands.length > 0) {
    const hand = landmarks.hands[0];
    
    // Estimate hand angle based on position relative to body center
    // Hands closer to edges suggest angled poses
    const distanceFromCenter = Math.abs(hand.x - 0.5);
    
    if (distanceFromCenter > 0.3) {
      handAngle = (hand.x - 0.5) * 90; // Convert to degrees
    } else {
      handAngle = 0; // Hand is roughly centered
    }
    
    // Factor in hand height for additional angle information
    if (hand.y < 0.4) {
      // Hand is high up (extended forward)
      handAngle = handAngle !== null ? handAngle + 15 : 15;
    } else if (hand.y > 0.7) {
      // Hand is low (hanging down)
      handAngle = handAngle !== null ? handAngle - 10 : -10;
    }
  }
  
  return {
    faceProfile,
    handAngle,
    bodyTilt
  };
}

/**
 * Calculate rotation angle for natural placement
 */
function calculateRotation(
  jewelryType: JewelryType,
  landmarks: BodyLandmarks,
  perspective: 'front' | 'side' | 'angled'
): number {
  // Get detailed orientation analysis
  const orientation = analyzeLandmarkOrientation(landmarks);
  
  // Base rotation angles for each jewelry type and perspective
  let baseRotation = 0;
  
  switch (jewelryType) {
    case 'ring':
      // Rings should align with finger angle and hand orientation
      if (perspective === 'angled') {
        baseRotation = -15;
        // Adjust based on actual hand angle if available
        if (orientation.handAngle !== null) {
          baseRotation += orientation.handAngle * 0.3; // Scale down the hand angle
        }
      } else if (perspective === 'side') {
        baseRotation = orientation.handAngle !== null ? orientation.handAngle : -25;
      }
      break;
      
    case 'necklace':
      // Necklaces follow neckline curve and body tilt
      baseRotation = orientation.bodyTilt * 0.5; // Follow body tilt
      
      if (perspective === 'side') {
        baseRotation += -10; // Slight tilt for side view
      } else if (perspective === 'angled') {
        baseRotation += orientation.faceProfile > 0.5 ? -8 : 8; // Direction depends on which way face is turned
      }
      break;
      
    case 'earrings':
      // Earrings should hang naturally and follow head tilt
      baseRotation = orientation.bodyTilt * 0.7; // Follow head tilt more closely
      
      if (perspective === 'side') {
        baseRotation += -5; // Slight forward tilt for side view
      } else if (perspective === 'angled') {
        // Adjust based on face profile direction
        baseRotation += orientation.faceProfile > 0.5 ? -3 : 3;
      }
      break;
      
    case 'bracelet':
      // Bracelets follow wrist curve and hand orientation
      if (perspective === 'angled') {
        baseRotation = 10;
        // Adjust based on hand angle
        if (orientation.handAngle !== null) {
          baseRotation += orientation.handAngle * 0.4;
        }
      } else if (perspective === 'side') {
        baseRotation = orientation.handAngle !== null ? orientation.handAngle * 0.6 : 15;
      }
      break;
      
    default:
      baseRotation = orientation.bodyTilt * 0.3; // Minimal body tilt influence
  }
  
  // Clamp rotation to reasonable bounds (-45 to +45 degrees)
  return Math.max(-45, Math.min(45, baseRotation));
}

/**
 * Calculate multiple placement positions for jewelry with multiple pieces (e.g., earrings)
 */
export async function calculateMultiplePlacements(
  modelImage: Buffer,
  jewelryDimensions: JewelryDimensions,
  jewelryType: JewelryType,
  bodyLandmarks: BodyLandmarks
): Promise<PlacementCalculation[]> {
  if (jewelryType !== 'earrings') {
    // For non-pair jewelry, return single placement
    const singlePlacement = await calculateJewelryPlacement(modelImage, jewelryDimensions, jewelryType);
    return [singlePlacement];
  }
  
  // For earrings, calculate placement for both ears
  const placements: PlacementCalculation[] = [];
  
  if (bodyLandmarks.face && bodyLandmarks.face.length >= 2) {
    // Left ear
    const leftEarLandmarks = { face: [bodyLandmarks.face[0]] };
    const leftPlacement = await calculateJewelryPlacement(modelImage, jewelryDimensions, jewelryType);
    leftPlacement.x = 0.35; // Left ear position
    leftPlacement.y = 0.25;
    placements.push(leftPlacement);
    
    // Right ear
    const rightEarLandmarks = { face: [bodyLandmarks.face[1]] };
    const rightPlacement = await calculateJewelryPlacement(modelImage, jewelryDimensions, jewelryType);
    rightPlacement.x = 0.65; // Right ear position
    rightPlacement.y = 0.25;
    placements.push(rightPlacement);
  }
  
  return placements;
}

/**
 * Validate placement calculation results
 */
export function validatePlacement(
  placement: PlacementCalculation,
  imageDimensions: { width: number; height: number }
): { isValid: boolean; issues: string[] } {
  const issues: string[] = [];
  
  // Check coordinates are within image bounds
  if (placement.x < 0 || placement.x > imageDimensions.width) {
    issues.push('X coordinate out of image bounds');
  }
  
  if (placement.y < 0 || placement.y > imageDimensions.height) {
    issues.push('Y coordinate out of image bounds');
  }
  
  // Check scale is reasonable
  if (placement.scale < 0.1 || placement.scale > 3.0) {
    issues.push('Scale factor is unrealistic');
  }
  
  // Check rotation is within reasonable bounds
  if (Math.abs(placement.rotation) > 45) {
    issues.push('Rotation angle too extreme');
  }
  
  return {
    isValid: issues.length === 0,
    issues
  };
}

/**
 * Detect skin-colored regions in the image
 */
function detectSkinRegions(data: Buffer, width: number, height: number, channels: number): boolean[] {
  const skinMask = new Array(width * height).fill(false);
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const pixelIndex = (y * width + x) * channels;
      const r = data[pixelIndex];
      const g = data[pixelIndex + 1];
      const b = data[pixelIndex + 2];
      
      // Skin detection using RGB ranges
      const isSkin = (
        r > 95 && g > 40 && b > 20 &&
        Math.max(r, g, b) - Math.min(r, g, b) > 15 &&
        Math.abs(r - g) > 15 && r > g && r > b
      );
      
      skinMask[y * width + x] = isSkin;
    }
  }
  
  return skinMask;
}

/**
 * Find the largest connected region in a binary mask
 */
function findLargestRegion(mask: boolean[], width: number, height: number): {
  left: number; right: number; top: number; bottom: number;
  centerX: number; centerY: number; area: number;
} | null {
  const visited = new Array(width * height).fill(false);
  let largestRegion: any = null;
  let maxArea = 0;
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = y * width + x;
      
      if (mask[index] && !visited[index]) {
        const region = floodFill(mask, visited, x, y, width, height);
        
        if (region.area > maxArea) {
          maxArea = region.area;
          largestRegion = region;
        }
      }
    }
  }
  
  return largestRegion;
}

/**
 * Flood fill algorithm to find connected regions
 */
function floodFill(
  mask: boolean[], 
  visited: boolean[], 
  startX: number, 
  startY: number, 
  width: number, 
  height: number
): { left: number; right: number; top: number; bottom: number; centerX: number; centerY: number; area: number } {
  const stack = [{ x: startX, y: startY }];
  let left = startX, right = startX, top = startY, bottom = startY;
  let area = 0;
  let sumX = 0, sumY = 0;
  
  while (stack.length > 0) {
    const { x, y } = stack.pop()!;
    const index = y * width + x;
    
    if (x < 0 || x >= width || y < 0 || y >= height || visited[index] || !mask[index]) {
      continue;
    }
    
    visited[index] = true;
    area++;
    sumX += x;
    sumY += y;
    
    left = Math.min(left, x);
    right = Math.max(right, x);
    top = Math.min(top, y);
    bottom = Math.max(bottom, y);
    
    // Add neighbors
    stack.push({ x: x + 1, y }, { x: x - 1, y }, { x, y: y + 1 }, { x, y: y - 1 });
  }
  
  return {
    left, right, top, bottom,
    centerX: sumX / area,
    centerY: sumY / area,
    area
  };
}

/**
 * Detect finger tip locations within a hand region
 */
function detectFingerTips(
  data: Buffer,
  width: number,
  height: number,
  channels: number,
  handRegion: any
): { x: number; y: number }[] {
  const fingerTips = [];
  
  // Look for finger-like protrusions from the hand region
  const searchTop = Math.max(0, handRegion.top - 20);
  const searchBottom = Math.min(height - 1, handRegion.bottom + 20);
  const searchLeft = Math.max(0, handRegion.left - 20);
  const searchRight = Math.min(width - 1, handRegion.right + 20);
  
  // Find the topmost skin pixels (likely finger tips)
  for (let x = searchLeft; x <= searchRight; x += 5) {
    for (let y = searchTop; y <= searchBottom; y++) {
      const pixelIndex = (y * width + x) * channels;
      const r = data[pixelIndex];
      const g = data[pixelIndex + 1];
      const b = data[pixelIndex + 2];
      
      // Check if it's a skin pixel
      const isSkin = (
        r > 95 && g > 40 && b > 20 &&
        Math.max(r, g, b) - Math.min(r, g, b) > 15 &&
        Math.abs(r - g) > 15 && r > g && r > b
      );
      
      if (isSkin) {
        fingerTips.push({ x, y });
        break; // Found topmost skin pixel in this column
      }
    }
  }
  
  // Return the most prominent finger tip (usually the middle one)
  if (fingerTips.length > 0) {
    fingerTips.sort((a, b) => a.y - b.y); // Sort by Y coordinate (topmost first)
    return [fingerTips[0]]; // Return the topmost finger tip
  }
  
  return [];
}

/**
 * Detect face region in the image
 */
function detectFaceRegion(data: Buffer, width: number, height: number, channels: number): {
  left: number; right: number; top: number; bottom: number;
  centerX: number; centerY: number;
} | null {
  // Simple face detection using skin color and region properties
  const skinMask = detectSkinRegions(data, width, height, channels);
  const faceRegion = findLargestRegion(skinMask, width, height);
  
  if (faceRegion && faceRegion.area > (width * height * 0.02)) {
    // Face should be a reasonably sized region
    const faceWidth = faceRegion.right - faceRegion.left;
    const faceHeight = faceRegion.bottom - faceRegion.top;
    
    // Face regions should be roughly oval (width/height ratio between 0.6 and 1.4)
    const aspectRatio = faceWidth / faceHeight;
    
    if (aspectRatio > 0.6 && aspectRatio < 1.4) {
      return faceRegion;
    }
  }
  
  return null;
}

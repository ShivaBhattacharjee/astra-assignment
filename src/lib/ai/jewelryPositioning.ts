/**
 * AI-powered jewelry positioning using Gemini 2.0 Flash
 * Analyzes model images to find optimal jewelry placement positions
 */

export interface JewelryPlacementResult {
  position: {
    x: number;
    y: number;
  };
  scale: number;
  rotation: number; // in degrees
  confidence: number;
  anatomyPoints?: {
    neck?: { x: number; y: number };
    ears?: { left: { x: number; y: number }; right: { x: number; y: number } };
    fingers?: { x: number; y: number }[];
    wrist?: { x: number; y: number };
    shoulders?: { left: { x: number; y: number }; right: { x: number; y: number } };
    chest?: { x: number; y: number };
    bodyAngle?: number; // body tilt in degrees
  };
  adjustments?: {
    scaleX?: number; // horizontal scaling
    scaleY?: number; // vertical scaling
    skew?: number; // perspective adjustment in degrees
    opacity?: number; // transparency for natural blending
  };
}

export async function findOptimalJewelryPosition(
  modelImageBuffer: Buffer,
  jewelryType: 'necklace' | 'ring' | 'earrings' | 'bracelet'
): Promise<JewelryPlacementResult> {
  try {
    console.log(`Finding optimal ${jewelryType} placement using AI...`);
    
    // Convert image to base64 for API
    const base64Image = modelImageBuffer.toString('base64');
    const mimeType = detectImageMimeType(modelImageBuffer);
    
    const geminiResult = await analyzeModelAnatomyWithGemini(base64Image, mimeType, jewelryType);
    
    if (geminiResult) {
      console.log('AI positioning successful:', geminiResult);
      return geminiResult;
    }
    
    // Fallback to traditional positioning
    console.log('Falling back to traditional positioning...');
    return getFallbackPosition(jewelryType);
    
  } catch (error) {
    console.error('AI positioning failed:', error);
    return getFallbackPosition(jewelryType);
  }
}

/**
 * Use Gemini Vision to analyze model anatomy and suggest jewelry placement
 */
async function analyzeModelAnatomyWithGemini(
  base64Image: string,
  mimeType: string,
  jewelryType: string
): Promise<JewelryPlacementResult | null> {
  try {
    const prompt = buildAnatomyAnalysisPrompt(jewelryType);
    
    console.log('Calling Gemini Vision for anatomy analysis...');
    
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.error('GEMINI_API_KEY not found in environment variables');
      return null;
    }
    
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: prompt },
            {
              inline_data: {
                mime_type: mimeType,
                data: base64Image
              }
            }
          ]
        }],
        generationConfig: {
          temperature: 0.1, // Low temperature for precise analysis
          candidateCount: 1,
          maxOutputTokens: 1000,
        },
        safetySettings: [
          {
            category: "HARM_CATEGORY_HARASSMENT",
            threshold: "BLOCK_MEDIUM_AND_ABOVE"
          },
          {
            category: "HARM_CATEGORY_HATE_SPEECH", 
            threshold: "BLOCK_MEDIUM_AND_ABOVE"
          },
          {
            category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
            threshold: "BLOCK_MEDIUM_AND_ABOVE"
          },
          {
            category: "HARM_CATEGORY_DANGEROUS_CONTENT",
            threshold: "BLOCK_MEDIUM_AND_ABOVE"
          }
        ]
      })
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Gemini API error:', response.status, response.statusText, errorText);
      return null;
    }
    
    const result = await response.json();
    
    if (result.candidates?.[0]?.content?.parts?.[0]?.text) {
      const analysisText = result.candidates[0].content.parts[0].text;
      return parseGeminiPositionResponse(analysisText, jewelryType);
    }
    
    return null;
    
  } catch (error) {
    console.error('Gemini anatomy analysis error:', error);
    return null;
  }
}

/**
 * Build anatomy analysis prompt based on jewelry type
 */
function buildAnatomyAnalysisPrompt(jewelryType: string): string {
  const basePrompt = `You are an expert jewelry stylist and computer vision specialist. Analyze this portrait image to determine the optimal ${jewelryType} placement position.

IMPORTANT: The image canvas is typically 1200x900 pixels (width x height). Provide coordinates in this coordinate system where:
- (0,0) is the top-left corner
- X increases going right (0 to 1200)
- Y increases going down (0 to 900)
- All coordinates must be in pixels as integers

Your task is to locate anatomical landmarks and calculate precise positioning for ${jewelryType} placement.`;

  switch (jewelryType) {
    case 'necklace':
      return `${basePrompt}

ANALYSIS REQUIRED:
1. **Identify the person's anatomy and pose**
   - Locate the base of the neck where it transitions to the chest
   - Find the collar bone/clavicle area and shoulder line
   - Identify the center line of the body for symmetrical placement
   - Determine the body's tilt/angle from vertical (head tilt, shoulder angle)
   - Consider any existing clothing necklines or accessories

2. **Calculate optimal necklace center position**
   - X coordinate: Should align with the body's vertical centerline (usually around 600px for 1200px width)
   - Y coordinate: Position on upper chest area, typically 60-120 pixels below the neck base
   - Account for natural jewelry draping and the model's pose
   - For statement necklaces, position slightly lower; for chokers, position higher

3. **Determine rotation and perspective adjustments**
   - Calculate rotation angle based on shoulder line and body pose (-45° to +45°)
   - If left shoulder is higher, rotate clockwise (positive degrees)
   - If right shoulder is higher, rotate counter-clockwise (negative degrees)
   - For front-facing poses, rotation should be close to 0°
   - Consider perspective scaling (scaleX/scaleY) for 3/4 poses

4. **Determine appropriate scale and adjustments**
   - Analyze the model's proportions relative to the image size
   - For delicate necklaces: scale 0.3-0.5
   - For statement/traditional necklaces: scale 0.5-0.8
   - Consider the distance of the model from camera
   - ScaleX: 0.8-1.2 based on perspective (wider for angled poses)
   - ScaleY: 0.9-1.1 for natural draping
   - Opacity: 0.85-0.95 for natural blending

5. **Assess confidence level**
   - Rate 0.9-1.0 if neck/chest area is clearly visible with clear shoulder lines
   - Rate 0.7-0.8 if partially visible or at an angle
   - Rate 0.5-0.6 if difficult to see anatomical landmarks

RESPONSE FORMAT (JSON only):
{
  "position": {"x": [integer_x_coordinate], "y": [integer_y_coordinate]},
  "scale": [decimal_scale_factor],
  "rotation": [rotation_in_degrees],
  "confidence": [decimal_0_to_1],
  "anatomyPoints": {
    "neck": {"x": [neck_center_x], "y": [neck_base_y]},
    "chest": {"x": [chest_center_x], "y": [upper_chest_y]},
    "shoulders": {
      "left": {"x": [left_shoulder_x], "y": [left_shoulder_y]},
      "right": {"x": [right_shoulder_x], "y": [right_shoulder_y]}
    },
    "bodyAngle": [body_tilt_degrees]
  },
  "adjustments": {
    "scaleX": [horizontal_scale_factor],
    "scaleY": [vertical_scale_factor],
    "skew": [perspective_skew_degrees],
    "opacity": [transparency_factor]
  }
}`;

    case 'ring':
      return `${basePrompt}

ANALYSIS REQUIRED:
1. **Locate hands and fingers with pose analysis**
   - Identify visible hands (left, right, or both)
   - Locate individual fingers, focusing on ring fingers
   - Consider hand positioning, angle, and perspective
   - Determine finger orientation and natural curve

2. **Calculate optimal ring placement with rotation**
   - X coordinate: Center of the target finger
   - Y coordinate: Position on the finger (typically between knuckles)
   - Rotation: Follow the finger's natural angle and curve
   - Prefer the ring finger if visible, otherwise the most prominent finger

3. **Scale and perspective adjustments**
   - Small scale for delicate rings: 0.1-0.3
   - Medium scale for statement rings: 0.3-0.5
   - Consider finger size relative to image resolution
   - Adjust scaleX/scaleY for finger perspective

RESPONSE FORMAT (JSON only):
{
  "position": {"x": [integer_x_coordinate], "y": [integer_y_coordinate]},
  "scale": [decimal_scale_factor],
  "rotation": [finger_angle_degrees],
  "confidence": [decimal_0_to_1],
  "anatomyPoints": {
    "fingers": [{"x": [finger_x], "y": [finger_y]}]
  },
  "adjustments": {
    "scaleX": [horizontal_scale],
    "scaleY": [vertical_scale],
    "opacity": [transparency]
  }
}`;

    case 'earrings':
      return `${basePrompt}

ANALYSIS REQUIRED:
1. **Identify ear positions with head angle analysis**
   - Locate visible ears (left, right, or both)
   - Find the earlobe attachment point
   - Consider the model's head angle, tilt, and hair coverage
   - Determine the natural hang angle for earrings

2. **Calculate earring placement with proper orientation**
   - X coordinate: Center of the earlobe
   - Y coordinate: Bottom of the earlobe where earrings would hang
   - Rotation: Account for head tilt (earrings hang vertically with gravity)
   - If both ears are visible, choose the more prominent one

3. **Scale for ear proportions with perspective**
   - Small earrings: scale 0.15-0.3
   - Statement earrings: scale 0.3-0.6
   - Consider ear size relative to face and head angle
   - Adjust for perspective if head is turned

RESPONSE FORMAT (JSON only):
{
  "position": {"x": [integer_x_coordinate], "y": [integer_y_coordinate]},
  "scale": [decimal_scale_factor],
  "rotation": [head_tilt_compensation_degrees],
  "confidence": [decimal_0_to_1],
  "anatomyPoints": {
    "ears": {
      "left": {"x": [left_ear_x], "y": [left_ear_y]},
      "right": {"x": [right_ear_x], "y": [right_ear_y]}
    }
  },
  "adjustments": {
    "scaleX": [perspective_scale_x],
    "scaleY": [perspective_scale_y],
    "opacity": [blend_factor]
  }
}`;

    case 'bracelet':
      return `${basePrompt}

ANALYSIS REQUIRED:
1. **Locate wrist and forearm with pose analysis**
   - Identify visible wrists/forearms
   - Consider arm positioning, angles, and perspective
   - Account for clothing sleeves or existing accessories
   - Determine the natural curve and angle of the wrist

2. **Calculate bracelet placement with proper fit**
   - X coordinate: Center of the wrist
   - Y coordinate: Position on the wrist/lower forearm
   - Rotation: Follow the natural curve and angle of the wrist/arm
   - Choose the most visible and well-positioned wrist

3. **Scale and fit adjustments**
   - Delicate bracelets: scale 0.2-0.4
   - Statement bracelets: scale 0.4-0.7
   - Consider wrist size and arm position
   - Adjust for perspective and natural arm curve

RESPONSE FORMAT (JSON only):
{
  "position": {"x": [integer_x_coordinate], "y": [integer_y_coordinate]},
  "scale": [decimal_scale_factor],
  "rotation": [wrist_angle_degrees],
  "confidence": [decimal_0_to_1],
  "anatomyPoints": {
    "wrist": {"x": [wrist_x], "y": [wrist_y]}
  },
  "adjustments": {
    "scaleX": [fit_scale_x],
    "scaleY": [fit_scale_y],
    "skew": [arm_perspective_skew],
    "opacity": [natural_blend]
  }
}`;

    default:
      return `${basePrompt}

Please analyze the image and provide optimal jewelry placement coordinates with rotation and adjustments in the specified JSON format.`;
  }
}

/**
 * Parse Gemini's response to extract positioning data
 */
function parseGeminiPositionResponse(responseText: string, jewelryType: string): JewelryPlacementResult | null {
  try {
    // Look for JSON in the response
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.log('No JSON found in Gemini response, parsing text...');
      return parseTextResponse(responseText, jewelryType);
    }

    const jsonStr = jsonMatch[0];
    const parsed = JSON.parse(jsonStr);

    // Validate the response structure
    if (parsed.position && typeof parsed.position.x === 'number' && typeof parsed.position.y === 'number') {
      return {
        position: {
          x: Math.round(parsed.position.x),
          y: Math.round(parsed.position.y)
        },
        scale: parsed.scale || getDefaultScale(jewelryType),
        rotation: parsed.rotation || 0,
        confidence: parsed.confidence || 0.8,
        anatomyPoints: parsed.anatomyPoints || undefined,
        adjustments: parsed.adjustments || undefined
      };
    }

    return null;

  } catch (error) {
    console.error('Failed to parse Gemini positioning response:', error);
    console.log('Raw response:', responseText);
    return parseTextResponse(responseText, jewelryType);
  }
}

/**
 * Parse text response if JSON parsing fails
 */
function parseTextResponse(responseText: string, jewelryType: string): JewelryPlacementResult | null {
  try {
    // Look for coordinate patterns in text
    const xMatch = responseText.match(/x[:\s]*(\d+)/i);
    const yMatch = responseText.match(/y[:\s]*(\d+)/i);
    const scaleMatch = responseText.match(/scale[:\s]*(0?\.\d+|\d+\.?\d*)/i);
    const rotationMatch = responseText.match(/rotation[:\s]*(-?\d+\.?\d*)/i);
    const confidenceMatch = responseText.match(/confidence[:\s]*(0?\.\d+|\d+\.?\d*)/i);

    if (xMatch && yMatch) {
      return {
        position: {
          x: parseInt(xMatch[1]),
          y: parseInt(yMatch[1])
        },
        scale: scaleMatch ? parseFloat(scaleMatch[1]) : getDefaultScale(jewelryType),
        rotation: rotationMatch ? parseFloat(rotationMatch[1]) : 0,
        confidence: confidenceMatch ? parseFloat(confidenceMatch[1]) : 0.7
      };
    }

    return null;

  } catch (error) {
    console.error('Failed to parse text response:', error);
    return null;
  }
}

/**
 * Get default scale based on jewelry type
 */
function getDefaultScale(jewelryType: string): number {
  switch (jewelryType) {
    case 'necklace': return 0.4; // Smaller for better proportions
    case 'ring': return 0.3;
    case 'earrings': return 0.25;
    case 'bracelet': return 0.4;
    default: return 0.5;
  }
}

/**
 * Fallback positioning when AI analysis fails
 */
function getFallbackPosition(jewelryType: string): JewelryPlacementResult {
  // Canvas dimensions (1200x900 as used in RealTimeDraggableJewelry component)
  const canvasWidth = 1200;
  const canvasHeight = 900;
  
  const centerX = canvasWidth / 2; // 600px
  const centerY = canvasHeight / 2; // 450px

  switch (jewelryType) {
    case 'necklace':
      return {
        position: { x: centerX, y: centerY * 0.6 }, // Around 270px from top
        scale: 0.6,
        rotation: 0,
        confidence: 0.5
      };
    case 'ring':
      return {
        position: { x: centerX * 1.2, y: centerY * 1.3 }, // 720px, 585px - right hand area
        scale: 0.25,
        rotation: 0,
        confidence: 0.5
      };
    case 'earrings':
      return {
        position: { x: centerX * 0.85, y: centerY * 0.5 }, // 510px, 225px - left ear area
        scale: 0.2,
        rotation: 0,
        confidence: 0.5
      };
    case 'bracelet':
      return {
        position: { x: centerX * 1.15, y: centerY * 1.4 }, // 690px, 630px - right wrist area
        scale: 0.35,
        rotation: 0,
        confidence: 0.5
      };
    default:
      return {
        position: { x: centerX, y: centerY },
        scale: 0.4,
        rotation: 0,
        confidence: 0.5
      };
  }
}

/**
 * Detect image MIME type from buffer
 */
function detectImageMimeType(buffer: Buffer): string {
  // Check PNG signature
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
    return 'image/png';
  }
  
  // Check JPEG signature  
  if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
    return 'image/jpeg';
  }
  
  // Check WebP signature
  if (buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50) {
    return 'image/webp';
  }
  
  // Default to PNG
  return 'image/png';
}

/**
 * Validate positioning result for reasonableness
 */
export function validateJewelryPosition(
  result: JewelryPlacementResult,
  imageWidth: number,
  imageHeight: number
): JewelryPlacementResult {
  // Ensure position is within image bounds
  const validatedX = Math.max(50, Math.min(imageWidth - 50, result.position.x));
  const validatedY = Math.max(50, Math.min(imageHeight - 50, result.position.y));
  
  // Ensure scale is reasonable
  const validatedScale = Math.max(0.1, Math.min(1.5, result.scale));
  
  return {
    ...result,
    position: { x: validatedX, y: validatedY },
    scale: validatedScale
  };
}

import OpenAI from 'openai';

export interface VisionPositioningResult {
  position: { x: number; y: number };
  scale: number;
  confidence: number;
  reasoning: string;
}

/**
 * Use OpenAI Vision to analyze model and jewelry for optimal positioning
 */
export async function analyzeJewelryPositioning(
  modelImageBase64: string,
  jewelryImageBase64: string,
  jewelryType: 'necklace' | 'ring' | 'earrings' | 'bracelet',
  canvasWidth: number = 900,
  canvasHeight: number = 1200
): Promise<VisionPositioningResult> {
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
  });

  try {
    const prompt = buildVisionPrompt(jewelryType, canvasWidth, canvasHeight);
    
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: prompt
            },
            {
              type: "image_url",
              image_url: {
                url: `data:image/jpeg;base64,${modelImageBase64}`,
                detail: "high"
              }
            },
            {
              type: "image_url", 
              image_url: {
                url: `data:image/png;base64,${jewelryImageBase64}`,
                detail: "high"
              }
            }
          ]
        }
      ],
      max_tokens: 500,
      temperature: 0.1
    });

    const analysis = response.choices[0]?.message?.content;
    if (!analysis) {
      throw new Error('No analysis received from OpenAI Vision');
    }

    // Parse the structured response
    const result = parseVisionResponse(analysis, canvasWidth, canvasHeight, jewelryType);
    
    console.log('OpenAI Vision positioning analysis:', result);
    return result;

  } catch (error) {
    console.error('OpenAI Vision positioning failed:', error);
    
    // Return fallback positioning
    return getFallbackPositioning(jewelryType, canvasWidth, canvasHeight);
  }
}

/**
 * Build detailed prompt for vision analysis
 */
function buildVisionPrompt(
  jewelryType: string,
  canvasWidth: number,
  canvasHeight: number
): string {
  return `You are an expert jewelry positioning AI. Analyze these two images:

1. FIRST IMAGE: A portrait photo of a person (model)
2. SECOND IMAGE: A ${jewelryType} jewelry piece with transparent background

Your task: Determine the EXACT pixel coordinates where this ${jewelryType} should be positioned on the model for the most natural, realistic placement.

CANVAS DIMENSIONS: ${canvasWidth}x${canvasHeight} pixels

CRITICAL POSITIONING RULES FOR ${jewelryType.toUpperCase()}:
${getJewelrySpecificInstructions(jewelryType)}

ANALYSIS PROCESS:
1. Identify key anatomical landmarks in the model image (collarbone, chest, neck)
2. For NECKLACES: Position the pendant/focal point on the CHEST area, NOT on the face/chin/neck
3. Consider the jewelry size, style, and typical wearing position
4. Account for perspective, lighting, and model pose
5. Calculate precise pixel coordinates for natural placement

RESPOND IN THIS EXACT JSON FORMAT:
{
  "x": [pixel_x_coordinate],
  "y": [pixel_y_coordinate], 
  "scale": [recommended_scale_0.1_to_2.0],
  "confidence": [confidence_0.0_to_1.0],
  "reasoning": "[brief_explanation_of_positioning_choice]"
}

IMPORTANT: For necklaces, the Y coordinate should place the jewelry on the CHEST/DÉCOLLETAGE area, typically between 40-70% down from the top of the image, NOT on the face or chin area.

Be precise with coordinates. Consider that (0,0) is top-left corner, and jewelry will be centered on the given coordinates.`;
}

/**
 * Get jewelry-specific positioning instructions
 */
function getJewelrySpecificInstructions(jewelryType: string): string {
  switch (jewelryType) {
    case 'necklace':
      return `- Position at the natural necklace line (chest/décolletage area)
- Should sit comfortably on or just below the collarbone
- CRITICAL: Never position on the face, chin, or mouth area
- CRITICAL: Necklace should be in the chest/upper torso region, NOT on the neck itself
- The pendant/focal point should rest on the chest area, below the collarbone
- Avoid positioning too high (neck/chin area) or too low (below chest)
- Consider necklace length - shorter pieces sit higher on chest, longer pieces drape lower on chest
- Account for clothing neckline and body pose
- The chain should follow the natural curve of the chest/décolletage`;

    case 'ring':
      return `- Position on a clearly visible finger (usually ring finger or index finger)
- Should align with finger direction and knuckle placement
- Consider hand pose, perspective, and finger visibility
- Ring should appear to wrap around the finger naturally
- Account for hand position and lighting
- CRITICAL: Must be positioned ON the finger, not floating above or below`;

    case 'earrings':
      return `- Position at the earlobe or ear area
- Should hang naturally from the ear attachment point
- Consider ear visibility, hair coverage, and head angle
- Account for earring style (studs vs dangles)
- Ensure proper perspective and depth
- CRITICAL: Must be positioned AT the ear, not on the face or neck`;

    case 'bracelet':
      return `- Position at wrist area of visible arm/hand
- Should wrap around wrist naturally
- Consider arm position, perspective, and visibility
- Account for bracelet width and style
- Ensure proper alignment with wrist anatomy
- CRITICAL: Must be positioned ON the wrist, not on the hand or forearm`;

    default:
      return `- Position naturally on the appropriate body area
- Consider anatomy, perspective, and realistic placement
- Account for lighting and model pose`;
  }
}

/**
 * Parse OpenAI Vision response into structured result
 */
function parseVisionResponse(
  response: string,
  canvasWidth: number,
  canvasHeight: number,
  jewelryType?: string
): VisionPositioningResult {
  try {
    // Try to extract JSON from the response
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in response');
    }

    const parsed = JSON.parse(jsonMatch[0]);
    
    // Validate and constrain the coordinates
    let x = Math.max(50, Math.min(canvasWidth - 50, parsed.x || canvasWidth / 2));
    let y = Math.max(50, Math.min(canvasHeight - 50, parsed.y || canvasHeight / 2));
    let scale = Math.max(0.1, Math.min(2.0, parsed.scale || 0.4));
    let confidence = Math.max(0.0, Math.min(1.0, parsed.confidence || 0.7));

    // Special validation for necklaces - reject if positioned too high (face/chin area)
    if (jewelryType === 'necklace') {
      const percentageFromTop = y / canvasHeight;
      
      // If necklace is positioned in the top 35% (face/chin area), move it to chest area
      if (percentageFromTop < 0.35) {
        console.warn(`AI positioned necklace too high (${Math.round(percentageFromTop * 100)}% from top). Moving to chest area.`);
        y = canvasHeight * 0.55; // Position at 55% down (chest area)
        confidence = Math.max(0.3, confidence - 0.3); // Lower confidence due to correction
      }
      
      // If positioned too low (below chest), move up
      if (percentageFromTop > 0.75) {
        console.warn(`AI positioned necklace too low (${Math.round(percentageFromTop * 100)}% from top). Moving to chest area.`);
        y = canvasHeight * 0.6; // Position at 60% down (chest area)
        confidence = Math.max(0.3, confidence - 0.3); // Lower confidence due to correction
      }
    }

    return {
      position: { x, y },
      scale,
      confidence,
      reasoning: parsed.reasoning || 'AI-analyzed positioning'
    };

  } catch (error) {
    console.error('Failed to parse vision response:', error);
    console.log('Raw response:', response);
    
    // Extract coordinates using regex as fallback
    const xMatch = response.match(/x[\"']?\s*:\s*(\d+)/i);
    const yMatch = response.match(/y[\"']?\s*:\s*(\d+)/i);
    const scaleMatch = response.match(/scale[\"']?\s*:\s*([\d.]+)/i);
    
    let x = xMatch ? parseInt(xMatch[1]) : canvasWidth / 2;
    let y = yMatch ? parseInt(yMatch[1]) : canvasHeight / 2;
    const scale = scaleMatch ? parseFloat(scaleMatch[1]) : 0.4;
    
    // Apply necklace validation to fallback parsing too
    if (jewelryType === 'necklace') {
      const percentageFromTop = y / canvasHeight;
      if (percentageFromTop < 0.35 || percentageFromTop > 0.75) {
        y = canvasHeight * 0.55; // Safe chest positioning
      }
    }
    
    return {
      position: { 
        x: Math.max(50, Math.min(canvasWidth - 50, x)), 
        y: Math.max(50, Math.min(canvasHeight - 50, y))
      },
      scale: Math.max(0.1, Math.min(2.0, scale)),
      confidence: 0.6,
      reasoning: 'Parsed from text analysis'
    };
  }
}

/**
 * Get fallback positioning when vision analysis fails
 */
function getFallbackPositioning(
  jewelryType: string,
  canvasWidth: number,
  canvasHeight: number
): VisionPositioningResult {
  const centerX = canvasWidth / 2;
  const centerY = canvasHeight / 2;

  switch (jewelryType) {
    case 'necklace':
      return {
        position: { x: centerX, y: canvasHeight * 0.55 }, // Conservative chest positioning at 55%
        scale: 0.35,
        confidence: 0.5,
        reasoning: 'Fallback anatomical positioning for necklace at chest level'
      };
    case 'ring':
      return {
        position: { x: centerX * 1.2, y: centerY * 1.1 }, // Adjusted for taller canvas
        scale: 0.3,
        confidence: 0.5,
        reasoning: 'Fallback hand positioning for ring'
      };
    case 'earrings':
      return {
        position: { x: centerX * 0.85, y: canvasHeight * 0.25 }, // Adjusted for portrait
        scale: 0.25,
        confidence: 0.5,
        reasoning: 'Fallback ear positioning for earrings'
      };
    case 'bracelet':
      return {
        position: { x: centerX * 1.15, y: centerY * 1.2 }, // Adjusted for taller canvas
        scale: 0.4,
        confidence: 0.5,
        reasoning: 'Fallback wrist positioning for bracelet'
      };
    default:
      return {
        position: { x: centerX, y: centerY },
        scale: 0.5,
        confidence: 0.5,
        reasoning: 'Default center positioning'
      };
  }
}

/**
 * Validate that a generated model image doesn't contain jewelry
 */
export async function validateModelHasNoJewelry(
  modelImageBase64: string
): Promise<{ hasJewelry: boolean; confidence: number; detectedItems: string[] }> {
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY 
  });

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `CRITICAL JEWELRY DETECTION TASK:

Analyze this portrait image with extreme precision to detect ANY jewelry or accessories on the person.

You MUST look for these items with maximum scrutiny:

JEWELRY TYPES:
- Necklaces (any length: chokers, pendants, chains, lockets)
- Earrings (studs, hoops, dangles, ear cuffs, ear piercings)
- Rings (on any finger, wedding bands, fashion rings)
- Bracelets (bangles, watches, wristbands, arm bands)
- Anklets, toe rings
- Body jewelry (nose rings, eyebrow piercings, lip piercings)
- Traditional jewelry (mangalsutra, maang tikka, nose pins)

CLOTHING ACCESSORIES:
- Watches, hair clips, headbands
- Metallic clothing elements (buttons, zippers, buckles)
- Decorative pins, brooches
- Any shiny or metallic objects on the person

DETECTION CRITERIA:
- Even tiny, subtle jewelry counts as jewelry
- Partially visible jewelry still counts
- Jewelry in shadow or poor lighting still counts
- If you're unsure, err on the side of "has jewelry"

RESPOND IN THIS EXACT JSON FORMAT:
{
  "hasJewelry": [true/false],
  "confidence": [confidence_0.0_to_1.0],
  "detectedItems": ["specific", "list", "of", "detected", "items"]
}

BE EXTREMELY THOROUGH - Missing jewelry detection is a critical failure.`
            },
            {
              type: "image_url",
              image_url: {
                url: `data:image/jpeg;base64,${modelImageBase64}`,
                detail: "high"
              }
            }
          ]
        }
      ],
      max_tokens: 300,
      temperature: 0.1
    });

    const analysis = response.choices[0]?.message?.content;
    if (!analysis) {
      return { hasJewelry: false, confidence: 0.5, detectedItems: [] };
    }

    // Parse the response
    try {
      const jsonMatch = analysis.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          hasJewelry: parsed.hasJewelry || false,
          confidence: Math.max(0.0, Math.min(1.0, parsed.confidence || 0.7)),
          detectedItems: Array.isArray(parsed.detectedItems) ? parsed.detectedItems : []
        };
      }
    } catch (parseError) {
      console.error('Failed to parse jewelry detection response:', parseError);
    }

    // Fallback: check for jewelry-related keywords with expanded list
    const jewelryKeywords = [
      'ring', 'rings', 'necklace', 'necklaces', 'earring', 'earrings', 'bracelet', 'bracelets', 
      'chain', 'chains', 'pendant', 'pendants', 'jewelry', 'jewellery', 'watch', 'watches',
      'bangle', 'bangles', 'anklet', 'anklets', 'choker', 'chokers', 'locket', 'lockets',
      'stud', 'studs', 'hoop', 'hoops', 'gold', 'silver', 'metallic', 'shiny', 'glinting',
      'mangalsutra', 'nose ring', 'nose pin', 'ear cuff', 'wedding band', 'engagement ring',
      'body jewelry', 'piercing', 'piercings', 'accessory', 'accessories'
    ];
    const hasJewelryKeywords = jewelryKeywords.some(keyword => 
      analysis.toLowerCase().includes(keyword)
    );

    return {
      hasJewelry: hasJewelryKeywords,
      confidence: hasJewelryKeywords ? 0.8 : 0.2, // Higher confidence when keywords found
      detectedItems: hasJewelryKeywords ? ['detected via keyword analysis'] : []
    };

  } catch (error) {
    console.error('Jewelry validation failed:', error);
    return { hasJewelry: false, confidence: 0.3, detectedItems: [] };
  }
}

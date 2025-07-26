import { NextRequest, NextResponse } from 'next/server';
import { findOptimalJewelryPosition } from '@/lib/ai/jewelryPositioning';

export async function POST(req: NextRequest) {
  try {
    const { modelImage, jewelryType } = await req.json();

    // Validate input
    if (!modelImage || !jewelryType) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Model image and jewelry type are required' 
        },
        { status: 400 }
      );
    }

    if (!['necklace', 'ring', 'earrings', 'bracelet'].includes(jewelryType)) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Invalid jewelry type' 
        },
        { status: 400 }
      );
    }

    console.log(`Analyzing ${jewelryType} positioning...`);

    // Convert base64 to buffer
    const imageBuffer = Buffer.from(modelImage, 'base64');

    // Analyze positioning using AI
    const positioning = await findOptimalJewelryPosition(imageBuffer, jewelryType);

    if (!positioning) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Failed to analyze jewelry positioning' 
        },
        { status: 500 }
      );
    }

    console.log('AI positioning result:', positioning);

    return NextResponse.json({
      success: true,
      positioning: {
        position: positioning.position,
        scale: positioning.scale,
        confidence: positioning.confidence,
        anatomyPoints: positioning.anatomyPoints
      }
    });

  } catch (error) {
    console.error('Jewelry positioning API error:', error);
    
    return NextResponse.json(
      { 
        success: false, 
        error: 'Internal server error during positioning analysis' 
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json(
    { 
      message: 'Jewelry positioning API - POST requests only',
      supportedJewelryTypes: ['necklace', 'ring', 'earrings', 'bracelet']
    },
    { status: 405 }
  );
}

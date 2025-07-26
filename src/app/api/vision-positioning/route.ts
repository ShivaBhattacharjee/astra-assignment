import { NextRequest, NextResponse } from 'next/server';
import { analyzeJewelryPositioning } from '@/lib/ai/visionPositioning';

export async function POST(request: NextRequest) {
  try {
    const { modelImage, jewelryImage, jewelryType, canvasWidth, canvasHeight } = await request.json();

    if (!modelImage || !jewelryImage || !jewelryType) {
      return NextResponse.json(
        { error: 'Missing required parameters: modelImage, jewelryImage, or jewelryType' },
        { status: 400 }
      );
    }

    // Remove data URL prefix if present
    const modelBase64 = modelImage.replace(/^data:image\/[a-z]+;base64,/, '');
    const jewelryBase64 = jewelryImage.replace(/^data:image\/[a-z]+;base64,/, '');

    console.log('Starting OpenAI Vision analysis for jewelry positioning...');
    
    const result = await analyzeJewelryPositioning(
      modelBase64,
      jewelryBase64,
      jewelryType,
      canvasWidth || 800,
      canvasHeight || 600
    );

    console.log('Vision positioning analysis complete:', result);

    return NextResponse.json({
      success: true,
      positioning: result,
      method: 'openai-vision'
    });

  } catch (error) {
    console.error('Vision positioning API error:', error);
    return NextResponse.json(
      { 
        error: 'Vision positioning analysis failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

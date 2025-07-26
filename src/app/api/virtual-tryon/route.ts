import { NextRequest, NextResponse } from 'next/server';
import { processVirtualTryOn } from '@/lib/services/virtualTryOnService';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    
    // Extract form data
    const jewelryImage = formData.get('jewelryImage') as File;
    const jewelryType = formData.get('jewelryType') as string;
    const width = parseFloat(formData.get('width') as string);
    const height = parseFloat(formData.get('height') as string);
    const depth = parseFloat(formData.get('depth') as string);
    const demographics = formData.get('demographics') as string;
    const customModel = formData.get('customModel') as File | null;
    
    // Optional position adjustment parameters
    const offsetX = formData.get('offsetX') ? parseFloat(formData.get('offsetX') as string) : 0;
    const offsetY = formData.get('offsetY') ? parseFloat(formData.get('offsetY') as string) : 0;
    
    // Validate required fields
    if (!jewelryImage) {
      return NextResponse.json(
        { error: 'Jewelry image is required' },
        { status: 400 }
      );
    }
    
    if (!jewelryType || !['ring', 'necklace', 'earrings', 'bracelet'].includes(jewelryType)) {
      return NextResponse.json(
        { error: 'Valid jewelry type is required' },
        { status: 400 }
      );
    }

    if (isNaN(width) || isNaN(height) || isNaN(depth)) {
      return NextResponse.json(
        { error: 'Valid dimensions (width, height, depth) are required' },
        { status: 400 }
      );
    }

    // Validate image file types
    const supportedImageTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!supportedImageTypes.includes(jewelryImage.type)) {
      return NextResponse.json(
        { error: `Unsupported image format: ${jewelryImage.type}. Supported formats: JPEG, PNG, WebP` },
        { status: 400 }
      );
    }

    if (customModel && !supportedImageTypes.includes(customModel.type)) {
      return NextResponse.json(
        { error: `Unsupported custom model image format: ${customModel.type}. Supported formats: JPEG, PNG, WebP` },
        { status: 400 }
      );
    }

    // Convert files to buffers
    const jewelryImageBuffer = Buffer.from(await jewelryImage.arrayBuffer());
    let customModelBuffer: Buffer | undefined;
    
    if (customModel) {
      customModelBuffer = Buffer.from(await customModel.arrayBuffer());
    }

    // Process directly - get both model and segmented jewelry
    const result = await processVirtualTryOn({
      jewelryImageBuffer,
      jewelryType,
      dimensions: { width, height, depth },
      demographics: demographics || undefined,
      customModelBuffer,
      positionOffset: { x: offsetX, y: offsetY }, // Pass position adjustment
      returnSeparateImages: true, // Request separate images for canvas
    });

    // Convert result images to base64 for response
    const base64Image = result.imageBuffer ? result.imageBuffer.toString('base64') : null;
    const imageData = base64Image ? `data:image/png;base64,${base64Image}` : null;
    
    // For real-time canvas, also provide separate images
    const modelImageData = result.modelImageBuffer ? 
      `data:image/png;base64,${result.modelImageBuffer.toString('base64')}` : null;
    const jewelryImageData = result.segmentedJewelryBuffer ? 
      `data:image/png;base64,${result.segmentedJewelryBuffer.toString('base64')}` : null;

    return NextResponse.json({
      success: true,
      result: {
        imageUrl: result.imageUrl,
        imageData: imageData, // Base64 encoded processed image
        modelImageData: modelImageData, // Separate model image for canvas
        jewelryImageData: jewelryImageData, // Separate jewelry image for canvas
        jewelryType: jewelryType, // Pass jewelry type to frontend
      },
      message: 'Virtual try-on completed successfully'
    });

  } catch (error) {
    console.error('Virtual try-on processing error:', error);
    
    return NextResponse.json(
      { 
        success: false,
        error: 'Processing failed',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

// Handle OPTIONS for CORS
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}

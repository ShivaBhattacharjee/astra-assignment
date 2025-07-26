// API route for high-fidelity jewelry generation using OpenAI
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

export async function POST(req: NextRequest) {
  try {
    const { compositeImage, jewelryType, enhancementPrompt } = await req.json();

    // Validate input
    if (!compositeImage || !jewelryType) {
      return NextResponse.json(
        {
          success: false,
          error: "Composite image and jewelry type are required",
        },
        { status: 400 }
      );
    }

    const openaiApiKey = process.env.OPENAI_API_KEY;
    if (!openaiApiKey) {
      return NextResponse.json(
        {
          success: false,
          error: "OpenAI API key not configured",
        },
        { status: 500 }
      );
    }

    // Initialize OpenAI client
    const openai = new OpenAI({
      apiKey: openaiApiKey,
    });

    console.log(`🎨 Generating high-fidelity ${jewelryType} image...`);

    // Create sophisticated prompt based on jewelry type
    const prompt = createEnhancementPrompt(jewelryType, enhancementPrompt);

    // Convert base64 image to a File object with proper MIME type
    function base64ToFile(b64: string, filename: string): File {
      const buffer = Buffer.from(
        b64.replace(/^data:image\/\w+;base64,/, ""),
        "base64"
      );
      
      // Create a proper File object with MIME type
      return new File([buffer], filename, {
        type: 'image/png'
      });
    }

    // Create File object from base64
    const personImageFile = base64ToFile(compositeImage, `person-${Date.now()}.png`);

    try {
      // Use OpenAI's GPT Image 1 model for high-fidelity edit with input_fidelity: "high"
      const response = await openai.images.edit({
        model: "gpt-image-1",
        image: personImageFile,
        prompt,
        n: 1,
        size: "1024x1024",
        input_fidelity: "high", 
      });

      console.log("🖼️ High-fidelity image generated:", response.data);

      if (response.data?.[0]?.b64_json) {
        console.log("✅ High-fidelity image generated successfully");

        return NextResponse.json({
          success: true,
          enhancedImage: response.data[0].b64_json,
        });
      } else {
        console.log("❌ No b64_json data found in response:", response.data);
        return NextResponse.json(
          {
            success: false,
            error: "No image data returned from OpenAI",
          },
          { status: 500 }
        );
      }
    } catch (editError) {
      console.error("Image edit error:", editError);
      throw editError;
    }
  } catch (error) {
    console.error("High-fidelity generation error:", error);

    // Handle specific OpenAI errors
    if (
      error instanceof Error &&
      error.message.includes("content_policy_violation")
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Image generation was blocked due to content policy. Please try with a different image or positioning.",
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: "Internal server error during image enhancement",
      },
      { status: 500 }
    );
  }
}


function createEnhancementPrompt(
  jewelryType: string,
  customPrompt?: string
): string {
  if (customPrompt) {
    return customPrompt;
  }

  const basePrompt =
    "Enhance the photorealism of the jewelry being worn by the person in the image. Improve the lighting, shadows, and texture to make it look like a high-resolution studio photograph. Do not change the design of the jewelry however make it look like it has been worn naturally.";

  switch (jewelryType) {
    case "necklace":
      return `${basePrompt} Focus on the necklace, making the metal shine authentically and ensuring it casts realistic shadows on the skin and clothing.`;

    case "earrings":
      return `${basePrompt} Focus on the earrings, making them catch the light realistically and ensuring they cast subtle shadows.`;

    case "ring":
      return `${basePrompt} Focus on the ring, enhancing its metallic or gemstone properties and making it look naturally worn on the finger.`;

    case "bracelet":
      return `${basePrompt} Focus on the bracelet, improving the realism of how it drapes on the wrist and reflects light.`;

    default:
      return basePrompt;
  }
}

export async function GET() {
  return NextResponse.json(
    {
      message: "High-fidelity jewelry enhancement API - POST requests only",
      supportedJewelryTypes: ["necklace", "ring", "earrings", "bracelet"],
    },
    { status: 405 }
  );
}

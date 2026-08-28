import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError) {
      console.error("AUTH ERROR:", authError);

      return NextResponse.json(
        {
          error: "Authentication error",
          details: authError.message,
        },
        { status: 401 }
      );
    }

    if (!user) {
      return NextResponse.json(
        {
          error: "Not authenticated",
        },
        { status: 401 }
      );
    }

    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json(
        {
          error: "No file received",
        },
        { status: 400 }
      );
    }

    const allowedTypes = [
      "image/jpeg",
      "image/png",
      "image/webp",
      "video/mp4",
      "video/quicktime",
    ];

    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        {
          error: `Unsupported file type: ${file.type}`,
        },
        { status: 400 }
      );
    }

    const maxSize = 200 * 1024 * 1024;

    if (file.size > maxSize) {
      return NextResponse.json(
        {
          error: "File is larger than 200 MB",
        },
        { status: 400 }
      );
    }

    const extension =
      file.name.split(".").pop()?.toLowerCase() || "bin";

    const fileName =
      `${crypto.randomUUID()}.${extension}`;

    const filePath =
      `${user.id}/${fileName}`;

    console.log("Uploading:", {
      userId: user.id,
      fileName,
      filePath,
      fileType: file.type,
      fileSize: file.size,
    });

    const {
      data: uploadData,
      error: uploadError,
    } = await supabase.storage
      .from("instagram-scheduled-media")
      .upload(filePath, file, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      console.error(
        "SUPABASE STORAGE ERROR:",
        uploadError
      );

      return NextResponse.json(
        {
          error: "Supabase storage upload failed",
          details: uploadError.message,
          code: uploadError.name,
        },
        { status: 500 }
      );
    }

    const {
      data: publicUrlData,
    } = supabase.storage
      .from("instagram-scheduled-media")
      .getPublicUrl(filePath);

    return NextResponse.json({
      success: true,
      url: publicUrlData.publicUrl,
      path: filePath,
      mediaType: file.type.startsWith("video/")
        ? "video"
        : "image",
    });

  } catch (error) {
    console.error(
      "SCHEDULER UPLOAD ERROR:",
      error
    );

    return NextResponse.json(
      {
        error: "Unexpected upload error",
        details:
          error instanceof Error
            ? error.message
            : String(error),
      },
      { status: 500 }
    );
  }
}
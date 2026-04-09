import { type NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import {
  processImage,
  CV_MAX_FILE_BYTES,
  CV_ALLOWED_MIME_TYPES,
  CvServiceError,
  type CvOperation,
} from "@/lib/services/cv";
import { createSession, updateSession } from "@/lib/storage/sessions";
import { saveArtifact } from "@/lib/storage/artifacts";

const VALID_OPERATIONS: CvOperation[] = ["segment", "analyze", "palette"];

/**
 * POST /api/tools/cv
 *
 * Accepts a multipart form upload containing an image file and a CV operation.
 * Validates the file, proxies it to the internal CV / SAM service, stores the
 * result as a per-user artifact, and records a session entry.
 *
 * Expected form fields:
 *   image     – required, image file
 *   operation – required, one of "segment" | "analyze" | "palette"
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const h = await headers();
  const userId = h.get("x-user-id");
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const imageFile = formData.get("image");
  if (!(imageFile instanceof File)) {
    return NextResponse.json({ error: "Missing image file" }, { status: 400 });
  }

  if (!CV_ALLOWED_MIME_TYPES.includes(imageFile.type)) {
    return NextResponse.json(
      { error: "Unsupported image format" },
      { status: 415 },
    );
  }

  if (imageFile.size > CV_MAX_FILE_BYTES) {
    return NextResponse.json(
      {
        error: `Image file exceeds the ${CV_MAX_FILE_BYTES / (1024 * 1024)} MiB limit`,
      },
      { status: 413 },
    );
  }

  const operationRaw = formData.get("operation");
  if (
    typeof operationRaw !== "string" ||
    !VALID_OPERATIONS.includes(operationRaw as CvOperation)
  ) {
    return NextResponse.json(
      {
        error: `operation must be one of: ${VALID_OPERATIONS.join(", ")}`,
      },
      { status: 400 },
    );
  }
  const operation = operationRaw as CvOperation;

  // Create a pending session before calling the upstream service.
  const session = await createSession(userId, "computer-vision", {
    filename: imageFile.name,
    operation,
  });

  try {
    await updateSession(userId, session.id, { status: "running" });

    const imageBuffer = Buffer.from(await imageFile.arrayBuffer());
    const result = await processImage(imageBuffer, imageFile.name, operation);

    const artifact = await saveArtifact(
      userId,
      session.id,
      result.filename,
      result.mimeType,
      result.data,
    );

    const updatedSession = await updateSession(userId, session.id, {
      status: "complete",
      metadata: {
        filename: imageFile.name,
        operation,
        artifactId: artifact.id,
        mimeType: result.mimeType,
      },
    });

    return NextResponse.json({ session: updatedSession, artifact });
  } catch (err) {
    const message =
      err instanceof CvServiceError ? err.message : "Upstream service error";
    await updateSession(userId, session.id, {
      status: "failed",
      metadata: {
        filename: imageFile.name,
        operation,
        error: message,
      },
    });
    const status = err instanceof CvServiceError ? err.status : 502;
    return NextResponse.json(
      { error: message, sessionId: session.id },
      { status },
    );
  }
}

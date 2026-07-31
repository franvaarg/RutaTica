import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET(request: NextRequest) {
  const filename = request.nextUrl.searchParams.get('file');

  // Only allow specific files for security
  const allowedFiles: Record<string, string> = {
    'bitacora': 'Bitacora_RutaTica.docx',
  };

  if (!filename || !allowedFiles[filename]) {
    return NextResponse.json({ error: 'Archivo no encontrado' }, { status: 404 });
  }

  const filePath = path.join(process.cwd(), allowedFiles[filename]);

  if (!fs.existsSync(filePath)) {
    return NextResponse.json({ error: 'Archivo no existe' }, { status: 404 });
  }

  const fileBuffer = fs.readFileSync(filePath);
  const displayName = allowedFiles[filename];

  return new NextResponse(fileBuffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename="${displayName}"`,
      'Content-Length': fileBuffer.length.toString(),
    },
  });
}

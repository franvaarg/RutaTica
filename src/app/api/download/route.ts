import { invalidQuery, badQuery } from '@/lib/api-validation';
import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'node:fs/promises';
import path from 'path';

const allowedFiles = Object.freeze({
  bitacora: 'Bitacora_RutaTica.docx',
});

function isAllowedFilename(filename: string): filename is keyof typeof allowedFiles {
  return Object.hasOwn(allowedFiles, filename);
}

export async function GET(request: NextRequest) {
  if (invalidQuery(request.nextUrl.searchParams)) return badQuery();
  const filename = request.nextUrl.searchParams.get('file');

  if (typeof filename !== 'string' || !filename || !isAllowedFilename(filename)) {
    return NextResponse.json({ error: 'Archivo no permitido' }, { status: 400 });
  }

  const relativePath = allowedFiles[filename];

  if (!relativePath) {
    return NextResponse.json({ error: 'Archivo no permitido' }, { status: 400 });
  }

  const projectRoot = process.cwd();
  const filePath = path.resolve(projectRoot, relativePath);

  if (!filePath.startsWith(`${projectRoot}${path.sep}`)) {
    return NextResponse.json({ error: 'Archivo no permitido' }, { status: 400 });
  }

  let fileBuffer: Buffer;
  try {
    fileBuffer = await readFile(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return NextResponse.json({ error: 'Archivo no existe' }, { status: 404 });
    }
    console.error('[download] file read failed');
    return NextResponse.json({ error: 'No se pudo descargar el archivo' }, { status: 500 });
  }

  return new NextResponse(new Uint8Array(fileBuffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename="${relativePath}"`,
      'Content-Length': fileBuffer.length.toString(),
    },
  });
}

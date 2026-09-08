import { NextResponse } from 'next/server';

// No authenticated identity exists yet. Do not expose cross-user data.
function unavailable() {
  return NextResponse.json({ error: 'Esta función requiere autenticación y almacenamiento persistente; aún no está disponible.' }, { status: 503 });
}

export const DELETE = unavailable;

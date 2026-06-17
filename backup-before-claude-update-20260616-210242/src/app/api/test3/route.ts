import { NextResponse } from 'next/server'
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

export async function GET() {
  try {
    const dbKeys = Object.keys(db).filter(k => !k.startsWith('_') && k !== 'constructor')

    // Intentar acceder a stop
    let hasStop = false
    let stopCount = 0
    try {
      hasStop = typeof db.stop !== 'undefined'
      if (hasStop) {
        stopCount = await db.stop.count()
      }
    } catch (e: any) {
      console.log('Error accessing db.stop:', e.message)
    }

    return NextResponse.json({
      success: true,
      dbKeys,
      hasStop,
      stopCount,
    })
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error.message,
    })
  }
}

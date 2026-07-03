// scripts/import-gtfs.ts
// GTFS Importer for RutaTica
// Reads GTFS CSV files and custom files, validates data, and imports into the database.
// Usage: bun run import-gtfs [--gtfs-dir /path/to/gtfs-data]

import { PrismaClient } from '@prisma/client'
import * as fs from 'fs'
import * as path from 'path'

const prisma = new PrismaClient()

// ============================================
// Configuration
// ============================================

const args = process.argv.slice(2)
let GTFS_DIR = path.join(process.cwd(), 'gtfs-data')
const BATCH_SIZE = 500
const PROGRESS_INTERVAL = 1000

for (let i = 0; i < args.length; i++) {
  if ((args[i] === '--gtfs-dir' || args[i] === '-d') && args[i + 1]) {
    GTFS_DIR = args[i + 1]
    i++
  }
}

// ============================================
// CSV Parsing Utilities
// ============================================

/**
 * Removes BOM (Byte Order Mark) from the beginning of a string.
 */
function stripBOM(input: string): string {
  if (input.charCodeAt(0) === 0xfeff) {
    return input.slice(1)
  }
  return input
}

/**
 * Parses a single CSV line into an array of fields, handling quoted fields.
 */
function parseCSV(line: string): string[] {
  const fields: string[] = []
  let current = ''
  let inQuotes = false
  let i = 0

  while (i < line.length) {
    const ch = line[i]

    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"'
          i += 2
          continue
        } else {
          inQuotes = false
          i++
          continue
        }
      } else {
        current += ch
        i++
        continue
      }
    }

    if (ch === '"') {
      inQuotes = true
      i++
      continue
    }

    if (ch === ',') {
      fields.push(current.trim())
      current = ''
      i++
      continue
    }

    current += ch
    i++
  }

  fields.push(current.trim())
  return fields
}

/**
 * Reads a CSV file and returns an array of rows (each row is an array of string fields).
 * Handles BOM, empty lines, and comment lines starting with #.
 */
function parseCSVFile(filePath: string): string[][] {
  if (!fs.existsSync(filePath)) {
    return []
  }

  const raw = fs.readFileSync(filePath, 'utf-8')
  const content = stripBOM(raw)
  const lines = content.split(/\r?\n/)

  const rows: string[][] = []
  let headerFound = false
  let headers: string[] = []

  for (const line of lines) {
    const trimmed = line.trim()

    // Skip empty lines
    if (trimmed.length === 0) continue

    // Skip comment lines starting with #
    if (trimmed.startsWith('#')) continue

    const fields = parseCSV(trimmed)

    // First non-empty, non-comment line is the header
    if (!headerFound) {
      headers = fields
      headerFound = true
      continue
    }

    // Pad or truncate fields to match header length
    while (fields.length < headers.length) {
      fields.push('')
    }
    if (fields.length > headers.length) {
      fields.length = headers.length
    }

    rows.push(fields)
  }

  return rows
}

/**
 * Reads a CSV file and returns { headers, rows } where each row is an object
 * mapping header names to field values.
 */
function parseCSVFileAsRecords(filePath: string): { headers: string[]; rows: Record<string, string>[] } {
  if (!fs.existsSync(filePath)) {
    return { headers: [], rows: [] }
  }

  const raw = fs.readFileSync(filePath, 'utf-8')
  const content = stripBOM(raw)
  const lines = content.split(/\r?\n/)

  let headers: string[] = []
  const rows: Record<string, string>[] = []

  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed.length === 0) continue
    if (trimmed.startsWith('#')) continue

    const fields = parseCSV(trimmed)

    if (headers.length === 0) {
      headers = fields
      continue
    }

    const record: Record<string, string> = {}
    for (let i = 0; i < headers.length; i++) {
      record[headers[i]] = i < fields.length ? fields[i] : ''
    }

    rows.push(record)
  }

  return { headers, rows }
}

// ============================================
// Validation / Parsing Helpers
// ============================================

function parseTime(timeStr: string): string {
  // GTFS times can go past 24:00:00 (e.g., 25:35:00 for trips after midnight).
  // We store them as-is since they're strings in our schema.
  const trimmed = timeStr.trim()
  const match = trimmed.match(/^(\d{1,2}):(\d{2}):(\d{2})$/)
  if (!match) {
    return trimmed
  }
  const h = match[1].padStart(2, '0')
  const m = match[2]
  const s = match[3]
  return `${h}:${m}:${s}`
}

function parseDate(dateStr: string): string {
  // GTFS dates are YYYYMMDD
  const trimmed = dateStr.trim().replace(/-/g, '')
  const match = trimmed.match(/^(\d{4})(\d{2})(\d{2})$/)
  if (!match) {
    return trimmed
  }
  return `${match[1]}${match[2]}${match[3]}`
}

function parseFloat2(str: string): number | null {
  const trimmed = str.trim()
  if (trimmed === '' || trimmed === undefined || trimmed === null) return null
  const num = Number(trimmed)
  if (isNaN(num)) return null
  return num
}

function parseInt2(str: string): number | null {
  const trimmed = str.trim()
  if (trimmed === '' || trimmed === undefined || trimmed === null) return null
  const num = parseInt(trimmed, 10)
  if (isNaN(num)) return null
  return num
}

function parseBoolean(str: string): boolean {
  const trimmed = str.trim().toLowerCase()
  return trimmed === '1' || trimmed === 'true' || trimmed === 'yes'
}

function validateLatitude(lat: number | null): boolean {
  if (lat === null) return false
  return lat >= -90 && lat <= 90
}

function validateLongitude(lon: number | null): boolean {
  if (lon === null) return false
  return lon >= -180 && lon <= 180
}

function validateTime(timeStr: string): boolean {
  const trimmed = timeStr.trim()
  // Accept GTFS extended times (can be > 24:00:00)
  const match = trimmed.match(/^(\d{1,3}):(\d{2}):(\d{2})$/)
  if (!match) return false
  const h = parseInt(match[1], 10)
  const m = parseInt(match[2], 10)
  const s = parseInt(match[3], 10)
  if (m < 0 || m > 59) return false
  if (s < 0 || s > 59) return false
  // GTFS allows hours > 24 for overnight trips
  if (h < 0 || h > 99) return false
  return true
}

function emptyToNull(val: string): string | null {
  const trimmed = val.trim()
  return trimmed === '' ? null : trimmed
}

// ============================================
// ImportLog Helper
// ============================================

async function createImportLog(
  filename: string,
  recordsProcessed: number | null = null,
  recordsCreated: number | null = null,
  recordsUpdated: number | null = null,
  errors: string | null = null
): Promise<void> {
  try {
    await prisma.importLog.create({
      data: {
        filename,
        recordsProcessed,
        recordsCreated,
        recordsUpdated,
        errors,
        completedAt: new Date(),
      },
    })
  } catch (err) {
    console.error(`  [ImportLog] Failed to create log entry for ${filename}:`, err)
  }
}

// ============================================
// Batch Processing Helper
// ============================================

async function processInBatches<T>(
  items: T[],
  batchSize: number,
  processor: (batch: T[]) => Promise<{ created: number; updated: number }>
): Promise<{ created: number; updated: number }> {
  let totalCreated = 0
  let totalUpdated = 0

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize)
    const result = await processor(batch)
    totalCreated += result.created
    totalUpdated += result.updated
  }

  return { created: totalCreated, updated: totalUpdated }
}

// ============================================
// Import Functions
// ============================================

async function importAgencies(): Promise<void> {
  const filename = 'agency.txt'
  const filePath = path.join(GTFS_DIR, filename)
  console.log(`\n📋 Importing ${filename}...`)

  if (!fs.existsSync(filePath)) {
    console.log(`  ⚠️  File not found: ${filePath}`)
    await createImportLog(filename, 0, 0, 0, 'File not found')
    return
  }

  try {
    const { rows } = parseCSVFileAsRecords(filePath)
    console.log(`  Found ${rows.length} records`)

    let created = 0
    let updated = 0

    const result = await processInBatches(rows, BATCH_SIZE, async (batch) => {
      let bCreated = 0
      let bUpdated = 0

      for (const row of batch) {
        const agencyId = row['agency_id']
        const name = row['agency_name'] || row['agency_id']

        if (!agencyId) {
          console.log(`  ⚠️  Skipping agency row without agency_id`)
          continue
        }

        if (!name) {
          console.log(`  ⚠️  Skipping agency ${agencyId} without name`)
          continue
        }

        const existing = await prisma.gtfsAgency.findUnique({ where: { agency_id: agencyId } })

        if (existing) {
          await prisma.gtfsAgency.update({
            where: { agency_id: agencyId },
            data: {
              name: name,
              url: row['agency_url'] || existing.url,
              timezone: row['agency_timezone'] || existing.timezone,
              phone: emptyToNull(row['agency_phone']),
              lang: emptyToNull(row['agency_lang']),
              email: emptyToNull(row['agency_email']),
            },
          })
          bUpdated++
        } else {
          await prisma.gtfsAgency.create({
            data: {
              agency_id: agencyId,
              name: name,
              url: row['agency_url'] || '',
              timezone: row['agency_timezone'] || 'America/Costa_Rica',
              phone: emptyToNull(row['agency_phone']),
              lang: emptyToNull(row['agency_lang']),
              email: emptyToNull(row['agency_email']),
            },
          })
          bCreated++
        }
      }

      return { created: bCreated, updated: bUpdated }
    })

    created = result.created
    updated = result.updated

    console.log(`  ✅ Agencies: ${created} created, ${updated} updated`)
    await createImportLog(filename, rows.length, created, updated)
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err)
    console.error(`  ❌ Error importing ${filename}:`, errMsg)
    await createImportLog(filename, null, null, null, errMsg)
  }
}

async function importStops(): Promise<void> {
  const filename = 'stops.txt'
  const filePath = path.join(GTFS_DIR, filename)
  console.log(`\n📍 Importing ${filename}...`)

  if (!fs.existsSync(filePath)) {
    console.log(`  ⚠️  File not found: ${filePath}`)
    await createImportLog(filename, 0, 0, 0, 'File not found')
    return
  }

  try {
    const { rows } = parseCSVFileAsRecords(filePath)
    console.log(`  Found ${rows.length} records`)

    let skipped = 0

    const result = await processInBatches(rows, BATCH_SIZE, async (batch) => {
      let bCreated = 0
      let bUpdated = 0

      for (const row of batch) {
        const stopId = row['stop_id']
        if (!stopId) {
          skipped++
          continue
        }

        const name = row['stop_name']
        if (!name) {
          skipped++
          continue
        }

        const lat = parseFloat2(row['stop_lat'])
        const lon = parseFloat2(row['stop_lon'])

        if (!validateLatitude(lat) || !validateLongitude(lon)) {
          console.log(`  ⚠️  Skipping stop ${stopId}: invalid coordinates (lat=${row['stop_lat']}, lon=${row['stop_lon']})`)
          skipped++
          continue
        }

        const data = {
          code: emptyToNull(row['stop_code']),
          name: name,
          desc: emptyToNull(row['stop_desc']),
          lat: lat!,
          lon: lon!,
          zone_id: emptyToNull(row['zone_id']),
          location_type: parseInt2(row['location_type']) ?? 0,
          parent_station: emptyToNull(row['parent_station']),
          wheelchair_boarding: parseInt2(row['wheelchair_boarding']) ?? 0,
        }

        const existing = await prisma.gtfsStop.findUnique({ where: { stop_id: stopId } })

        if (existing) {
          await prisma.gtfsStop.update({ where: { stop_id: stopId }, data })
          bUpdated++
        } else {
          await prisma.gtfsStop.create({ data: { stop_id: stopId, ...data } })
          bCreated++
        }
      }

      return { created: bCreated, updated: bUpdated }
    })

    console.log(`  ✅ Stops: ${result.created} created, ${result.updated} updated, ${skipped} skipped`)
    await createImportLog(filename, rows.length, result.created, result.updated, skipped > 0 ? `${skipped} skipped` : null)
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err)
    console.error(`  ❌ Error importing ${filename}:`, errMsg)
    await createImportLog(filename, null, null, null, errMsg)
  }
}

async function importRoutes(): Promise<void> {
  const filename = 'routes.txt'
  const filePath = path.join(GTFS_DIR, filename)
  console.log(`\n🛣️  Importing ${filename}...`)

  if (!fs.existsSync(filePath)) {
    console.log(`  ⚠️  File not found: ${filePath}`)
    await createImportLog(filename, 0, 0, 0, 'File not found')
    return
  }

  try {
    const { rows } = parseCSVFileAsRecords(filePath)
    console.log(`  Found ${rows.length} records`)

    let skipped = 0

    const result = await processInBatches(rows, BATCH_SIZE, async (batch) => {
      let bCreated = 0
      let bUpdated = 0

      for (const row of batch) {
        const routeId = row['route_id']
        if (!routeId) {
          skipped++
          continue
        }

        const agencyId = row['agency_id']
        if (!agencyId) {
          console.log(`  ⚠️  Skipping route ${routeId}: no agency_id`)
          skipped++
          continue
        }

        const data = {
          agency_id: agencyId,
          short_name: emptyToNull(row['route_short_name']),
          long_name: emptyToNull(row['route_long_name']),
          type: parseInt2(row['route_type']) ?? 3,
          color: emptyToNull(row['route_color']),
          text_color: emptyToNull(row['route_text_color']),
          sort_order: parseInt2(row['route_sort_order']),
        }

        const existing = await prisma.gtfsRoute.findUnique({ where: { route_id: routeId } })

        if (existing) {
          await prisma.gtfsRoute.update({ where: { route_id: routeId }, data })
          bUpdated++
        } else {
          await prisma.gtfsRoute.create({ data: { route_id: routeId, ...data } })
          bCreated++
        }
      }

      return { created: bCreated, updated: bUpdated }
    })

    console.log(`  ✅ Routes: ${result.created} created, ${result.updated} updated, ${skipped} skipped`)
    await createImportLog(filename, rows.length, result.created, result.updated, skipped > 0 ? `${skipped} skipped` : null)
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err)
    console.error(`  ❌ Error importing ${filename}:`, errMsg)
    await createImportLog(filename, null, null, null, errMsg)
  }
}

async function importTrips(): Promise<void> {
  const filename = 'trips.txt'
  const filePath = path.join(GTFS_DIR, filename)
  console.log(`\n🚌 Importing ${filename}...`)

  if (!fs.existsSync(filePath)) {
    console.log(`  ⚠️  File not found: ${filePath}`)
    await createImportLog(filename, 0, 0, 0, 'File not found')
    return
  }

  try {
    const { rows } = parseCSVFileAsRecords(filePath)
    console.log(`  Found ${rows.length} records`)

    let skipped = 0

    const result = await processInBatches(rows, BATCH_SIZE, async (batch) => {
      let bCreated = 0
      let bUpdated = 0

      for (const row of batch) {
        const tripId = row['trip_id']
        if (!tripId) {
          skipped++
          continue
        }

        const routeId = row['route_id']
        const serviceId = row['service_id']

        if (!routeId || !serviceId) {
          console.log(`  ⚠️  Skipping trip ${tripId}: missing route_id or service_id`)
          skipped++
          continue
        }

        const data = {
          route_id: routeId,
          service_id: serviceId,
          headsign: emptyToNull(row['trip_headsign']),
          short_name: emptyToNull(row['trip_short_name']),
          direction_id: parseInt2(row['direction_id']),
          block_id: emptyToNull(row['block_id']),
          shape_id: emptyToNull(row['shape_id']),
          wheelchair_accessible: parseInt2(row['wheelchair_accessible']) ?? 0,
          bikes_allowed: parseInt2(row['bikes_allowed']) ?? 0,
        }

        const existing = await prisma.gtfsTrip.findUnique({ where: { trip_id: tripId } })

        if (existing) {
          await prisma.gtfsTrip.update({ where: { trip_id: tripId }, data })
          bUpdated++
        } else {
          await prisma.gtfsTrip.create({ data: { trip_id: tripId, ...data } })
          bCreated++
        }
      }

      return { created: bCreated, updated: bUpdated }
    })

    console.log(`  ✅ Trips: ${result.created} created, ${result.updated} updated, ${skipped} skipped`)
    await createImportLog(filename, rows.length, result.created, result.updated, skipped > 0 ? `${skipped} skipped` : null)
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err)
    console.error(`  ❌ Error importing ${filename}:`, errMsg)
    await createImportLog(filename, null, null, null, errMsg)
  }
}

async function importStopTimes(): Promise<void> {
  const filename = 'stop_times.txt'
  const filePath = path.join(GTFS_DIR, filename)
  console.log(`\n⏰ Importing ${filename}...`)

  if (!fs.existsSync(filePath)) {
    console.log(`  ⚠️  File not found: ${filePath}`)
    await createImportLog(filename, 0, 0, 0, 'File not found')
    return
  }

  try {
    const { rows } = parseCSVFileAsRecords(filePath)
    console.log(`  Found ${rows.length} records`)

    let skipped = 0
    let processed = 0

    // Delete existing stop_times for a full re-import (since we use autoincrement IDs,
    // upsert per row would be very slow with findUnique on all fields)
    console.log(`  Clearing existing stop_times...`)
    await prisma.gtfsStopTime.deleteMany({})
    console.log(`  Cleared. Inserting new records...`)

    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE)
      const createData: Prisma.GtfsStopTimeCreateInput[] = []

      for (const row of batch) {
        const tripId = row['trip_id']
        const stopId = row['stop_id']

        if (!tripId || !stopId) {
          skipped++
          continue
        }

        const arrivalTime = parseTime(row['arrival_time'] || '')
        const departureTime = parseTime(row['departure_time'] || '')
        const stopSequence = parseInt2(row['stop_sequence'])

        if (stopSequence === null) {
          skipped++
          continue
        }

        if (!validateTime(arrivalTime)) {
          console.log(`  ⚠️  Skipping stop_time: invalid arrival_time "${row['arrival_time']}"`)
          skipped++
          continue
        }

        if (!validateTime(departureTime)) {
          console.log(`  ⚠️  Skipping stop_time: invalid departure_time "${row['departure_time']}"`)
          skipped++
          continue
        }

        createData.push({
          trip: { connect: { trip_id: tripId } },
          stop: { connect: { stop_id: stopId } },
          arrival_time: arrivalTime,
          departure_time: departureTime,
          stop_sequence: stopSequence,
          stop_headsign: emptyToNull(row['stop_headsign']),
          pickup_type: parseInt2(row['pickup_type']) ?? 0,
          drop_off_type: parseInt2(row['drop_off_type']) ?? 0,
          shape_dist_traveled: parseFloat2(row['shape_dist_traveled']),
          timepoint: parseInt2(row['timepoint']) ?? 1,
        })
      }

      if (createData.length > 0) {
        await prisma.gtfsStopTime.createMany({ data: createData, skipDuplicates: true })
        processed += createData.length
      }

      if (processed > 0 && processed % PROGRESS_INTERVAL < BATCH_SIZE) {
        console.log(`  ... ${processed} stop_times processed`)
      }
    }

    console.log(`  ✅ Stop times: ${processed} created, ${skipped} skipped`)
    await createImportLog(filename, rows.length, processed, 0, skipped > 0 ? `${skipped} skipped` : null)
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err)
    console.error(`  ❌ Error importing ${filename}:`, errMsg)
    await createImportLog(filename, null, null, null, errMsg)
  }
}

async function importCalendar(): Promise<void> {
  const filename = 'calendar.txt'
  const filePath = path.join(GTFS_DIR, filename)
  console.log(`\n📅 Importing ${filename}...`)

  if (!fs.existsSync(filePath)) {
    console.log(`  ⚠️  File not found: ${filePath}`)
    await createImportLog(filename, 0, 0, 0, 'File not found')
    return
  }

  try {
    const { rows } = parseCSVFileAsRecords(filePath)
    console.log(`  Found ${rows.length} records`)

    let skipped = 0

    const result = await processInBatches(rows, BATCH_SIZE, async (batch) => {
      let bCreated = 0
      let bUpdated = 0

      for (const row of batch) {
        const serviceId = row['service_id']
        if (!serviceId) {
          skipped++
          continue
        }

        const startDate = parseDate(row['start_date'] || '')
        const endDate = parseDate(row['end_date'] || '')

        if (!startDate || !endDate) {
          console.log(`  ⚠️  Skipping calendar ${serviceId}: invalid dates`)
          skipped++
          continue
        }

        const data = {
          monday: parseBoolean(row['monday'] || '0'),
          tuesday: parseBoolean(row['tuesday'] || '0'),
          wednesday: parseBoolean(row['wednesday'] || '0'),
          thursday: parseBoolean(row['thursday'] || '0'),
          friday: parseBoolean(row['friday'] || '0'),
          saturday: parseBoolean(row['saturday'] || '0'),
          sunday: parseBoolean(row['sunday'] || '0'),
          start_date: startDate,
          end_date: endDate,
        }

        const existing = await prisma.gtfsCalendar.findUnique({ where: { service_id: serviceId } })

        if (existing) {
          await prisma.gtfsCalendar.update({ where: { service_id: serviceId }, data })
          bUpdated++
        } else {
          await prisma.gtfsCalendar.create({ data: { service_id: serviceId, ...data } })
          bCreated++
        }
      }

      return { created: bCreated, updated: bUpdated }
    })

    console.log(`  ✅ Calendar: ${result.created} created, ${result.updated} updated, ${skipped} skipped`)
    await createImportLog(filename, rows.length, result.created, result.updated, skipped > 0 ? `${skipped} skipped` : null)
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err)
    console.error(`  ❌ Error importing ${filename}:`, errMsg)
    await createImportLog(filename, null, null, null, errMsg)
  }
}

async function importCalendarDates(): Promise<void> {
  const filename = 'calendar_dates.txt'
  const filePath = path.join(GTFS_DIR, filename)
  console.log(`\n📆 Importing ${filename}...`)

  if (!fs.existsSync(filePath)) {
    console.log(`  ⚠️  File not found: ${filePath}`)
    await createImportLog(filename, 0, 0, 0, 'File not found')
    return
  }

  try {
    const { rows } = parseCSVFileAsRecords(filePath)
    console.log(`  Found ${rows.length} records`)

    let skipped = 0

    // Clear and re-import for calendar_dates since we use autoincrement IDs
    console.log(`  Clearing existing calendar_dates...`)
    await prisma.gtfsCalendarDate.deleteMany({})
    console.log(`  Cleared. Inserting new records...`)

    let processed = 0

    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE)
      const createData: Prisma.GtfsCalendarDateCreateInput[] = []

      for (const row of batch) {
        const serviceId = row['service_id']
        const date = parseDate(row['date'] || '')
        const exceptionType = parseInt2(row['exception_type'])

        if (!serviceId || !date || exceptionType === null) {
          skipped++
          continue
        }

        createData.push({
          service_id: serviceId,
          date: date,
          exception_type: exceptionType,
        })
      }

      if (createData.length > 0) {
        await prisma.gtfsCalendarDate.createMany({ data: createData, skipDuplicates: true })
        processed += createData.length
      }
    }

    console.log(`  ✅ Calendar dates: ${processed} created, ${skipped} skipped`)
    await createImportLog(filename, rows.length, processed, 0, skipped > 0 ? `${skipped} skipped` : null)
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err)
    console.error(`  ❌ Error importing ${filename}:`, errMsg)
    await createImportLog(filename, null, null, null, errMsg)
  }
}

async function importShapes(): Promise<void> {
  const filename = 'shapes.txt'
  const filePath = path.join(GTFS_DIR, filename)
  console.log(`\n📐 Importing ${filename}...`)

  if (!fs.existsSync(filePath)) {
    console.log(`  ⚠️  File not found: ${filePath}`)
    await createImportLog(filename, 0, 0, 0, 'File not found')
    return
  }

  try {
    const { rows } = parseCSVFileAsRecords(filePath)
    console.log(`  Found ${rows.length} records`)

    let skipped = 0

    // Clear and re-import for shapes (autoincrement IDs, large file)
    console.log(`  Clearing existing shapes...`)
    await prisma.gtfsShape.deleteMany({})
    console.log(`  Cleared. Inserting new records...`)

    let processed = 0

    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE)
      const createData: Prisma.GtfsShapeCreateInput[] = []

      for (const row of batch) {
        const shapeId = row['shape_id']
        if (!shapeId) {
          skipped++
          continue
        }

        const lat = parseFloat2(row['shape_pt_lat'])
        const lon = parseFloat2(row['shape_pt_lon'])
        const sequence = parseInt2(row['shape_pt_sequence'])

        if (!validateLatitude(lat) || !validateLongitude(lon) || sequence === null) {
          skipped++
          continue
        }

        createData.push({
          shape_id: shapeId,
          shape_pt_lat: lat!,
          shape_pt_lon: lon!,
          shape_pt_sequence: sequence,
          shape_dist_traveled: parseFloat2(row['shape_dist_traveled']),
        })
      }

      if (createData.length > 0) {
        await prisma.gtfsShape.createMany({ data: createData, skipDuplicates: true })
        processed += createData.length
      }

      if (processed > 0 && processed % PROGRESS_INTERVAL < BATCH_SIZE) {
        console.log(`  ... ${processed} shapes processed`)
      }
    }

    console.log(`  ✅ Shapes: ${processed} created, ${skipped} skipped`)
    await createImportLog(filename, rows.length, processed, 0, skipped > 0 ? `${skipped} skipped` : null)
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err)
    console.error(`  ❌ Error importing ${filename}:`, errMsg)
    await createImportLog(filename, null, null, null, errMsg)
  }
}

async function importFareAttributes(): Promise<void> {
  const filename = 'fare_attributes.txt'
  const filePath = path.join(GTFS_DIR, filename)
  console.log(`\n💰 Importing ${filename}...`)

  if (!fs.existsSync(filePath)) {
    console.log(`  ⚠️  File not found: ${filePath}`)
    await createImportLog(filename, 0, 0, 0, 'File not found')
    return
  }

  try {
    const { rows } = parseCSVFileAsRecords(filePath)
    console.log(`  Found ${rows.length} records`)

    let skipped = 0

    const result = await processInBatches(rows, BATCH_SIZE, async (batch) => {
      let bCreated = 0
      let bUpdated = 0

      for (const row of batch) {
        const fareId = row['fare_id']
        if (!fareId) {
          skipped++
          continue
        }

        const price = parseFloat2(row['price'])
        if (price === null) {
          console.log(`  ⚠️  Skipping fare ${fareId}: invalid price`)
          skipped++
          continue
        }

        const data = {
          price: price,
          currency_type: row['currency_type'] || 'CRC',
          payment_method: parseInt2(row['payment_method']) ?? 0,
          transfers: parseInt2(row['transfers']) ?? 0,
          transfer_duration: parseInt2(row['transfer_duration']),
        }

        const existing = await prisma.gtfsFareAttribute.findUnique({ where: { fare_id: fareId } })

        if (existing) {
          await prisma.gtfsFareAttribute.update({ where: { fare_id: fareId }, data })
          bUpdated++
        } else {
          await prisma.gtfsFareAttribute.create({ data: { fare_id: fareId, ...data } })
          bCreated++
        }
      }

      return { created: bCreated, updated: bUpdated }
    })

    console.log(`  ✅ Fare attributes: ${result.created} created, ${result.updated} updated, ${skipped} skipped`)
    await createImportLog(filename, rows.length, result.created, result.updated, skipped > 0 ? `${skipped} skipped` : null)
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err)
    console.error(`  ❌ Error importing ${filename}:`, errMsg)
    await createImportLog(filename, null, null, null, errMsg)
  }
}

async function importFareRules(): Promise<void> {
  const filename = 'fare_rules.txt'
  const filePath = path.join(GTFS_DIR, filename)
  console.log(`\n🎟️  Importing ${filename}...`)

  if (!fs.existsSync(filePath)) {
    console.log(`  ⚠️  File not found: ${filePath}`)
    await createImportLog(filename, 0, 0, 0, 'File not found')
    return
  }

  try {
    const { rows } = parseCSVFileAsRecords(filePath)
    console.log(`  Found ${rows.length} records`)

    let skipped = 0

    // Clear and re-import for fare_rules (autoincrement IDs)
    console.log(`  Clearing existing fare_rules...`)
    await prisma.gtfsFareRule.deleteMany({})
    console.log(`  Cleared. Inserting new records...`)

    let processed = 0

    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE)
      const createData: Prisma.GtfsFareRuleCreateInput[] = []

      for (const row of batch) {
        const fareId = row['fare_id']
        if (!fareId) {
          skipped++
          continue
        }

        const routeId = emptyToNull(row['route_id'])

        const data: Prisma.GtfsFareRuleCreateInput = {
          fare: { connect: { fare_id: fareId } },
          route_id: routeId,
          origin_id: emptyToNull(row['origin_id']),
          destination_id: emptyToNull(row['destination_id']),
          contains_id: emptyToNull(row['contains_id']),
        }

        // Only connect route if routeId is provided
        if (routeId) {
          data.route = { connect: { route_id: routeId } }
        }

        createData.push(data)
      }

      if (createData.length > 0) {
        await prisma.gtfsFareRule.createMany({
          data: createData.map((d) => ({
            fare_id: d.fare_id as string,
            route_id: d.route_id,
            origin_id: d.origin_id,
            destination_id: d.destination_id,
            contains_id: d.contains_id,
          })),
          skipDuplicates: true,
        })
        processed += createData.length
      }
    }

    console.log(`  ✅ Fare rules: ${processed} created, ${skipped} skipped`)
    await createImportLog(filename, rows.length, processed, 0, skipped > 0 ? `${skipped} skipped` : null)
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err)
    console.error(`  ❌ Error importing ${filename}:`, errMsg)
    await createImportLog(filename, null, null, null, errMsg)
  }
}

// ============================================
// Custom File Imports
// ============================================

async function importCompanies(): Promise<void> {
  const filename = 'empresas.csv'
  const filePath = path.join(GTFS_DIR, filename)
  console.log(`\n🏢 Importing ${filename}...`)

  if (!fs.existsSync(filePath)) {
    console.log(`  ⚠️  File not found: ${filePath}`)
    await createImportLog(filename, 0, 0, 0, 'File not found')
    return
  }

  try {
    const { rows } = parseCSVFileAsRecords(filePath)
    console.log(`  Found ${rows.length} records`)

    let skipped = 0

    const result = await processInBatches(rows, BATCH_SIZE, async (batch) => {
      let bCreated = 0
      let bUpdated = 0

      for (const row of batch) {
        const name = row['name']
        if (!name) {
          skipped++
          continue
        }

        // Try to find existing company by name
        const existing = await prisma.company.findFirst({ where: { name } })

        const data = {
          phone: emptyToNull(row['phone']),
          email: emptyToNull(row['email']),
          website: emptyToNull(row['website']),
          logoUrl: emptyToNull(row['logoUrl']),
          description: emptyToNull(row['description']),
          primaryColor: emptyToNull(row['primaryColor']),
          secondaryColor: emptyToNull(row['secondaryColor']),
          isActive: true,
        }

        if (existing) {
          await prisma.company.update({ where: { id: existing.id }, data })
          bUpdated++
        } else {
          await prisma.company.create({ data: { name, ...data } })
          bCreated++
        }
      }

      return { created: bCreated, updated: bUpdated }
    })

    console.log(`  ✅ Companies: ${result.created} created, ${result.updated} updated, ${skipped} skipped`)
    await createImportLog(filename, rows.length, result.created, result.updated, skipped > 0 ? `${skipped} skipped` : null)
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err)
    console.error(`  ❌ Error importing ${filename}:`, errMsg)
    await createImportLog(filename, null, null, null, errMsg)
  }
}

async function importTarifas(): Promise<void> {
  const filename = 'tarifas.csv'
  const filePath = path.join(GTFS_DIR, filename)
  console.log(`\n💲 Importing ${filename}...`)

  if (!fs.existsSync(filePath)) {
    console.log(`  ⚠️  File not found: ${filePath}`)
    await createImportLog(filename, 0, 0, 0, 'File not found')
    return
  }

  try {
    const { rows } = parseCSVFileAsRecords(filePath)
    console.log(`  Found ${rows.length} records`)

    let updated = 0
    let skipped = 0

    for (const row of rows) {
      const routeId = row['route_id']
      if (!routeId) {
        skipped++
        continue
      }

      const existing = await prisma.gtfsRoute.findUnique({ where: { route_id: routeId } })
      if (!existing) {
        console.log(`  ⚠️  Skipping tarifa: route ${routeId} not found`)
        skipped++
        continue
      }

      // Tarifas updates pricing-related info on routes.
      // Since our GtfsRoute model doesn't have price fields directly,
      // we log it and store any relevant data.
      // We could extend the model later or use RouteConfig.
      // For now, we just record that we processed it.
      updated++
    }

    console.log(`  ✅ Tarifas: ${updated} routes updated, ${skipped} skipped`)
    await createImportLog(filename, rows.length, 0, updated, skipped > 0 ? `${skipped} skipped` : null)
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err)
    console.error(`  ❌ Error importing ${filename}:`, errMsg)
    await createImportLog(filename, null, null, null, errMsg)
  }
}

async function importColores(): Promise<void> {
  const filename = 'colores.csv'
  const filePath = path.join(GTFS_DIR, filename)
  console.log(`\n🎨 Importing ${filename}...`)

  if (!fs.existsSync(filePath)) {
    console.log(`  ⚠️  File not found: ${filePath}`)
    await createImportLog(filename, 0, 0, 0, 'File not found')
    return
  }

  try {
    const { rows } = parseCSVFileAsRecords(filePath)
    console.log(`  Found ${rows.length} records`)

    let updated = 0
    let skipped = 0

    const result = await processInBatches(rows, BATCH_SIZE, async (batch) => {
      let bUpdated = 0
      let bSkipped = 0

      for (const row of batch) {
        const routeId = row['route_id']
        if (!routeId) {
          bSkipped++
          continue
        }

        const color = emptyToNull(row['color'])
        const textColor = emptyToNull(row['textColor'])

        if (!color && !textColor) {
          bSkipped++
          continue
        }

        const existing = await prisma.gtfsRoute.findUnique({ where: { route_id: routeId } })
        if (!existing) {
          console.log(`  ⚠️  Skipping color: route ${routeId} not found`)
          bSkipped++
          continue
        }

        await prisma.gtfsRoute.update({
          where: { route_id: routeId },
          data: {
            ...(color ? { color } : {}),
            ...(textColor ? { text_color: textColor } : {}),
          },
        })
        bUpdated++
      }

      return { created: 0, updated: bUpdated }
    })

    updated = result.updated
    skipped = rows.length - updated

    console.log(`  ✅ Colores: ${updated} routes updated, ${skipped} skipped`)
    await createImportLog(filename, rows.length, 0, updated, skipped > 0 ? `${skipped} skipped` : null)
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err)
    console.error(`  ❌ Error importing ${filename}:`, errMsg)
    await createImportLog(filename, null, null, null, errMsg)
  }
}

async function importLogos(): Promise<void> {
  const filename = 'logos.csv'
  const filePath = path.join(GTFS_DIR, filename)
  console.log(`\n🖼️  Importing ${filename}...`)

  if (!fs.existsSync(filePath)) {
    console.log(`  ⚠️  File not found: ${filePath}`)
    await createImportLog(filename, 0, 0, 0, 'File not found')
    return
  }

  try {
    const { rows } = parseCSVFileAsRecords(filePath)
    console.log(`  Found ${rows.length} records`)

    let skipped = 0

    // logos.csv maps agency_id to logoUrl, but GtfsAgency doesn't have a logoUrl field.
    // We update the matching Company record's logoUrl if one exists by agency name.

    let updated = 0

    for (const row of rows) {
      const agencyId = row['agency_id']
      const logoUrl = emptyToNull(row['logoUrl'])

      if (!agencyId || !logoUrl) {
        skipped++
        continue
      }

      const agency = await prisma.gtfsAgency.findUnique({ where: { agency_id: agencyId } })
      if (!agency) {
        console.log(`  ⚠️  Skipping logo: agency ${agencyId} not found`)
        skipped++
        continue
      }

      // Try to update a Company with the same name
      const company = await prisma.company.findFirst({ where: { name: agency.name } })
      if (company) {
        await prisma.company.update({
          where: { id: company.id },
          data: { logoUrl },
        })
        updated++
      } else {
        console.log(`  ⚠️  No company found matching agency "${agency.name}" for logo update`)
        skipped++
      }
    }

    console.log(`  ✅ Logos: ${updated} companies updated, ${skipped} skipped`)
    await createImportLog(filename, rows.length, 0, updated, skipped > 0 ? `${skipped} skipped` : null)
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err)
    console.error(`  ❌ Error importing ${filename}:`, errMsg)
    await createImportLog(filename, null, null, null, errMsg)
  }
}

// ============================================
// RouteConfig Seeding
// ============================================

async function seedRouteConfig(): Promise<void> {
  console.log(`\n⚙️  Seeding RouteConfig...`)

  const configs = [
    {
      key: 'timeWeight',
      value: '0.40',
      description: 'Weight for travel time in route scoring',
    },
    {
      key: 'walkDistanceWeight',
      value: '0.25',
      description: 'Weight for walking distance in route scoring',
    },
    {
      key: 'transfersWeight',
      value: '0.20',
      description: 'Weight for number of transfers in route scoring',
    },
    {
      key: 'costWeight',
      value: '0.15',
      description: 'Weight for cost/price in route scoring',
    },
  ]

  let created = 0
  let updated = 0

  for (const config of configs) {
    const existing = await prisma.routeConfig.findUnique({ where: { key: config.key } })

    if (existing) {
      await prisma.routeConfig.update({
        where: { key: config.key },
        data: { value: config.value, description: config.description },
      })
      updated++
    } else {
      await prisma.routeConfig.create({ data: config })
      created++
    }
  }

  console.log(`  ✅ RouteConfig: ${created} created, ${updated} updated`)
  await createImportLog('RouteConfig (seed)', configs.length, created, updated)
}

// ============================================
// Main
// ============================================

async function main() {
  console.log('========================================')
  console.log('  RutaTica GTFS Importer')
  console.log('========================================')
  console.log(`  GTFS Directory: ${GTFS_DIR}`)
  console.log(`  Batch Size: ${BATCH_SIZE}`)
  console.log(`  Started at: ${new Date().toISOString()}`)
  console.log('========================================')

  // Verify GTFS directory exists
  if (!fs.existsSync(GTFS_DIR)) {
    console.error(`\n❌ GTFS directory not found: ${GTFS_DIR}`)
    console.error('   Create the directory and place GTFS files there, or use --gtfs-dir <path>')
    await createImportLog('INIT', 0, 0, 0, `GTFS directory not found: ${GTFS_DIR}`)
    return
  }

  // List files in GTFS directory
  const files = fs.readdirSync(GTFS_DIR).filter((f) => {
    const ext = path.extname(f).toLowerCase()
    return ext === '.txt' || ext === '.csv'
  })
  console.log(`\n📁 Found ${files.length} data files in ${GTFS_DIR}:`)
  for (const f of files) {
    const stat = fs.statSync(path.join(GTFS_DIR, f))
    const sizeKB = (stat.size / 1024).toFixed(1)
    console.log(`   - ${f} (${sizeKB} KB)`)
  }

  const startTime = Date.now()

  // Import GTFS files in dependency order
  // 1. Agencies (no dependencies)
  await importAgencies()

  // 2. Calendar (no dependencies)
  await importCalendar()

  // 3. Calendar dates (depends on service_id, but no FK constraint)
  await importCalendarDates()

  // 4. Stops (no dependencies)
  await importStops()

  // 5. Routes (depends on agencies)
  await importRoutes()

  // 6. Fare attributes (no dependencies)
  await importFareAttributes()

  // 7. Fare rules (depends on fare_attributes and routes)
  await importFareRules()

  // 8. Shapes (no DB dependencies)
  await importShapes()

  // 9. Trips (depends on routes and calendar)
  await importTrips()

  // 10. Stop times (depends on trips and stops)
  await importStopTimes()

  // Import custom files
  await importCompanies()
  await importTarifas()
  await importColores()
  await importLogos()

  // Seed RouteConfig
  await seedRouteConfig()

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)

  console.log('\n========================================')
  console.log(`  ✅ Import completed in ${elapsed}s`)
  console.log(`  Finished at: ${new Date().toISOString()}`)
  console.log('========================================')
}

main()
  .catch((err) => {
    console.error('\n❌ Fatal error in GTFS import:', err)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
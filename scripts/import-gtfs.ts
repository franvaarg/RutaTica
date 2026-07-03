// scripts/import-gtfs.ts
// GTFS Importer for RutaTica
// Reads GTFS CSV files and custom files, validates data, and imports into the database.
// Usage: bun run scripts/import-gtfs.ts [--gtfs-dir /path/to/gtfs-data]

import { PrismaClient } from '@prisma/client'
import * as fs from 'fs'
import * as path from 'path'
import { parse } from 'csv-parse/sync'

const prisma = new PrismaClient()

// ============================================
// Configuration
// ============================================

const args = process.argv.slice(2)
let GTFS_DIR = path.join(process.cwd(), 'gtfs-data')

for (let i = 0; i < args.length; i++) {
  if ((args[i] === '--gtfs-dir' || args[i] === '-d') && args[i + 1]) {
    GTFS_DIR = args[i + 1]
    i++
  }
}

// ============================================
// Utilities
// ============================================

interface ImportStats {
  processed: number
  created: number
  updated: number
  errors: string[]
}

function makeStats(): ImportStats {
  return { processed: 0, created: 0, updated: 0, errors: [] }
}

function logStats(label: string, stats: ImportStats) {
  console.log(
    `  [${label}] processed=${stats.processed} created=${stats.created} updated=${stats.updated} errors=${stats.errors.length}`
  )
  if (stats.errors.length > 0) {
    for (const err of stats.errors.slice(0, 10)) {
      console.log(`    ERROR: ${err}`)
    }
    if (stats.errors.length > 10) {
      console.log(`    ... and ${stats.errors.length - 10} more errors`)
    }
  }
}

async function recordImportLog(filename: string, stats: ImportStats) {
  try {
    await prisma.importLog.create({
      data: {
        filename,
        recordsProcessed: stats.processed,
        recordsCreated: stats.created,
        recordsUpdated: stats.updated,
        errors: stats.errors.length > 0 ? stats.errors.join('\n') : null,
        completedAt: new Date(),
      },
    })
  } catch (e) {
    console.log(`  [WARN] Could not write ImportLog for ${filename}: ${e}`)
  }
}

/**
 * Reads and parses a CSV file using csv-parse/sync.
 * Returns array of objects. Empty result if file not found.
 */
function readCsvFile(filename: string): Record<string, string>[] {
  const filePath = path.join(GTFS_DIR, filename)
  if (!fs.existsSync(filePath)) {
    console.log(`  [SKIP] File not found: ${filename}`)
    return []
  }
  const content = fs.readFileSync(filePath, 'utf-8')
  const records = parse(content, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_quotes: true,
    relax_column_count: true,
  })
  return records as Record<string, string>[]
}

function safeFloat(val: string | undefined | null, fallback = 0): number {
  if (!val || val.trim() === '') return fallback
  const n = parseFloat(val)
  return isNaN(n) ? fallback : n
}

function safeInt(val: string | undefined | null, fallback = 0): number {
  if (!val || val.trim() === '') return fallback
  const n = parseInt(val, 10)
  return isNaN(n) ? fallback : n
}

// ============================================
// Import: Agency
// ============================================

async function importAgencies(): Promise<ImportStats> {
  const stats = makeStats()
  const rows = readCsvFile('agency.txt')
  if (rows.length === 0) return stats

  console.log(`  Importing ${rows.length} agencies...`)

  for (const row of rows) {
    stats.processed++
    try {
      const agency_id = row.agency_id
      if (!agency_id) {
        stats.errors.push(`Row ${stats.processed}: missing agency_id`)
        continue
      }
      const existing = await prisma.gtfsAgency.findUnique({ where: { agency_id } })
      const data = {
        name: row.agency_name || agency_id,
        url: row.agency_url || '',
        timezone: row.agency_timezone || 'America/Costa_Rica',
        phone: row.agency_phone || null,
        lang: row.agency_lang || null,
        email: row.agency_email || null,
      }
      if (existing) {
        await prisma.gtfsAgency.update({ where: { agency_id }, data })
        stats.updated++
      } else {
        await prisma.gtfsAgency.create({ data: { agency_id, ...data } })
        stats.created++
      }
    } catch (e) {
      stats.errors.push(`Agency ${row.agency_id}: ${e}`)
    }
  }

  logStats('agencies', stats)
  return stats
}

// ============================================
// Import: Calendar
// ============================================

async function importCalendar(): Promise<ImportStats> {
  const stats = makeStats()
  const rows = readCsvFile('calendar.txt')
  if (rows.length === 0) return stats

  console.log(`  Importing ${rows.length} calendar entries...`)

  for (const row of rows) {
    stats.processed++
    try {
      const service_id = row.service_id
      if (!service_id) {
        stats.errors.push(`Row ${stats.processed}: missing service_id`)
        continue
      }
      const toBool = (v: string) => v === '1'
      const data = {
        monday: toBool(row.monday),
        tuesday: toBool(row.tuesday),
        wednesday: toBool(row.wednesday),
        thursday: toBool(row.thursday),
        friday: toBool(row.friday),
        saturday: toBool(row.saturday),
        sunday: toBool(row.sunday),
        start_date: row.start_date || '20240101',
        end_date: row.end_date || '20261231',
      }
      const existing = await prisma.gtfsCalendar.findUnique({ where: { service_id } })
      if (existing) {
        await prisma.gtfsCalendar.update({ where: { service_id }, data })
        stats.updated++
      } else {
        await prisma.gtfsCalendar.create({ data: { service_id, ...data } })
        stats.created++
      }
    } catch (e) {
      stats.errors.push(`Calendar ${row.service_id}: ${e}`)
    }
  }

  logStats('calendar', stats)
  return stats
}

// ============================================
// Import: Calendar Dates
// ============================================

async function importCalendarDates(): Promise<ImportStats> {
  const stats = makeStats()
  const rows = readCsvFile('calendar_dates.txt')
  if (rows.length === 0) return stats

  console.log(`  Importing ${rows.length} calendar date exceptions...`)

  await prisma.$transaction(async (tx) => {
    for (const row of rows) {
      stats.processed++
      try {
        const service_id = row.service_id
        const date = row.date
        if (!service_id || !date) {
          stats.errors.push(`Row ${stats.processed}: missing service_id or date`)
          continue
        }
        const exception_type = safeInt(row.exception_type, 1)
        const dedup = await tx.gtfsCalendarDate.findFirst({
          where: { service_id, date, exception_type },
        })
        if (dedup) {
          stats.updated++
        } else {
          await tx.gtfsCalendarDate.create({
            data: { service_id, date, exception_type },
          })
          stats.created++
        }
      } catch (e) {
        stats.errors.push(`CalendarDate ${row.service_id}/${row.date}: ${e}`)
      }
    }
  })

  logStats('calendar_dates', stats)
  return stats
}

// ============================================
// Import: Routes
// ============================================

async function importRoutes(): Promise<ImportStats> {
  const stats = makeStats()
  const rows = readCsvFile('routes.txt')
  if (rows.length === 0) return stats

  console.log(`  Importing ${rows.length} routes...`)

  for (const row of rows) {
    stats.processed++
    try {
      const route_id = row.route_id
      const agency_id = row.agency_id
      if (!route_id || !agency_id) {
        stats.errors.push(`Row ${stats.processed}: missing route_id or agency_id`)
        continue
      }
      const data = {
        agency_id,
        short_name: row.route_short_name || null,
        long_name: row.route_long_name || null,
        type: safeInt(row.route_type, 3),
        color: row.route_color || null,
        text_color: row.route_text_color || null,
        sort_order: row.route_sort_order ? safeInt(row.route_sort_order) : null,
      }
      const existing = await prisma.gtfsRoute.findUnique({ where: { route_id } })
      if (existing) {
        await prisma.gtfsRoute.update({ where: { route_id }, data })
        stats.updated++
      } else {
        await prisma.gtfsRoute.create({ data: { route_id, ...data } })
        stats.created++
      }
    } catch (e) {
      stats.errors.push(`Route ${row.route_id}: ${e}`)
    }
  }

  logStats('routes', stats)
  return stats
}

// ============================================
// Import: Stops
// ============================================

async function importStops(): Promise<ImportStats> {
  const stats = makeStats()
  const rows = readCsvFile('stops.txt')
  if (rows.length === 0) return stats

  console.log(`  Importing ${rows.length} stops...`)

  for (const row of rows) {
    stats.processed++
    try {
      const stop_id = row.stop_id
      const stop_name = row.stop_name
      if (!stop_id || !stop_name) {
        stats.errors.push(`Row ${stats.processed}: missing stop_id or stop_name`)
        continue
      }
      const lat = safeFloat(row.stop_lat)
      const lon = safeFloat(row.stop_lon)
      if (lat === 0 && lon === 0) {
        stats.errors.push(`Stop ${stop_id}: invalid coordinates (${row.stop_lat}, ${row.stop_lon})`)
        continue
      }
      const data = {
        code: row.stop_code || null,
        name: stop_name,
        desc: row.stop_desc || null,
        lat,
        lon,
        zone_id: row.zone_id || null,
        location_type: safeInt(row.location_type, 0),
        parent_station: row.parent_station || null,
        wheelchair_boarding: safeInt(row.wheelchair_boarding, 0),
      }
      const existing = await prisma.gtfsStop.findUnique({ where: { stop_id } })
      if (existing) {
        await prisma.gtfsStop.update({ where: { stop_id }, data })
        stats.updated++
      } else {
        await prisma.gtfsStop.create({ data: { stop_id, ...data } })
        stats.created++
      }
    } catch (e) {
      stats.errors.push(`Stop ${row.stop_id}: ${e}`)
    }
  }

  logStats('stops', stats)
  return stats
}

// ============================================
// Import: Trips
// ============================================

async function importTrips(): Promise<ImportStats> {
  const stats = makeStats()
  const rows = readCsvFile('trips.txt')
  if (rows.length === 0) return stats

  console.log(`  Importing ${rows.length} trips...`)

  for (const row of rows) {
    stats.processed++
    try {
      const trip_id = row.trip_id
      const route_id = row.route_id
      const service_id = row.service_id
      if (!trip_id || !route_id || !service_id) {
        stats.errors.push(`Row ${stats.processed}: missing trip_id, route_id, or service_id`)
        continue
      }
      const data = {
        route_id,
        service_id,
        headsign: row.trip_headsign || null,
        short_name: row.trip_short_name || null,
        direction_id: row.direction_id ? safeInt(row.direction_id) : null,
        block_id: row.block_id || null,
        shape_id: row.shape_id || null,
        wheelchair_accessible: safeInt(row.wheelchair_accessible, 0),
        bikes_allowed: safeInt(row.bikes_allowed, 0),
      }
      const existing = await prisma.gtfsTrip.findUnique({ where: { trip_id } })
      if (existing) {
        await prisma.gtfsTrip.update({ where: { trip_id }, data })
        stats.updated++
      } else {
        await prisma.gtfsTrip.create({ data: { trip_id, ...data } })
        stats.created++
      }
    } catch (e) {
      stats.errors.push(`Trip ${row.trip_id}: ${e}`)
    }
  }

  logStats('trips', stats)
  return stats
}

// ============================================
// Import: Stop Times
// ============================================

async function importStopTimes(): Promise<ImportStats> {
  const stats = makeStats()
  const rows = readCsvFile('stop_times.txt')
  if (rows.length === 0) return stats

  console.log(`  Importing ${rows.length} stop times (in batches)...`)

  // Delete existing stop times and re-insert for idempotency
  await prisma.gtfsStopTime.deleteMany({})
  console.log(`  Cleared existing stop_times for fresh import.`)

  const BATCH = 500
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH)
    try {
      await prisma.$transaction(async (tx) => {
        for (const row of batch) {
          stats.processed++
          try {
            const trip_id = row.trip_id
            const stop_id = row.stop_id
            if (!trip_id || !stop_id) {
              stats.errors.push(`Row ${stats.processed}: missing trip_id or stop_id`)
              continue
            }
            await tx.gtfsStopTime.create({
              data: {
                trip_id,
                stop_id,
                arrival_time: row.arrival_time || '00:00:00',
                departure_time: row.departure_time || '00:00:00',
                stop_sequence: safeInt(row.stop_sequence, 0),
                stop_headsign: row.stop_headsign || null,
                pickup_type: safeInt(row.pickup_type, 0),
                drop_off_type: safeInt(row.drop_off_type, 0),
                shape_dist_traveled: row.shape_dist_traveled
                  ? safeFloat(row.shape_dist_traveled)
                  : null,
                timepoint: safeInt(row.timepoint, 1),
              },
            })
            stats.created++
          } catch (e) {
            stats.errors.push(`StopTime ${row.trip_id}/${row.stop_id}: ${e}`)
          }
        }
      })
    } catch (e) {
      console.log(`  [WARN] Batch ${Math.floor(i / BATCH) + 1} failed: ${e}`)
    }
  }

  logStats('stop_times', stats)
  return stats
}

// ============================================
// Import: Shapes
// ============================================

async function importShapes(): Promise<ImportStats> {
  const stats = makeStats()
  const rows = readCsvFile('shapes.txt')
  if (rows.length === 0) return stats

  console.log(`  Importing ${rows.length} shape points (in batches)...`)

  // Delete existing shapes and re-insert for idempotency
  await prisma.gtfsShape.deleteMany({})
  console.log(`  Cleared existing shapes for fresh import.`)

  const BATCH = 500
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH)
    try {
      await prisma.$transaction(async (tx) => {
        for (const row of batch) {
          stats.processed++
          try {
            const shape_id = row.shape_id
            if (!shape_id) {
              stats.errors.push(`Row ${stats.processed}: missing shape_id`)
              continue
            }
            await tx.gtfsShape.create({
              data: {
                shape_id,
                shape_pt_lat: safeFloat(row.shape_pt_lat),
                shape_pt_lon: safeFloat(row.shape_pt_lon),
                shape_pt_sequence: safeInt(row.shape_pt_sequence, 0),
                shape_dist_traveled: row.shape_dist_traveled
                  ? safeFloat(row.shape_dist_traveled)
                  : null,
              },
            })
            stats.created++
          } catch (e) {
            stats.errors.push(`Shape ${row.shape_id}/${row.shape_pt_sequence}: ${e}`)
          }
        }
      })
    } catch (e) {
      console.log(`  [WARN] Batch ${Math.floor(i / BATCH) + 1} failed: ${e}`)
    }
  }

  logStats('shapes', stats)
  return stats
}

// ============================================
// Import: Fare Attributes
// ============================================

async function importFareAttributes(): Promise<ImportStats> {
  const stats = makeStats()
  const rows = readCsvFile('fare_attributes.txt')
  if (rows.length === 0) return stats

  console.log(`  Importing ${rows.length} fare attributes...`)

  for (const row of rows) {
    stats.processed++
    try {
      const fare_id = row.fare_id
      if (!fare_id) {
        stats.errors.push(`Row ${stats.processed}: missing fare_id`)
        continue
      }
      const data = {
        price: safeFloat(row.price, 0),
        currency_type: row.currency_type || 'CRC',
        payment_method: safeInt(row.payment_method, 0),
        transfers: safeInt(row.transfers, 0),
        transfer_duration: row.transfer_duration ? safeInt(row.transfer_duration) : null,
      }
      const existing = await prisma.gtfsFareAttribute.findUnique({ where: { fare_id } })
      if (existing) {
        await prisma.gtfsFareAttribute.update({ where: { fare_id }, data })
        stats.updated++
      } else {
        await prisma.gtfsFareAttribute.create({ data: { fare_id, ...data } })
        stats.created++
      }
    } catch (e) {
      stats.errors.push(`FareAttribute ${row.fare_id}: ${e}`)
    }
  }

  logStats('fare_attributes', stats)
  return stats
}

// ============================================
// Import: Fare Rules
// ============================================

async function importFareRules(): Promise<ImportStats> {
  const stats = makeStats()
  const rows = readCsvFile('fare_rules.txt')
  if (rows.length === 0) return stats

  console.log(`  Importing ${rows.length} fare rules...`)

  // Delete existing and re-insert for idempotency
  await prisma.gtfsFareRule.deleteMany({})
  console.log(`  Cleared existing fare_rules for fresh import.`)

  try {
    await prisma.$transaction(async (tx) => {
      for (const row of rows) {
        stats.processed++
        try {
          const fare_id = row.fare_id
          if (!fare_id) {
            stats.errors.push(`Row ${stats.processed}: missing fare_id`)
            continue
          }
          await tx.gtfsFareRule.create({
            data: {
              fare_id,
              route_id: row.route_id || null,
              origin_id: row.origin_id || null,
              destination_id: row.destination_id || null,
              contains_id: row.contains_id || null,
            },
          })
          stats.created++
        } catch (e) {
          stats.errors.push(`FareRule ${row.fare_id}/${row.route_id}: ${e}`)
        }
      }
    })
  } catch (e) {
    console.log(`  [WARN] Fare rules transaction failed: ${e}`)
  }

  logStats('fare_rules', stats)
  return stats
}

// ============================================
// Import: Custom - Empresas (Company)
// ============================================

async function importEmpresas(): Promise<ImportStats> {
  const stats = makeStats()
  const rows = readCsvFile('empresas.csv')
  if (rows.length === 0) return stats

  console.log(`  Importing ${rows.length} empresas (companies)...`)

  for (const row of rows) {
    stats.processed++
    try {
      const name = row.name
      if (!name) {
        stats.errors.push(`Row ${stats.processed}: missing company name`)
        continue
      }
      const existing = await prisma.company.findFirst({ where: { name } })
      const data = {
        phone: row.phone || null,
        email: row.email || null,
        website: row.website || null,
        logoUrl: row.logo || null,
        description: row.description || null,
        primaryColor: null,
        secondaryColor: null,
        isActive: true,
      }
      if (existing) {
        await prisma.company.update({ where: { id: existing.id }, data })
        stats.updated++
      } else {
        await prisma.company.create({ data: { name, ...data } })
        stats.created++
      }
    } catch (e) {
      stats.errors.push(`Company ${row.name}: ${e}`)
    }
  }

  logStats('empresas', stats)
  return stats
}

// ============================================
// Import: Custom - Colores (RouteColor)
// ============================================

async function importColores(): Promise<ImportStats> {
  const stats = makeStats()
  const rows = readCsvFile('colores.csv')
  if (rows.length === 0) return stats

  console.log(`  Importing ${rows.length} route colors...`)

  for (const row of rows) {
    stats.processed++
    try {
      const route_id = row.route_id
      if (!route_id) {
        stats.errors.push(`Row ${stats.processed}: missing route_id`)
        continue
      }
      const color = row.color
      const textColor = row.text_color
      if (!color || !textColor) {
        stats.errors.push(`Row ${stats.processed}: missing color or text_color for ${route_id}`)
        continue
      }
      // Verify route exists
      const routeExists = await prisma.gtfsRoute.findUnique({ where: { route_id } })
      if (!routeExists) {
        stats.errors.push(`Route ${route_id} not found, skipping color`)
        continue
      }
      const existing = await prisma.routeColor.findUnique({ where: { routeId: route_id } })
      if (existing) {
        await prisma.routeColor.update({
          where: { routeId: route_id },
          data: { color, textColor },
        })
        stats.updated++
      } else {
        await prisma.routeColor.create({
          data: { routeId: route_id, color, textColor },
        })
        stats.created++
      }
    } catch (e) {
      stats.errors.push(`RouteColor ${row.route_id}: ${e}`)
    }
  }

  logStats('colores', stats)
  return stats
}

// ============================================
// Import: Custom - Tarifas (StopRoute linking)
// ============================================

async function importTarifas(): Promise<ImportStats> {
  const stats = makeStats()
  const rows = readCsvFile('tarifas.csv')
  if (rows.length === 0) return stats

  console.log(`  Importing ${rows.length} tarifas (fare-route links)...`)

  // Delete existing StopRoutes and re-insert for idempotency
  await prisma.stopRoute.deleteMany({})
  console.log(`  Cleared existing stop_routes for fresh import.`)

  try {
    await prisma.$transaction(async (tx) => {
      for (const row of rows) {
        stats.processed++
        try {
          const route_id = row.route_id
          if (!route_id) {
            stats.errors.push(`Row ${stats.processed}: missing route_id`)
            continue
          }
          // Verify route exists
          const route = await tx.gtfsRoute.findUnique({ where: { route_id } })
          if (!route) {
            stats.errors.push(`Route ${route_id} not found for tarifa`)
            continue
          }

          // Get the first stop of this route from stop_times to create a StopRoute entry
          const firstStopTime = await tx.gtfsStopTime.findFirst({
            where: { trip_id: { in: route.trips ? undefined : [] } },
            orderBy: { stop_sequence: 'asc' },
          })

          // Find any trip for this route to get stops
          const anyTrip = await tx.gtfsTrip.findFirst({ where: { route_id } })
          if (!anyTrip) {
            stats.errors.push(`No trips found for route ${route_id}`)
            continue
          }

          const stopTimes = await tx.gtfsStopTime.findMany({
            where: { trip_id: anyTrip.trip_id },
            orderBy: { stop_sequence: 'asc' },
          })

          for (let idx = 0; idx < stopTimes.length; idx++) {
            await tx.stopRoute.create({
              data: {
                stopId: stopTimes[idx].stop_id,
                routeId: route_id,
                company: route.agency_id,
                sequence: idx + 1,
              },
            })
            stats.created++
          }
        } catch (e) {
          stats.errors.push(`Tarifa ${row.route_id}: ${e}`)
        }
      }
    })
  } catch (e) {
    console.log(`  [WARN] Tarifas transaction failed: ${e}`)
  }

  logStats('tarifas', stats)
  return stats
}

// ============================================
// Main Import Runner
// ============================================

async function main() {
  const startTime = Date.now()

  console.log('============================================')
  console.log('  RutaTica GTFS Importer')
  console.log(`  GTFS Data Directory: ${GTFS_DIR}`)
  console.log('============================================\n')

  if (!fs.existsSync(GTFS_DIR)) {
    console.error(`ERROR: GTFS directory not found: ${GTFS_DIR}`)
    process.exit(1)
  }

  const files = fs.readdirSync(GTFS_DIR)
  console.log(`  Files found: ${files.join(', ')}\n`)

  // Import order matters: agencies first, then calendar, then routes, then trips/stops
  const importers = [
    { label: 'agency.txt', fn: importAgencies },
    { label: 'calendar.txt', fn: importCalendar },
    { label: 'calendar_dates.txt', fn: importCalendarDates },
    { label: 'routes.txt', fn: importRoutes },
    { label: 'stops.txt', fn: importStops },
    { label: 'trips.txt', fn: importTrips },
    { label: 'stop_times.txt', fn: importStopTimes },
    { label: 'shapes.txt', fn: importShapes },
    { label: 'fare_attributes.txt', fn: importFareAttributes },
    { label: 'fare_rules.txt', fn: importFareRules },
    { label: 'empresas.csv', fn: importEmpresas },
    { label: 'colores.csv', fn: importColores },
    { label: 'tarifas.csv', fn: importTarifas },
  ]

  const totals = makeStats()

  for (const importer of importers) {
    console.log(`--- ${importer.label} ---`)
    const stats = await importer.fn()
    totals.processed += stats.processed
    totals.created += stats.created
    totals.updated += stats.updated
    totals.errors.push(...stats.errors)
    await recordImportLog(importer.label, stats)
    console.log()
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)

  console.log('============================================')
  console.log('  Import Complete')
  console.log('============================================')
  console.log(`  Total processed: ${totals.processed}`)
  console.log(`  Total created:   ${totals.created}`)
  console.log(`  Total updated:   ${totals.updated}`)
  console.log(`  Total errors:    ${totals.errors.length}`)
  console.log(`  Elapsed time:    ${elapsed}s`)
  console.log('============================================')

  if (totals.errors.length > 0) {
    console.log(`\n  WARNING: ${totals.errors.length} errors occurred during import.`)
    console.log('  Check ImportLog table for details.\n')
  }
}

main()
  .catch((e) => {
    console.error('Fatal import error:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
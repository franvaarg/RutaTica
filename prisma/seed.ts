import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('Iniciando seed de datos...')

  // Crear empresas de autobuses
  const companies = await Promise.all([
    prisma.busCompany.create({
      data: {
        name: 'Autobuses del Norte',
        phone: '+506 2290-0000',
        email: 'info@autobusesdelnorte.cr',
        website: 'https://www.autobusesdelnorte.cr',
        description: 'Servicio de transporte hacia el norte de Costa Rica',
        isActive: true,
      },
    }),
    prisma.busCompany.create({
      data: {
        name: 'Transportes Tica',
        phone: '+506 2222-0000',
        email: 'contacto@ticabus.cr',
        website: 'https://www.ticabus.cr',
        description: 'Transporte internacional y de larga distancia',
        isActive: true,
      },
    }),
    prisma.busCompany.create({
      data: {
        name: 'Pulmitan',
        phone: '+506 2233-0000',
        email: 'servicio@pulmitan.cr',
        website: 'https://www.pulmitan.cr',
        description: 'Rutas costeras y hacia el Pacífico',
        isActive: true,
      },
    }),
    prisma.busCompany.create({
      data: {
        name: 'Autobuses San Pedro',
        phone: '+506 2253-0000',
        email: 'info@sanpedrobuses.cr',
        website: 'https://www.sanpedrobuses.cr',
        description: 'Servicio de transporte en el Área Metropolitana',
        isActive: true,
      },
    }),
  ])

  console.log(`✓ Se crearon ${companies.length} empresas de autobuses`)

  // Crear paradas de autobuses con coordenadas
  const stops = await Promise.all([
    // San José area
    prisma.stop.create({
      data: {
        name: 'Terminal San José',
        latitude: 9.9281,
        longitude: -84.0907,
        city: 'San José',
        isActive: true,
      },
    }),
    prisma.stop.create({
      data: {
        name: 'Parque Central',
        latitude: 9.9333,
        longitude: -84.0833,
        city: 'San José',
        isActive: true,
      },
    }),
    prisma.stop.create({
      data: {
        name: 'Coca-Cola',
        latitude: 9.9345,
        longitude: -84.0789,
        city: 'San José',
        isActive: true,
      },
    }),

    // Alajuela
    prisma.stop.create({
      data: {
        name: 'Terminal Alajuela',
        latitude: 10.0175,
        longitude: -84.2139,
        city: 'Alajuela',
        isActive: true,
      },
    }),
    prisma.stop.create({
      data: {
        name: 'Parque Alajuela',
        latitude: 10.0167,
        longitude: -84.2167,
        city: 'Alajuela',
        isActive: true,
      },
    }),

    // San Pedro
    prisma.stop.create({
      data: {
        name: 'Terminal San Pedro',
        latitude: 9.9333,
        longitude: -83.9833,
        city: 'San Pedro',
        isActive: true,
      },
    }),

    // Liberia
    prisma.stop.create({
      data: {
        name: 'Terminal Liberia',
        latitude: 10.6300,
        longitude: -85.4450,
        city: 'Liberia',
        isActive: true,
      },
    }),

    // Puntarenas
    prisma.stop.create({
      data: {
        name: 'Terminal Puntarenas',
        latitude: 9.9750,
        longitude: -84.8333,
        city: 'Puntarenas',
        isActive: true,
      },
    }),

    // Limón
    prisma.stop.create({
      data: {
        name: 'Terminal Limón',
        latitude: 10.0083,
        longitude: -83.0333,
        city: 'Limón',
        isActive: true,
      },
    }),

    // Guápiles
    prisma.stop.create({
      data: {
        name: 'Terminal Guápiles',
        latitude: 10.3167,
        longitude: -83.7833,
        city: 'Guápiles',
        isActive: true,
      },
    }),

    // Ciudad Quesada
    prisma.stop.create({
      data: {
        name: 'Terminal Ciudad Quesada',
        latitude: 10.3333,
        longitude: -84.4333,
        city: 'Ciudad Quesada',
        isActive: true,
      },
    }),

    // San Isidro
    prisma.stop.create({
      data: {
        name: 'Terminal San Isidro',
        latitude: 9.3667,
        longitude: -83.7000,
        city: 'San Isidro de El General',
        isActive: true,
      },
    }),
  ])

  console.log(`✓ Se crearon ${stops.length} paradas de autobuses`)

  // Crear rutas y precios
  const routes = await Promise.all([
    // Ruta 101: San José - Liberia
    prisma.busRoute.create({
      data: {
        companyId: companies[0].id,
        routeNumber: '101',
        origin: 'San José',
        destination: 'Liberia',
        distanceKm: 217,
        durationMin: 210,
        isActive: true,
        prices: {
          create: {
            price: 4500,
            currency: 'CRC',
            seatType: 'regular',
            validFrom: new Date(),
            isActive: true,
          },
        },
      },
    }),

    // Ruta Express: San José - Liberia
    prisma.busRoute.create({
      data: {
        companyId: companies[1].id,
        routeNumber: 'Express',
        origin: 'San José',
        destination: 'Liberia',
        distanceKm: 217,
        durationMin: 195,
        isActive: true,
        prices: {
          create: {
            price: 5200,
            currency: 'CRC',
            seatType: 'regular',
            validFrom: new Date(),
            isActive: true,
          },
        },
      },
    }),

    // Ruta 102: San José - Puntarenas
    prisma.busRoute.create({
      data: {
        companyId: companies[0].id,
        routeNumber: '102',
        origin: 'San José',
        destination: 'Puntarenas',
        distanceKm: 121,
        durationMin: 165,
        isActive: true,
        prices: {
          create: {
            price: 3800,
            currency: 'CRC',
            seatType: 'regular',
            validFrom: new Date(),
            isActive: true,
          },
        },
      },
    }),

    // Ruta Costera: San José - Puntarenas
    prisma.busRoute.create({
      data: {
        companyId: companies[2].id,
        routeNumber: 'Costera',
        origin: 'San José',
        destination: 'Puntarenas',
        distanceKm: 121,
        durationMin: 150,
        isActive: true,
        prices: {
          create: {
            price: 4200,
            currency: 'CRC',
            seatType: 'regular',
            validFrom: new Date(),
            isActive: true,
          },
        },
      },
    }),

    // Ruta Caribe: San José - Limón
    prisma.busRoute.create({
      data: {
        companyId: companies[1].id,
        routeNumber: 'Caribe',
        origin: 'San José',
        destination: 'Limón',
        distanceKm: 160,
        durationMin: 225,
        isActive: true,
        prices: {
          create: {
            price: 5600,
            currency: 'CRC',
            seatType: 'regular',
            validFrom: new Date(),
            isActive: true,
          },
        },
      },
    }),

    // Ruta 201: Alajuela - San José
    prisma.busRoute.create({
      data: {
        companyId: companies[0].id,
        routeNumber: '201',
        origin: 'Alajuela',
        destination: 'San José',
        distanceKm: 20,
        durationMin: 45,
        isActive: true,
        prices: {
          create: {
            price: 850,
            currency: 'CRC',
            seatType: 'regular',
            validFrom: new Date(),
            isActive: true,
          },
        },
      },
    }),

    // Ruta 301 (San Pedro): San Pedro - San José
    prisma.busRoute.create({
      data: {
        companyId: companies[3].id,
        routeNumber: '301',
        origin: 'San Pedro',
        destination: 'San José',
        distanceKm: 8,
        durationMin: 30,
        isActive: true,
        prices: {
          create: {
            price: 450,
            currency: 'CRC',
            seatType: 'regular',
            validFrom: new Date(),
            isActive: true,
          },
        },
      },
    }),

    // Ruta 301 (Norte): San José - Ciudad Quesada
    prisma.busRoute.create({
      data: {
        companyId: companies[0].id,
        routeNumber: '301',
        origin: 'San José',
        destination: 'Ciudad Quesada',
        distanceKm: 82,
        durationMin: 120,
        isActive: true,
        prices: {
          create: {
            price: 2200,
            currency: 'CRC',
            seatType: 'regular',
            validFrom: new Date(),
            isActive: true,
          },
        },
      },
    }),

    // Ruta Caribeña: San José - Guápiles
    prisma.busRoute.create({
      data: {
        companyId: companies[2].id,
        routeNumber: 'Caribeña',
        origin: 'San José',
        destination: 'Guápiles',
        distanceKm: 85,
        durationMin: 105,
        isActive: true,
        prices: {
          create: {
            price: 2100,
            currency: 'CRC',
            seatType: 'regular',
            validFrom: new Date(),
            isActive: true,
          },
        },
      },
    }),

    // Ruta Panamericana: San José - San Isidro
    prisma.busRoute.create({
      data: {
        companyId: companies[1].id,
        routeNumber: 'Panamericana',
        origin: 'San José',
        destination: 'San Isidro de El General',
        distanceKm: 137,
        durationMin: 180,
        isActive: true,
        prices: {
          create: {
            price: 3500,
            currency: 'CRC',
            seatType: 'regular',
            validFrom: new Date(),
            isActive: true,
          },
        },
      },
    }),
  ])

  console.log(`✓ Se crearon ${routes.length} rutas con precios`)

  // Crear relaciones entre rutas y paradas
  const routeStops = [
    // Ruta 101: San José - Liberia
    { routeId: routes[0].id, stopId: stops[0].id, sequence: 1 }, // Terminal San José
    { routeId: routes[0].id, stopId: stops[5].id, sequence: 2 }, // Terminal Liberia

    // Ruta Express: San José - Liberia
    { routeId: routes[1].id, stopId: stops[0].id, sequence: 1 }, // Terminal San José
    { routeId: routes[1].id, stopId: stops[5].id, sequence: 2 }, // Terminal Liberia

    // Ruta 102: San José - Puntarenas
    { routeId: routes[2].id, stopId: stops[0].id, sequence: 1 }, // Terminal San José
    { routeId: routes[2].id, stopId: stops[6].id, sequence: 2 }, // Terminal Puntarenas

    // Ruta Costera: San José - Puntarenas
    { routeId: routes[3].id, stopId: stops[0].id, sequence: 1 }, // Terminal San José
    { routeId: routes[3].id, stopId: stops[6].id, sequence: 2 }, // Terminal Puntarenas

    // Ruta Caribe: San José - Limón
    { routeId: routes[4].id, stopId: stops[0].id, sequence: 1 }, // Terminal San José
    { routeId: routes[4].id, stopId: stops[7].id, sequence: 2 }, // Terminal Limón

    // Ruta 201: Alajuela - San José
    { routeId: routes[5].id, stopId: stops[3].id, sequence: 1 }, // Terminal Alajuela
    { routeId: routes[5].id, stopId: stops[0].id, sequence: 2 }, // Terminal San José

    // Ruta 301 (San Pedro): San Pedro - San José
    { routeId: routes[6].id, stopId: stops[5].id, sequence: 1 }, // Terminal San Pedro
    { routeId: routes[6].id, stopId: stops[0].id, sequence: 2 }, // Terminal San José

    // Ruta 301 (Norte): San José - Ciudad Quesada
    { routeId: routes[7].id, stopId: stops[0].id, sequence: 1 }, // Terminal San José
    { routeId: routes[7].id, stopId: stops[9].id, sequence: 2 }, // Terminal Ciudad Quesada

    // Ruta Caribeña: San José - Guápiles
    { routeId: routes[8].id, stopId: stops[0].id, sequence: 1 }, // Terminal San José
    { routeId: routes[8].id, stopId: stops[8].id, sequence: 2 }, // Terminal Guápiles

    // Ruta Panamericana: San José - San Isidro
    { routeId: routes[9].id, stopId: stops[0].id, sequence: 1 }, // Terminal San José
    { routeId: routes[9].id, stopId: stops[10].id, sequence: 2 }, // Terminal San Isidro
  ]

  await Promise.all(
    routeStops.map((rs) =>
      prisma.routeStop.create({
        data: {
          routeId: rs.routeId,
          stopId: rs.stopId,
          sequence: rs.sequence,
          isActive: true,
        },
      })
    )
  )

  console.log(`✓ Se crearon ${routeStops.length} relaciones ruta-parada`)

  console.log('✅ Seed completado exitosamente')
}

main()
  .catch((e) => {
    console.error('❌ Error en el seed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })

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

  // Crear rutas y precios
  const routes = [
    {
      companyId: companies[0].id,
      routeNumber: '101',
      origin: 'San José',
      destination: 'Liberia',
      distanceKm: 217,
      durationMin: 210,
      price: 4500,
    },
    {
      companyId: companies[1].id,
      routeNumber: 'Express',
      origin: 'San José',
      destination: 'Liberia',
      distanceKm: 217,
      durationMin: 195,
      price: 5200,
    },
    {
      companyId: companies[0].id,
      routeNumber: '102',
      origin: 'San José',
      destination: 'Puntarenas',
      distanceKm: 121,
      durationMin: 165,
      price: 3800,
    },
    {
      companyId: companies[2].id,
      routeNumber: 'Costera',
      origin: 'San José',
      destination: 'Puntarenas',
      distanceKm: 121,
      durationMin: 150,
      price: 4200,
    },
    {
      companyId: companies[1].id,
      routeNumber: 'Caribe',
      origin: 'San José',
      destination: 'Limón',
      distanceKm: 160,
      durationMin: 225,
      price: 5600,
    },
    {
      companyId: companies[0].id,
      routeNumber: '201',
      origin: 'Alajuela',
      destination: 'San José',
      distanceKm: 20,
      durationMin: 45,
      price: 850,
    },
    {
      companyId: companies[3].id,
      routeNumber: '301',
      origin: 'San Pedro',
      destination: 'San José',
      distanceKm: 8,
      durationMin: 30,
      price: 450,
    },
    {
      companyId: companies[0].id,
      routeNumber: '301',
      origin: 'San José',
      destination: 'Ciudad Quesada',
      distanceKm: 82,
      durationMin: 120,
      price: 2200,
    },
    {
      companyId: companies[2].id,
      routeNumber: 'Caribeña',
      origin: 'San José',
      destination: 'Guápiles',
      distanceKm: 85,
      durationMin: 105,
      price: 2100,
    },
    {
      companyId: companies[1].id,
      routeNumber: 'Panamericana',
      origin: 'San José',
      destination: 'San Isidro de El General',
      distanceKm: 137,
      durationMin: 180,
      price: 3500,
    },
  ]

  const createdRoutes = await Promise.all(
    routes.map((route) =>
      prisma.busRoute.create({
        data: {
          companyId: route.companyId,
          routeNumber: route.routeNumber,
          origin: route.origin,
          destination: route.destination,
          distanceKm: route.distanceKm,
          durationMin: route.durationMin,
          isActive: true,
          prices: {
            create: {
              price: route.price,
              currency: 'CRC',
              seatType: 'regular',
              validFrom: new Date(),
              isActive: true,
            },
          },
        },
      })
    )
  )

  console.log(`✓ Se crearon ${createdRoutes.length} rutas con precios`)

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

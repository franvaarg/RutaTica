/** Facility names never establish a passenger boarding point. */
export function isPassengerStop(name: string, description = ''): boolean {
  const fold = (value: string) => value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
  const text = fold(`${name} ${description}`)
  const facility = /\b(plantel|deposito|garaje|garage|cochera|taller|patio de buses|patio de autobuses|oficinas? administrativas?|instalaciones? de la empresa)\b/.test(text)
  return !facility || /\b(parada de pasajeros|terminal de pasajeros|plataforma de abordaje)\b/.test(fold(description))
}

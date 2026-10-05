import { haversineDistance, type Coordinate } from './coordinates'
import type { PlanatedRoute } from './planned-route'
import { TRANSIT_ESTIMATES } from './transit-estimates'

function project(point: Coordinate, path: Coordinate[]) {
  let distance = Infinity, along = 0, traveled = 0
  const sx = 111.195 * Math.cos(point.lat * Math.PI / 180)
  for (let i=1;i<path.length;i++) {
    const a=path[i-1],b=path[i],dx=(b.lon-a.lon)*sx,dy=(b.lat-a.lat)*111.195
    const ax=(a.lon-point.lon)*sx,ay=(a.lat-point.lat)*111.195
    const t=Math.max(0,Math.min(1,-(ax*dx+ay*dy)/(dx*dx+dy*dy || 1)))
    const length=haversineDistance(a.lat,a.lon,b.lat,b.lon),d=Math.hypot(ax+t*dx,ay+t*dy)
    if(d<distance) {distance=d;along=traveled+t*length}
    traveled+=length
  }
  return { distance, along, length: traveled }
}
/** Passenger GPS only: off-route fixes cannot advance the selected journey. */
export function passengerProgress(route: PlanatedRoute, position: Coordinate, previous: number) {
  const path=route._shapePoints || [],stops=route._stops || []
  if(path.length<2) {
    let index=previous
    for(let i=previous+1;i<stops.length;i++) if(haversineDistance(position.lat,position.lon,stops[i].lat,stops[i].lon)<.075) index=i
    return { passedIndex:index,remainingKm:null,remainingMinutes:null }
  }
  const fix=project(position,path)
  if(fix.distance>.1) {
    let nearest=previous,best=.075
    for(let i=previous+1;i<stops.length;i++) {
      const distance=haversineDistance(position.lat,position.lon,stops[i].lat,stops[i].lon)
      if(distance<best) { best=distance;nearest=i }
    }
    return { passedIndex:nearest,remainingKm:null,remainingMinutes:null }
  }
  let index=previous
  for(let i=previous+1;i<stops.length;i++) {
    const stop=project(stops[i],path)
    if(stop.along<=fix.along+.005) index=i
  }
  const remainingKm=Math.max(0,fix.length-fix.along)
  const finalWalk=Math.max(0,(route._walkingDistanceKm || 0)-(route._boardingStopDistanceKm || 0))
  const busDuration=Math.max(0,(route.durationMin || 0)-(route._walkingDistanceKm || 0)/TRANSIT_ESTIMATES.walkingSpeedKmh*60)
  return { passedIndex:index,remainingKm:remainingKm+finalWalk,
    remainingMinutes:fix.length ? busDuration*remainingKm/fix.length+finalWalk/TRANSIT_ESTIMATES.walkingSpeedKmh*60 : 0 }
}
export function elapsedStopIndex(route: PlanatedRoute, elapsedMinutes: number) {
  const stops=route._stops || []
  const walking=(route._boardingStopDistanceKm || 0)/TRANSIT_ESTIMATES.walkingSpeedKmh*60
  const parse=(t?: string) => t ? t.split(':').reduce((sum,v,i)=>sum+Number(v)*[60,1,1/60][i],0) : null
  const start=parse(stops[0]?.departureTime || stops[0]?.arrivalTime)
  let index=-1
  for(let i=0;i<stops.length;i++) {
    const arrival=parse(stops[i].arrivalTime)
    const minute=stops[i].estimatedMinutesFromStart ?? (start!==null && arrival!==null ? Math.max(0,arrival-start) : i/Math.max(1,stops.length-1)*Math.max(1,(route.durationMin || 1)-walking))
    if(elapsedMinutes>=walking+minute) index=i
  }
  return index
}

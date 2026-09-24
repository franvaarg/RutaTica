import { serviceSeconds } from './service-time';
export type TimedStop = {stop_id:string;stop_sequence:number;arrival_time:string;departure_time:string;pickup_type:number;drop_off_type:number};
/** Consider every ordered occurrence, including loops and a later return to the same stop. */
export function selectTripSegment<T extends TimedStop>(stops:T[],origin:string,destination:string,earliestMinutes:number):{board:T;alight:T}|null {
  let best:{board:T;alight:T}|null=null;
  for(const board of stops) {
    const departure=serviceSeconds(board.departure_time);
    if(board.stop_id!==origin||board.pickup_type!==0||departure===null||!Number.isFinite(departure)||departure<earliestMinutes*60)continue;
    for(const alight of stops) {
      const arrival=serviceSeconds(alight.arrival_time);
      if(alight.stop_id!==destination||alight.drop_off_type!==0||alight.stop_sequence<=board.stop_sequence||arrival===null||!Number.isFinite(arrival)||arrival<=departure)continue;
      if(!best||departure<serviceSeconds(best.board.departure_time)!||(departure===serviceSeconds(best.board.departure_time)&&arrival<serviceSeconds(best.alight.arrival_time)!)) best={board,alight};
    }
  }
  return best;
}
